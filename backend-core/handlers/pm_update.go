package handlers

import (
	"errors"
	"encoding/json"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
	"github.com/septimus-os/backend-core/utils"
	"gorm.io/gorm"
)

var errPMVersionConflict = errors.New("task record version conflict")

type updateTaskRequest struct {
	Title         *string `json:"title"`
	Description   *string `json:"description"`
	Priority      *int    `json:"priority"`
	StoryPoints   *int    `json:"story_points"`
	AssigneeID    *string `json:"assignee_id"`
	SprintID      *string `json:"sprint_id"`
	StartDate     *string `json:"start_date"`
	DueDate       *string `json:"due_date"`
	Status        *string `json:"status"`
	RecordVersion *int    `json:"record_version"`
}

func parseOptionalPMTime(value *string, field string) (*time.Time, error) {
	if value == nil || strings.TrimSpace(*value) == "" {
		return nil, nil
	}
	parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(*value))
	if err != nil {
		return nil, errors.New(field + " must be an RFC3339 timestamp")
	}
	return &parsed, nil
}

func UpdateTask(c *fiber.Ctx) error {
	taskID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid task ID"})
	}
	var req updateTaskRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid input"})
	}
	if req.Status != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "status changes must use the task transition endpoint",
			"code":  "PM_TRANSITION_REQUIRED",
		})
	}

	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	db := database.GetDB(c)
	var task models.Task
	if err := db.Preload("Project").Where("id = ? AND workspace_id = ?", taskID, workspaceID).First(&task).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Task not found"})
	}

	updates := map[string]interface{}{}
	if req.Title != nil {
		title, err := validateTaskInput(*req.Title, task.Priority, task.StoryPoints)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}
		updates["title"] = title
		task.Title = title
	}
	if req.Description != nil {
		if len([]rune(*req.Description)) > 50000 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "description exceeds 50000 characters"})
		}
		updates["description"] = strings.TrimSpace(*req.Description)
		task.Description = strings.TrimSpace(*req.Description)
	}
	if req.Priority != nil {
		if _, err := validateTaskInput(task.Title, *req.Priority, task.StoryPoints); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}
		updates["priority"] = *req.Priority
		task.Priority = *req.Priority
	}
	if req.StoryPoints != nil {
		if _, err := validateTaskInput(task.Title, task.Priority, *req.StoryPoints); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}
		updates["story_points"] = *req.StoryPoints
		task.StoryPoints = *req.StoryPoints
	}
	if req.AssigneeID != nil {
		if strings.TrimSpace(*req.AssigneeID) == "" {
			updates["assignee_id"] = nil
			task.AssigneeID = nil
		} else {
			assigneeID, parseErr := uuid.Parse(strings.TrimSpace(*req.AssigneeID))
			if parseErr != nil {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid assignee_id"})
			}
			var count int64
			if err := db.Model(&models.User{}).Where("id = ? AND workspace_id = ?", assigneeID, workspaceID).Count(&count).Error; err != nil || count == 0 {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Assignee is not a workspace member"})
			}
			updates["assignee_id"] = assigneeID
			task.AssigneeID = &assigneeID
		}
	}
	if req.SprintID != nil {
		if strings.TrimSpace(*req.SprintID) == "" {
			updates["sprint_id"] = nil
			task.SprintID = nil
		} else {
			sprintID, parseErr := uuid.Parse(strings.TrimSpace(*req.SprintID))
			if parseErr != nil {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid sprint_id"})
			}
			var count int64
			if err := db.Model(&models.Sprint{}).Where("id = ? AND workspace_id = ? AND project_id = ?", sprintID, workspaceID, task.ProjectID).Count(&count).Error; err != nil || count == 0 {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Sprint does not belong to this project"})
			}
			updates["sprint_id"] = sprintID
			task.SprintID = &sprintID
		}
	}

	startDate := task.StartDate
	dueDate := task.DueDate
	if req.StartDate != nil {
		startDate, err = parseOptionalPMTime(req.StartDate, "start_date")
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}
		updates["start_date"] = startDate
	}
	if req.DueDate != nil {
		dueDate, err = parseOptionalPMTime(req.DueDate, "due_date")
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}
		updates["due_date"] = dueDate
	}
	if startDate != nil && dueDate != nil && dueDate.Before(*startDate) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "due_date must not be before start_date"})
	}
	oldDueDate := task.DueDate
	task.StartDate, task.DueDate = startDate, dueDate

	if task.AssigneeID != nil && task.StartDate != nil && task.DueDate != nil {
		var policy models.WorkspaceSetting
		if err := db.Where("workspace_id = ? AND key = ?", workspaceID, "pm_assignment_policy").First(&policy).Error; err == nil {
			var p struct {
				BlockOnLeave string `json:"block_on_leave"`
			}
			if json.Unmarshal(policy.Value, &p) == nil && p.BlockOnLeave == "hard" {
				var overlap int64
				db.Model(&models.LeaveRequest{}).
					Where("workspace_id = ? AND employee_id IN (SELECT id FROM employees WHERE user_id = ? AND workspace_id = ?) AND status = ? AND start_date <= ? AND end_date >= ?",
						workspaceID, *task.AssigneeID, workspaceID, "approved", task.DueDate, task.StartDate).
					Count(&overlap)
				if overlap > 0 {
					return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Assignee has an approved leave during this period"})
				}
			}
		}
	}

	if len(updates) == 0 {
		return c.JSON(task)
	}
	err = db.Transaction(func(tx *gorm.DB) error {
		nextVersion := task.RecordVersion + 1
		if nextVersion < 2 {
			nextVersion = 2
		}
		updates["record_version"] = nextVersion
		query := tx.Model(&models.Task{}).Where("id = ? AND workspace_id = ?", task.ID, workspaceID)
		if req.RecordVersion != nil {
			query = query.Where("record_version = ?", *req.RecordVersion)
		}
		result := query.Updates(updates)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return errPMVersionConflict
		}
		task.RecordVersion = nextVersion
		return services.EnqueueOutbox(tx, workspaceID, "events.tasks.updated", "task.updated", "task", task.ID, map[string]interface{}{
			"type": "task_updated", "task_id": task.ID.String(), "project_id": task.ProjectID.String(),
			"record_version": nextVersion, "changed_fields": mapKeys(updates),
		})
	})
	if errors.Is(err, errPMVersionConflict) {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Task changed since it was loaded", "code": "PM_VERSION_CONFLICT"})
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update task"})
	}

	dueDateChanged := (oldDueDate == nil && task.DueDate != nil) ||
		(oldDueDate != nil && task.DueDate == nil) ||
		(oldDueDate != nil && task.DueDate != nil && !oldDueDate.Equal(*task.DueDate))
	if dueDateChanged && task.DueDate != nil && task.Project != nil {
		if _, active := GetActiveIntegration(task.Project.WorkspaceID, "google_calendar"); active {
			utils.DispatchN8NWebhook("calendar", "TaskDeadlineSet", fiber.Map{
				"task_id": task.ID, "title": task.Title, "due_date": task.DueDate,
			})
		}
	}
	return c.JSON(task)
}

func mapKeys(values map[string]interface{}) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	return keys
}
