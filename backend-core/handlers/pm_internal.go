package handlers

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/services"
)

type createPMTaskInternalRequest struct {
	ProjectID   string `json:"project_id"`
	UseInbox    bool   `json:"use_inbox"`
	Title       string `json:"title"`
	Description string `json:"description"`
	ParentID    string `json:"parent_id"`
	Priority    int    `json:"priority"`
	StoryPoints int    `json:"story_points"`
	Source      string `json:"source"`
}

// CreatePMTaskInternal is the only service-to-service task creation endpoint.
// A caller must select a real project or explicitly opt into the system Inbox;
// an omitted project can never silently create an unscoped JSONB entity.
func CreatePMTaskInternal(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	var req createPMTaskInternalRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid input"})
	}
	db := database.GetDB(c)
	projectID, err := uuid.Parse(strings.TrimSpace(req.ProjectID))
	if err != nil {
		if !req.UseInbox {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "project_id is required unless use_inbox is true", "code": "PM_PROJECT_REQUIRED",
			})
		}
		project, ensureErr := services.EnsurePMInboxProject(db, workspaceID, nil)
		if ensureErr != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to resolve PM Inbox"})
		}
		projectID = project.ID
	}
	var parentID *uuid.UUID
	if strings.TrimSpace(req.ParentID) != "" {
		parsed, parseErr := uuid.Parse(strings.TrimSpace(req.ParentID))
		if parseErr != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid parent_id"})
		}
		parentID = &parsed
	}
	source := strings.TrimSpace(req.Source)
	if source == "" || len(source) > 50 {
		source = "internal"
	}
	task, err := services.CreatePMTask(db, workspaceID, services.CreatePMTaskInput{
		ProjectID: projectID, Title: req.Title, Description: req.Description,
		ParentID: parentID, Priority: req.Priority, StoryPoints: req.StoryPoints, Source: source,
	})
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	event := map[string]interface{}{
		"task_id": task.ID.String(), "project_id": task.ProjectID.String(),
		"title": task.Title, "status": task.Status, "priority": task.Priority, "source": source,
	}
	go ExecuteWorkflowsByTrigger(workspaceID, "task.created", event)
	go services.DispatchWebhook(workspaceID, "events.tasks.created", event)
	return c.Status(fiber.StatusCreated).JSON(task)
}
