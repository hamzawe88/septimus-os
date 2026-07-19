package middleware

import (
	"fmt"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
)

// QuotaEnforcerMiddleware blocks a create when the workspace has hit its plan's
// cap for that resource. Limits are read from the data-driven entitlements
// (services.GetLimit) — never hardcoded — and current usage is counted live.
func QuotaEnforcerMiddleware(resourceType string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		ws := resolveWorkspace(c)
		if ws == nil {
			return c.Next()
		}

		max := services.GetLimit(ws, resourceType)
		if max == services.Unlimited {
			return c.Next()
		}

		db := database.GetDB(c)
		var current int64
		switch strings.ToLower(resourceType) {
		case services.LimUsers:
			db.Model(&models.User{}).Where("workspace_id = ?", ws.ID).Count(&current)
		case services.LimProjects:
			db.Model(&models.Project{}).Where("workspace_id = ?", ws.ID).Count(&current)
		case services.LimWorkflows:
			db.Model(&models.Workflow{}).Where("workspace_id = ?", ws.ID).Count(&current)
		case services.LimIntegrations:
			db.Model(&models.WorkspaceIntegration{}).Where("workspace_id = ?", ws.ID).Count(&current)
		default:
			return c.Next() // unknown resource → don't block
		}

		if current >= max {
			return c.Status(fiber.StatusPaymentRequired).JSON(fiber.Map{
				"error":    fmt.Sprintf("Plan limit reached for '%s' (%d/%d). Please upgrade your plan.", resourceType, current, max),
				"code":     "QUOTA_EXCEEDED",
				"resource": resourceType,
				"current":  current,
				"limit":    max,
			})
		}
		return c.Next()
	}
}
