package handlers

import (
	"encoding/json"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/datatypes"
)

// Employees API — the relational replacement for hr_employee JSONB entities.
//
// These handlers speak the same wire shape the HR frontend already used with
// /entities ({ name, data:{...} } in, { id, name, data:{...} } out), so the UI
// migrates by swapping a URL rather than reshaping every component. Internally
// the data lands in typed columns (queryable, joinable to attendance/payroll)
// with anything non-canonical preserved in the attributes JSONB — lossless.
//
// Tenant and author always come from the session, never the request body, to
// match CreateEntity's tenant-safety rule.

// employeeCanonicalKeys are the incoming data keys promoted to typed columns.
// Aliases map the legacy field names the UI still sends (role→position,
// salary→base_salary, joinDate→hire_date, name→full_name).
var employeeCanonicalKeys = map[string]bool{
	"full_name": true, "full_name_ar": true, "email": true, "phone": true,
	"department": true, "position": true, "employment_type": true, "status": true,
	"base_salary": true, "housing_allowance": true, "transport_allowance": true,
	"iban": true, "nationality": true, "employee_number": true,
	"hire_date": true, "termination_date": true, "iqama_expiry": true, "insurance_expiry": true,
	"user_id": true, "manager_id": true,
}

type employeePayload struct {
	Name       string                 `json:"name"`
	EntityType string                 `json:"entity_type"` // accepted and ignored (legacy)
	Type       string                 `json:"type"`        // accepted and ignored (legacy)
	Data       map[string]interface{} `json:"data"`
}

// employeeToEnvelope renders a row in the entity-compatible shape the UI reads:
// typed columns exposed both flat and merged into a `data` object, over the top
// of any org-specific attributes so nothing the client stored is dropped.
func employeeToEnvelope(e models.Employee) fiber.Map {
	data := map[string]interface{}{}
	if len(e.Attributes) > 0 {
		_ = json.Unmarshal(e.Attributes, &data)
	}
	// Canonical typed values win over whatever the flexible blob held.
	data["full_name"] = e.FullName
	data["name"] = e.FullName
	data["full_name_ar"] = e.FullNameAr
	data["email"] = e.Email
	data["phone"] = e.Phone
	data["department"] = e.Department
	data["position"] = e.Position
	data["role"] = e.Position // legacy alias some views still read
	data["employment_type"] = e.EmploymentType
	data["status"] = e.Status
	data["base_salary"] = e.BaseSalary
	data["salary"] = e.BaseSalary // legacy alias
	data["housing_allowance"] = e.HousingAllowance
	data["transport_allowance"] = e.TransportAllowance
	data["iban"] = e.IBAN
	data["nationality"] = e.Nationality
	data["employee_number"] = e.EmployeeNumber
	data["hire_date"] = dateStr(e.HireDate)
	data["joinDate"] = dateStr(e.HireDate) // legacy alias
	data["termination_date"] = dateStr(e.TerminationDate)
	data["iqama_expiry"] = dateStr(e.IqamaExpiry)
	data["insurance_expiry"] = dateStr(e.InsuranceExpiry)
	if e.UserID != nil {
		data["user_id"] = e.UserID.String()
	}
	if e.ManagerID != nil {
		data["manager_id"] = e.ManagerID.String()
	}

	return fiber.Map{
		"id":            e.ID,
		"name":          e.FullName,
		"display_value": e.FullName,
		"created_at":    e.CreatedAt,
		"updated_at":    e.UpdatedAt,
		"data":          data,
	}
}

func dateStr(t *time.Time) interface{} {
	if t == nil {
		return nil
	}
	return t.Format("2006-01-02")
}

