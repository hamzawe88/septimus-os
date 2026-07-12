package handlers

import (
	"encoding/json"
	"log"

	"github.com/gofiber/fiber/v2"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/datatypes"
)

type SystemMessageRequest struct {
	ChannelID     string      `json:"channel_id"`
	Content       string      `json:"content"`
	IsAIGenerated bool        `json:"is_ai_generated"`
	AIAgentRole   string      `json:"ai_agent_role"`
	AIProposal    interface{} `json:"ai_proposal"`
	EntityType    string      `json:"entity_type"`
	EntityID      string      `json:"entity_id"`
}

// InjectSystemMessage allows backend services (like NATS workers) to inject a message into a channel
func InjectSystemMessage(c *fiber.Ctx) error {
	// Optional: verify an API key here
	// apiKey := c.Get("X-System-Key")
	// if apiKey != os.Getenv("SYSTEM_API_KEY") { return fiber.ErrUnauthorized }

	var req SystemMessageRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	channelID := database.ParseUUID(req.ChannelID)
	var channel models.Channel
	if err := database.DB.Where("id = ?", channelID).First(&channel).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Channel not found"})
	}

	senderID, err := aiSystemUserID(channel.WorkspaceID)
	if err != nil {
		log.Printf("[InjectSystemMessage] cannot resolve AI sender user: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Cannot resolve AI system user"})
	}

	dbMsg := models.Message{
		ChannelID:     channelID,
		SenderID:      senderID,
		Content:       req.Content,
		IsAIGenerated: req.IsAIGenerated,
		AIAgentRole:   req.AIAgentRole,
		EntityType:    req.EntityType,
	}

	if req.EntityID != "" {
		eid := database.ParseUUID(req.EntityID)
		dbMsg.EntityID = &eid
	}

	if req.AIProposal != nil {
		propBytes, _ := json.Marshal(req.AIProposal)
		propJSON := datatypes.JSON(propBytes)
		dbMsg.AIProposal = &propJSON
	}

	if err := database.DB.Create(&dbMsg).Error; err != nil {
		log.Printf("[InjectSystemMessage] failed to create message: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create message"})
	}

	// Broadcast via WebSocket Hub
	// Build a custom payload for the frontend
	outPayload := map[string]interface{}{
		"ID":              dbMsg.ID,
		"CreatedAt":       dbMsg.CreatedAt,
		"Content":         dbMsg.Content,
		"ChannelID":       dbMsg.ChannelID,
		"type":            "chat_message", // WS type
		"IsAIGenerated":   dbMsg.IsAIGenerated,
		"AIAgentRole":     dbMsg.AIAgentRole,
		"AIProposal":      req.AIProposal,
		"EntityType":      req.EntityType,
		"EntityID":        req.EntityID,
		"User": map[string]interface{}{
			"Email": req.AIAgentRole, // Mocking author name
		},
	}

	out, _ := json.Marshal(outPayload)
	// 🔐 Channel-scoped: only members of this channel receive the AI message
	WSHub.BroadcastToChannel(req.ChannelID, out)

	return c.Status(fiber.StatusCreated).JSON(dbMsg)
}
