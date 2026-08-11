package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
)

// RequireInternalWorkspace establishes a tenant context for a call that has
// already passed RequireInternalToken. Internal services must state which
// workspace they act for in X-Workspace-ID; accepting an id from a JSON body
// or query parameter would let a payload select another tenant.
func RequireInternalWorkspace() fiber.Handler {
	return func(c *fiber.Ctx) error {
		workspaceID, err := uuid.Parse(c.Get("X-Workspace-ID"))
		if err != nil || workspaceID == uuid.Nil {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
		}
		var workspace models.Workspace
		if err := database.DB.Where("id = ?", workspaceID).First(&workspace).Error; err != nil {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace not found"})
		}
		if strings.EqualFold(workspace.Status, "suspended") || strings.EqualFold(workspace.Status, "cancelled") {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace is unavailable"})
		}
		c.Locals("workspace_id", workspaceID.String())
		c.Locals("workspace", &workspace)
		return c.Next()
	}
}
