package handlers

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
)

// GetEntitlementCatalog returns every gate-able feature key and limit resource,
// plus the built-in per-tier defaults. The admin plan editor renders its toggles
// and limit fields from this so the UI can never drift from the backend catalog.
func GetEntitlementCatalog(c *fiber.Ctx) error {
	tiers := []string{"free", "starter", "business", "enterprise"}
	defaults := fiber.Map{}
	for _, t := range tiers {
		defaults[t] = fiber.Map{
			"features": services.DefaultFeaturesFor(t),
			"limits":   services.DefaultLimitsFor(t),
		}
	}
	return c.JSON(fiber.Map{
		"feature_keys": services.AllFeatureKeys,
		"limit_keys":   services.AllLimitKeys,
		"tiers":        tiers,
		"defaults":     defaults,
		"unlimited":    services.Unlimited,
	})
}

// GetEntitlements returns the resolved feature flags, limits, and live usage for
// the caller's workspace — the single source the frontend consumes to show,
// hide, or lock gated UI (EntitlementsProvider / <Gated>).
func GetEntitlements(c *fiber.Ctx) error {
	var ws models.Workspace
	if wsVal := c.Locals("workspace"); wsVal != nil {
		if w, ok := wsVal.(*models.Workspace); ok && w != nil {
			ws = *w
		}
	}
	if ws.ID == uuid.Nil {
		if idVal, ok := c.Locals("workspace_id").(string); ok && idVal != "" {
			database.GetDB(c).Where("id = ?", database.ParseUUID(idVal)).First(&ws)
		}
	}

	features, limits := services.ResolveEntitlements(&ws)

	db := database.GetDB(c)
	var users, projects, integrations, workflows, schemas, aiTokens int64
	db.Model(&models.User{}).Where("workspace_id = ?", ws.ID).Count(&users)
	db.Model(&models.Project{}).Where("workspace_id = ?", ws.ID).Count(&projects)
	db.Model(&models.WorkspaceIntegration{}).Where("workspace_id = ?", ws.ID).Count(&integrations)
	db.Model(&models.Workflow{}).Where("workspace_id = ?", ws.ID).Count(&workflows)
	db.Model(&models.EntityDefinition{}).Where("workspace_id = ?", ws.ID).Count(&schemas)

	now := time.Now().UTC()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	db.Model(&models.AITokenUsage{}).
		Where("workspace_id = ? AND created_at >= ?", ws.ID, monthStart).
		Select("COALESCE(SUM(total_tokens),0)").Scan(&aiTokens)

	usage := map[string]int64{
		services.LimUsers:         users,
		services.LimProjects:      projects,
		services.LimIntegrations:  integrations,
		services.LimWorkflows:     workflows,
		services.LimDataSchemas:   schemas,
		services.LimAITokensMonth: aiTokens,
	}

	return c.JSON(fiber.Map{
		"tier":     services.NormalizeTier(ws.Tier),
		"features": features,
		"limits":   limits,
		"usage":    usage,
		"warnings": services.BuildQuotaWarnings(limits, usage),
	})
}
