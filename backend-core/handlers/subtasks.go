package handlers

import (
	"errors"
	"fmt"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
)

type SubtaskPayload struct {
	Title       string `json:"title"`
	Description string `json:"description,omitempty"`
	Priority    int    `json:"priority,omitempty"`
	StoryPoints int    `json:"story_points,omitempty"`
	AssigneeID  string `json:"assignee_id,omitempty"`
}

// CreateSubtask creates a normal relational PM task with a parent. Subtasks no
// longer use the generic JSONB entity store, so hierarchy, RLS, history,
// Workflow, n8n, Centrifugo, and AI all observe the same aggregate.
func CreateSubtask(c *fiber.Ctx) error {
	parentID, err := uuid.Parse(c.Params("parent_task_id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid parent_task_id"})
	}
	var payload SubtaskPayload
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid payload"})
	}
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	db := database.GetDB(c)
	var parent models.Task
	if err := db.Where("id = ? AND workspace_id = ?", parentID, workspaceID).First(&parent).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "parent task not found"})
	}
	var assigneeID *uuid.UUID
	if strings.TrimSpace(payload.AssigneeID) != "" {
		parsed, err := uuid.Parse(strings.TrimSpace(payload.AssigneeID))
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid assignee_id"})
		}
		assigneeID = &parsed
	}
	task, err := services.CreatePMTask(db, workspaceID, services.CreatePMTaskInput{
		ProjectID: parent.ProjectID, Title: payload.Title, Description: payload.Description,
		ParentID: &parent.ID, Priority: payload.Priority, StoryPoints: payload.StoryPoints,
		AssigneeID: assigneeID, Source: "http_subtask",
	})
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	go ExecuteWorkflowsByTrigger(workspaceID, "task.created", map[string]interface{}{
		"task_id": task.ID.String(), "project_id": task.ProjectID.String(),
		"parent_id": parent.ID.String(), "title": task.Title, "status": task.Status,
	})
	return c.Status(fiber.StatusCreated).JSON(task)
}

func GetSubtasks(c *fiber.Ctx) error {
	parentID, err := uuid.Parse(c.Params("parent_task_id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid parent_task_id"})
	}
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	var parentCount int64
	db := database.GetDB(c)
	if err := db.Model(&models.Task{}).Where("id = ? AND workspace_id = ?", parentID, workspaceID).Count(&parentCount).Error; err != nil || parentCount == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "parent task not found"})
	}
	var tasks []models.Task
	if err := db.Where("workspace_id = ? AND parent_id = ?", workspaceID, parentID).
		Order("created_at ASC, id ASC").Find(&tasks).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch subtasks"})
	}
	return c.JSON(tasks)
}

// UpdateSubtaskStatus is a compatibility alias over the canonical transition
// command. It accepts only canonical PM statuses and cannot mutate JSONB rows.
func UpdateSubtaskStatus(c *fiber.Ctx) error {
	taskID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid subtask id"})
	}
	var payload struct {
		Status string `json:"status"`
	}
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid payload"})
	}
	workspaceID := CurrentWorkspaceID(c)
	var child models.Task
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ? AND parent_id IS NOT NULL", taskID, workspaceID).First(&child).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "subtask not found"})
	}
	var actorID *uuid.UUID
	if parsed, err := uuid.Parse(fmt.Sprint(c.Locals("user_id"))); err == nil {
		actorID = &parsed
	}
	updated, _, err := TransitionTaskForWorkspace(database.GetDB(c), workspaceID, taskID, payload.Status, actorID, "subtask_http")
	if errors.Is(err, ErrInvalidTransition) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error(), "code": "PM_INVALID_TRANSITION"})
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to transition subtask"})
	}
	return c.JSON(updated)
}
