package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
)

// resolveDefaultWorkspaceID returns the oldest workspace as the single-tenant
// fallback for requests that carry no workspace context (webhooks, internal
// calls). uuid.Nil means no workspace exists yet.
func resolveDefaultWorkspaceID() uuid.UUID {
	var ws models.Workspace
	if err := database.DB.Order("created_at ASC").First(&ws).Error; err != nil {
		return uuid.Nil
	}
	return ws.ID
}

// GetDefaultWorkspaceInternal lets internal services (AI sidecar) resolve the
// default workspace at startup instead of hardcoding an id.
func GetDefaultWorkspaceInternal(c *fiber.Ctx) error {
	id := resolveDefaultWorkspaceID()
	if id == uuid.Nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "no workspaces exist"})
	}
	return c.JSON(fiber.Map{"workspace_id": id})
}
