package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/gorm/clause"
)

// SearchMessages searches across all messages in channels the user has access to
func SearchMessages(c *fiber.Ctx) error {
	query := c.Query("q")
	if query == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Query parameter 'q' is required"})
	}

	userID, _ := c.Locals("user_id").(string)
	workspaceID, _ := c.Locals("workspace_id").(string)

	var messages []models.Message

	// We join channels and channel_members to ensure the user has access to the message's channel
	// We use to_tsquery for full text search against the tsv column
	err := database.DB.Distinct("messages.*").
		Joins("JOIN channels ON channels.id = messages.channel_id").
		Joins("LEFT JOIN channel_members ON channel_members.channel_id = channels.id").
		Where("channels.workspace_id = ?", workspaceID).
		Where("(channels.type = 'PUBLIC' OR channel_members.user_id = ?)", userID).
		Where("messages.tsv @@ plainto_tsquery('english', ?)", query).
		Order(clause.Expr{
			SQL:  "ts_rank(messages.tsv, plainto_tsquery('english', ?)) DESC",
			Vars: []interface{}{query},
		}).
		Preload("User").
		Preload("Channel").
		Limit(50).
		Find(&messages).Error

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Search failed"})
	}

	return c.JSON(messages)
}
