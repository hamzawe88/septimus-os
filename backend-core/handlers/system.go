package handlers

import (
	"encoding/json"

	"github.com/gofiber/fiber/v2"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
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

	dbMsg := models.Message{
		ChannelID:     database.ParseUUID(req.ChannelID),
		Content:       req.Content,
		IsAIGenerated: req.IsAIGenerated,
		AIAgentRole:   req.AIAgentRole,
	}

	database.DB.Create(&dbMsg)

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
