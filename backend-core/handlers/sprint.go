package handlers

import (
	"time"

	"log"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
	"github.com/septimus-os/backend-core/utils"
)

// CreateSprint creates a new sprint
func CreateSprint(c *fiber.Ctx) error {
	var req struct {
		ProjectID string     `json:"project_id"`
		Name      string     `json:"name"`
		Goal      string     `json:"goal"`
		StartDate *time.Time `json:"start_date"`
		EndDate   *time.Time `json:"end_date"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid input"})
	}

	projectID, err := uuid.Parse(req.ProjectID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid project_id"})
	}

	sprint := models.Sprint{
		ID:        uuid.New(),
		ProjectID: projectID,
		Name:      req.Name,
		Goal:      req.Goal,
		Status:    "planning",
		StartDate: req.StartDate,
		EndDate:   req.EndDate,
	}

	if err := database.DB.Create(&sprint).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create sprint"})
	}

	var project models.Project
	if err := database.DB.First(&project, "id = ?", projectID).Error; err == nil {
		if integration, active := GetActiveIntegration(project.WorkspaceID, "google_calendar"); active {
			token := services.GetClient(integration.AccessToken, integration.RefreshToken, integration.Expiry)
			
			startStr := time.Now().Format(time.RFC3339)
			if sprint.StartDate != nil {
				startStr = sprint.StartDate.Format(time.RFC3339)
			}
			
			endStr := time.Now().AddDate(0, 0, 14).Format(time.RFC3339)
			if sprint.EndDate != nil {
				endStr = sprint.EndDate.Format(time.RFC3339)
			}

			eventID, htmlLink, err := services.CreateCalendarEvent(c.Context(), token, sprint.Name, sprint.Goal, startStr, endStr)
			if err == nil {
				sprint.CalendarEventLink = htmlLink
				database.DB.Save(&sprint)
			} else {
				log.Printf("Failed to create Google Calendar event: %v", err)
			}

			utils.DispatchWebhook("http://localhost:5678/webhook/calendar", "SprintCreated", fiber.Map{
				"sprint_id":   sprint.ID,
				"sprint_name": sprint.Name,
				"project_id":  sprint.ProjectID,
				"event_id":    eventID,
				"event_link":  htmlLink,
			})
		}
	}

	return c.Status(fiber.StatusCreated).JSON(sprint)
}

// GetSprints retrieves sprints for a specific project
func GetSprints(c *fiber.Ctx) error {
	projectIDParam := c.Query("project_id")
	if projectIDParam == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "project_id is required"})
	}

	pid, err := uuid.Parse(projectIDParam)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid project_id"})
	}

	var sprints []models.Sprint
	if err := database.DB.Where("project_id = ?", pid).Order("created_at desc").Find(&sprints).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch sprints"})
	}

	return c.JSON(sprints)
}

// StartSprint changes the sprint status to 'active'
func StartSprint(c *fiber.Ctx) error {
	sprintIDStr := c.Params("id")
	sprintID, err := uuid.Parse(sprintIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid sprint ID"})
	}

	var sprint models.Sprint
	if err := database.DB.First(&sprint, "id = ?", sprintID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Sprint not found"})
	}

	if sprint.Status != "planning" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Only planning sprints can be started"})
	}

	sprint.Status = "active"
	now := time.Now()
	if sprint.StartDate == nil {
		sprint.StartDate = &now
	}

	if err := database.DB.Save(&sprint).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to start sprint"})
	}

	return c.JSON(sprint)
}

// CompleteSprint changes the sprint status to 'completed'
func CompleteSprint(c *fiber.Ctx) error {
	sprintIDStr := c.Params("id")
	sprintID, err := uuid.Parse(sprintIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid sprint ID"})
	}

	var sprint models.Sprint
	if err := database.DB.First(&sprint, "id = ?", sprintID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Sprint not found"})
	}

	if sprint.Status != "active" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Only active sprints can be completed"})
	}

	sprint.Status = "completed"
	now := time.Now()
	if sprint.EndDate == nil {
		sprint.EndDate = &now
	}

	if err := database.DB.Save(&sprint).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to complete sprint"})
	}

	return c.JSON(sprint)
}
