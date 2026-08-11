package handlers

import (
	"errors"
	"log"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
	"github.com/septimus-os/backend-core/utils"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func validateSprint(name string, startDate, endDate *time.Time) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" || len([]rune(name)) > maxSprintNameLength {
		return "", errors.New("sprint name must contain 1-100 characters")
	}
	if startDate != nil && endDate != nil && endDate.Before(*startDate) {
		return "", errors.New("end_date must not be before start_date")
	}
	return name, nil
}

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
	name, err := validateSprint(req.Name, req.StartDate, req.EndDate)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	workspaceID := CurrentWorkspaceID(c)
	var project models.Project
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", projectID, workspaceID).First(&project).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Project not found in workspace"})
	}

	sprint := models.Sprint{
		ID: uuid.New(), WorkspaceID: workspaceID, ProjectID: projectID,
		Name: name, Goal: strings.TrimSpace(req.Goal), Status: "planning",
		StartDate: req.StartDate, EndDate: req.EndDate, RecordVersion: 1,
	}
	if err := database.GetDB(c).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&sprint).Error; err != nil {
			return err
		}
		return services.EnqueueOutbox(tx, workspaceID, "events.sprints.created", "sprint.created", "sprint", sprint.ID, map[string]interface{}{
			"type": "sprint_updated", "sprint_id": sprint.ID.String(), "project_id": projectID.String(), "status": sprint.Status,
		})
	}); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create sprint"})
	}

	if integration, active := GetActiveIntegration(project.WorkspaceID, "google_calendar"); active {
		token := services.GetClient(integration.AccessToken, integration.RefreshToken, integration.Expiry)
		start := time.Now().UTC()
		if sprint.StartDate != nil {
			start = *sprint.StartDate
		}
		end := start.AddDate(0, 0, 14)
		if sprint.EndDate != nil {
			end = *sprint.EndDate
		}
		eventID, htmlLink, integrationErr := services.CreateCalendarEvent(c.Context(), token, sprint.Name, sprint.Goal, start.Format(time.RFC3339), end.Format(time.RFC3339))
		if integrationErr == nil {
			sprint.CalendarEventLink = htmlLink
			_ = database.GetDB(c).Model(&models.Sprint{}).Where("id = ? AND workspace_id = ?", sprint.ID, workspaceID).Update("calendar_event_link", htmlLink).Error
		} else {
			log.Printf("Failed to create Google Calendar event for sprint %s: %v", sprint.ID, integrationErr)
		}
		utils.DispatchN8NWebhook("calendar", "SprintCreated", fiber.Map{
			"sprint_id": sprint.ID, "sprint_name": sprint.Name, "project_id": sprint.ProjectID,
			"event_id": eventID, "event_link": htmlLink,
		})
	}
	return c.Status(fiber.StatusCreated).JSON(sprint)
}

func GetSprints(c *fiber.Ctx) error {
	projectIDParam := c.Query("project_id")
	if projectIDParam == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "project_id is required"})
	}
	projectID, err := uuid.Parse(projectIDParam)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid project_id"})
	}
	workspaceID := CurrentWorkspaceID(c)
	var projectCount int64
	if err := database.GetDB(c).Model(&models.Project{}).Where("id = ? AND workspace_id = ?", projectID, workspaceID).Count(&projectCount).Error; err != nil || projectCount == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Project not found in workspace"})
	}
	var sprints []models.Sprint
	if err := database.GetDB(c).Where("project_id = ? AND workspace_id = ?", projectID, workspaceID).Order("created_at desc").Find(&sprints).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch sprints"})
	}
	return c.JSON(sprints)
}

