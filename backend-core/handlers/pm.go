package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
	"github.com/septimus-os/backend-core/utils"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/datatypes"
)

// ProjectConfig represents the settings JSON structure for a project workflow
type ProjectConfig struct {
	Transitions map[string][]string `json:"transitions"`
}

// DefaultConfig provides a basic Kanban workflow if none is specified
var DefaultConfig = ProjectConfig{
	Transitions: map[string][]string{
		"todo":        {"in_progress"},
		"in_progress": {"review", "todo", "blocked"},
		"review":      {"done", "in_progress"},
		"blocked":     {"todo", "in_progress"},
		"done":        {"in_progress"},
	},
}

// CanTransition checks if moving from currentStatus to newStatus is valid based on config
func CanTransition(currentStatus, newStatus string, config ProjectConfig) bool {
	allowed, exists := config.Transitions[currentStatus]
	if !exists {
		return false
	}
	for _, s := range allowed {
		if s == newStatus {
			return true
		}
	}
	return false
}

// ─── Projects ───────────────────────────────────────────────────────────────

func CreateProject(c *fiber.Ctx) error {
	var req struct {
		Name     string          `json:"name"`
		Settings json.RawMessage `json:"settings"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid input"})
	}
	name, err := validateProjectName(req.Name)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	settings, err := validateProjectSettings(req.Settings)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	workspaceID := CurrentWorkspaceID(c)
	userID, err := uuid.Parse(fmt.Sprint(c.Locals("user_id")))
	if workspaceID == uuid.Nil || err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "authenticated workspace and user are required"})
	}

	project := models.Project{
		ID:          uuid.New(),
		WorkspaceID: workspaceID,
		CreatedBy:   userID,
		Name:        name,
		Settings:    datatypes.JSON(settings),
	}

	if err := database.GetDB(c).Create(&project).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create project"})
	}

	// Webhook & Native Integration: Google Drive — auto-create project folder structure
	if integration, active := GetActiveIntegration(project.WorkspaceID, "google_drive"); active {
		token := services.GetClient(integration.AccessToken, integration.RefreshToken, integration.Expiry)
		folderID, webViewLink, err := services.CreateDriveFolder(c.Context(), token, project.Name)

		if err == nil {
			project.DriveFolderLink = webViewLink
			database.GetDB(c).Save(&project)
		} else {
			log.Printf("Failed to create Google Drive folder: %v", err)
		}

		utils.DispatchN8NWebhook("drive", "ProjectCreated", fiber.Map{
			"project_id":   project.ID,
			"project_name": project.Name,
			"workspace_id": project.WorkspaceID,
			"folder_id":    folderID,
			"folder_link":  webViewLink,
		})
	}

	return c.Status(fiber.StatusCreated).JSON(project)
}

func GetProjects(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	var projects []models.Project
	if err := database.GetDB(c).Where("workspace_id = ?", workspaceID).Order("created_at desc").Find(&projects).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(projects)
}

func UpdateProject(c *fiber.Ctx) error {
	projectID := c.Params("id")
	if projectID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Project ID is required"})
	}

	id := database.ParseUUID(projectID)
	if id == uuid.Nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid Project ID"})
	}

	var req struct {
		Name     *string         `json:"name"`
		Settings json.RawMessage `json:"settings"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid input"})
	}

	var project models.Project
	workspaceID := CurrentWorkspaceID(c)
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", id, workspaceID).First(&project).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Project not found"})
	}

	if req.Name != nil {
		name, err := validateProjectName(*req.Name)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}
		project.Name = name
	}
	if len(req.Settings) > 0 {
		settings, err := validateProjectSettings(req.Settings)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}
		project.Settings = datatypes.JSON(settings)
	}

	if err := database.GetDB(c).Save(&project).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update project"})
	}

	return c.JSON(project)
}

func DeleteProject(c *fiber.Ctx) error {
	projectID := c.Params("id")
	if projectID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Project ID is required"})
	}

	id := database.ParseUUID(projectID)
	if id == uuid.Nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid Project ID"})
	}

	var project models.Project
	workspaceID := CurrentWorkspaceID(c)
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", id, workspaceID).First(&project).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Project not found"})
	}

	if err := database.GetDB(c).Where("id = ?", id).Delete(&models.Project{}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete project"})
	}

	var actorID *uuid.UUID
	if parsed, err := uuid.Parse(fmt.Sprint(c.Locals("user_id"))); err == nil {
		actorID = &parsed
	}
	services.LogEvent(
		actorID,
		"projects.delete",
		"Project",
		projectID,
		map[string]interface{}{"ip": c.IP()},
		c.IP(),
	)

	return c.Status(fiber.StatusOK).JSON(fiber.Map{"status": "success", "message": "Project deleted successfully"})
}

// ─── Tasks ──────────────────────────────────────────────────────────────────

