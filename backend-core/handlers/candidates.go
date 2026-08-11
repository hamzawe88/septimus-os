package handlers

import (
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/gorm"
)

// Recruitment pipeline / ATS (M3). Stages: applied → screening → interview →
// offer → hired | rejected. Hiring converts the candidate into an Employee and
// fires the onboarding workflow, closing the loop back to the HR foundation.

var candidateStages = map[string]bool{
	"applied": true, "screening": true, "interview": true,
	"offer": true, "hired": true, "rejected": true,
}

func candidateEnvelope(cd models.Candidate) fiber.Map {
	return fiber.Map{
		"id": cd.ID, "full_name": cd.FullName, "email": cd.Email, "phone": cd.Phone,
		"position": cd.Position, "stage": cd.Stage, "rating": cd.Rating,
		"source": cd.Source, "notes": cd.Notes, "hired_employee_id": cd.HiredEmployeeID,
		"created_at": cd.CreatedAt,
	}
}

type candidatePayload struct {
	FullName string `json:"full_name"`
	Email    string `json:"email"`
	Phone    string `json:"phone"`
	Position string `json:"position"`
	Stage    string `json:"stage"`
	Rating   int    `json:"rating"`
	Source   string `json:"source"`
	Notes    string `json:"notes"`
}

func GetCandidates(c *fiber.Ctx) error {
	ws := CurrentWorkspaceID(c)
	if ws == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	q := database.GetDB(c).Model(&models.Candidate{}).Where("workspace_id = ?", ws)
	if st := c.Query("stage"); st != "" {
		q = q.Where("stage = ?", st)
	}
	var candidates []models.Candidate
	if err := q.Order("created_at desc").Find(&candidates).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch candidates"})
	}
	out := make([]fiber.Map, 0, len(candidates))
	for _, cd := range candidates {
		out = append(out, candidateEnvelope(cd))
	}
	return c.JSON(fiber.Map{"data": out})
}

func CreateCandidate(c *fiber.Ctx) error {
	ws := CurrentWorkspaceID(c)
	if ws == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	var p candidatePayload
	if err := c.BodyParser(&p); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if strings.TrimSpace(p.FullName) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "full_name is required"})
	}
	stage := firstNonEmpty(strings.TrimSpace(p.Stage), "applied")
	if !candidateStages[stage] {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid stage"})
	}
	cd := models.Candidate{
		WorkspaceID: ws, FullName: strings.TrimSpace(p.FullName), Email: strings.TrimSpace(p.Email),
		Phone: strings.TrimSpace(p.Phone), Position: strings.TrimSpace(p.Position), Stage: stage,
		Rating: clampRating(p.Rating), Source: strings.TrimSpace(p.Source), Notes: strings.TrimSpace(p.Notes),
		CreatedBy: currentUserUUID(c),
	}
	if err := database.GetDB(c).Create(&cd).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create candidate"})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"message": "Candidate created", "data": candidateEnvelope(cd)})
}

func UpdateCandidate(c *fiber.Ctx) error {
	ws := CurrentWorkspaceID(c)
	if ws == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	var cd models.Candidate
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", c.Params("id"), ws).First(&cd).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Candidate not found"})
	}
	var body struct {
		FullName *string `json:"full_name"`
		Email    *string `json:"email"`
		Phone    *string `json:"phone"`
		Position *string `json:"position"`
		Stage    *string `json:"stage"`
		Rating   *int    `json:"rating"`
		Source   *string `json:"source"`
		Notes    *string `json:"notes"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if body.FullName != nil {
		cd.FullName = strings.TrimSpace(*body.FullName)
	}
	if body.Email != nil {
		cd.Email = strings.TrimSpace(*body.Email)
	}
	if body.Phone != nil {
		cd.Phone = strings.TrimSpace(*body.Phone)
	}
	if body.Position != nil {
		cd.Position = strings.TrimSpace(*body.Position)
	}
	if body.Stage != nil {
		st := strings.TrimSpace(*body.Stage)
		if !candidateStages[st] {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid stage"})
		}
		cd.Stage = st
	}
	if body.Rating != nil {
		cd.Rating = clampRating(*body.Rating)
	}
	if body.Source != nil {
		cd.Source = strings.TrimSpace(*body.Source)
	}
	if body.Notes != nil {
		cd.Notes = strings.TrimSpace(*body.Notes)
	}
	if err := database.GetDB(c).Save(&cd).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update candidate"})
	}
	return c.JSON(fiber.Map{"message": "Candidate updated", "data": candidateEnvelope(cd)})
}

func DeleteCandidate(c *fiber.Ctx) error {
	ws := CurrentWorkspaceID(c)
	if ws == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", c.Params("id"), ws).
		Delete(&models.Candidate{}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete candidate"})
	}
	return c.JSON(fiber.Map{"message": "Candidate deleted"})
}

// HireCandidate converts a candidate into an Employee and marks them hired, in
// one transaction, then fires the onboarding workflow — the same trigger a
// directly-created employee gets. Idempotent: a candidate already linked to an
// employee is not hired twice.
func HireCandidate(c *fiber.Ctx) error {
	ws := CurrentWorkspaceID(c)
	if ws == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	var cd models.Candidate
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", c.Params("id"), ws).First(&cd).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Candidate not found"})
	}
	if cd.HiredEmployeeID != nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error": "candidate already hired", "employee_id": cd.HiredEmployeeID,
		})
	}

	now := time.Now()
	hireDate := now
	emp := models.Employee{
		WorkspaceID: ws, FullName: cd.FullName, Email: cd.Email, Phone: cd.Phone,
		Position: cd.Position, Status: "active", HireDate: &hireDate, CreatedBy: currentUserUUID(c),
	}
	err := database.GetDB(c).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&emp).Error; err != nil {
			return err
		}
		cd.Stage = "hired"
		cd.HiredEmployeeID = &emp.ID
		return tx.Save(&cd).Error
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to hire candidate"})
	}

	// Same onboarding automation a directly-created employee receives.
	go ExecuteWorkflowsByTrigger(ws, "hr.employee.onboarding", employeeTriggerContext(emp, ws))

	return c.JSON(fiber.Map{
		"message": "Candidate hired and employee created",
		"data":    candidateEnvelope(cd),
		"employee": fiber.Map{"id": emp.ID, "full_name": emp.FullName},
	})
}
