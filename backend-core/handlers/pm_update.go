package handlers

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/utils"
)

func UpdateTask(c *fiber.Ctx) error {
	taskIDStr := c.Params("id")
	taskID, err := uuid.Parse(taskIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid task ID"})
	}

	var task models.Task
	if err := database.DB.Preload("Project").First(&task, "id = ?", taskID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Task not found"})
	}

	var req struct {
		Title       *string `json:"title"`
		Description *string `json:"description"`
		Priority    *int    `json:"priority"`
		StoryPoints *int    `json:"story_points"`
		AssigneeID  *string `json:"assignee_id"`
		SprintID    *string `json:"sprint_id"`
		StartDate   *string `json:"start_date"`
		DueDate     *string `json:"due_date"`
		Status      *string `json:"status"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid input"})
	}

	if req.Title != nil {
		task.Title = *req.Title
	}
	if req.Description != nil {
		task.Description = *req.Description
	}
	if req.Priority != nil {
		task.Priority = *req.Priority
	}
	if req.StoryPoints != nil {
		task.StoryPoints = *req.StoryPoints
	}
	if req.Status != nil {
		task.Status = *req.Status
	}
	if req.AssigneeID != nil {
		if *req.AssigneeID == "" {
			task.AssigneeID = nil
		} else {
			aid, err := uuid.Parse(*req.AssigneeID)
			if err == nil {
				task.AssigneeID = &aid
			}
		}
	}
	if req.SprintID != nil {
		if *req.SprintID == "" {
			task.SprintID = nil
		} else {
			sid, err := uuid.Parse(*req.SprintID)
			if err == nil {
				task.SprintID = &sid
			}
		}
	}

	oldDueDate := task.DueDate

	if req.StartDate != nil {
		if *req.StartDate == "" {
			task.StartDate = nil
		} else {
			t, err := time.Parse(time.RFC3339, *req.StartDate)
			if err == nil {
				task.StartDate = &t
			}
		}
	}
	if req.DueDate != nil {
		if *req.DueDate == "" {
			task.DueDate = nil
		} else {
			t, err := time.Parse(time.RFC3339, *req.DueDate)
			if err == nil {
				task.DueDate = &t
			}
		}
	}

	if err := database.DB.Save(&task).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update task"})
	}

	// Webhook: Google Calendar sync when DueDate is set or changed
	dueDateChanged := (oldDueDate == nil && task.DueDate != nil) ||
		(oldDueDate != nil && task.DueDate != nil && !oldDueDate.Equal(*task.DueDate))

	if dueDateChanged && task.Project != nil {
		if _, active := GetActiveIntegration(task.Project.WorkspaceID, "google_calendar"); active {
			utils.DispatchWebhook("http://localhost:5678/webhook/calendar", "TaskDeadlineSet", fiber.Map{
				"task_id":  task.ID,
				"title":    task.Title,
				"due_date": task.DueDate,
			})
		}
	}

	// Webhook: Google Sheets sync when task is completed
	if task.Status == "done" && task.Project != nil {
		if _, active := GetActiveIntegration(task.Project.WorkspaceID, "google_sheets"); active {
			utils.DispatchWebhook("http://localhost:5678/webhook/tasks", "TaskCompleted", fiber.Map{
				"task_id":   task.ID,
				"title":     task.Title,
				"status":    task.Status,
				"completed": time.Now(),
			})
		}
	}

	return c.JSON(task)
}
