package handlers

import (
	"errors"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/gorm"
)

// Relational leave requests + the approval → balance deduction loop (G2 cont.).
//
// Approving a request atomically adds its days to the employee's LeaveBalance
// for that leave type and year; moving a previously-approved request back out
// of approved credits the days back. Both run in one transaction with the
// status change so a balance can never disagree with the requests behind it.

type leaveRequestPayload struct {
	EmployeeID string  `json:"employee_id"`
	LeaveType  string  `json:"leave_type"`
	StartDate  string  `json:"start_date"`
	EndDate    string  `json:"end_date"`
	Days       float64 `json:"days"`
	Reason     string  `json:"reason"`
}

func leaveRequestEnvelope(r models.LeaveRequest, employeeName string) fiber.Map {
	return fiber.Map{
		"id":            r.ID,
		"employee_id":   r.EmployeeID,
		"employee_name": employeeName,
		"leave_type":    r.LeaveType,
		"start_date":    dateStr(r.StartDate),
		"end_date":      dateStr(r.EndDate),
		"days":          r.Days,
		"status":        r.Status,
		"reason":        r.Reason,
		"created_at":    r.CreatedAt,
	}
}

// balanceYear picks the year a request's days count against — the start date's
// year, or the current year when no start date was given.
func balanceYear(r models.LeaveRequest) int {
	if r.StartDate != nil {
		return r.StartDate.Year()
	}
	return time.Now().Year()
}

func GetLeaveRequests(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	q := database.GetDB(c).Model(&models.LeaveRequest{}).Where("workspace_id = ?", workspaceID)
	if emp := c.Query("employee_id"); emp != "" {
		q = q.Where("employee_id = ?", emp)
	}
	var requests []models.LeaveRequest
	if err := q.Order("created_at desc").Find(&requests).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch leave requests"})
	}

	// Resolve employee names in one query rather than N.
	names := map[uuid.UUID]string{}
	if len(requests) > 0 {
		ids := make([]uuid.UUID, 0, len(requests))
		for _, r := range requests {
			ids = append(ids, r.EmployeeID)
		}
		var emps []models.Employee
		database.GetDB(c).Select("id, full_name").Where("id IN ?", ids).Find(&emps)
		for _, e := range emps {
			names[e.ID] = e.FullName
		}
	}

	out := make([]fiber.Map, 0, len(requests))
	for _, r := range requests {
		out = append(out, leaveRequestEnvelope(r, names[r.EmployeeID]))
	}
	return c.JSON(fiber.Map{"data": out})
}

func CreateLeaveRequest(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	var p leaveRequestPayload
	if err := c.BodyParser(&p); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	employeeID, err := uuid.Parse(strings.TrimSpace(p.EmployeeID))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "valid employee_id is required"})
	}

	// The employee must belong to this tenant.
	var emp models.Employee
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", employeeID, workspaceID).First(&emp).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Employee not found"})
	}

	r := models.LeaveRequest{
		WorkspaceID: workspaceID,
		EmployeeID:  employeeID,
		LeaveType:   firstNonEmpty(strings.TrimSpace(p.LeaveType), "annual"),
		StartDate:   parseDate(p.StartDate),
		EndDate:     parseDate(p.EndDate),
		Days:        p.Days,
		Reason:      strings.TrimSpace(p.Reason),
		Status:      "pending",
		CreatedBy:   currentUserUUID(c),
	}
	// Derive days from the date span when the client did not send an explicit
	// count (inclusive of both endpoints).
	if r.Days == 0 && r.StartDate != nil && r.EndDate != nil {
		d := r.EndDate.Sub(*r.StartDate).Hours()/24 + 1
		if d > 0 {
			r.Days = d
		}
	}

	if err := database.GetDB(c).Create(&r).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create leave request"})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message": "Leave request created",
		"data":    leaveRequestEnvelope(r, emp.FullName),
	})
}

// DecideLeaveRequest approves or rejects a request and keeps the leave balance
// in lock-step. The status change and the balance movement share one
// transaction; days are added on entry into approved and credited back on exit.
func normalizeLeaveDecision(s string) (string, bool) {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "approved", "rejected", "pending":
		return strings.ToLower(strings.TrimSpace(s)), true
	}
	return "", false
}

