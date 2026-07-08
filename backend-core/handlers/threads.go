package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
)

// GetMessageReplies fetches all replies for a specific message ID
func GetMessageReplies(c *fiber.Ctx) error {
	messageID := c.Params("id")

	// Verify the parent message exists and the user has access to its channel
	// For MVP, we'll just fetch the replies directly
	
	var replies []models.Message
	
	// Preload the User so we know who sent the reply
	result := database.DB.Preload("User").
		Where("parent_id = ?", messageID).
		Order("created_at ASC").
		Find(&replies)

	if result.Error != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to fetch replies",
		})
	}

	return c.JSON(fiber.Map{
		"replies": replies,
	})
}