// applyPayload maps an incoming { name, data } payload onto an Employee,
// resolving legacy aliases and stashing the full blob (minus canonical keys)
// into attributes so custom fields survive the round trip.
func applyPayload(e *models.Employee, p employeePayload) {
	d := p.Data
	if d == nil {
		d = map[string]interface{}{}
	}

	str := func(keys ...string) string {
		for _, k := range keys {
			if v, ok := d[k]; ok {
				if s := strings.TrimSpace(toStr(v)); s != "" {
					return s
				}
			}
		}
		return ""
	}
	num := func(keys ...string) (float64, bool) {
		for _, k := range keys {
			if v, ok := d[k]; ok {
				if f, ok := toFloat(v); ok {
					return f, true
				}
			}
		}
		return 0, false
	}

	if name := firstNonEmpty(str("full_name", "name"), strings.TrimSpace(p.Name)); name != "" {
		e.FullName = name
	}
	if v := str("full_name_ar"); v != "" {
		e.FullNameAr = v
	}
	if v := str("email"); v != "" {
		e.Email = v
	}
	if v := str("phone"); v != "" {
		e.Phone = v
	}
	if v := str("department"); v != "" {
		e.Department = v
	}
	if v := str("position", "role", "job_title"); v != "" {
		e.Position = v
	}
	if v := str("employment_type"); v != "" {
		e.EmploymentType = v
	}
	if v := str("status"); v != "" {
		e.Status = v
	}
	if v := str("iban"); v != "" {
		e.IBAN = v
	}
	if v := str("nationality"); v != "" {
		e.Nationality = v
	}
	if v := str("employee_number", "staff_no"); v != "" {
		e.EmployeeNumber = v
	}
	if f, ok := num("base_salary", "salary"); ok {
		e.BaseSalary = f
	}
	if f, ok := num("housing_allowance"); ok {
		e.HousingAllowance = f
	}
	if f, ok := num("transport_allowance"); ok {
		e.TransportAllowance = f
	}
	if t := parseDate(str("hire_date", "joinDate")); t != nil {
		e.HireDate = t
	}
	if t := parseDate(str("termination_date")); t != nil {
		e.TerminationDate = t
	}
	if t := parseDate(str("iqama_expiry")); t != nil {
		e.IqamaExpiry = t
	}
	if t := parseDate(str("insurance_expiry")); t != nil {
		e.InsuranceExpiry = t
	}
	if id, err := uuid.Parse(str("user_id")); err == nil {
		e.UserID = &id
	}
	if id, err := uuid.Parse(str("manager_id")); err == nil {
		e.ManagerID = &id
	}
	if e.Status == "" {
		e.Status = "active"
	}

	// Preserve every non-canonical field (national_id_expiry, passport_expiry,
	// medical_insurance_expiry, …) in attributes so no custom data is lost.
	extra := map[string]interface{}{}
	for k, v := range d {
		if !employeeCanonicalKeys[k] && k != "role" && k != "salary" && k != "job_title" && k != "joinDate" && k != "staff_no" && k != "name" {
			extra[k] = v
		}
	}
	if len(extra) > 0 {
		if b, err := json.Marshal(extra); err == nil {
			e.Attributes = datatypes.JSON(b)
		}
	}
}

func GetEmployees(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}

	db := database.GetDB(c).Model(&models.Employee{}).Where("workspace_id = ?", workspaceID)

	var total int64
	db.Count(&total)

	// Optional pagination (EmployeesDirectory sends page/limit and reads total_pages).
	page, _ := strconv.Atoi(c.Query("page", "0"))
	limit, _ := strconv.Atoi(c.Query("limit", "0"))
	q := db.Order("created_at desc")
	totalPages := 1
	if limit > 0 {
		if page < 1 {
			page = 1
		}
		totalPages = int(math.Ceil(float64(total) / float64(limit)))
		q = q.Offset((page - 1) * limit).Limit(limit)
	}

	var employees []models.Employee
	if err := q.Find(&employees).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch employees"})
	}

	out := make([]fiber.Map, 0, len(employees))
	for _, e := range employees {
		out = append(out, employeeToEnvelope(e))
	}
	return c.JSON(fiber.Map{"data": out, "total": total, "total_pages": totalPages})
}

func GetEmployee(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	var e models.Employee
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", c.Params("id"), workspaceID).First(&e).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Employee not found"})
	}
	return c.JSON(fiber.Map{"data": employeeToEnvelope(e)})
}

func CreateEmployee(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	var p employeePayload
	if err := c.BodyParser(&p); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	e := models.Employee{WorkspaceID: workspaceID}
	e.CreatedBy = currentUserUUID(c)
	applyPayload(&e, p)
	if strings.TrimSpace(e.FullName) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "employee name is required"})
	}

	if err := database.GetDB(c).Create(&e).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create employee"})
	}
	// Fire the onboarding trigger so any workflow built for it (welcome message,
	// account provisioning, onboarding checklist tasks) runs automatically.
	go ExecuteWorkflowsByTrigger(workspaceID, "hr.employee.onboarding", employeeTriggerContext(e, workspaceID))
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message": "Employee created successfully",
		"data":    employeeToEnvelope(e),
	})
}

