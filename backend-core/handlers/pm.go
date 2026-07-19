package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/engine"
	"github.com/septimus-os/backend-core/events"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
	"github.com/septimus-os/backend-core/utils"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
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

	// Use default config if none provided
	settings := req.Settings
	if len(settings) == 0 {
		b, _ := json.Marshal(DefaultConfig)
		settings = b
	}

	workspaceIDStr, _ := c.Locals("workspace_id").(string)
	userIDStr, _ := c.Locals("user_id").(string)
	workspaceID, _ := uuid.Parse(workspaceIDStr)
	userID, _ := uuid.Parse(userIDStr)

	project := models.Project{
		ID:          uuid.New(),
		WorkspaceID: workspaceID,
		CreatedBy:   userID,
		Name:        req.Name,
		Settings:    datatypes.JSON(settings),
	}

	if err := database.GetDB(c).Create(&project).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
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

		utils.DispatchWebhook("http://localhost:5678/webhook/drive", "ProjectCreated", fiber.Map{
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
	workspaceID, _ := c.Locals("workspace_id").(string)
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
		Name     string          `json:"name"`
		Settings json.RawMessage `json:"settings"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid input"})
	}

	var project models.Project
	if err := database.GetDB(c).Where("id = ?", id).First(&project).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Project not found"})
	}

	userID, _ := c.Locals("user_id").(string)
	role := c.Locals("role")
	if project.CreatedBy.String() != userID && role != "ADMIN" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Forbidden: You do not have permission to edit this project"})
	}

	if req.Name != "" {
		project.Name = req.Name
	}
	if len(req.Settings) > 0 {
		project.Settings = datatypes.JSON(req.Settings)
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
	if err := database.GetDB(c).Where("id = ?", id).First(&project).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Project not found"})
	}

	userID, _ := c.Locals("user_id").(string)
	role := c.Locals("role")
	if project.CreatedBy.String() != userID && role != "ADMIN" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Forbidden: You do not have permission to delete this project"})
	}

	if err := database.GetDB(c).Where("id = ?", id).Delete(&models.Project{}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete project"})
	}

	services.LogEvent(
		nil, // Replace with UserID from locals if extracted
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

	taskID := uuid.New()
	path := utils.FormatUUIDForLtree(taskID)
	var parentIDPtr *uuid.UUID

	if req.ParentID != "" {
		pid, err := uuid.Parse(req.ParentID)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid parent_id"})
		}
		parentIDPtr = &pid

		// Fetch parent to get its path
		var parentTask models.Task
		if err := database.GetDB(c).First(&parentTask, "id = ?", pid).Error; err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Parent task not found"})
		}
		
		// LTREE format: parent_path.child_id
		path = parentTask.Path + "." + path
	}

	task := models.Task{
		ID:          taskID,
		ProjectID:   projectID,
		Title:       req.Title,
		Description: req.Description,
		Status:      "todo", // Default status
		Priority:    req.Priority,
		StoryPoints: req.StoryPoints,
		ParentID:    parentIDPtr,
		Path:        path,
	}

	err = database.GetDB(c).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&task).Error; err != nil {
			return err
		}

		// Create initial history entry
		history := models.TaskHistory{
			ID:             uuid.New(),
			TaskID:         task.ID,
			PreviousStatus: "",
			NewStatus:      "todo",
			ChangedAt:      time.Now(),
		}
		if err := tx.Create(&history).Error; err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	// Publish Event
	eventDataMap := map[string]interface{}{
		"type":         "TASK_CREATED",
		"task_id":      task.ID.String(),
		"project_id":   task.ProjectID.String(),
		"title":        task.Title,
		"description":  task.Description,
		"story_points": task.StoryPoints,
		"status":       task.Status,
		"priority":     task.Priority,
	}
	eventData, _ := json.Marshal(eventDataMap)
	events.PublishEvent("events.tasks.created", eventData)

	// Trigger any active Workflows listening for task creation
	go ExecuteWorkflowsByTrigger("task.created", eventDataMap)

	// Dispatch Webhook
	if wsID, ok := c.Locals("workspace_id").(string); ok && wsID != "" {
		workspaceID := database.ParseUUID(wsID)
		services.DispatchWebhook(workspaceID, "events.tasks.created", eventDataMap)
		
		// Trigger Workflow Engine
		go engine.ExecuteEvent(database.GetDB(c), workspaceID, "task.created", eventDataMap)
	}

	return c.Status(fiber.StatusCreated).JSON(task)
}

func GetTasks(c *fiber.Ctx) error {
	projectIDParam := c.Query("project_id")
	statusParam := c.Query("status")

	// Pagination
	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 50)
	if limit > 200 {
		limit = 200
	}
	offset := (page - 1) * limit

	query := database.GetDB(c).Model(&models.Task{})

	if projectIDParam != "" {
		pid, err := uuid.Parse(projectIDParam)
		if err == nil {
			query = query.Where("project_id = ?", pid)
		}
	}

	if statusParam != "" {
		query = query.Where("status = ?", statusParam)
	}

	var total int64
	query.Count(&total)

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
	if err := database.GetDB(c).First(&parentTask, "id = ?", taskID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Task not found"})
	}

	var allTasks []models.Task
	// '<@' is the LTREE operator for 'is descendant of'
	// This query fetches the task itself AND all its nested subtasks (children, grandchildren, etc.)
	// at any depth, using the GIST index in O(1) / O(log N) time!
	if err := database.GetDB(c).Where("path <@ ?", parentTask.Path).Order("path ASC").Find(&allTasks).Error; err != nil {
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

	// 1. Fetch the Task and its Project
	var task models.Task
	if err := database.GetDB(c).Preload("Project").First(&task, "id = ?", taskID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Task not found"})
	}

	// If status is the same, do nothing
	if task.Status == req.NewStatus {
		return c.JSON(task)
	}

	// 2. Load Project Config
	var config ProjectConfig
	if len(task.Project.Settings) > 0 {
		if err := json.Unmarshal(task.Project.Settings, &config); err != nil {
			// Fallback to default if JSON is malformed
			config = DefaultConfig
		}
	} else {
		config = DefaultConfig
	}

	// Ensure transitions exist even if unmarshal succeeded but didn't have transitions
	if len(config.Transitions) == 0 {
		config.Transitions = DefaultConfig.Transitions
	}

	// 3. The State Machine Validation
	if !CanTransition(task.Status, req.NewStatus, config) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": fmt.Sprintf("Invalid transition from '%s' to '%s'", task.Status, req.NewStatus),
		})
}

	oldStatus := task.Status

	// 4. Update the Task
	task.Status = req.NewStatus
	if err := database.GetDB(c).Save(&task).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update task"})
	}

	// Webhook for Google Sheets / Tracker sync
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

	// 5. Create History Entry
	history := models.TaskHistory{
		ID:             uuid.New(),
		TaskID:         task.ID,
		PreviousStatus: oldStatus,
		NewStatus:      task.Status,
		ChangedAt:      time.Now(),
	}
	database.GetDB(c).Create(&history)

	// 6. Integration: Publish event to NATS
	eventData, _ := json.Marshal(map[string]interface{}{
		"type":            "TASK_TRANSITIONED",
		"task_id":         task.ID.String(),
		"title":           task.Title,
		"previous_status": oldStatus,
		"new_status":      task.Status,
	})
	events.PublishEvent("events.tasks.updated", eventData)

	// 7. Trigger any active Workflows listening for task transitions
	go ExecuteWorkflowsByTrigger("task.transitioned", map[string]interface{}{
		"task_id":    task.ID.String(),
		"title":      task.Title,
		"status":     task.Status,
		"new_status": task.Status,
		"old_status": oldStatus,
		"priority":   task.Priority,
	})

	return c.JSON(task)
}