// applyLeaveDecision transitions a request to newStatus and keeps the leave
// balance in lock-step (deduct on entering approved, credit on leaving), all in
// one transaction. Shared by the HTTP handler and the agent's internal
// endpoint. Returns the updated request, the employee name, and whether the
// status actually changed. A missing request surfaces as gorm.ErrRecordNotFound.
func applyLeaveDecision(db *gorm.DB, workspaceID, requestID uuid.UUID, decidedBy *uuid.UUID, newStatus string) (models.LeaveRequest, string, bool, error) {
	var r models.LeaveRequest
	if err := db.Where("id = ? AND workspace_id = ?", requestID, workspaceID).First(&r).Error; err != nil {
		return r, "", false, err
	}
	empName := func() string {
		var emp models.Employee
		db.Select("full_name").Where("id = ?", r.EmployeeID).First(&emp)
		return emp.FullName
	}
	prevStatus := r.Status
	if prevStatus == newStatus {
		return r, empName(), false, nil
	}
	err := db.Transaction(func(tx *gorm.DB) error {
		enteringApproved := newStatus == "approved" && prevStatus != "approved"
		leavingApproved := prevStatus == "approved" && newStatus != "approved"
		if enteringApproved || leavingApproved {
			delta := r.Days
			if leavingApproved {
				delta = -r.Days
			}
			if err := adjustTakenDays(tx, workspaceID, r.EmployeeID, r.LeaveType, balanceYear(r), delta); err != nil {
				return err
			}
		}
		now := time.Now()
		r.Status = newStatus
		r.DecidedBy = decidedBy
		r.DecidedAt = &now
		return tx.Save(&r).Error
	})
	if err != nil {
		return r, "", false, err
	}
	return r, empName(), true, nil
}

func DecideLeaveRequest(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	var body struct {
		Decision string `json:"decision"` // approved | rejected | pending
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	newStatus, ok := normalizeLeaveDecision(body.Decision)
	if !ok {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "decision must be approved, rejected, or pending"})
	}
	requestID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request id"})
	}

	r, empName, changed, err := applyLeaveDecision(database.GetDB(c), workspaceID, requestID, currentUserUUID(c), newStatus)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Leave request not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to apply decision"})
	}
	msg := "Decision applied"
	if !changed {
		msg = "No change"
	}
	return c.JSON(fiber.Map{"message": msg, "data": leaveRequestEnvelope(r, empName)})
}

// DecideLeaveRequestInternal backs the HR agent's decide_leave_request tool. It
// runs on the token-gated /internal group; authorization is enforced in the
// sidecar (the tool is only handed to manager/admin/hr agents and re-checks the
// user role), matching the existing agent-tool security model.
func DecideLeaveRequestInternal(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	var body struct {
		RequestID string `json:"request_id"`
		Decision  string `json:"decision"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	newStatus, ok := normalizeLeaveDecision(body.Decision)
	if !ok {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "decision must be approved, rejected, or pending"})
	}
	requestID, err := uuid.Parse(strings.TrimSpace(body.RequestID))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "valid request_id is required"})
	}
	r, empName, changed, err := applyLeaveDecision(database.GetDB(c), workspaceID, requestID, nil, newStatus)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Leave request not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to apply decision"})
	}
	return c.JSON(fiber.Map{
		"changed": changed, "status": r.Status, "employee_name": empName,
		"days": r.Days, "leave_type": r.LeaveType,
	})
}

// adjustTakenDays moves TakenDays by delta on the matching balance, creating the
// balance (with the statutory entitlement) if it does not exist yet. Taken is
// floored at zero so a credit-back can never drive it negative.
func adjustTakenDays(tx *gorm.DB, workspaceID, employeeID uuid.UUID, leaveType string, year int, delta float64) error {
	var b models.LeaveBalance
	err := tx.Where("workspace_id = ? AND employee_id = ? AND leave_type = ? AND year = ?",
		workspaceID, employeeID, leaveType, year).First(&b).Error
	if err != nil {
		var emp models.Employee
		tx.Select("hire_date").Where("id = ?", employeeID).First(&emp)
		b = models.LeaveBalance{
			WorkspaceID:  workspaceID,
			EmployeeID:   employeeID,
			LeaveType:    leaveType,
			Year:         year,
			EntitledDays: defaultEntitlement(leaveType, emp.HireDate, year),
		}
		if createErr := tx.Create(&b).Error; createErr != nil {
			return createErr
		}
	}
	b.TakenDays += delta
	if b.TakenDays < 0 {
		b.TakenDays = 0
	}
	return tx.Save(&b).Error
}
