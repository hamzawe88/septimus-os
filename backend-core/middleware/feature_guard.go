package middleware

import (
	"fmt"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
)

// resolveWorkspace pulls the tenant from locals (set by TenantEnforcer), falling
// back to a DB fetch by workspace_id.
func resolveWorkspace(c *fiber.Ctx) *models.Workspace {
	if wsVal := c.Locals("workspace"); wsVal != nil {
		if ws, ok := wsVal.(*models.Workspace); ok && ws != nil {
			return ws
		}
	}
	if idVal := c.Locals("workspace_id"); idVal != nil {
		if idStr, ok := idVal.(string); ok && idStr != "" {
			var ws models.Workspace
			if err := database.DB.Where("id = ?", database.ParseUUID(idStr)).First(&ws).Error; err == nil {
				return &ws
			}
		}
	}
	return nil
}

// RequireFeature gates a route on a data-driven entitlement (feature_key) rather
// than a hardcoded tier. The plan's stored overrides win over the default tier
// matrix (see services.ResolveEntitlements). Denials return 402 UPGRADE_REQUIRED
// carrying the missing feature so the frontend can open the upgrade modal.
func RequireFeature(featureKey string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		ws := resolveWorkspace(c)
		if ws == nil {
			// No resolvable tenant → let the auth/tenant layers reject; a feature
			// gate shouldn't be the thing that 500s on a missing workspace.
			return c.Next()
		}

		if strings.EqualFold(ws.Status, "past_due") {
			return c.Status(fiber.StatusPaymentRequired).JSON(fiber.Map{
				"error": "Workspace subscription is past due. Please update billing details.",
				"code":  "TENANT_PAST_DUE",
			})
		}

		if !services.HasFeature(ws, featureKey) {
			return c.Status(fiber.StatusPaymentRequired).JSON(fiber.Map{
				"error":            fmt.Sprintf("The '%s' feature is not included in your current plan.", featureKey),
				"code":             "UPGRADE_REQUIRED",
				"required_feature": featureKey,
				"required_tier":    services.MinTierForFeature(featureKey),
				"current_tier":     services.NormalizeTier(ws.Tier),
			})
		}
		return c.Next()
	}
}
