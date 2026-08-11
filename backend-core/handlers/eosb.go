package handlers

import (
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
)

// End-of-service benefit (EOSB) calculator — Saudi Labour Law Arts. 84–85.
//
// Award (employer termination / contract end, Art. 84):
//   - half a month's wage for each of the first 5 years of service,
//   - a full month's wage for each year beyond 5,
//   - pro-rated for partial years.
// Resignation reduction (Art. 85) applies a factor to that award:
//   - < 2 years  → 0
//   - 2–5 years  → 1/3
//   - 5–10 years → 2/3
//   - ≥ 10 years → full.
//
// "Wage" here is the last full monthly wage (basic + housing + transport), the
// common EOSB basis. It is a pure calculation over the employee's current
// figures, so it stays a read endpoint with no stored state.

// serviceYears returns completed years of service plus the fraction into the
// current year, measured on the calendar. Unlike dividing raw days by 365.25,
// this yields exactly N at the Nth hire anniversary — which matters because the
// EOSB brackets (5 and 10 years) and the annual-leave step are threshold rules:
// an employee on their anniversary must land on, not just below, the boundary.
func serviceYears(hire, asOf time.Time) float64 {
	if !asOf.After(hire) {
		return 0
	}
	years := asOf.Year() - hire.Year()
	anniv := time.Date(asOf.Year(), hire.Month(), hire.Day(), 0, 0, 0, 0, time.UTC)
	if asOf.Before(anniv) {
		years--
		prev := anniv.AddDate(-1, 0, 0)
		span := anniv.Sub(prev).Hours()
		return float64(years) + asOf.Sub(prev).Hours()/span
	}
	next := anniv.AddDate(1, 0, 0)
	span := next.Sub(anniv).Hours()
	return float64(years) + asOf.Sub(anniv).Hours()/span
}

func eosbResignationFactor(years float64) float64 {
	switch {
	case years < 2:
		return 0
	case years < 5:
		return 1.0 / 3.0
	case years < 10:
		return 2.0 / 3.0
	default:
		return 1
	}
}

// GetEmployeeEOSB computes the gratuity for one employee as of a date.
// Query params: as_of=YYYY-MM-DD (default today), reason=termination|resignation
// (default termination).
func GetEmployeeEOSB(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}

	var emp models.Employee
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", c.Params("id"), workspaceID).First(&emp).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Employee not found"})
	}
	if emp.HireDate == nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "employee has no hire_date; cannot compute end-of-service"})
	}

	asOf := time.Now()
	if v := parseDate(c.Query("as_of")); v != nil {
		asOf = *v
	} else if emp.TerminationDate != nil {
		asOf = *emp.TerminationDate
	}
	if asOf.Before(*emp.HireDate) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "as_of is before the hire date"})
	}

	reason := strings.ToLower(strings.TrimSpace(c.Query("reason", "termination")))
	if reason != "resignation" && reason != "termination" {
		reason = "termination"
	}

	years := serviceYears(*emp.HireDate, asOf)
	monthlyWage := emp.BaseSalary + emp.HousingAllowance + emp.TransportAllowance

	firstFive := years
	if firstFive > 5 {
		firstFive = 5
	}
	beyondFive := years - 5
	if beyondFive < 0 {
		beyondFive = 0
	}
	firstFiveComponent := firstFive * 0.5 * monthlyWage
	beyondFiveComponent := beyondFive * 1.0 * monthlyWage
	grossAward := firstFiveComponent + beyondFiveComponent

	factor := 1.0
	if reason == "resignation" {
		factor = eosbResignationFactor(years)
	}
	payable := grossAward * factor

	return c.JSON(fiber.Map{
		"employee_id":           emp.ID,
		"employee_name":         emp.FullName,
		"hire_date":             dateStr(emp.HireDate),
		"as_of":                 asOf.Format("2006-01-02"),
		"reason":                reason,
		"years_of_service":      round2(years),
		"monthly_wage":          round2(monthlyWage),
		"first_five_component":  round2(firstFiveComponent),
		"beyond_five_component": round2(beyondFiveComponent),
		"gross_award":           round2(grossAward),
		"resignation_factor":    round2(factor),
		"payable_amount":        round2(payable),
		"currency":              "SAR",
	})
}
