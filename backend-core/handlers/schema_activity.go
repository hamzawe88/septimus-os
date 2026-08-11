package handlers

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/datatypes"
)

type schemaActivityItem struct {
	ID        uuid.UUID      `json:"id"`
	UserID    *uuid.UUID     `json:"user_id,omitempty"`
	Action    string         `json:"action"`
	Details   datatypes.JSON `json:"details,omitempty"`
	CreatedAt time.Time      `json:"created_at"`
}

// ListSchemaActivity returns only audit entries for the requested definition
// inside the active workspace. The definition lookup enforces tenant ownership.
func ListSchemaActivity(c *fiber.Ctx) error {
	definition, err := findSchemaDefinition(c)
	if err != nil {
		return err
	}

	limit := c.QueryInt("limit", 50)
	if limit < 1 || limit > 100 {
		limit = 50
	}

	var logs []models.AuditLog
	if err := database.GetDB(c).
		Where(
			"workspace_id = ? AND entity_type = ? AND entity_id = ?",
			definition.WorkspaceID,
			"EntityDefinition",
			definition.ID.String(),
		).
		Order("created_at DESC").
		Limit(limit).
		Find(&logs).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "failed to load schema activity",
		})
	}

	items := make([]schemaActivityItem, 0, len(logs))
	for _, log := range logs {
		items = append(items, schemaActivityItem{
			ID: log.ID, UserID: log.UserID, Action: log.Action,
			Details: log.Details, CreatedAt: log.CreatedAt,
		})
	}

	return c.JSON(fiber.Map{"data": items})
}
