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
	clients              map[string]map[*websocket.Conn]bool
	connectionWorkspaces map[*websocket.Conn]uuid.UUID

	register   chan *Client
	unregister chan *Client

	// channelBroadcast delivers a message to members of a specific channel
	channelBroadcast chan *ChannelMessage

	// workspaceBroadcast delivers presence/system events only to one tenant.
	workspaceBroadcast chan *WorkspaceMessage
}

// ChannelMessage carries both the target channelID and the payload to broadcast
type ChannelMessage struct {
	ChannelID string
	Payload   []byte
}

type WorkspaceMessage struct {
	WorkspaceID uuid.UUID
	Payload     []byte
}

type Client struct {
	hub         *Hub
	conn        *websocket.Conn
	userID      string
	workspaceID uuid.UUID
}

func NewHub() *Hub {
	return &Hub{
		clients:              make(map[string]map[*websocket.Conn]bool),
		connectionWorkspaces: make(map[*websocket.Conn]uuid.UUID),
		register:             make(chan *Client, 256),
		unregister:           make(chan *Client, 256),
		channelBroadcast:     make(chan *ChannelMessage, 512),
		workspaceBroadcast:   make(chan *WorkspaceMessage, 512),
	}
}

var WSHub = NewHub()

// Run is the Hub's single event loop. Each channel case delegates to a focused
// handler so the locking/broadcast logic for each concern lives on its own.
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.handleRegister(client)
		case client := <-h.unregister:
			h.handleUnregister(client)
		case cm := <-h.channelBroadcast:
			h.handleChannelBroadcast(cm)
		case message := <-h.workspaceBroadcast:
			h.handleWorkspaceBroadcast(message)
		}
	}
}

// handleRegister adds a connection and announces presence when a user comes online.
func (h *Hub) handleRegister(client *Client) {
	h.mu.Lock()
	isNew := false
	if h.clients[client.userID] == nil {
		h.clients[client.userID] = make(map[*websocket.Conn]bool)
		isNew = true
	}
	h.clients[client.userID][client.conn] = true
	h.connectionWorkspaces[client.conn] = client.workspaceID
	h.mu.Unlock()
	log.Printf("[WS] User %s connected (%d total online)", client.userID, h.onlineCount())

	if isNew {
		presenceMsg, _ := json.Marshal(map[string]interface{}{
			"type":    "presence",
			"user_id": client.userID,
			"online":  true,
		})
		h.workspaceBroadcast <- &WorkspaceMessage{WorkspaceID: client.workspaceID, Payload: presenceMsg}
	}
}

// handleUnregister removes a connection and announces offline presence once the
// user's last connection is gone.
func (h *Hub) handleUnregister(client *Client) {
	h.mu.Lock()
	if conns, ok := h.clients[client.userID]; ok {
		if _, ok := conns[client.conn]; ok {
			delete(conns, client.conn)
			delete(h.connectionWorkspaces, client.conn)
			client.conn.Close()
			if len(conns) == 0 {
				delete(h.clients, client.userID)
				h.mu.Unlock()

				presenceMsg, _ := json.Marshal(map[string]interface{}{
					"type":    "presence",
					"user_id": client.userID,
					"online":  false,
				})
				h.workspaceBroadcast <- &WorkspaceMessage{WorkspaceID: client.workspaceID, Payload: presenceMsg}
				log.Printf("[WS] User %s disconnected (%d total online)", client.userID, h.onlineCount())
				return
			}
		}
	}
	h.mu.Unlock()
	log.Printf("[WS] User %s connection closed (%d total online)", client.userID, h.onlineCount())
}

