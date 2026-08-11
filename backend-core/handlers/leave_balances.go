package handlers

import (
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/gorm"
)

// Leave balance engine (G2).
//
// Entitlement is derived from Saudi labour law, not typed in by hand:
//   - Annual (Art. 109): 21 days/year, rising to 30 after 5 years of service.
//   - Sick (Art. 117): 120-day envelope (30 full + 60 partial + 30 unpaid pay
//     tiers are a payroll concern; here we track the day envelope).
//   - Hajj (Art. 114): a 10–15 day grant, once during service.
//   - Maternity (Art. 151): 10 weeks = 70 days.
// Remaining is always computed (Entitled + CarriedOver + Adjustment − Taken),
// never stored, so it cannot drift out of sync with its inputs.

// leaveTypeDefaults is the fallback entitlement per type. Annual is special-
// cased by tenure in annualLeaveEntitlement and ignores this value.
var leaveTypeDefaults = map[string]float64{
	"annual":    21,
	"sick":      120,
	"hajj":      15,
	"maternity": 70,
	"unpaid":    0,
}

// leaveTypeOrder fixes the response order so the UI is stable.
var leaveTypeOrder = []string{"annual", "sick", "hajj", "maternity", "unpaid"}

// annualLeaveEntitlement implements Saudi Labour Law Art. 109: 21 days a year,
// increased to 30 once the worker completes five years of service. Tenure is
// measured to the end of the balance year.
func annualLeaveEntitlement(hireDate *time.Time, year int) float64 {
	if hireDate == nil {
		return 21
	}
	asOf := time.Date(year, 12, 31, 23, 59, 59, 0, time.UTC)
	years := asOf.Sub(*hireDate).Hours() / (24 * 365.25)
	if years >= 5 {
		return 30
	}
	return 21
}

func defaultEntitlement(leaveType string, hireDate *time.Time, year int) float64 {
	if leaveType == "annual" {
		return annualLeaveEntitlement(hireDate, year)
	}
	return leaveTypeDefaults[leaveType]
}

func leaveBalanceEnvelope(b models.LeaveBalance) fiber.Map {
	remaining := b.EntitledDays + b.CarriedOverDays + b.AdjustmentDays - b.TakenDays
	return fiber.Map{
		"id":                b.ID,
		"employee_id":       b.EmployeeID,
		"leave_type":        b.LeaveType,
		"year":              b.Year,
		"entitled_days":     b.EntitledDays,
		"carried_over_days": b.CarriedOverDays,
		"adjustment_days":   b.AdjustmentDays,
		"taken_days":        b.TakenDays,
		"remaining_days":    remaining,
	}
}

// GetLeaveBalances returns every leave-type balance for one employee in a given
// year, lazily provisioning any missing type from the statutory default. This
// makes the endpoint self-healing: a freshly created employee gets a complete,
// law-correct balance sheet the first time it is read.
func GetLeaveBalances(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	employeeID, err := uuid.Parse(c.Query("employee_id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "valid employee_id query param is required"})
	}
	year, _ := strconv.Atoi(c.Query("year"))
	if year == 0 {
		year = time.Now().Year()
	}

	// The employee must exist in this tenant — this both authorises the read
	// and gives us hire_date for the annual entitlement.
	var emp models.Employee
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", employeeID, workspaceID).First(&emp).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Employee not found"})
	}

	out := provisionAndListBalances(database.GetDB(c), workspaceID, employeeID, emp.HireDate, year)
	return c.JSON(fiber.Map{
		"employee_id":      employeeID,
		"employee_name":    emp.FullName,
		"year":             year,
		"years_of_service": yearsOfService(emp.HireDate, year),
		"data":             out,
	})
}

// provisionAndListBalances returns every leave-type balance for an employee in
// a year, lazily creating any missing type from the statutory default. Shared
// by the tenant-facing GET and the internal agent endpoint. The duplicate-race
// branch relies on the unique index to stay idempotent.
func provisionAndListBalances(db *gorm.DB, workspaceID, employeeID uuid.UUID, hireDate *time.Time, year int) []fiber.Map {
	var existing []models.LeaveBalance
	db.Where("workspace_id = ? AND employee_id = ? AND year = ?", workspaceID, employeeID, year).Find(&existing)
	byType := make(map[string]models.LeaveBalance, len(existing))
	for _, b := range existing {
		byType[b.LeaveType] = b
	}
	out := make([]fiber.Map, 0, len(leaveTypeOrder))
	for _, lt := range leaveTypeOrder {
		b, ok := byType[lt]
		if !ok {
			b = models.LeaveBalance{
				WorkspaceID: workspaceID, EmployeeID: employeeID, LeaveType: lt,
				Year: year, EntitledDays: defaultEntitlement(lt, hireDate, year),
			}
			if err := db.Create(&b).Error; err != nil {
				if lookupErr := db.Where(
					"workspace_id = ? AND employee_id = ? AND leave_type = ? AND year = ?",
					workspaceID, employeeID, lt, year,
				).First(&b).Error; lookupErr != nil {
					continue
				}
			}
		}
		out = append(out, leaveBalanceEnvelope(b))
	}
	return out
}

