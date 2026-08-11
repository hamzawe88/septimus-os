package handlers

import (
	"math"
	"sort"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
)

// GetHRAnalytics returns a workspace HR snapshot for the analytics dashboard
// (G9): headcount + Saudization, turnover, leave, compliance, and performance —
// all computed live from the relational tables, workspace-scoped.
func GetHRAnalytics(c *fiber.Ctx) error {
	ws := CurrentWorkspaceID(c)
	if ws == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	db := database.GetDB(c)

	countEmp := func(cond string, args ...interface{}) int64 {
		var n int64
		q := db.Model(&models.Employee{}).Where("workspace_id = ?", ws)
		if cond != "" {
			q = q.Where(cond, args...)
		}
		q.Count(&n)
		return n
	}

	total := countEmp("")
	active := countEmp("status <> ?", "terminated")
	terminated := countEmp("status = ?", "terminated")

	// Saudization: explicit Saudi nationals over the active headcount.
	saudiSet := []string{"saudi", "سعودي", "سعودية", "sa", "ksa", "saudi arabia"}
	saudi := countEmp("status <> ? AND lower(trim(nationality)) IN ?", "terminated", saudiSet)
	saudization := 0.0
	if active > 0 {
		saudization = math.Round(float64(saudi)/float64(active)*1000) / 10
	}
	turnover := 0.0
	if total > 0 {
		turnover = math.Round(float64(terminated)/float64(total)*1000) / 10
	}

	// Headcount by department (active only).
	type deptRow struct {
		Department string `json:"department"`
		Count      int    `json:"count"`
	}
	var depts []deptRow
	db.Model(&models.Employee{}).
		Select("COALESCE(NULLIF(department,''), '—') AS department, count(*) AS count").
		Where("workspace_id = ? AND status <> ?", ws, "terminated").
		Group("department").Order("count desc").Scan(&depts)

	// Leave.
	today := time.Now().Format("2006-01-02")
	var onLeaveToday, pendingLeave int64
	db.Model(&models.LeaveRequest{}).
		Where("workspace_id = ? AND status = ? AND start_date <= ? AND end_date >= ?", ws, "approved", today, today).
		Count(&onLeaveToday)
	db.Model(&models.LeaveRequest{}).Where("workspace_id = ? AND status = ?", ws, "pending").Count(&pendingLeave)

	// Compliance — documents expiring within 60 days.
	cutoff := time.Now().AddDate(0, 0, 60)
	var expiring int64
	db.Model(&models.Employee{}).
		Where("workspace_id = ? AND status <> ? AND ((iqama_expiry IS NOT NULL AND iqama_expiry <= ?) OR (insurance_expiry IS NOT NULL AND insurance_expiry <= ?))",
			ws, "terminated", cutoff, cutoff).Count(&expiring)

	// Performance.
	var activeGoals, completedGoals int64
	db.Model(&models.PerformanceGoal{}).Where("workspace_id = ? AND status = ?", ws, "active").Count(&activeGoals)
	db.Model(&models.PerformanceGoal{}).Where("workspace_id = ? AND status = ?", ws, "completed").Count(&completedGoals)

	// Latest posted payroll totals.
	var run models.PayrollRun
	payroll := fiber.Map{"month": nil, "total_net": 0, "total_gosi": 0}
	if err := db.Where("workspace_id = ? AND status = ?", ws, "posted").
		Order("year desc, month desc").First(&run).Error; err == nil {
		payroll = fiber.Map{
			"month":      run.Year*100 + run.Month,
			"total_net":  run.TotalNet,
			"total_gosi": run.TotalGOSI,
		}
	}

	return c.JSON(fiber.Map{
		"headcount": fiber.Map{
			"total":               total,
			"active":              active,
			"saudi":               saudi,
			"saudization_percent": saudization,
			"by_department":       depts,
		},
		"turnover":    fiber.Map{"terminated": terminated, "rate_percent": turnover},
		"leave":       fiber.Map{"on_leave_today": onLeaveToday, "pending_requests": pendingLeave},
		"compliance":  fiber.Map{"expiring_documents": expiring},
		"performance": fiber.Map{"active_goals": activeGoals, "completed_goals": completedGoals},
		"payroll":     payroll,
	})
}

