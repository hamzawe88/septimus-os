package handlers

import (
	"math"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
)

// Sales velocity — how long deals actually take, and where they get stuck.
//
// Every stage move already writes an audit row ("crm.opportunity.stage_changed"
// with {from,to} in details), so the full transition history is on disk. This
// reads that trail instead of adding new bookkeeping: cycle length is the span
// from an opportunity's first recorded move to the one that closed it, and
// dwell time is the gap between consecutive moves.
//
// Deals with no recorded transitions are invisible here by design — the audit
// log is the source of truth, and inventing timings for them would be a guess.

// GetCRMVelocity returns average sales-cycle length, per-stage dwell time, and
// the current bottleneck.
func GetCRMVelocity(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	db := database.GetDB(c)

	type moveRow struct {
		EntityID  string
		FromStage string
		ToStage   string
		CreatedAt time.Time
	}
	var moves []moveRow
	// Ordered per deal so consecutive rows are consecutive transitions.
	if err := db.Table("audit_logs").
		Where("workspace_id = ? AND action = ?", workspaceID, "crm.opportunity.stage_changed").
		Select(`entity_id AS entity_id, details->>'from' AS from_stage,
			details->>'to' AS to_stage, created_at`).
		Order("entity_id, created_at ASC").Scan(&moves).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to read stage history"})
	}

	type dwell struct {
		total float64
		n     int
	}
	dwellByStage := map[string]*dwell{}
	var cycleDays []float64

	var curID string
	var firstAt, prevAt time.Time
	var prevStage string
	flush := func(closedAt time.Time, closed bool) {
		if closed && !firstAt.IsZero() {
			cycleDays = append(cycleDays, closedAt.Sub(firstAt).Hours()/24)
		}
	}
	for _, m := range moves {
		if m.EntityID != curID {
			curID, firstAt, prevAt, prevStage = m.EntityID, m.CreatedAt, m.CreatedAt, m.FromStage
		}
		// Time spent in the stage we are leaving.
		if prevStage != "" {
			d := dwellByStage[prevStage]
			if d == nil {
				d = &dwell{}
				dwellByStage[prevStage] = d
			}
			d.total += m.CreatedAt.Sub(prevAt).Hours() / 24
			d.n++
		}
		if m.ToStage == "closed_won" || m.ToStage == "closed_lost" {
			flush(m.CreatedAt, true)
		}
		prevAt, prevStage = m.CreatedAt, m.ToStage
	}

	stages := make([]fiber.Map, 0, len(crmOpenStages))
	bottleneck, worst := "", -1.0
	for _, st := range crmOpenStages {
		avg := 0.0
		n := 0
		if d := dwellByStage[st]; d != nil && d.n > 0 {
			avg = math.Round(d.total/float64(d.n)*10) / 10
			n = d.n
		}
		if avg > worst {
			worst, bottleneck = avg, st
		}
		stages = append(stages, fiber.Map{"stage": st, "avg_days": avg, "samples": n})
	}

	avgCycle := 0.0
	if len(cycleDays) > 0 {
		var sum float64
		for _, d := range cycleDays {
			sum += d
		}
		avgCycle = math.Round(sum/float64(len(cycleDays))*10) / 10
	}

	resp := fiber.Map{
		"avg_cycle_days":    avgCycle,
		"closed_deals":      len(cycleDays),
		"dwell_by_stage":    stages,
		"total_transitions": len(moves),
	}
	// Only name a bottleneck when there is real data behind it.
	if worst > 0 {
		resp["bottleneck_stage"] = bottleneck
		resp["bottleneck_avg_days"] = worst
	}
	return c.JSON(resp)
}
