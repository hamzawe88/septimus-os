package handlers

import (
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/gorm"
)

// Server-side payroll engine (M1 / G3).
//
// The previous flow computed net = gross in the browser with no deductions. This
// engine snapshots every active employee into a Payslip with statutory GOSI
// applied, freezing the figures at run time. Rates live here as editable
// package vars (not magic numbers scattered in logic) so a regulation change is
// a one-line edit, per the proposal's risk-mitigation note.
//
// GOSI (General Organization for Social Insurance), current Saudi rates:
//   - Contributory wage = basic + housing, capped at SAR 45,000.
//   - Saudi national:  employee 9.75%, employer 11.75%.
//   - Non-Saudi:       employee 0%,    employer 2% (occupational hazard only).
var (
	gosiCeiling              = 45000.0
	gosiSaudiEmployeeRate    = 0.0975
	gosiSaudiEmployerRate    = 0.1175
	gosiNonSaudiEmployerRate = 0.02
)

func round2(x float64) float64 { return math.Round(x*100) / 100 }

// isSaudiNationality classifies an employee for GOSI. Unset nationality defaults
// to Saudi (full GOSI) because this is a Saudi-first system and under-deducting
// is the costlier error; set the field explicitly for expatriates.
func isSaudiNationality(n string) bool {
	switch strings.ToLower(strings.TrimSpace(n)) {
	case "", "saudi", "سعودي", "سعودية", "sa", "ksa", "saudi arabia":
		return true
	}
	return false
}

// computeGOSI returns (employeeDeduction, employerContribution).
func computeGOSI(base, housing float64, saudi bool) (float64, float64) {
	contributory := base + housing
	if contributory > gosiCeiling {
		contributory = gosiCeiling
	}
	if saudi {
		return round2(contributory * gosiSaudiEmployeeRate), round2(contributory * gosiSaudiEmployerRate)
	}
	return 0, round2(contributory * gosiNonSaudiEmployerRate)
}

func payslipFor(emp models.Employee) models.Payslip {
	saudi := isSaudiNationality(emp.Nationality)
	gross := emp.BaseSalary + emp.HousingAllowance + emp.TransportAllowance
	gosiEmp, gosiEmployer := computeGOSI(emp.BaseSalary, emp.HousingAllowance, saudi)
	net := round2(gross - gosiEmp)
	return models.Payslip{
		WorkspaceID:        emp.WorkspaceID,
		EmployeeID:         emp.ID,
		EmployeeName:       emp.FullName,
		BaseSalary:         emp.BaseSalary,
		HousingAllowance:   emp.HousingAllowance,
		TransportAllowance: emp.TransportAllowance,
		GrossSalary:        round2(gross),
		GosiEmployee:       gosiEmp,
		GosiEmployer:       gosiEmployer,
		NetSalary:          net,
		IBAN:               emp.IBAN,
		Nationality:        emp.Nationality,
		IsSaudi:            saudi,
	}
}

func payrollRunEnvelope(r models.PayrollRun, includePayslips bool) fiber.Map {
	m := fiber.Map{
		"id":             r.ID,
		"year":           r.Year,
		"month":          r.Month,
		"status":         r.Status,
		"currency":       r.Currency,
		"employee_count": r.EmployeeCount,
		"total_gross":    r.TotalGross,
		"total_gosi":     r.TotalGOSI,
		"total_net":      r.TotalNet,
		"posted_at":      r.PostedAt,
		"created_at":     r.CreatedAt,
	}
	if includePayslips {
		slips := make([]fiber.Map, 0, len(r.Payslips))
		for _, p := range r.Payslips {
			slips = append(slips, fiber.Map{
				"id": p.ID, "employee_id": p.EmployeeID, "employee_name": p.EmployeeName,
				"base_salary": p.BaseSalary, "housing_allowance": p.HousingAllowance,
				"transport_allowance": p.TransportAllowance, "gross_salary": p.GrossSalary,
				"gosi_employee": p.GosiEmployee, "gosi_employer": p.GosiEmployer,
				"other_deductions": p.OtherDeductions, "net_salary": p.NetSalary,
				"iban": p.IBAN, "nationality": p.Nationality, "is_saudi": p.IsSaudi,
			})
		}
		m["payslips"] = slips
	}
	return m
}