func UpdateSprint(c *fiber.Ctx) error {
	sprintID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid sprint ID"})
	}
	var req struct {
		Name          *string    `json:"name"`
		Goal          *string    `json:"goal"`
		StartDate     *time.Time `json:"start_date"`
		EndDate       *time.Time `json:"end_date"`
		RecordVersion *int       `json:"record_version"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid input"})
	}
	workspaceID := CurrentWorkspaceID(c)
	var sprint models.Sprint
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", sprintID, workspaceID).First(&sprint).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Sprint not found"})
	}
	name := sprint.Name
	if req.Name != nil {
		name = *req.Name
	}
	startDate, endDate := sprint.StartDate, sprint.EndDate
	if req.StartDate != nil {
		startDate = req.StartDate
	}
	if req.EndDate != nil {
		endDate = req.EndDate
	}
	name, err = validateSprint(name, startDate, endDate)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	updates := map[string]interface{}{"name": name, "start_date": startDate, "end_date": endDate, "record_version": sprint.RecordVersion + 1}
	if req.Goal != nil {
		updates["goal"] = strings.TrimSpace(*req.Goal)
	}
	query := database.GetDB(c).Model(&models.Sprint{}).Where("id = ? AND workspace_id = ?", sprintID, workspaceID)
	if req.RecordVersion != nil {
		query = query.Where("record_version = ?", *req.RecordVersion)
	}
	result := query.Updates(updates)
	if result.Error != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update sprint"})
	}
	if result.RowsAffected != 1 {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Sprint changed since it was loaded", "code": "PM_VERSION_CONFLICT"})
	}
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", sprintID, workspaceID).First(&sprint).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to reload sprint"})
	}
	return c.JSON(sprint)
}

func DeleteSprint(c *fiber.Ctx) error {
	sprintID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid sprint ID"})
	}
	workspaceID := CurrentWorkspaceID(c)
	err = database.GetDB(c).Transaction(func(tx *gorm.DB) error {
		var sprint models.Sprint
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND workspace_id = ?", sprintID, workspaceID).First(&sprint).Error; err != nil {
			return err
		}
		if sprint.Status != "planning" {
			return errors.New("only planning sprints can be deleted")
		}
		if err := tx.Model(&models.Task{}).Where("workspace_id = ? AND sprint_id = ?", workspaceID, sprint.ID).Update("sprint_id", nil).Error; err != nil {
			return err
		}
		if err := tx.Delete(&sprint).Error; err != nil {
			return err
		}
		return services.EnqueueOutbox(tx, workspaceID, "events.sprints.deleted", "sprint.deleted", "sprint", sprint.ID, map[string]interface{}{
			"type": "sprint_updated", "sprint_id": sprint.ID.String(), "project_id": sprint.ProjectID.String(),
		})
	})
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Sprint not found"})
	}
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func StartSprint(c *fiber.Ctx) error {
	return changeSprintLifecycle(c, "planning", "active")
}

func CompleteSprint(c *fiber.Ctx) error {
	return changeSprintLifecycle(c, "active", "completed")
}

func changeSprintLifecycle(c *fiber.Ctx, requiredStatus, nextStatus string) error {
	sprintID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid sprint ID"})
	}
	workspaceID := CurrentWorkspaceID(c)
	var sprint models.Sprint
	err = database.GetDB(c).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND workspace_id = ?", sprintID, workspaceID).First(&sprint).Error; err != nil {
			return err
		}
		if sprint.Status != requiredStatus {
			return errors.New("sprint is not in the required lifecycle state")
		}
		if nextStatus == "active" {
			var activeCount int64
			if err := tx.Model(&models.Sprint{}).Where("workspace_id = ? AND project_id = ? AND status = ? AND id <> ?", workspaceID, sprint.ProjectID, "active", sprint.ID).Count(&activeCount).Error; err != nil {
				return err
			}
			if activeCount > 0 {
				return errors.New("another sprint is already active for this project")
			}
			now := time.Now().UTC()
			if sprint.StartDate == nil {
				sprint.StartDate = &now
			}
		}
		if nextStatus == "completed" {
			now := time.Now().UTC()
			if sprint.EndDate == nil {
				sprint.EndDate = &now
			}
			if err := tx.Model(&models.Task{}).Where("workspace_id = ? AND sprint_id = ? AND status <> ?", workspaceID, sprint.ID, "done").Update("sprint_id", nil).Error; err != nil {
				return err
			}
		}
		sprint.Status = nextStatus
		sprint.RecordVersion++
		if err := tx.Model(&models.Sprint{}).Where("id = ? AND workspace_id = ?", sprint.ID, workspaceID).Updates(map[string]interface{}{
			"status": sprint.Status, "start_date": sprint.StartDate, "end_date": sprint.EndDate, "record_version": sprint.RecordVersion,
		}).Error; err != nil {
			return err
		}
		return services.EnqueueOutbox(tx, workspaceID, "events.sprints.updated", "sprint."+nextStatus, "sprint", sprint.ID, map[string]interface{}{
			"type": "sprint_updated", "sprint_id": sprint.ID.String(), "project_id": sprint.ProjectID.String(), "status": nextStatus,
		})
	})
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Sprint not found"})
	}
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(sprint)
}