// GetAttritionRisk scores each active employee's flight risk from transparent,
// explainable signals — high leave usage, thin recent attendance, low
// performance rating, short tenure, pending leave — and returns those at
// medium/high risk with their contributing factors. This is a heuristic early-
// warning flag, deliberately not a black-box model: every point is traceable.
func GetAttritionRisk(c *fiber.Ctx) error {
	ws := CurrentWorkspaceID(c)
	if ws == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	db := database.GetDB(c)
	now := time.Now()
	year := now.Year()

	var employees []models.Employee
	db.Where("workspace_id = ? AND status <> ?", ws, "terminated").Find(&employees)

	// Annual leave usage (current year).
	type lb struct {
		EmployeeID   uuid.UUID
		TakenDays    float64
		EntitledDays float64
	}
	var lbs []lb
	db.Model(&models.LeaveBalance{}).Select("employee_id, taken_days, entitled_days").
		Where("workspace_id = ? AND leave_type = ? AND year = ?", ws, "annual", year).Scan(&lbs)
	leaveByEmp := map[uuid.UUID]lb{}
	for _, x := range lbs {
		leaveByEmp[x.EmployeeID] = x
	}

	// Recent attendance (last 30 days) by user.
	type ac struct {
		UserID uuid.UUID
		N      int
	}
	var acs []ac
	db.Model(&models.AttendanceLog{}).Select("user_id, count(*) AS n").
		Where("workspace_id = ? AND check_in_time >= now() - interval '30 days'", ws).
		Group("user_id").Scan(&acs)
	attByUser := map[uuid.UUID]int{}
	for _, x := range acs {
		attByUser[x.UserID] = x.N
	}

	// Latest review rating per employee (submitted/acknowledged only).
	var reviews []models.PerformanceReview
	db.Where("workspace_id = ? AND status IN ?", ws, []string{"submitted", "acknowledged"}).
		Order("created_at desc").Find(&reviews)
	ratingByEmp := map[uuid.UUID]int{}
	for _, r := range reviews {
		if _, seen := ratingByEmp[r.EmployeeID]; !seen {
			ratingByEmp[r.EmployeeID] = r.OverallRating // first = most recent
		}
	}

	// Pending leave requests per employee.
	type pl struct {
		EmployeeID uuid.UUID
		N          int
	}
	var pls []pl
	db.Model(&models.LeaveRequest{}).Select("employee_id, count(*) AS n").
		Where("workspace_id = ? AND status = ?", ws, "pending").Group("employee_id").Scan(&pls)
	pendingByEmp := map[uuid.UUID]int{}
	for _, x := range pls {
		pendingByEmp[x.EmployeeID] = x.N
	}

	type riskRow struct {
		EmployeeID uuid.UUID `json:"employee_id"`
		Name       string    `json:"employee_name"`
		Department string    `json:"department"`
		Score      int       `json:"score"`
		Level      string    `json:"level"`
		Factors    []string  `json:"factors"`
	}
	out := make([]riskRow, 0)
	for _, e := range employees {
		score := 0
		factors := []string{}

		if l, ok := leaveByEmp[e.ID]; ok && l.EntitledDays > 0 && l.TakenDays/l.EntitledDays >= 0.8 {
			score += 25
			factors = append(factors, "high_leave_usage")
		}
		if e.UserID != nil {
			n := attByUser[*e.UserID]
			if n == 0 {
				score += 20
				factors = append(factors, "no_recent_attendance")
			} else if n < 8 {
				score += 10
				factors = append(factors, "low_attendance")
			}
		}
		if rating, ok := ratingByEmp[e.ID]; ok {
			if rating > 0 && rating <= 2 {
				score += 30
				factors = append(factors, "low_performance")
			} else if rating == 3 {
				score += 10
				factors = append(factors, "average_performance")
			}
		}
		if e.HireDate != nil && serviceYears(*e.HireDate, now) < 1 {
			score += 10
			factors = append(factors, "new_hire")
		}
		if pendingByEmp[e.ID] > 0 {
			score += 5
			factors = append(factors, "pending_leave")
		}

		if score > 100 {
			score = 100
		}
		level := "low"
		if score >= 60 {
			level = "high"
		} else if score >= 35 {
			level = "medium"
		}
		// Only surface actionable (medium/high) risks.
		if level == "low" {
			continue
		}
		out = append(out, riskRow{EmployeeID: e.ID, Name: e.FullName, Department: e.Department, Score: score, Level: level, Factors: factors})
	}
	// Highest risk first.
	sort.Slice(out, func(i, j int) bool { return out[i].Score > out[j].Score })

	return c.JSON(fiber.Map{"data": out, "total_active": len(employees), "at_risk": len(out)})
}
