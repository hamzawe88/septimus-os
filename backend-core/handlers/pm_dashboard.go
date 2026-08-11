package handlers

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/gorm"
)

type pmDashboardWorkload struct {
	UserID    uuid.UUID `json:"user_id"`
	Email     string    `json:"email"`
	TaskCount int64     `json:"task_count"`
}

type pmDashboardSprint struct {
	ID           uuid.UUID `json:"id"`
	Name         string    `json:"name"`
	TotalTasks   int64     `json:"total_tasks"`
	DoneTasks    int64     `json:"done_tasks"`
	TimeElapsed  int       `json:"time_elapsed_percent"`
	WorkComplete int       `json:"work_complete_percent"`
}

type pmDashboardResponse struct {
	ProjectCount   int64                 `json:"project_count"`
	TotalTasks     int64                 `json:"total_tasks"`
	CompletedTasks int64                 `json:"completed_tasks"`
	OverdueTasks   int64                 `json:"overdue_tasks"`
	BlockedTasks   int64                 `json:"blocked_tasks"`
	OnTrackPercent int                   `json:"on_track_percent"`
	StatusCounts   map[string]int64      `json:"status_counts"`
	Workload       []pmDashboardWorkload `json:"workload"`
	MyTasks        []models.Task         `json:"my_tasks"`
	ActiveSprint   *pmDashboardSprint    `json:"active_sprint,omitempty"`
}

func GetPMDashboard(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	db := database.GetDB(c)
	projectID := uuid.Nil
	if rawProjectID := c.Query("project_id"); rawProjectID != "" {
		parsed, err := uuid.Parse(rawProjectID)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid project_id"})
		}
		var count int64
		if err := db.Model(&models.Project{}).Where("id = ? AND workspace_id = ?", parsed, workspaceID).Count(&count).Error; err != nil || count == 0 {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Project not found in workspace"})
		}
		projectID = parsed
	}

	taskScope := func(query *gorm.DB) *gorm.DB {
		query = query.Where("tasks.workspace_id = ?", workspaceID)
		if projectID != uuid.Nil {
			query = query.Where("tasks.project_id = ?", projectID)
		}
		return query
	}
	response := pmDashboardResponse{
		StatusCounts: map[string]int64{"todo": 0, "in_progress": 0, "review": 0, "blocked": 0, "done": 0},
		Workload:     []pmDashboardWorkload{}, MyTasks: []models.Task{},
	}
	projectQuery := db.Model(&models.Project{}).Where("workspace_id = ?", workspaceID)
	if projectID != uuid.Nil {
		projectQuery = projectQuery.Where("id = ?", projectID)
	}
	if err := projectQuery.Count(&response.ProjectCount).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to load PM dashboard"})
	}

	var statusRows []struct {
		Status string
		Count  int64
	}
	if err := taskScope(db.Model(&models.Task{})).
		Select("tasks.status, count(*) AS count").Group("tasks.status").Scan(&statusRows).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to load PM dashboard"})
	}
	for _, row := range statusRows {
		response.StatusCounts[row.Status] = row.Count
		response.TotalTasks += row.Count
	}
	response.CompletedTasks = response.StatusCounts["done"]
	response.BlockedTasks = response.StatusCounts["blocked"]
	if err := taskScope(db.Model(&models.Task{})).
		Where("tasks.status <> ? AND tasks.due_date IS NOT NULL AND tasks.due_date < ?", "done", time.Now().UTC()).
		Count(&response.OverdueTasks).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to load PM dashboard"})
	}
	if response.TotalTasks > 0 {
		response.OnTrackPercent = int(((response.TotalTasks - response.OverdueTasks) * 100) / response.TotalTasks)
	}

	workloadQuery := db.Table("tasks").
		Select("users.id AS user_id, users.email, count(tasks.id) AS task_count").
		Joins("JOIN users ON users.id = tasks.assignee_id AND users.workspace_id = tasks.workspace_id").
		Where("tasks.workspace_id = ? AND tasks.status <> ?", workspaceID, "done")
	if projectID != uuid.Nil {
		workloadQuery = workloadQuery.Where("tasks.project_id = ?", projectID)
	}
	if err := workloadQuery.Group("users.id, users.email").Order("task_count DESC").Limit(8).Scan(&response.Workload).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to load PM dashboard"})
	}

	userIDRaw, _ := c.Locals("user_id").(string)
	if userID, err := uuid.Parse(userIDRaw); err == nil {
		myTasksQuery := taskScope(db.Model(&models.Task{})).Where("tasks.assignee_id = ?", userID)
		_ = myTasksQuery.Order("CASE WHEN tasks.due_date IS NULL THEN 1 ELSE 0 END, tasks.due_date ASC, tasks.updated_at DESC").Limit(6).Find(&response.MyTasks).Error
	}

	var sprint models.Sprint
	sprintQuery := db.Where("workspace_id = ? AND status = ?", workspaceID, "active")
	if projectID != uuid.Nil {
		sprintQuery = sprintQuery.Where("project_id = ?", projectID)
	}
	if err := sprintQuery.Order("updated_at DESC").First(&sprint).Error; err == nil {
		summary := &pmDashboardSprint{ID: sprint.ID, Name: sprint.Name}
		_ = db.Model(&models.Task{}).Where("workspace_id = ? AND sprint_id = ?", workspaceID, sprint.ID).Count(&summary.TotalTasks).Error
		_ = db.Model(&models.Task{}).Where("workspace_id = ? AND sprint_id = ? AND status = ?", workspaceID, sprint.ID, "done").Count(&summary.DoneTasks).Error
		if summary.TotalTasks > 0 {
			summary.WorkComplete = int((summary.DoneTasks * 100) / summary.TotalTasks)
		}
		if sprint.StartDate != nil && sprint.EndDate != nil && sprint.EndDate.After(*sprint.StartDate) {
			elapsed := time.Since(*sprint.StartDate)
			total := sprint.EndDate.Sub(*sprint.StartDate)
			summary.TimeElapsed = max(0, min(100, int((elapsed*100)/total)))
		}
		response.ActiveSprint = summary
	} else if err != gorm.ErrRecordNotFound {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to load PM dashboard"})
	}

	return c.JSON(response)
}
