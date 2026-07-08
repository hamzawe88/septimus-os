package handlers

import (
	"encoding/json"
	"log"
	"sync"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/events"
	"github.com/septimus-os/backend-core/models"
)

// ─── Channel-Scoped WebSocket Hub ─────────────────────────────────────────────

// Hub manages all WebSocket connections with channel-level access control.
// Messages are only delivered to clients who are actual members of the target channel.
type Hub struct {
	mu sync.RWMutex

	// clients: map[UserID] → set of active connections for that user
	clients map[string]map[*websocket.Conn]bool

	register   chan *Client
	unregister chan *Client

	// channelBroadcast delivers a message to members of a specific channel
	channelBroadcast chan *ChannelMessage

	// globalBroadcast delivers presence/system events to all connected clients
	globalBroadcast chan []byte
}

// ChannelMessage carries both the target channelID and the payload to broadcast
type ChannelMessage struct {
	ChannelID string
	Payload   []byte
}

type Client struct {
	hub    *Hub
	conn   *websocket.Conn
	userID string
}

func NewHub() *Hub {
	return &Hub{
		clients:          make(map[string]map[*websocket.Conn]bool),
		register:         make(chan *Client, 256),
		unregister:       make(chan *Client, 256),
		channelBroadcast: make(chan *ChannelMessage, 512),
		globalBroadcast:  make(chan []byte, 512),
	}
}

var WSHub = NewHub()

func (h *Hub) Run() {
	for {
		select {
		// ── Register ─────────────────────────────────────────────────────────
		case client := <-h.register:
			h.mu.Lock()
			isNew := false
			if h.clients[client.userID] == nil {
				h.clients[client.userID] = make(map[*websocket.Conn]bool)
				isNew = true
			}
			h.clients[client.userID][client.conn] = true
			h.mu.Unlock()
			log.Printf("[WS] User %s connected (%d total online)", client.userID, h.onlineCount())

			if isNew {
				presenceMsg, _ := json.Marshal(map[string]interface{}{
					"type":    "presence",
					"user_id": client.userID,
					"online":  true,
				})
				h.globalBroadcast <- presenceMsg
			}

		// ── Unregister ───────────────────────────────────────────────────────
		case client := <-h.unregister:
			h.mu.Lock()
			if conns, ok := h.clients[client.userID]; ok {
				if _, ok := conns[client.conn]; ok {
					delete(conns, client.conn)
					client.conn.Close()
					if len(conns) == 0 {
						delete(h.clients, client.userID)
						h.mu.Unlock()

						presenceMsg, _ := json.Marshal(map[string]interface{}{
							"type":    "presence",
							"user_id": client.userID,
							"online":  false,
						})
						h.globalBroadcast <- presenceMsg
						log.Printf("[WS] User %s disconnected (%d total online)", client.userID, h.onlineCount())
						continue
					}
				}
			}
			h.mu.Unlock()
			log.Printf("[WS] User %s connection closed (%d total online)", client.userID, h.onlineCount())

		// ── Channel-Scoped Broadcast ─────────────────────────────────────────
		case cm := <-h.channelBroadcast:
			// 🔐 Security: only send to members of this channel
			members := h.getChannelMembers(cm.ChannelID)
			h.mu.RLock()
			for _, memberID := range members {
				if conns, ok := h.clients[memberID]; ok {
					for conn := range conns {
						if err := conn.WriteMessage(websocket.TextMessage, cm.Payload); err != nil {
							log.Printf("[WS] Write error for user %s: %v", memberID, err)
						}
					}
				}
			}
			h.mu.RUnlock()

		// ── Global Broadcast (Presence only) ─────────────────────────────────
		case message := <-h.globalBroadcast:
			h.mu.RLock()
			for _, conns := range h.clients {
				for conn := range conns {
					conn.WriteMessage(websocket.TextMessage, message)
				}
			}
			h.mu.RUnlock()
		}
	}
}

// BroadcastToChannel sends a payload exclusively to members of the given channel.
// This is the PRIMARY method for sending chat messages — use this, NOT globalBroadcast.
func (h *Hub) BroadcastToChannel(channelID string, payload []byte) {
	h.channelBroadcast <- &ChannelMessage{
		ChannelID: channelID,
		Payload:   payload,
	}
}

// SendToUser delivers a payload to all connections of a specific user.
func (h *Hub) SendToUser(userID string, payload []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if conns, ok := h.clients[userID]; ok {
		for conn := range conns {
			conn.WriteMessage(websocket.TextMessage, payload)
		}
	}
}

