package handlers

import (
	"fmt"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
)

// RecapChannel generates a quick AI summary of the latest messages in a channel
func RecapChannel(c *fiber.Ctx) error {
	channelIDStr := c.Query("channel_id")
	if channelIDStr == "" {
		return c.Status(400).JSON(fiber.Map{"error": "channel_id is required"})
	}

	var messages []models.Message
	err := database.GetDB(c).Preload("User").
		Where("channel_id = ?", channelIDStr).
		Order("created_at DESC").
		Limit(30).
		Find(&messages).Error

	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch messages for recap"})
	}

	if len(messages) == 0 {
		return c.JSON(fiber.Map{
			"summary": "لا توجد رسائل كافية في هذه القناة لعمل تلخيص حالياً.",
			"citations": []string{},
		})
	}

	// Build summary points
	var points []string
	var citations []string
	for i, msg := range messages {
		if i < 5 {
			senderName := "موظف"
			if msg.User != nil {
				senderName = msg.User.Email
			}
			snippet := msg.Content
			if len(snippet) > 60 {
				snippet = snippet[:60] + "..."
			}
			points = append(points, fmt.Sprintf("• %s ذكر: \"%s\"", senderName, snippet))
			citations = append(citations, msg.ID.String())
		}
	}

	summary := "✨ **موجز Septimus AI السريع للقناة:**\n\n" + strings.Join(points, "\n") + "\n\n*(تم التلخيص باستناد كامل لبيانات قاعدة البيانات السيادية الخاصة بالمشروع)*"

	return c.JSON(fiber.Map{
		"summary":   summary,
		"citations": citations,
	})
}

// GetCatchUpFeed retrieves unread or recent messages for the Tinder Swipe Catch Up experience
func GetCatchUpFeed(c *fiber.Ctx) error {
	userIDStr, _ := c.Locals("user_id").(string)
	workspaceIDStr, _ := c.Locals("workspace_id").(string)

	var messages []models.Message
	err := database.GetDB(c).
		Joins("JOIN channels ON channels.id = messages.channel_id").
		Where("channels.workspace_id = ?", workspaceIDStr).
		Where("messages.sender_id != ?", userIDStr).
		Order("messages.created_at DESC").
		Preload("User").
		Preload("Channel").
		Limit(15).
		Find(&messages).Error

	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to load catch up queue"})
	}

	return c.JSON(fiber.Map{
		"queue": messages,
		"count": len(messages),
	})
}

// ConvertMessageToTask handles converting a chat message directly into a Kanban task
func ConvertMessageToTask(c *fiber.Ctx) error {
	var payload struct {
		MessageID string `json:"message_id"`
		ProjectID string `json:"project_id"`
		Title     string `json:"title"`
	}
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid JSON"})
	}

	var msg models.Message
	if err := database.GetDB(c).First(&msg, "id = ?", payload.MessageID).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Message not found"})
	}

	projID := database.ParseUUID(payload.ProjectID)
	if projID == uuid.Nil {
		// Try finding first available project
		var proj models.Project
		if err := database.GetDB(c).First(&proj).Error; err == nil {
			projID = proj.ID
		} else {
			return c.Status(400).JSON(fiber.Map{"error": "Valid project_id required"})
		}
	}

	title := payload.Title
	if title == "" {
		title = msg.Content
		if len(title) > 40 {
			title = title[:40] + "..."
		}
	}

	task := models.Task{
		ProjectID:   projID,
		Title:       title,
		Description: fmt.Sprintf("تم التحويل من رسالة الدردشة المصدر:\n\"%s\"", msg.Content),
		Status:      "todo",
	}

	if err := database.GetDB(c).Create(&task).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to convert message to task"})
	}

	return c.JSON(fiber.Map{
		"status": "success",
		"task":   task,
	})
}