// GetLeaveBalanceInternal backs the HR agent's get_my_leave_balance tool. It
// resolves the employee from the calling user's id (employees.user_id) and
// returns their provisioned balances. Served on the token-gated /internal group,
// so a user can only ever reach their own balance through the agent.
func GetLeaveBalanceInternal(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	userID, err := uuid.Parse(c.Query("user_id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "valid user_id is required"})
	}
	year, _ := strconv.Atoi(c.Query("year"))
	if year == 0 {
		year = time.Now().Year()
	}
	var emp models.Employee
	if err := database.GetDB(c).Where("user_id = ? AND workspace_id = ?", userID, workspaceID).First(&emp).Error; err != nil {
		return c.JSON(fiber.Map{"linked": false, "message": "No employee record is linked to this user account."})
	}
	out := provisionAndListBalances(database.GetDB(c), workspaceID, emp.ID, emp.HireDate, year)
	return c.JSON(fiber.Map{
		"linked":           true,
		"employee_name":    emp.FullName,
		"year":             year,
		"years_of_service": yearsOfService(emp.HireDate, year),
		"data":             out,
	})
}

func yearsOfService(hireDate *time.Time, year int) float64 {
	if hireDate == nil {
		return 0
	}
	asOf := time.Date(year, 12, 31, 0, 0, 0, 0, time.UTC)
	y := asOf.Sub(*hireDate).Hours() / (24 * 365.25)
	if y < 0 {
		return 0
	}
	// Round to one decimal for display.
	return float64(int(y*10)) / 10
}

// AccrueLeaveBalances (re)provisions annual entitlement for every active
// employee for a year. Idempotent: existing rows have their entitled_days
// re-synced to the current statutory figure (a promotion past 5 years bumps
// 21→30), taken/adjustment/carry-over are left untouched.
func AccrueLeaveBalances(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	year, _ := strconv.Atoi(c.Query("year"))
	if year == 0 {
		year = time.Now().Year()
	}

	db := database.GetDB(c)
	var employees []models.Employee
	if err := db.Where("workspace_id = ? AND status <> ?", workspaceID, "terminated").Find(&employees).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to load employees"})
	}

	provisioned := 0
	for _, emp := range employees {
		entitled := annualLeaveEntitlement(emp.HireDate, year)
		var b models.LeaveBalance
		err := db.Where("workspace_id = ? AND employee_id = ? AND leave_type = ? AND year = ?",
			workspaceID, emp.ID, "annual", year).First(&b).Error
		if err != nil {
			b = models.LeaveBalance{
				WorkspaceID: workspaceID, EmployeeID: emp.ID, LeaveType: "annual",
				Year: year, EntitledDays: entitled,
			}
			if createErr := db.Create(&b).Error; createErr == nil {
				provisioned++
			}
			continue
		}
		if b.EntitledDays != entitled {
			db.Model(&b).Update("entitled_days", entitled)
		}
		provisioned++
	}

	return c.JSON(fiber.Map{
		"message":     "Annual leave balances accrued",
		"year":        year,
		"employees":   len(employees),
		"provisioned": provisioned,
	})
}

// UpdateLeaveBalance lets HR record taken days or apply a manual adjustment /
// carry-over. Only the mutable ledger fields are accepted; entitlement stays
// law-derived.
func UpdateLeaveBalance(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	var b models.LeaveBalance
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", c.Params("id"), workspaceID).First(&b).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Leave balance not found"})
	}
	var body struct {
		TakenDays       *float64 `json:"taken_days"`
		AdjustmentDays  *float64 `json:"adjustment_days"`
		CarriedOverDays *float64 `json:"carried_over_days"`
		EntitledDays    *float64 `json:"entitled_days"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if body.TakenDays != nil {
		b.TakenDays = *body.TakenDays
	}
	if body.AdjustmentDays != nil {
		b.AdjustmentDays = *body.AdjustmentDays
	}
	if body.CarriedOverDays != nil {
		b.CarriedOverDays = *body.CarriedOverDays
	}
	if body.EntitledDays != nil {
		b.EntitledDays = *body.EntitledDays
	}
	if err := database.GetDB(c).Save(&b).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update leave balance"})
	}
	return c.JSON(fiber.Map{"message": "Leave balance updated", "data": leaveBalanceEnvelope(b)})
}