// handleChannelBroadcast delivers a payload only to members of the target channel.
func (h *Hub) handleChannelBroadcast(cm *ChannelMessage) {
	// 🔐 Security: only send to members of this channel
	members, workspaceID := h.getChannelMembers(cm.ChannelID)
	if workspaceID == uuid.Nil {
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, memberID := range members {
		if conns, ok := h.clients[memberID]; ok {
			for conn := range conns {
				// A user id alone is not a tenant boundary. Only deliver to a
				// connection authenticated for this channel's workspace.
				if h.connectionWorkspaces[conn] != workspaceID {
					continue
				}
				if err := conn.WriteMessage(websocket.TextMessage, cm.Payload); err != nil {
					log.Printf("[WS] Write error for user %s: %v", memberID, err)
				}
			}
		}
	}
}

// handleGlobalBroadcast fans a presence/system payload out to every connection.
func (h *Hub) handleWorkspaceBroadcast(message *WorkspaceMessage) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, conns := range h.clients {
		for conn := range conns {
			if h.connectionWorkspaces[conn] != message.WorkspaceID {
				continue
			}
			_ = conn.WriteMessage(websocket.TextMessage, message.Payload)
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
func (h *Hub) getChannelMembers(channelID string) ([]string, uuid.UUID) {
	var channel models.Channel
	if err := database.DB.Where("id = ?", channelID).First(&channel).Error; err != nil {
		return nil, uuid.Nil
	}
	var members []models.ChannelMember
	if err := database.DB.Where("channel_id = ?", channel.ID).Find(&members).Error; err != nil {
		log.Printf("[WS] Failed to fetch members for channel %s: %v", channelID, err)
		return nil, uuid.Nil
	}

	if channel.Type == "PUBLIC" {
		var users []models.User
		if err := database.DB.Select("id").Where("workspace_id = ?", channel.WorkspaceID).Find(&users).Error; err != nil {
			return nil, uuid.Nil
		}
		members = make([]models.ChannelMember, 0, len(users))
		for _, user := range users {
			members = append(members, models.ChannelMember{UserID: user.ID})
		}
	}

	ids := make([]string, 0, len(members))
	for _, m := range members {
		ids = append(ids, m.UserID.String())
	}
	return ids, channel.WorkspaceID
}

// ─── WS Message Struct ────────────────────────────────────────────────────────

type WSMessage struct {
	Type           string     `json:"type"`                // "chat_message", "presence", "typing"
	ChannelID      string     `json:"channel_id"`          // Target channel
	ParentID       *uuid.UUID `json:"parent_id,omitempty"` // Thread parent
	Author         string     `json:"author"`
	Content        string     `json:"content"`
	Time           string     `json:"time"`
	AttachmentURL  string     `json:"AttachmentURL,omitempty"`
	AttachmentType string     `json:"AttachmentType,omitempty"`
}

// ─── WebSocket Connection Handler ─────────────────────────────────────────────

func WebsocketHandler(c *websocket.Conn) {
	userID, _ := c.Locals("user_id").(string)

	client := &Client{
		hub:         WSHub,
		conn:        c,
		userID:      userID,
		workspaceID: database.ParseUUID(c.Locals("workspace_id").(string)),
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
			client.handleChatMessage(wsMsg)
		case "typing":
			client.handleTypingIndicator(wsMsg)
		}
	}
}

// handleChatMessage persists an inbound chat message, broadcasts it to channel
// members, and publishes it to NATS for AI processing.
func (client *Client) handleChatMessage(wsMsg WSMessage) {
	if wsMsg.ChannelID == "" || wsMsg.Content == "" || len(wsMsg.Content) > 10000 {
		return
	}

	// 1. Persist to DB
	userUUID := database.ParseUUID(client.userID)
	channelUUID := database.ParseUUID(wsMsg.ChannelID)
	if channelUUID == uuid.Nil || client.workspaceID == uuid.Nil {
		return
	}
	var channel models.Channel
	if err := database.DB.Where("id = ? AND workspace_id = ?", channelUUID, client.workspaceID).First(&channel).Error; err != nil {
		return
	}
	if channel.Type != "PUBLIC" {
		var member models.ChannelMember
		if err := database.DB.Where("channel_id = ? AND user_id = ?", channelUUID, userUUID).First(&member).Error; err != nil {
			log.Printf("[WS] rejected message from non-member %s on channel %s", client.userID, wsMsg.ChannelID)
			return
		}
	}

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
		return
	}

	// 2. Load full user info for the broadcast payload
	if err := database.DB.Preload("User").First(&dbMsg, dbMsg.ID).Error; err != nil {
		log.Printf("[WS] Failed to load full user info for message: %v", err)
		return
	}

	// 3. Broadcast ONLY to channel members (🔐 scoped)
	out, _ := json.Marshal(dbMsg)
	client.hub.BroadcastToChannel(wsMsg.ChannelID, out)

	// 4. Publish to NATS for AI Agent processing
	if events.NatsConn != nil {
		// The tenant comes off the persisted row (BeforeCreate derives it from
		// the channel), which is authoritative here — a websocket frame has no
		// request context to read it from.
		if err := events.PublishTenantEvent("events.messages.created", dbMsg.WorkspaceID, map[string]interface{}{
			"event":      "events.messages.created",
			"message_id": dbMsg.ID,
			"channel_id": dbMsg.ChannelID,
			"content":    dbMsg.Content,
			"sender_id":  dbMsg.SenderID,
		}); err != nil {
			log.Printf("events.messages.created not published for message %s: %v", dbMsg.ID, err)
		}
	}
}

// handleTypingIndicator broadcasts a typing notification to channel members only.
func (client *Client) handleTypingIndicator(wsMsg WSMessage) {
	if wsMsg.ChannelID == "" {
		return
	}
	channelID := database.ParseUUID(wsMsg.ChannelID)
	if channelID == uuid.Nil || client.workspaceID == uuid.Nil {
		return
	}
	var channel models.Channel
	if err := database.DB.Where("id = ? AND workspace_id = ?", channelID, client.workspaceID).First(&channel).Error; err != nil {
		return
	}
	if channel.Type != "PUBLIC" {
		var member models.ChannelMember
		if err := database.DB.Where("channel_id = ? AND user_id = ?", channelID, database.ParseUUID(client.userID)).First(&member).Error; err != nil {
			return
		}
	}
	typingMsg, _ := json.Marshal(map[string]interface{}{
		"type":       "typing",
		"user_id":    client.userID,
		"channel_id": wsMsg.ChannelID,
	})
	client.hub.BroadcastToChannel(wsMsg.ChannelID, typingMsg)
}

// ─── JWT Auth Middleware for WS ───────────────────────────────────────────────

func WSAuthMiddleware(c *fiber.Ctx) error {
	if websocket.IsWebSocketUpgrade(c) {
		tokenStr := c.Query("token")
		if tokenStr == "" {
			return c.Status(fiber.StatusUnauthorized).SendString("Missing token")
		}

		token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fiber.ErrUnauthorized
			}
			return []byte(getJWTSecret()), nil
		})

		if err == nil && token.Valid {
			if claims, ok := token.Claims.(jwt.MapClaims); ok {
				userID, userOK := claims["sub"].(string)
				workspaceID, workspaceOK := claims["workspace_id"].(string)
				wsUUID := database.ParseUUID(workspaceID)
				userUUID := database.ParseUUID(userID)
				if !userOK || !workspaceOK || userUUID == uuid.Nil || wsUUID == uuid.Nil {
					return c.Status(fiber.StatusUnauthorized).SendString("Invalid tenant claims")
				}
				var user models.User
				if err := database.DB.Where("id = ? AND workspace_id = ?", userUUID, wsUUID).First(&user).Error; err != nil {
					return c.Status(fiber.StatusUnauthorized).SendString("User is not a member of this workspace")
				}
				c.Locals("user_id", userID)
				c.Locals("workspace_id", workspaceID)
				return c.Next()
			}
		}
		return c.Status(fiber.StatusUnauthorized).SendString("Invalid token")
	}
	return fiber.ErrUpgradeRequired
}
