package handlers

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/gorm"
)

// ── Internal ingest (ai-sidecar → Go) ────────────────────────────────────────

type aiUsageIngestRequest struct {
	WorkspaceID      string  `json:"workspace_id"`
	Provider         string  `json:"provider"`
	Model            string  `json:"model"`
	Tier             string  `json:"tier"`
	PromptTokens     int     `json:"prompt_tokens"`
	CompletionTokens int     `json:"completion_tokens"`
	TotalTokens      int     `json:"total_tokens"`
	EstimatedCostUSD float64 `json:"estimated_cost_usd"`
}

// IngestAITokenUsage persists one LLM usage event (token-gated, /internal only).
func IngestAITokenUsage(c *fiber.Ctx) error {
	var req aiUsageIngestRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	workspaceID := database.ParseUUID(req.WorkspaceID)
	if workspaceID == uuid.Nil {
		workspaceID = resolveDefaultWorkspaceID()
	}

	total := req.TotalTokens
	if total == 0 {
		total = req.PromptTokens + req.CompletionTokens
	}

	row := models.AITokenUsage{
		WorkspaceID:      workspaceID,
		Provider:         req.Provider,
		Model:            req.Model,
		Tier:             req.Tier,
		PromptTokens:     req.PromptTokens,
		CompletionTokens: req.CompletionTokens,
		TotalTokens:      total,
		CostUSD:          req.EstimatedCostUSD,
	}
	if err := database.GetDB(c).Create(&row).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to record AI usage"})
	}
	return c.Status(201).JSON(fiber.Map{"id": row.ID})
}

// ── Cost dashboard (JWT, workspace-scoped) ───────────────────────────────────

// aiUsageWorkspace resolves the caller's workspace from the JWT context, with a
// deterministic fallback (mirrors the fact/analytics handlers).
func aiUsageWorkspace(c *fiber.Ctx) uuid.UUID {
	var workspaceID uuid.UUID
	if val := c.Locals("workspace_id"); val != nil {
		if str, ok := val.(string); ok {
			workspaceID = database.ParseUUID(str)
		}
	}
	if workspaceID == uuid.Nil {
		workspaceID = resolveDefaultWorkspaceID()
	}
	return workspaceID
}

// GetAICostReport aggregates AI token spend for the caller's workspace over the
// last `days` days (default 30, capped at 365). Powers the cost dashboard.
func GetAICostReport(c *fiber.Ctx) error {
	workspaceID := aiUsageWorkspace(c)

	days := c.QueryInt("days", 30)
	if days <= 0 {
		days = 30
	}
	if days > 365 {
		days = 365
	}
	since := time.Now().AddDate(0, 0, -days)

	db := database.GetDB(c)
	// Fresh scoped query per aggregate so conditions never accumulate.
	newQuery := func() *gorm.DB {
		return db.Model(&models.AITokenUsage{}).
			Where("workspace_id = ? AND created_at > ?", workspaceID, since)
	}

	var totals struct {
		TotalTokens int64   `json:"total_tokens"`
		TotalCost   float64 `json:"total_cost_usd"`
		Calls       int64   `json:"calls"`
	}
	newQuery().
		Select("COALESCE(SUM(total_tokens),0) as total_tokens, COALESCE(SUM(cost_usd),0) as total_cost, COUNT(*) as calls").
		Scan(&totals)

	var byModel []struct {
		Model  string  `json:"model"`
		Tokens int64   `json:"tokens"`
		Cost   float64 `json:"cost_usd"`
		Calls  int64   `json:"calls"`
	}
	newQuery().
		Select("model, COALESCE(SUM(total_tokens),0) as tokens, COALESCE(SUM(cost_usd),0) as cost, COUNT(*) as calls").
		Group("model").
		Order("cost DESC").
		Scan(&byModel)

	var daily []struct {
		Date   string  `json:"date"`
		Tokens int64   `json:"tokens"`
		Cost   float64 `json:"cost_usd"`
	}
	newQuery().
		Select("DATE(created_at) as date, COALESCE(SUM(total_tokens),0) as tokens, COALESCE(SUM(cost_usd),0) as cost").
		Group("DATE(created_at)").
		Order("DATE(created_at) ASC").
		Scan(&daily)

	return c.JSON(fiber.Map{
		"workspace_id": workspaceID,
		"range_days":   days,
		"totals":       totals,
		"by_model":     byModel,
		"daily_trend":  daily,
	})
}