// employeeTriggerContext is the payload HR lifecycle workflows receive; keys
// match what send_chat / ai_agent / create-task nodes interpolate.
func employeeTriggerContext(e models.Employee, workspaceID uuid.UUID) map[string]interface{} {
	return map[string]interface{}{
		"employee_id":   e.ID.String(),
		"employee_name": e.FullName,
		"department":    e.Department,
		"position":      e.Position,
		"email":         e.Email,
		"hire_date":     dateStr(e.HireDate),
		"workspace_id":  workspaceID.String(),
	}
}

func UpdateEmployee(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	var e models.Employee
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", c.Params("id"), workspaceID).First(&e).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Employee not found"})
	}
	var p employeePayload
	if err := c.BodyParser(&p); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	prevStatus := e.Status
	applyPayload(&e, p)
	if err := database.GetDB(c).Save(&e).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update employee"})
	}
	// Fire the offboarding trigger only on the transition INTO terminated, so an
	// access-revocation / exit-checklist workflow runs once, not on every edit.
	if prevStatus != "terminated" && e.Status == "terminated" {
		go ExecuteWorkflowsByTrigger(workspaceID, "hr.employee.offboarding", employeeTriggerContext(e, workspaceID))
	}
	return c.JSON(fiber.Map{"message": "Employee updated successfully", "data": employeeToEnvelope(e)})
}

func DeleteEmployee(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", c.Params("id"), workspaceID).
		Delete(&models.Employee{}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete employee"})
	}
	return c.JSON(fiber.Map{"message": "Employee deleted successfully"})
}

// GetExpiringDocuments lists employees whose Iqama or insurance expires within N
// days (default 60; already-expired documents are included, with a negative
// days_remaining). Powers the compliance dashboard; the periodic proactive
// auditor pushes the same data as 60/30/7-day alerts.
func GetExpiringDocuments(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	within := 60
	if v, err := strconv.Atoi(c.Query("within")); err == nil && v > 0 {
		within = v
	}
	cutoff := time.Now().AddDate(0, 0, within)

	var employees []models.Employee
	if err := database.GetDB(c).Where(
		"workspace_id = ? AND status <> ? AND ((iqama_expiry IS NOT NULL AND iqama_expiry <= ?) OR (insurance_expiry IS NOT NULL AND insurance_expiry <= ?))",
		workspaceID, "terminated", cutoff, cutoff,
	).Find(&employees).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch expiring documents"})
	}

	now := time.Now()
	out := make([]fiber.Map, 0)
	addDoc := func(e models.Employee, document string, d *time.Time) {
		if d == nil || d.After(cutoff) {
			return
		}
		out = append(out, fiber.Map{
			"employee_id":    e.ID,
			"employee_name":  e.FullName,
			"document":       document,
			"expiry":         d.Format("2006-01-02"),
			"days_remaining": int(d.Sub(now).Hours() / 24),
		})
	}
	for _, e := range employees {
		addDoc(e, "iqama", e.IqamaExpiry)
		addDoc(e, "insurance", e.InsuranceExpiry)
	}
	// Most urgent first (soonest / most overdue at the top).
	sort.Slice(out, func(i, j int) bool {
		return out[i]["days_remaining"].(int) < out[j]["days_remaining"].(int)
	})

	return c.JSON(fiber.Map{"within_days": within, "count": len(out), "data": out})
}

// ── small conversion helpers ────────────────────────────────────────────────

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func toStr(v interface{}) string {
	switch t := v.(type) {
	case string:
		return t
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	case bool:
		return strconv.FormatBool(t)
	case nil:
		return ""
	default:
		b, _ := json.Marshal(t)
		return string(b)
	}
}

func toFloat(v interface{}) (float64, bool) {
	switch t := v.(type) {
	case float64:
		return t, true
	case string:
		if f, err := strconv.ParseFloat(strings.TrimSpace(t), 64); err == nil {
			return f, true
		}
	}
	return 0, false
}

func parseDate(s string) *time.Time {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	for _, layout := range []string{"2006-01-02", time.RFC3339, "2006-01-02T15:04:05", "01/02/2006"} {
		if t, err := time.Parse(layout, s); err == nil {
			return &t
		}
	}
	return nil
}
