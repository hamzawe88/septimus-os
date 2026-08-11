package handlers

import (
	"math"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
)

// Weighted pipeline forecast + conversion funnel (CRM depth).
//
// The dashboard reports what already closed; this answers "what is the pipeline
// actually worth?" — every open opportunity discounted by the win-probability
// of the stage it sits in, plus how the funnel converts and which deals have
// gone quiet.
//
// Probabilities are package vars (not literals buried in the query) so a sales
// leader can retune them without hunting through SQL — the same rationale as
// the GOSI rates in payroll.
var crmStageProbability = map[string]float64{
	"new":         0.10,
	"contacted":   0.20,
	"qualified":   0.40,
	"proposal":    0.60,
	"negotiation": 0.80,
	"closed_won":  1.00,
	"closed_lost": 0.00,
}

// crmOpenStages is the pipeline order used for the funnel; closed stages are
// reported separately because they are outcomes, not pipeline.
var crmOpenStages = []string{"new", "contacted", "qualified", "proposal", "negotiation"}

// crmStaleDays is how long an opportunity may sit untouched before it is
// flagged as at-risk.
const crmStaleDays = 21

func round2f(x float64) float64 { return math.Round(x*100) / 100 }

// GetCRMForecast returns the weighted pipeline, per-stage breakdown, conversion
// funnel, and stalled deals for the workspace.
func GetCRMForecast(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	currency := strings.ToUpper(strings.TrimSpace(c.Query("currency")))
	if !crmCurrencyCode.MatchString(currency) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "currency must be a three-letter ISO code"})
	}
	db := database.GetDB(c)

	// One grouped pass over open opportunities in the requested currency.
	// Mirrors GetCRMDashboard's tenant + definition scoping exactly.
	type stageRow struct {
		Stage string
		Count int64
		Value float64
	}
	var rows []stageRow
	if err := db.Table("entities").
		Where(`workspace_id = ? AND entity_type = ? AND definition_id IS NOT NULL AND deleted_at IS NULL
			AND UPPER(COALESCE(data->>'currency', '')) = ?`, workspaceID, "crm_opportunity", currency).
		Select(`LOWER(COALESCE(data->>'stage', 'new')) AS stage, COUNT(*) AS count,
			COALESCE(SUM(NULLIF(data->>'value','')::numeric), 0) AS value`).
		Group("LOWER(COALESCE(data->>'stage', 'new'))").Scan(&rows).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to aggregate CRM pipeline"})
	}

	byStage := map[string]stageRow{}
	for _, r := range rows {
		byStage[r.Stage] = r
	}

	stages := make([]fiber.Map, 0, len(crmOpenStages))
	var openValue, weightedValue float64
	var openCount int64
	for _, st := range crmOpenStages {
		r := byStage[st]
		p := crmStageProbability[st]
		w := float64(0)
		if r.Value > 0 {
			w = r.Value * p
		}
		openValue += r.Value
		weightedValue += w
		openCount += r.Count
		stages = append(stages, fiber.Map{
			"stage": st, "count": r.Count,
			"value": round2f(r.Value), "probability": p, "weighted_value": round2f(w),
		})
	}

	won := byStage["closed_won"]
	lost := byStage["closed_lost"]
	decided := won.Count + lost.Count
	winRate := 0.0
	if decided > 0 {
		winRate = math.Round(float64(won.Count)/float64(decided)*1000) / 10
	}

	// Conversion funnel: how many opportunities reached at least each stage.
	// An opportunity in "proposal" has necessarily passed the earlier stages,
	// so each step is the cumulative remainder — plus everything already won.
	funnel := make([]fiber.Map, 0, len(crmOpenStages))
	for i, st := range crmOpenStages {
		var reached int64 = won.Count
		for _, later := range crmOpenStages[i:] {
			reached += byStage[later].Count
		}
		entry := fiber.Map{"stage": st, "reached": reached}
		if i > 0 {
			var prev int64 = won.Count
			for _, later := range crmOpenStages[i-1:] {
				prev += byStage[later].Count
			}
			rate := 0.0
			if prev > 0 {
				rate = math.Round(float64(reached)/float64(prev)*1000) / 10
			}
			entry["conversion_from_previous_percent"] = rate
		}
		funnel = append(funnel, entry)
	}

	// Stalled deals — open, untouched for longer than the threshold.
	cutoff := time.Now().AddDate(0, 0, -crmStaleDays)
	type staleRow struct {
		ID           uuid.UUID
		DisplayValue string
		Stage        string
		Value        float64
		UpdatedAt    time.Time
	}
	var stale []staleRow
	if err := db.Table("entities").
		Where(`workspace_id = ? AND entity_type = ? AND definition_id IS NOT NULL AND deleted_at IS NULL
			AND COALESCE(data->>'stage','new') NOT IN ('closed_won','closed_lost') AND updated_at < ?`,
			workspaceID, "crm_opportunity", cutoff).
		Select(`id, display_value, LOWER(COALESCE(data->>'stage','new')) AS stage,
			COALESCE(NULLIF(data->>'value','')::numeric, 0) AS value, updated_at`).
		Order("updated_at ASC").Limit(20).Scan(&stale).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load stalled CRM opportunities"})
	}
	stalled := make([]fiber.Map, 0, len(stale))
	for _, s := range stale {
		stalled = append(stalled, fiber.Map{
			"id": s.ID, "title": s.DisplayValue, "stage": s.Stage,
			"value": round2f(s.Value), "idle_days": int(time.Since(s.UpdatedAt).Hours() / 24),
		})
	}

	return c.JSON(fiber.Map{
		"currency": currency,
		"pipeline": fiber.Map{
			"open_count": openCount, "open_value": round2f(openValue),
			"weighted_value": round2f(weightedValue), "by_stage": stages,
		},
		"outcomes": fiber.Map{
			"won_count": won.Count, "won_value": round2f(won.Value),
			"lost_count": lost.Count, "win_rate_percent": winRate,
		},
		"funnel":           funnel,
		"stalled":          stalled,
		"stale_after_days": crmStaleDays,
	})
}