func CreateTask(c *fiber.Ctx) error {
	var req struct {
		ProjectID   string `json:"project_id"`
		Title       string `json:"title"`
		Description string `json:"description"`
		ParentID    string `json:"parent_id"`
		Priority    int    `json:"priority"`
		StoryPoints int    `json:"story_points"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid input"})
	}

	projectID, err := uuid.Parse(req.ProjectID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid project_id"})
	}
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	var project models.Project
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", projectID, workspaceID).First(&project).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Project not found in workspace"})
	}
	title, err := validateTaskInput(req.Title, req.Priority, req.StoryPoints)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	var parentIDPtr *uuid.UUID

	if req.ParentID != "" {
		pid, err := uuid.Parse(req.ParentID)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid parent_id"})
		}
		parentIDPtr = &pid
	}

	task, err := services.CreatePMTask(database.GetDB(c), workspaceID, services.CreatePMTaskInput{
		ProjectID: projectID, Title: title, Description: req.Description,
		ParentID: parentIDPtr, Priority: req.Priority, StoryPoints: req.StoryPoints,
		Source: "http",
	})

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	eventDataMap := map[string]interface{}{
		"type":         "task_created",
		"task_id":      task.ID.String(),
		"project_id":   task.ProjectID.String(),
		"title":        task.Title,
		"description":  task.Description,
		"story_points": task.StoryPoints,
		"status":       task.Status,
		"priority":     task.Priority,
	}
	go ExecuteWorkflowsByTrigger(workspaceID, "task.created", eventDataMap)

	// Dispatch Webhook
	if wsID, ok := c.Locals("workspace_id").(string); ok && wsID != "" {
		workspaceID := database.ParseUUID(wsID)
		services.DispatchWebhook(workspaceID, "events.tasks.created", eventDataMap)

	}

	return c.Status(fiber.StatusCreated).JSON(task)
}

func GetTasks(c *fiber.Ctx) error {
	projectIDParam := c.Query("project_id")
	statusParam := c.Query("status")

	// Pagination
	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 50)
	if page < 1 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "page must be greater than zero"})
	}
	if limit < 1 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "limit must be greater than zero"})
	}
	if limit > 200 {
		limit = 200
	}
	offset := (page - 1) * limit

	workspaceID := CurrentWorkspaceID(c)
	query := database.GetDB(c).Model(&models.Task{}).Where("workspace_id = ?", workspaceID)

	if projectIDParam != "" {
		pid, err := uuid.Parse(projectIDParam)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid project_id"})
		}
		query = query.Where("project_id = ?", pid)
	}

	if statusParam != "" {
		query = query.Where("status = ?", statusParam)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to count tasks"})
	}

	var tasks []models.Task
	if err := query.
		Order("created_at desc").
		Offset(offset).
		Limit(limit).
		Find(&tasks).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{
		"tasks":       tasks,
		"total":       total,
		"page":        page,
		"limit":       limit,
		"total_pages": (total + int64(limit) - 1) / int64(limit),
	})
}

// GetTaskTree fetches a task and all its subtasks recursively in a single query
func GetTaskTree(c *fiber.Ctx) error {
	taskIDStr := c.Params("id")
	taskID, err := uuid.Parse(taskIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid task ID"})
	}

	// First, get the parent task to know its path
	var parentTask models.Task
	workspaceID := CurrentWorkspaceID(c)
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", taskID, workspaceID).First(&parentTask).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Task not found"})
	}

	var allTasks []models.Task
	// '<@' is the LTREE operator for 'is descendant of'
	// This query fetches the task itself AND all its nested subtasks (children, grandchildren, etc.)
	// at any depth, using the GIST index in O(1) / O(log N) time!
	if err := database.GetDB(c).Where("workspace_id = ? AND path <@ ?", workspaceID, parentTask.Path).Order("path ASC").Find(&allTasks).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch task tree"})
	}

	return c.JSON(fiber.Map{
		"tree": allTasks,
	})
}

// ─── The Agile State Machine Engine ─────────────────────────────────────────

func TransitionTask(c *fiber.Ctx) error {
	taskIDStr := c.Params("id")
	taskID, err := uuid.Parse(taskIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid task ID"})
	}

	var req struct {
		NewStatus string `json:"status"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid input"})
	}

	workspaceID := CurrentWorkspaceID(c)
	var actorID *uuid.UUID
	if parsed, parseErr := uuid.Parse(fmt.Sprint(c.Locals("user_id"))); parseErr == nil {
		actorID = &parsed
	}
	task, oldStatus, err := TransitionTaskForWorkspace(database.GetDB(c), workspaceID, taskID, req.NewStatus, actorID, "http")
	if errors.Is(err, ErrPMTaskNotFound) {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Task not found"})
	}
	if errors.Is(err, ErrInvalidTransition) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to transition task"})
	}
	if oldStatus == task.Status {
		return c.JSON(task)
	}

	// Webhook for Google Sheets / Tracker sync
	if task.Status == "done" && task.Project != nil {
		if _, active := GetActiveIntegration(task.Project.WorkspaceID, "google_sheets"); active {
			utils.DispatchN8NWebhook("tasks", "TaskCompleted", fiber.Map{
				"task_id":   task.ID,
				"title":     task.Title,
				"status":    task.Status,
				"completed": time.Now(),
			})
		}
	}

	go ExecuteWorkflowsByTrigger(workspaceID, "task.transitioned", map[string]interface{}{
		"task_id":    task.ID.String(),
		"project_id": task.ProjectID.String(),
		"title":      task.Title,
		"status":     task.Status,
		"new_status": task.Status,
		"old_status": oldStatus,
		"priority":   task.Priority,
	})

	return c.JSON(task)
}
