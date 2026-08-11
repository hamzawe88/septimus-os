package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
)

// resolveDefaultWorkspaceID answers "which workspace" for requests that carry
// no tenant context at all (webhooks, internal calls) — but only when the answer
// is unambiguous, i.e. the deployment holds exactly one workspace.
//
// It used to return the OLDEST workspace unconditionally. That was written when
// Septimus was single-tenant and stayed after it wasn't: with several tenants in
// the table, "oldest" is simply the first customer who ever signed up, and every
// caller that fell through to this helper silently read or wrote that
// customer's data. Nine call sites depended on it.
//
// Returning uuid.Nil is the honest answer for an ambiguous request. Callers turn
// that into an error; none of them may treat it as "pick someone".
func resolveDefaultWorkspaceID() uuid.UUID {
	var count int64
	if err := database.DB.Model(&models.Workspace{}).Count(&count).Error; err != nil {
		return uuid.Nil
	}
	if count != 1 {
		// Zero: nothing exists yet. More than one: refusing to guess is the
		// whole point — a tenant must be named, not inferred.
		return uuid.Nil
	}

	var ws models.Workspace
	if err := database.DB.First(&ws).Error; err != nil {
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
