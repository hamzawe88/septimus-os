package middleware

import (
	"fmt"
	"strings"

	"github.com/gofiber/fiber/v2"
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
		wsIDVal := c.Locals("workspace_id")
		if wsIDVal == nil || wsIDVal == "" {
			// Some unauthenticated or system routes don't require workspace_id
			return c.Next()
		}

		wsIDStr, ok := wsIDVal.(string)
		if !ok || wsIDStr == "" {
			return c.Next()
		}

		wsID := database.ParseUUID(wsIDStr)
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

		// Start a database transaction for this request to ensure PostgreSQL Row-Level Security (RLS) is applied properly.
		// Since SET LOCAL only applies to the current transaction block, all queries for this request MUST use this transaction.
		txErr := database.DB.Transaction(func(tx *gorm.DB) error {
			// Set PostgreSQL session-local variable for Row-Level Security (RLS) policies
			if err := tx.Exec(fmt.Sprintf("SET LOCAL app.current_workspace_id = '%s'", wsIDStr)).Error; err != nil {
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
