package handlers

import (
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
)

// Performance reviews (M3). draft → submitted → acknowledged. The employee sees
// a review only once submitted, and can acknowledge it from self-service.

func reviewEnvelope(r models.PerformanceReview) fiber.Map {
	return fiber.Map{
		"id":              r.ID,
		"employee_id":     r.EmployeeID,
		"reviewer_id":     r.ReviewerID,
		"period":          r.Period,
		"overall_rating":  r.OverallRating,
		"strengths":       r.Strengths,
		"improvements":    r.Improvements,
		"status":          r.Status,
		"acknowledged_at": r.AcknowledgedAt,
		"created_at":      r.CreatedAt,
	}
}

func clampRating(v int) int {
	if v < 0 {
		return 0
	}
	if v > 5 {
		return 5
	}
	return v
}

type reviewPayload struct {
	EmployeeID    string `json:"employee_id"`
	Period        string `json:"period"`
	OverallRating int    `json:"overall_rating"`
	Strengths     string `json:"strengths"`
	Improvements  string `json:"improvements"`
	Status        string `json:"status"`
}

func GetReviews(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	q := database.GetDB(c).Model(&models.PerformanceReview{}).Where("workspace_id = ?", workspaceID)
	if v := c.Query("employee_id"); v != "" {
		q = q.Where("employee_id = ?", v)
	}
	var reviews []models.PerformanceReview
	if err := q.Order("created_at desc").Find(&reviews).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch reviews"})
	}
	out := make([]fiber.Map, 0, len(reviews))
	for _, r := range reviews {
		out = append(out, reviewEnvelope(r))
	}
	return c.JSON(fiber.Map{"data": out})
}

func CreateReview(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	var p reviewPayload
	if err := c.BodyParser(&p); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	employeeID, err := uuid.Parse(strings.TrimSpace(p.EmployeeID))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "valid employee_id is required"})
	}
	var emp models.Employee
	if err := database.GetDB(c).Select("id").Where("id = ? AND workspace_id = ?", employeeID, workspaceID).First(&emp).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Employee not found"})
	}
	r := models.PerformanceReview{
		WorkspaceID: workspaceID, EmployeeID: employeeID, ReviewerID: currentUserUUID(c),
		Period: strings.TrimSpace(p.Period), OverallRating: clampRating(p.OverallRating),
		Strengths: strings.TrimSpace(p.Strengths), Improvements: strings.TrimSpace(p.Improvements),
		Status: firstNonEmpty(strings.TrimSpace(p.Status), "draft"), CreatedBy: currentUserUUID(c),
	}
	if err := database.GetDB(c).Create(&r).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create review"})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"message": "Review created", "data": reviewEnvelope(r)})
}

func UpdateReview(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	var r models.PerformanceReview
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", c.Params("id"), workspaceID).First(&r).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Review not found"})
	}
	var body struct {
		Period        *string `json:"period"`
		OverallRating *int    `json:"overall_rating"`
		Strengths     *string `json:"strengths"`
		Improvements  *string `json:"improvements"`
		Status        *string `json:"status"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if body.Period != nil {
		r.Period = strings.TrimSpace(*body.Period)
	}
	if body.OverallRating != nil {
		r.OverallRating = clampRating(*body.OverallRating)
	}
	if body.Strengths != nil {
		r.Strengths = strings.TrimSpace(*body.Strengths)
	}
	if body.Improvements != nil {
		r.Improvements = strings.TrimSpace(*body.Improvements)
	}
	if body.Status != nil {
		r.Status = strings.TrimSpace(*body.Status)
	}
	if err := database.GetDB(c).Save(&r).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update review"})
	}
	return c.JSON(fiber.Map{"message": "Review updated", "data": reviewEnvelope(r)})
}

func DeleteReview(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", c.Params("id"), workspaceID).
		Delete(&models.PerformanceReview{}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete review"})
	}
	return c.JSON(fiber.Map{"message": "Review deleted"})
}

// GetMyReviews returns the caller's own reviews, but only those already
// submitted (or acknowledged) — a draft the reviewer is still writing stays
// hidden, exactly like an unposted payslip.
func GetMyReviews(c *fiber.Ctx) error {
	emp, err := resolveSelfEmployee(c)
	if err != nil {
		return err
	}
	var reviews []models.PerformanceReview
	if err := database.GetDB(c).
		Where("workspace_id = ? AND employee_id = ? AND status IN ?", emp.WorkspaceID, emp.ID, []string{"submitted", "acknowledged"}).
		Order("created_at desc").Find(&reviews).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch your reviews"})
	}
	out := make([]fiber.Map, 0, len(reviews))
	for _, r := range reviews {
		out = append(out, reviewEnvelope(r))
	}
	return c.JSON(fiber.Map{"data": out})
}

// AcknowledgeMyReview lets the employee acknowledge one of their own submitted
// reviews. Scoped to the caller's employee id; a draft cannot be acknowledged.
func AcknowledgeMyReview(c *fiber.Ctx) error {
	emp, err := resolveSelfEmployee(c)
	if err != nil {
		return err
	}
	var r models.PerformanceReview
	if err := database.GetDB(c).
		Where("id = ? AND workspace_id = ? AND employee_id = ?", c.Params("id"), emp.WorkspaceID, emp.ID).
		First(&r).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Review not found"})
	}
	if r.Status == "draft" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "this review is not available yet"})
	}
	now := time.Now()
	r.Status = "acknowledged"
	r.AcknowledgedAt = &now
	if err := database.GetDB(c).Save(&r).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to acknowledge review"})
	}
	return c.JSON(fiber.Map{"message": "Review acknowledged", "data": reviewEnvelope(r)})
}
