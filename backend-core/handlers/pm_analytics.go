package handlers

import (
	"math"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
)

// Delivery analytics for PM: sprint velocity, burndown, and cycle time.
//
// The dashboard answers "what is the state right now?"; this answers "how fast
// does this team actually deliver, and where does work get stuck?".
//
// Cycle time comes from task_history (PreviousStatus → NewStatus with a
// timestamp), which is already written on every transition — the same approach
// the CRM velocity endpoint takes with the audit log. No new bookkeeping.

// pmDoneStatus is the terminal task status; kept as a var so a workspace that
// renames its final column only changes this one place.
var pmDoneStatus = "done"

func round1(x float64) float64 { return math.Round(x*10) / 10 }

// GetPMVelocity returns completed story points per finished sprint, plus the
// running average — the number a team uses to forecast the next sprint.
func GetPMVelocity(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	db := database.GetDB(c)

	q := db.Table("sprints").Where("workspace_id = ?", workspaceID)
	if pid := c.Query("project_id"); pid != "" {
		if _, err := uuid.Parse(pid); err == nil {
			q = q.Where("project_id = ?", pid)
		}
	}
	var sprints []models.Sprint
	if err := q.Order("start_date ASC NULLS LAST, created_at ASC").Limit(12).Find(&sprints).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load sprints"})
	}

	out := make([]fiber.Map, 0, len(sprints))
	var completedPoints []float64
	for _, s := range sprints {
		type agg struct {
			Total     int64
			Done      int64
			Points    int64
			DonePoint int64
		}
		var a agg
		db.Table("tasks").
			Where("workspace_id = ? AND sprint_id = ?", workspaceID, s.ID).
			Select(`COUNT(*) AS total,
				COUNT(*) FILTER (WHERE status = ?) AS done,
				COALESCE(SUM(story_points), 0) AS points,
				COALESCE(SUM(story_points) FILTER (WHERE status = ?), 0) AS done_point`,
				pmDoneStatus, pmDoneStatus).Scan(&a)

		row := fiber.Map{
			"sprint_id": s.ID, "name": s.Name, "status": s.Status,
			"start_date": dateStr(s.StartDate), "end_date": dateStr(s.EndDate),
			"total_tasks": a.Total, "done_tasks": a.Done,
			"committed_points": a.Points, "completed_points": a.DonePoint,
		}
		if a.Points > 0 {
			row["completion_percent"] = round1(float64(a.DonePoint) / float64(a.Points) * 100)
		}
		// Only completed sprints count toward the velocity average — an active
		// sprint is still in flight and would drag the number down.
		if s.Status == "completed" {
			completedPoints = append(completedPoints, float64(a.DonePoint))
		}
		out = append(out, row)
	}

	avg := 0.0
	if len(completedPoints) > 0 {
		var sum float64
		for _, p := range completedPoints {
			sum += p
		}
		avg = round1(sum / float64(len(completedPoints)))
	}
	return c.JSON(fiber.Map{
		"sprints": out, "completed_sprints": len(completedPoints),
		"average_velocity_points": avg,
	})
}

