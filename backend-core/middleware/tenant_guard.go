package middleware

import (
	"fmt"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/gorm"
)

// tierRank returns numerical value for tier comparison
func tierRank(tier string) int {
	switch strings.ToLower(tier) {
	case "enterprise":
		return 4
	case "business":
		return 3
	case "starter":
		return 2
	case "free", "":
		return 1
	default:
		return 0
	}
}

// TenantEnforcerMiddleware extracts workspace_id from claims/locals, validates workspace status, and configures PostgreSQL RLS isolation
func TenantEnforcerMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		wsIDStr, _ := c.Locals("workspace_id").(string)
		role, _ := c.Locals("role").(string)
		isImpersonated, _ := c.Locals("is_impersonated").(bool)
		if wsIDStr == "" {
			// Only an explicitly non-impersonated super-admin may use a global
			// route. Every normal JWT request must carry a tenant; continuing
			// here used to turn a missing claim into an unscoped request.
			if strings.EqualFold(role, "super_admin") && !isImpersonated {
				c.Locals("allow_global_access", true)
				return c.Next()
			}
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "workspace context is required",
				"code":  "TENANT_CONTEXT_REQUIRED",
			})
		}

		wsID := database.ParseUUID(wsIDStr)
		if wsID == uuid.Nil {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "invalid workspace context",
				"code":  "TENANT_CONTEXT_INVALID",
			})
		}
		var ws models.Workspace
		if err := database.DB.Where("id = ?", wsID).First(&ws).Error; err != nil {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "Workspace/Tenant not found or unauthorized",
				"code":  "TENANT_NOT_FOUND",
			})
		}

		if strings.EqualFold(ws.Status, "suspended") || strings.EqualFold(ws.Status, "cancelled") {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "Workspace subscription is suspended or cancelled. Please update billing details.",
				"code":  "TENANT_SUSPENDED",
			})
		}

		// Store workspace struct in fiber locals for easy access by feature gates and handlers
		c.Locals("workspace", &ws)
		c.Locals("workspace_tier", ws.Tier)

		// Super admins (when not impersonating) are allowed to read across
		// tenants. They therefore run on the privileged pool: leaving no
		// transaction in locals makes database.GetDB fall back to it. Opening an
		// RLS-enforced transaction without setting the tenant key would instead
		// return zero rows once the permissive policy branch is removed.
		if role == "super_admin" && !isImpersonated {
			c.Locals("allow_global_access", true)
			return c.Next()
		}

		// Everything else runs on the least-privilege pool so PostgreSQL applies
		// the tenant policies. If that pool is unavailable the middleware falls
		// back to the privileged one — the request still works, but without the
		// RLS backstop, which database.connectAppRole has already logged.
		pool := database.AppDB
		if pool == nil {
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
				"error": "tenant isolation is unavailable",
				"code":  "TENANT_ISOLATION_UNAVAILABLE",
			})
		}

		// The tenant key is transaction-local, so every query for this request
		// MUST run inside this transaction (handlers get it via database.GetDB).
		txErr := pool.Transaction(func(tx *gorm.DB) error {
			// Set the transaction-local variable the RLS policies read.
			// Parameterised via set_config: SET LOCAL cannot take a bind
			// parameter, so the previous version interpolated the workspace id
			// straight into the statement string. The workspace lookup above
			// happens to reject malformed ids before this line, but a tenant
			// identifier must never be concatenated into SQL — the safety of this
			// line should not depend on a check elsewhere.
			// The third argument (true) makes it transaction-local.
			if err := tx.Exec(`SELECT set_config('app.current_workspace_id', ?, true)`, wsID.String()).Error; err != nil {
				return err
			}

			// Store the transaction in locals so handlers can use database.GetDB(c)
			c.Locals("db_tx", tx)

			// Proceed to the next handler using the active transaction
			return c.Next()
		})

		return txErr
	}
}

// FeatureGateMiddleware restricts endpoint access based on the workspace tier ('free', 'starter', 'business', 'enterprise')
func FeatureGateMiddleware(requiredTier string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		wsVal := c.Locals("workspace")
		var ws *models.Workspace
		if wsVal != nil {
			ws, _ = wsVal.(*models.Workspace)
		}

		if ws == nil {
			// Fallback check DB if TenantEnforcer ran before locals populated or missing
			wsIDVal := c.Locals("workspace_id")
			if wsIDVal != nil {
				if wsIDStr, ok := wsIDVal.(string); ok && wsIDStr != "" {
					var fetched models.Workspace
					if err := database.DB.Where("id = ?", database.ParseUUID(wsIDStr)).First(&fetched).Error; err == nil {
						ws = &fetched
					}
				}
			}
		}

		currentTier := "free"
		if ws != nil && ws.Tier != "" {
			currentTier = ws.Tier
		}

		if ws != nil && ws.Status == "past_due" {
			return c.Status(fiber.StatusPaymentRequired).JSON(fiber.Map{
				"error": "Workspace subscription is past due. Please update billing details.",
				"code":  "TENANT_PAST_DUE",
			})
		}

		if tierRank(currentTier) < tierRank(requiredTier) {
			return c.Status(fiber.StatusPaymentRequired).JSON(fiber.Map{
				"error":         fmt.Sprintf("Feature requires the '%s' subscription plan or higher.", strings.Title(requiredTier)),
				"code":          "UPGRADE_REQUIRED",
				"required_tier": strings.ToLower(requiredTier),
				"current_tier":  strings.ToLower(currentTier),
			})
		}

		return c.Next()
	}
}
