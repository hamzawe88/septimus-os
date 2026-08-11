package handlers

import (
	"encoding/json"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/datatypes"
)

// Employee self-service (ESS, M2).
//
// These /me/* endpoints are scoped entirely to the caller: the employee is
// resolved from the JWT user id, never from a client-supplied employee_id. That
// is why they sit on the authenticated group with NO records.* permission — an
// employee may read and act on their own HR data without being granted access
// to everyone's records. Any employee_id in a request body is ignored.

// resolveSelfEmployee finds the employee row linked to the calling user in the
// current workspace. A user with no linked employee record gets a clear 404.
func resolveSelfEmployee(c *fiber.Ctx) (models.Employee, error) {
	var emp models.Employee
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return emp, fiber.NewError(fiber.StatusForbidden, "workspace context is required")
	}
	userIDStr, _ := c.Locals("user_id").(string)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return emp, fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	if err := database.GetDB(c).Where("user_id = ? AND workspace_id = ?", userID, workspaceID).First(&emp).Error; err != nil {
		return emp, fiber.NewError(fiber.StatusNotFound, "no employee record is linked to your account")
	}
	return emp, nil
}

func GetMyEmployee(c *fiber.Ctx) error {
	emp, err := resolveSelfEmployee(c)
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"data": employeeToEnvelope(emp)})
}

// UpdateMyEmployee lets an employee edit only their own low-risk contact
// fields. Safety is by construction: the body is parsed into a struct that
// contains ONLY the allowed fields, so a salary/status/hire_date sent by a
// malicious client is never bound — there is nothing to strip. HR-controlled
// fields stay HR-controlled.
func UpdateMyEmployee(c *fiber.Ctx) error {
	emp, err := resolveSelfEmployee(c)
	if err != nil {
		return err
	}
	var body struct {
		Phone            *string `json:"phone"`
		Address          *string `json:"address"`
		EmergencyContact *string `json:"emergency_contact"`
		EmergencyPhone   *string `json:"emergency_phone"`
		PersonalEmail    *string `json:"personal_email"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if body.Phone != nil {
		emp.Phone = strings.TrimSpace(*body.Phone)
	}

	// The remaining fields are personal extras — keep them in attributes without
	// disturbing anything HR stored there.
	attrs := map[string]interface{}{}
	if len(emp.Attributes) > 0 {
		_ = json.Unmarshal(emp.Attributes, &attrs)
	}
	setAttr := func(key string, v *string) {
		if v != nil {
			attrs[key] = strings.TrimSpace(*v)
		}
	}
	setAttr("address", body.Address)
	setAttr("emergency_contact", body.EmergencyContact)
	setAttr("emergency_phone", body.EmergencyPhone)
	setAttr("personal_email", body.PersonalEmail)
	if b, err := json.Marshal(attrs); err == nil {
		emp.Attributes = datatypes.JSON(b)
	}

	if err := database.GetDB(c).Save(&emp).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update your profile"})
	}
	return c.JSON(fiber.Map{"message": "Profile updated", "data": employeeToEnvelope(emp)})
}

func GetMyLeaveBalances(c *fiber.Ctx) error {
	emp, err := resolveSelfEmployee(c)
	if err != nil {
		return err
	}
	year := time.Now().Year()
	out := provisionAndListBalances(database.GetDB(c), emp.WorkspaceID, emp.ID, emp.HireDate, year)
	return c.JSON(fiber.Map{
		"employee_id":      emp.ID,
		"employee_name":    emp.FullName,
		"year":             year,
		"years_of_service": yearsOfService(emp.HireDate, year),
		"data":             out,
	})
}

func GetMyLeaveRequests(c *fiber.Ctx) error {
	emp, err := resolveSelfEmployee(c)
	if err != nil {
		return err
	}
	var requests []models.LeaveRequest
	if err := database.GetDB(c).
		Where("workspace_id = ? AND employee_id = ?", emp.WorkspaceID, emp.ID).
		Order("created_at desc").Find(&requests).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch your leave requests"})
	}
	out := make([]fiber.Map, 0, len(requests))
	for _, r := range requests {
		out = append(out, leaveRequestEnvelope(r, emp.FullName))
	}
	return c.JSON(fiber.Map{"data": out})
}

// GetMyPayslips returns the caller's own payslips, but only from payroll runs
// that have been POSTED — a draft run is not yet a real, disclosable payslip.
func GetMyPayslips(c *fiber.Ctx) error {
	emp, err := resolveSelfEmployee(c)
	if err != nil {
		return err
	}
	var payslips []models.Payslip
	if err := database.GetDB(c).
		Where("workspace_id = ? AND employee_id = ?", emp.WorkspaceID, emp.ID).
		Order("created_at desc").Find(&payslips).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch your payslips"})
	}
	if len(payslips) == 0 {
		return c.JSON(fiber.Map{"data": []fiber.Map{}})
	}

	// Resolve each payslip's run (period + posted status) in one query.
	runIDs := make([]uuid.UUID, 0, len(payslips))
	for _, p := range payslips {
		runIDs = append(runIDs, p.PayrollRunID)
	}
	var runs []models.PayrollRun
	database.GetDB(c).Select("id, year, month, status, currency").
		Where("id IN ?", runIDs).Find(&runs)
	runByID := make(map[uuid.UUID]models.PayrollRun, len(runs))
	for _, r := range runs {
		runByID[r.ID] = r
	}

	out := make([]fiber.Map, 0, len(payslips))
	for _, p := range payslips {
		run, ok := runByID[p.PayrollRunID]
		if !ok || run.Status != "posted" {
			continue // hide draft/unknown runs from the employee
		}
		out = append(out, fiber.Map{
			"id":                  p.ID,
			"year":                run.Year,
			"month":               run.Month,
			"currency":            run.Currency,
			"base_salary":         p.BaseSalary,
			"housing_allowance":   p.HousingAllowance,
			"transport_allowance": p.TransportAllowance,
			"gross_salary":        p.GrossSalary,
			"gosi_employee":       p.GosiEmployee,
			"other_deductions":    p.OtherDeductions,
			"net_salary":          p.NetSalary,
		})
	}
	return c.JSON(fiber.Map{"data": out})
}

// CreateMyLeaveRequest lets an employee file a leave request for themselves. The
// employee is always the caller — any employee_id in the body is ignored — and
// the request starts pending for a manager to approve.
func CreateMyLeaveRequest(c *fiber.Ctx) error {
	emp, err := resolveSelfEmployee(c)
	if err != nil {
		return err
	}
	var p leaveRequestPayload
	if err := c.BodyParser(&p); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	r := models.LeaveRequest{
		WorkspaceID: emp.WorkspaceID,
		EmployeeID:  emp.ID, // forced to the caller — never trusted from the body
		LeaveType:   firstNonEmpty(strings.TrimSpace(p.LeaveType), "annual"),
		StartDate:   parseDate(p.StartDate),
		EndDate:     parseDate(p.EndDate),
		Days:        p.Days,
		Reason:      strings.TrimSpace(p.Reason),
		Status:      "pending",
		CreatedBy:   currentUserUUID(c),
	}
	if r.Days == 0 && r.StartDate != nil && r.EndDate != nil {
		if d := r.EndDate.Sub(*r.StartDate).Hours()/24 + 1; d > 0 {
			r.Days = d
		}
	}
	if err := database.GetDB(c).Create(&r).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to submit leave request"})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message": "Leave request submitted",
		"data":    leaveRequestEnvelope(r, emp.FullName),
	})
}
