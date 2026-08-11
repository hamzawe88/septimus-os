package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
)

// CurrentWorkspace returns the workspace this request is authenticated for.
//
// It exists to kill a bug family that RLS exposed on 2026-07-23: several
// handlers reached for the caller's tenant with a bare `db.First(&workspace)`.
// The workspaces table is not under row-level security, so that query silently
// returned whichever row PostgreSQL happened to order first — an arbitrary,
// usually foreign, tenant. Reads then showed another customer's data and writes
// landed in another customer's workspace, with no error anywhere.
//
// The authoritative source is TenantEnforcerMiddleware, which validates the
// workspace named by the JWT and stores it in locals. This helper reads only
// that. It never falls back to "some workspace" — a caller with no tenant on the
// request has no tenant, and the handler must say so rather than guess.
func CurrentWorkspace(c *fiber.Ctx) (*models.Workspace, bool) {
	if ws, ok := c.Locals("workspace").(*models.Workspace); ok && ws != nil && ws.ID != uuid.Nil {
		return ws, true
	}

	// The middleware skips workspace lookup on routes that do not require one,
	// so fall back to resolving the id the JWT carries — still JWT-derived,
	// never client-supplied.
	wsIDStr, _ := c.Locals("workspace_id").(string)
	if wsIDStr == "" {
		return nil, false
	}
	wsID := database.ParseUUID(wsIDStr)
	if wsID == uuid.Nil {
		return nil, false
	}
	var ws models.Workspace
	if err := database.GetDB(c).Where("id = ?", wsID).First(&ws).Error; err != nil {
		return nil, false
	}
	c.Locals("workspace", &ws)
	return &ws, true
}

// CurrentWorkspaceID is the id-only form of CurrentWorkspace. It returns
// uuid.Nil when the request carries no tenant; callers must treat that as an
// authorization failure, never as "any tenant will do".
func CurrentWorkspaceID(c *fiber.Ctx) uuid.UUID {
	if ws, ok := CurrentWorkspace(c); ok {
		return ws.ID
	}
	return uuid.Nil
}

func rejectSystemManagedSchemaMutation(c *fiber.Ctx, definition models.EntityDefinition) error {
	if !services.IsSystemManagedDefinition(definition) {
		return nil
	}
	return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
		"error": "system-managed schemas cannot be modified through the builder",
		"code":  "SYSTEM_SCHEMA_IMMUTABLE",
	})
}