// CreatePayrollRun snapshots a month's payroll for all active employees.
func CreatePayrollRun(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	var body struct {
		Year  int `json:"year"`
		Month int `json:"month"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	now := time.Now()
	if body.Year == 0 {
		body.Year = now.Year()
	}
	if body.Month == 0 {
		body.Month = int(now.Month())
	}
	if body.Month < 1 || body.Month > 12 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "month must be 1–12"})
	}

	// One run per period. Surface the existing one instead of silently duplicating.
	var existing models.PayrollRun
	if err := database.GetDB(c).Where("workspace_id = ? AND year = ? AND month = ?", workspaceID, body.Year, body.Month).
		First(&existing).Error; err == nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error":          "A payroll run already exists for this period",
			"payroll_run_id": existing.ID,
			"status":         existing.Status,
		})
	}

	var employees []models.Employee
	if err := database.GetDB(c).Where("workspace_id = ? AND status <> ?", workspaceID, "terminated").
		Find(&employees).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to load employees"})
	}
	if len(employees) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "No active employees to run payroll for"})
	}

	// Read Commission Policy
	var commPolicy models.WorkspaceSetting
	var calcCommission bool
	if err := database.GetDB(c).Where("workspace_id = ? AND key = ?", workspaceID, "hr_commission_policy").First(&commPolicy).Error; err == nil {
		var p struct {
			Type string `json:"type"`
		}
		if json.Unmarshal(commPolicy.Value, &p) == nil && p.Type == "automated" {
			calcCommission = true
		}
	}

	// We need Start and End of Month
	startOfMonth := time.Date(body.Year, time.Month(body.Month), 1, 0, 0, 0, 0, time.UTC)
	endOfMonth := startOfMonth.AddDate(0, 1, -1).Add(23 * time.Hour).Add(59 * time.Minute)

	run := models.PayrollRun{
		WorkspaceID: workspaceID, Year: body.Year, Month: body.Month,
		Status: "draft", Currency: "SAR", CreatedBy: currentUserUUID(c),
	}
	var totalGross, totalGOSI, totalNet float64
	slips := make([]models.Payslip, 0, len(employees))
	for _, emp := range employees {
		p := payslipFor(emp)
		
		if calcCommission && emp.UserID != nil {
			var commRate float64
			if emp.Attributes != nil {
				var attrs struct {
					CommissionRate float64 `json:"commission_rate"`
				}
				json.Unmarshal(emp.Attributes, &attrs)
				commRate = attrs.CommissionRate
			}
			if commRate > 0 {
				var wonValue float64
				database.GetDB(c).Model(&models.Entity{}).
					Where("workspace_id = ? AND entity_type = ? AND data->>'stage' = ? AND data->>'owner' = ? AND updated_at >= ? AND updated_at <= ?",
						workspaceID, "crm_opportunity", "closed_won", emp.UserID.String(), startOfMonth, endOfMonth).
					Select("COALESCE(SUM(CAST(data->>'value' AS NUMERIC)), 0)").Scan(&wonValue)
				commission := round2(wonValue * commRate)
				p.OtherAllowances += commission
				p.GrossSalary += commission
				p.NetSalary += commission
			}
		}

		totalGross += p.GrossSalary
		totalGOSI += p.GosiEmployee
		totalNet += p.NetSalary
		slips = append(slips, p)
	}
	run.EmployeeCount = len(slips)
	run.TotalGross = round2(totalGross)
	run.TotalGOSI = round2(totalGOSI)
	run.TotalNet = round2(totalNet)

	err := database.GetDB(c).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&run).Error; err != nil {
			return err
		}
		for i := range slips {
			slips[i].PayrollRunID = run.ID
		}
		return tx.Create(&slips).Error
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create payroll run"})
	}
	run.Payslips = slips
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message": "Payroll run created",
		"data":    payrollRunEnvelope(run, true),
	})
}

func GetPayrollRuns(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	var runs []models.PayrollRun
	if err := database.GetDB(c).Where("workspace_id = ?", workspaceID).
		Order("year desc, month desc").Find(&runs).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch payroll runs"})
	}
	out := make([]fiber.Map, 0, len(runs))
	for _, r := range runs {
		out = append(out, payrollRunEnvelope(r, false))
	}
	return c.JSON(fiber.Map{"data": out})
}

func GetPayrollRun(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	var run models.PayrollRun
	if err := database.GetDB(c).Preload("Payslips").
		Where("id = ? AND workspace_id = ?", c.Params("id"), workspaceID).First(&run).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Payroll run not found"})
	}
	return c.JSON(fiber.Map{"data": payrollRunEnvelope(run, true)})
}

// csvField quotes a value only when it contains a comma, quote, or newline, and
// doubles embedded quotes — the standard CSV escaping banks' WPS parsers expect.
func csvField(s string) string {
	if strings.ContainsAny(s, ",\"\n\r") {
		return `"` + strings.ReplaceAll(s, `"`, `""`) + `"`
	}
	return s
}