// onlineCount returns the number of unique online users.
func (h *Hub) onlineCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// getChannelMembers fetches all member user IDs for a channel from the DB.
// Results are cached implicitly by the DB query optimizer.
func (h *Hub) getChannelMembers(channelID string) []string {
	var members []models.ChannelMember
	if err := database.DB.Where("channel_id = ?", channelID).Find(&members).Error; err != nil {
		log.Printf("[WS] Failed to fetch members for channel %s: %v", channelID, err)
		return nil
	}

	// Also include all users for PUBLIC channels
	var channel models.Channel
	if err := database.DB.First(&channel, "id = ?", channelID).Error; err == nil {
		if channel.Type == "PUBLIC" {
			// For public channels: broadcast to all connected users
			h.mu.RLock()
			defer h.mu.RUnlock()
			ids := make([]string, 0, len(h.clients))
			for uid := range h.clients {
				ids = append(ids, uid)
			}
			return ids
		}
	}

	ids := make([]string, 0, len(members))
	for _, m := range members {
		ids = append(ids, m.UserID.String())
	}
	return ids
}

// ─── WS Message Struct ────────────────────────────────────────────────────────

type WSMessage struct {
	Type           string     `json:"type"`                    // "chat_message", "presence", "typing"
	ChannelID      string     `json:"channel_id"`              // Target channel
	ParentID       *uuid.UUID `json:"parent_id,omitempty"`     // Thread parent
	Author         string     `json:"author"`
	Content        string     `json:"content"`
	Time           string     `json:"time"`
	AttachmentURL  string     `json:"AttachmentURL,omitempty"`
	AttachmentType string     `json:"AttachmentType,omitempty"`
}

// ─── WebSocket Connection Handler ─────────────────────────────────────────────

func WebsocketHandler(c *websocket.Conn) {
	userID := c.Locals("user_id").(string)

	client := &Client{
		hub:    WSHub,
		conn:   c,
		userID: userID,
	}

	client.hub.register <- client

	defer func() {
		client.hub.unregister <- client
	}()

	for {
		messageType, payload, err := c.ReadMessage()
		if err != nil {
			break
		}

		if messageType != websocket.TextMessage {
			continue
		}

		var wsMsg WSMessage
		if err := json.Unmarshal(payload, &wsMsg); err != nil {
			continue
		}

		switch wsMsg.Type {
		case "chat_message":
			if wsMsg.ChannelID == "" || wsMsg.Content == "" {
				continue
			}

			// 1. Persist to DB
			userUUID := database.ParseUUID(userID)
			channelUUID := database.ParseUUID(wsMsg.ChannelID)

			dbMsg := models.Message{
				ChannelID:      channelUUID,
				SenderID:       userUUID,
				ParentID:       wsMsg.ParentID,
				Content:        wsMsg.Content,
				AttachmentURL:  wsMsg.AttachmentURL,
				AttachmentType: wsMsg.AttachmentType,
			}
			if err := database.DB.Create(&dbMsg).Error; err != nil {
				log.Printf("[WS] Failed to save chat message to DB: %v", err)
				continue
			}

			// 2. Load full user info for the broadcast payload
			if err := database.DB.Preload("User").First(&dbMsg, dbMsg.ID).Error; err != nil {
				log.Printf("[WS] Failed to load full user info for message: %v", err)
				continue
			}

			// 3. Broadcast ONLY to channel members (🔐 scoped)
			out, _ := json.Marshal(dbMsg)
			client.hub.BroadcastToChannel(wsMsg.ChannelID, out)

			// 4. Publish to NATS for AI Agent processing
			if events.NatsConn != nil {
				natsPayload, _ := json.Marshal(map[string]interface{}{
					"event":      "events.messages.created",
					"message_id": dbMsg.ID,
					"channel_id": dbMsg.ChannelID,
					"content":    dbMsg.Content,
					"sender_id":  dbMsg.SenderID,
				})
				events.PublishEvent("events.messages.created", natsPayload)
			}

		case "typing":
			// Broadcast typing indicator to channel members only
			if wsMsg.ChannelID != "" {
				typingMsg, _ := json.Marshal(map[string]interface{}{
					"type":       "typing",
					"user_id":    userID,
					"channel_id": wsMsg.ChannelID,
				})
				client.hub.BroadcastToChannel(wsMsg.ChannelID, typingMsg)
			}
		}
	}
}

// ─── JWT Auth Middleware for WS ───────────────────────────────────────────────

func WSAuthMiddleware(c *fiber.Ctx) error {
	if websocket.IsWebSocketUpgrade(c) {
		tokenStr := c.Query("token")
		if tokenStr == "" {
			return c.Status(fiber.StatusUnauthorized).SendString("Missing token")
		}

		token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
			return []byte(getJWTSecret()), nil
		})

		if err == nil && token.Valid {
			if claims, ok := token.Claims.(jwt.MapClaims); ok {
				c.Locals("user_id", claims["sub"])
				return c.Next()
			}
		}
		return c.Status(fiber.StatusUnauthorized).SendString("Invalid token")
	}
	return fiber.ErrUpgradeRequired
}
