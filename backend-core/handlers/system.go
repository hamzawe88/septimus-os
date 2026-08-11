package handlers

import (
	"encoding/json"
	"fmt"
	"log"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
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
	var req SystemMessageRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	channelID := database.ParseUUID(req.ChannelID)
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Workspace context is required"})
	}
	var channel models.Channel
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", channelID, workspaceID).First(&channel).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Channel not found"})
	}

	senderID, err := aiSystemUserID(channel.WorkspaceID)
	if err != nil {
		log.Printf("[InjectSystemMessage] cannot resolve AI sender user: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Cannot resolve AI system user"})
	}

	dbMsg := models.Message{
		WorkspaceID:   workspaceID,
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

	if err := database.GetDB(c).Create(&dbMsg).Error; err != nil {
		log.Printf("[InjectSystemMessage] failed to create message: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create message"})
	}

	// Broadcast via WebSocket Hub
	// Build a custom payload for the frontend
	outPayload := map[string]interface{}{
		"ID":            dbMsg.ID,
		"CreatedAt":     dbMsg.CreatedAt,
		"Content":       dbMsg.Content,
		"ChannelID":     dbMsg.ChannelID,
		"type":          "chat_message", // WS type
		"IsAIGenerated": dbMsg.IsAIGenerated,
		"AIAgentRole":   dbMsg.AIAgentRole,
		"AIProposal":    req.AIProposal,
		"EntityType":    req.EntityType,
		"EntityID":      req.EntityID,
		"User": map[string]interface{}{
			"Email": req.AIAgentRole, // Mocking author name
		},
	}

	out, _ := json.Marshal(outPayload)
	// 🔐 Channel-scoped: only members of this channel receive the AI message
	WSHub.BroadcastToChannel(req.ChannelID, out)

	return c.Status(fiber.StatusCreated).JSON(dbMsg)
}

// InjectSystemMessageDirect allows internal Go functions in handlers package
// (like workflow_executor) to inject a message without an HTTP loopback. The
// caller MUST supply the tenant it is executing for: channel ids are opaque but
// not an authorization boundary, and looking one up by id alone lets a workflow
// in one workspace write into a channel in another workspace.
func InjectSystemMessageDirect(workspaceID uuid.UUID, channelIDStr, content, aiAgentRole string, isAI bool) error {
	if workspaceID == uuid.Nil {
		return fmt.Errorf("workspace context is required")
	}
	channelID := database.ParseUUID(channelIDStr)
	if channelID == uuid.Nil {
		return fmt.Errorf("invalid channel id")
	}
	var channel models.Channel
	if err := database.DB.Where("id = ? AND workspace_id = ?", channelID, workspaceID).First(&channel).Error; err != nil {
		return fmt.Errorf("channel not found: %w", err)
	}

	senderID, err := aiSystemUserID(channel.WorkspaceID)
	if err != nil {
		return fmt.Errorf("cannot resolve AI sender user: %w", err)
	}

	dbMsg := models.Message{
		ChannelID:     channelID,
		SenderID:      senderID,
		Content:       content,
		IsAIGenerated: isAI,
		AIAgentRole:   aiAgentRole,
	}

	if err := database.DB.Create(&dbMsg).Error; err != nil {
		return fmt.Errorf("failed to create message: %w", err)
	}

	outPayload := map[string]interface{}{
		"ID":            dbMsg.ID,
		"CreatedAt":     dbMsg.CreatedAt,
		"Content":       dbMsg.Content,
		"ChannelID":     dbMsg.ChannelID,
		"type":          "chat_message",
		"IsAIGenerated": dbMsg.IsAIGenerated,
		"AIAgentRole":   dbMsg.AIAgentRole,
		"User": map[string]interface{}{
			"Email": aiAgentRole,
		},
	}
	out, _ := json.Marshal(outPayload)
	WSHub.BroadcastToChannel(channelIDStr, out)
	return nil
}
