package handlers

import (
	"math"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
)

// Performance goals / OKRs (M3). Progress is always derived from current/target
// so it cannot drift; a completed goal reads as 100% regardless of the numbers.

func goalProgress(g models.PerformanceGoal) float64 {
	if strings.EqualFold(g.Status, "completed") {
		return 100
	}
	if g.TargetValue <= 0 {
		return 0
	}
	p := g.CurrentValue / g.TargetValue * 100
	if p < 0 {
		p = 0
	}
	if p > 100 {
		p = 100
	}
	return math.Round(p*10) / 10
}

func goalEnvelope(g models.PerformanceGoal) fiber.Map {
	return fiber.Map{
		"id":               g.ID,
		"employee_id":      g.EmployeeID,
		"title":            g.Title,
		"description":      g.Description,
		"metric":           g.Metric,
		"target_value":     g.TargetValue,
		"current_value":    g.CurrentValue,
		"progress_percent": goalProgress(g),
		"period":           g.Period,
		"status":           g.Status,
		"created_at":       g.CreatedAt,
	}
}

type goalPayload struct {
	EmployeeID   string  `json:"employee_id"`
	Title        string  `json:"title"`
	Description  string  `json:"description"`
	Metric       string  `json:"metric"`
	TargetValue  float64 `json:"target_value"`
	CurrentValue float64 `json:"current_value"`
	Period       string  `json:"period"`
	Status       string  `json:"status"`
}

func listGoals(c *fiber.Ctx, workspaceID, employeeID uuid.UUID) error {
	q := database.GetDB(c).Model(&models.PerformanceGoal{}).Where("workspace_id = ?", workspaceID)
	if employeeID != uuid.Nil {
		q = q.Where("employee_id = ?", employeeID)
	}
	var goals []models.PerformanceGoal
	if err := q.Order("created_at desc").Find(&goals).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch goals"})
	}
	out := make([]fiber.Map, 0, len(goals))
	for _, g := range goals {
		out = append(out, goalEnvelope(g))
	}
	return c.JSON(fiber.Map{"data": out})
}

// GetGoals — HR/manager view; optional ?employee_id= filter.
func GetGoals(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	var empID uuid.UUID
	if v := c.Query("employee_id"); v != "" {
		if parsed, err := uuid.Parse(v); err == nil {
			empID = parsed
		}
	}
	return listGoals(c, workspaceID, empID)
}

func CreateGoal(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	var p goalPayload
	if err := c.BodyParser(&p); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	employeeID, err := uuid.Parse(strings.TrimSpace(p.EmployeeID))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "valid employee_id is required"})
	}
	if strings.TrimSpace(p.Title) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "title is required"})
	}
	// The employee must belong to this tenant.
	var emp models.Employee
	if err := database.GetDB(c).Select("id").Where("id = ? AND workspace_id = ?", employeeID, workspaceID).First(&emp).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Employee not found"})
	}
	g := models.PerformanceGoal{
		WorkspaceID: workspaceID, EmployeeID: employeeID,
		Title: strings.TrimSpace(p.Title), Description: strings.TrimSpace(p.Description),
		Metric: strings.TrimSpace(p.Metric), TargetValue: p.TargetValue, CurrentValue: p.CurrentValue,
		Period: strings.TrimSpace(p.Period), Status: firstNonEmpty(strings.TrimSpace(p.Status), "active"),
		CreatedBy: currentUserUUID(c),
	}
	if err := database.GetDB(c).Create(&g).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create goal"})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"message": "Goal created", "data": goalEnvelope(g)})
}

func UpdateGoal(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	var g models.PerformanceGoal
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", c.Params("id"), workspaceID).First(&g).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Goal not found"})
	}
	// Partial update: only provided fields change.
	var body struct {
		Title        *string  `json:"title"`
		Description  *string  `json:"description"`
		Metric       *string  `json:"metric"`
		TargetValue  *float64 `json:"target_value"`
		CurrentValue *float64 `json:"current_value"`
		Period       *string  `json:"period"`
		Status       *string  `json:"status"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if body.Title != nil {
		g.Title = strings.TrimSpace(*body.Title)
	}
	if body.Description != nil {
		g.Description = strings.TrimSpace(*body.Description)
	}
	if body.Metric != nil {
		g.Metric = strings.TrimSpace(*body.Metric)
	}
	if body.TargetValue != nil {
		g.TargetValue = *body.TargetValue
	}
	if body.CurrentValue != nil {
		g.CurrentValue = *body.CurrentValue
	}
	if body.Period != nil {
		g.Period = strings.TrimSpace(*body.Period)
	}
	if body.Status != nil {
		g.Status = strings.TrimSpace(*body.Status)
	}
	if err := database.GetDB(c).Save(&g).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update goal"})
	}
	return c.JSON(fiber.Map{"message": "Goal updated", "data": goalEnvelope(g)})
}

func DeleteGoal(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", c.Params("id"), workspaceID).
		Delete(&models.PerformanceGoal{}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete goal"})
	}
	return c.JSON(fiber.Map{"message": "Goal deleted"})
}

// GetMyGoals — employee self-service view of their own goals.
func GetMyGoals(c *fiber.Ctx) error {
	emp, err := resolveSelfEmployee(c)
	if err != nil {
		return err
	}
	return listGoals(c, emp.WorkspaceID, emp.ID)
}