// ExportPayrollWPS renders a payroll run as a WPS SIF (Wage Protection System
// Salary Information File) — the CSV the bank/Mudad ingests to disburse wages.
// Layout: one EDR employer/summary record, then one SDR record per employee.
// National ID / Iqama is pulled from the employee's attributes when present;
// establishment and bank codes are added by the bank's own onboarding, so they
// are intentionally left for the operator rather than faked here.
func ExportPayrollWPS(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	var run models.PayrollRun
	if err := database.GetDB(c).Preload("Payslips").
		Where("id = ? AND workspace_id = ?", c.Params("id"), workspaceID).First(&run).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Payroll run not found"})
	}

	// Resolve national IDs from employee attributes in one query.
	natID := map[uuid.UUID]string{}
	if len(run.Payslips) > 0 {
		ids := make([]uuid.UUID, 0, len(run.Payslips))
		for _, p := range run.Payslips {
			ids = append(ids, p.EmployeeID)
		}
		var emps []models.Employee
		database.GetDB(c).Select("id, attributes").Where("id IN ?", ids).Find(&emps)
		for _, e := range emps {
			if len(e.Attributes) == 0 {
				continue
			}
			var attrs map[string]interface{}
			if json.Unmarshal(e.Attributes, &attrs) == nil {
				if v, ok := attrs["national_id"].(string); ok {
					natID[e.ID] = v
				}
			}
		}
	}

	var b strings.Builder
	// EDR — employer/summary record.
	fmt.Fprintf(&b, "EDR,%04d%02d,%d,%.2f,%s\n", run.Year, run.Month, run.EmployeeCount, run.TotalNet, run.Currency)
	// Detail header + one SDR per employee.
	b.WriteString("Record,EmployeeName,NationalID,IBAN,BasicSalary,HousingAllowance,OtherEarnings,Deductions,NetSalary,Currency\n")
	for _, p := range run.Payslips {
		otherEarnings := p.TransportAllowance + p.OtherAllowances
		deductions := p.GosiEmployee + p.OtherDeductions
		fmt.Fprintf(&b, "SDR,%s,%s,%s,%.2f,%.2f,%.2f,%.2f,%.2f,%s\n",
			csvField(p.EmployeeName), csvField(natID[p.EmployeeID]), csvField(p.IBAN),
			p.BaseSalary, p.HousingAllowance, otherEarnings, deductions, p.NetSalary, run.Currency)
	}

	filename := fmt.Sprintf("WPS_%04d_%02d.csv", run.Year, run.Month)
	c.Set("Content-Type", "text/csv; charset=utf-8")
	c.Set("Content-Disposition", "attachment; filename="+filename)
	return c.SendString(b.String())
}

// PostPayrollRun marks a draft run as posted (the financial commitment point).
func PostPayrollRun(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	var run models.PayrollRun
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", c.Params("id"), workspaceID).First(&run).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Payroll run not found"})
	}
	// Guard against a second finance entry: only a draft transitions to posted.
	if run.Status == "posted" {
		return c.JSON(fiber.Map{"message": "Already posted", "data": payrollRunEnvelope(run, false)})
	}
	now := time.Now()
	err := database.GetDB(c).Transaction(func(tx *gorm.DB) error {
		run.Status = "posted"
		run.PostedAt = &now
		if err := tx.Save(&run).Error; err != nil {
			return err
		}
		// Finance bridge: record the run as a posted expense so payroll shows up
		// in financial reporting — atomically with the status change, so a
		// posted run and its finance entry can never disagree.
		expense := map[string]interface{}{
			"name":           fmt.Sprintf("Payroll %04d-%02d", run.Year, run.Month),
			"expense_type":   "payroll",
			"payroll_run_id": run.ID.String(),
			"month":          fmt.Sprintf("%04d-%02d", run.Year, run.Month),
			"total_amount":   run.TotalNet,
			"total_gross":    run.TotalGross,
			"total_gosi":     run.TotalGOSI,
			"employee_count": run.EmployeeCount,
			"currency":       run.Currency,
			"status":         "posted",
			"posted_date":    now.Format(time.RFC3339),
			"notes":          fmt.Sprintf("Monthly payroll for %d employees", run.EmployeeCount),
		}
		_, err := createEntityRecordWithDB(tx, workspaceID, nil, currentUserUUID(c), "finance_expense", expense)
		return err
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to post payroll run"})
	}
	return c.JSON(fiber.Map{"message": "Payroll run posted and recorded in Finance", "data": payrollRunEnvelope(run, false)})
}