// GetPMBurndown returns the day-by-day remaining points for one sprint, next to
// the ideal straight line, so a team can see whether it is ahead or behind.
func GetPMBurndown(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	sprintID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "valid sprint id is required"})
	}
	db := database.GetDB(c)

	var sprint models.Sprint
	if err := db.Where("id = ? AND workspace_id = ?", sprintID, workspaceID).First(&sprint).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Sprint not found"})
	}
	if sprint.StartDate == nil || sprint.EndDate == nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "sprint has no start/end date"})
	}

	// Total committed points, and when each task's points were burned (the
	// moment it entered the done status, per task_history).
	type burnRow struct {
		Points int64
		DoneAt *time.Time
	}
	var rows []burnRow
	if err := db.Table("tasks").
		Joins(`LEFT JOIN LATERAL (
			SELECT th.changed_at FROM task_histories th
			WHERE th.task_id = tasks.id AND th.new_status = ?
			ORDER BY th.changed_at ASC LIMIT 1
		) done_evt ON TRUE`, pmDoneStatus).
		Where("tasks.workspace_id = ? AND tasks.sprint_id = ?", workspaceID, sprintID).
		Select("COALESCE(tasks.story_points,0) AS points, done_evt.changed_at AS done_at").
		Scan(&rows).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to compute burndown"})
	}

	var total int64
	for _, r := range rows {
		total += r.Points
	}

	start := sprint.StartDate.UTC().Truncate(24 * time.Hour)
	end := sprint.EndDate.UTC().Truncate(24 * time.Hour)
	days := int(end.Sub(start).Hours()/24) + 1
	if days < 1 || days > 120 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "sprint date range is not usable"})
	}

	series := make([]fiber.Map, 0, days)
	for i := 0; i < days; i++ {
		day := start.AddDate(0, 0, i)
		cutoff := day.Add(24 * time.Hour)
		var burned int64
		for _, r := range rows {
			if r.DoneAt != nil && r.DoneAt.Before(cutoff) {
				burned += r.Points
			}
		}
		ideal := float64(total)
		if days > 1 {
			ideal = float64(total) * (1 - float64(i)/float64(days-1))
		}
		entry := fiber.Map{
			"date":            day.Format("2006-01-02"),
			"ideal_remaining": round1(ideal),
		}
		// Do not draw the actual line into the future — an unstarted day has no
		// measurement, and plotting "total remaining" there would read as being
		// catastrophically behind rather than simply not yet reached.
		if !day.After(time.Now().UTC()) {
			entry["remaining"] = total - burned
		}
		series = append(series, entry)
	}

	return c.JSON(fiber.Map{
		"sprint_id": sprint.ID, "name": sprint.Name, "status": sprint.Status,
		"total_points": total, "days": days, "series": series,
	})
}

// GetPMCycleTime reports how long tasks take from first movement to done, and
// how long they dwell in each status — the delivery bottleneck view.
func GetPMCycleTime(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	db := database.GetDB(c)

	type histRow struct {
		TaskID         string
		PreviousStatus string
		NewStatus      string
		ChangedAt      time.Time
	}
	var hist []histRow
	if err := db.Table("task_histories").
		Joins("JOIN tasks ON tasks.id = task_histories.task_id").
		Where("tasks.workspace_id = ?", workspaceID).
		Select(`task_histories.task_id AS task_id, task_histories.previous_status AS previous_status,
			task_histories.new_status AS new_status, task_histories.changed_at AS changed_at`).
		Order("task_histories.task_id, task_histories.changed_at ASC").Scan(&hist).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to read task history"})
	}

	type dwellAgg struct {
		total float64
		n     int
	}
	dwell := map[string]*dwellAgg{}
	var cycles []float64

	var curTask string
	var firstAt, prevAt time.Time
	var prevStatus string
	for _, h := range hist {
		if h.TaskID != curTask {
			curTask, firstAt, prevAt, prevStatus = h.TaskID, h.ChangedAt, h.ChangedAt, h.PreviousStatus
		}
		if prevStatus != "" {
			d := dwell[prevStatus]
			if d == nil {
				d = &dwellAgg{}
				dwell[prevStatus] = d
			}
			d.total += h.ChangedAt.Sub(prevAt).Hours() / 24
			d.n++
		}
		if h.NewStatus == pmDoneStatus && !firstAt.IsZero() {
			cycles = append(cycles, h.ChangedAt.Sub(firstAt).Hours()/24)
		}
		prevAt, prevStatus = h.ChangedAt, h.NewStatus
	}

	statuses := []string{"todo", "in_progress", "review", "blocked"}
	byStatus := make([]fiber.Map, 0, len(statuses))
	bottleneck, worst := "", -1.0
	for _, st := range statuses {
		avg, n := 0.0, 0
		if d := dwell[st]; d != nil && d.n > 0 {
			avg, n = round1(d.total/float64(d.n)), d.n
		}
		if avg > worst {
			worst, bottleneck = avg, st
		}
		byStatus = append(byStatus, fiber.Map{"status": st, "avg_days": avg, "samples": n})
	}

	avgCycle := 0.0
	if len(cycles) > 0 {
		var sum float64
		for _, d := range cycles {
			sum += d
		}
		avgCycle = round1(sum / float64(len(cycles)))
	}

	resp := fiber.Map{
		"avg_cycle_days": avgCycle, "completed_tasks": len(cycles),
		"dwell_by_status": byStatus, "total_transitions": len(hist),
	}
	if worst > 0 {
		resp["bottleneck_status"] = bottleneck
		resp["bottleneck_avg_days"] = worst
	}
	return c.JSON(resp)
}
