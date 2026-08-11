package handlers

import (
	"errors"
	"math"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/gorm"
)

var errPMDependencyCycle = errors.New("dependency would create a cycle")

type planningTask struct {
	ID             uuid.UUID  `json:"id"`
	Title          string     `json:"title"`
	Status         string     `json:"status"`
	AssigneeID     *uuid.UUID `json:"assignee_id,omitempty"`
	DurationDays   int        `json:"duration_days"`
	EarliestStart  int        `json:"earliest_start_day"`
	EarliestFinish int        `json:"earliest_finish_day"`
	LatestStart    int        `json:"latest_start_day"`
	LatestFinish   int        `json:"latest_finish_day"`
	SlackDays      int        `json:"slack_days"`
	Critical       bool       `json:"critical"`
}

func taskDurationDays(task models.Task) int {
	if task.StartDate != nil && task.DueDate != nil && !task.DueDate.Before(*task.StartDate) {
		return max(1, int(math.Ceil(task.DueDate.Sub(*task.StartDate).Hours()/24))) + 1
	}
	return max(1, task.StoryPoints)
}

func calculateCriticalPath(tasks []models.Task, dependencies []models.TaskDependency) ([]planningTask, int, error) {
	byID := make(map[uuid.UUID]models.Task, len(tasks))
	inDegree := make(map[uuid.UUID]int, len(tasks))
	incoming := make(map[uuid.UUID][]models.TaskDependency)
	outgoing := make(map[uuid.UUID][]models.TaskDependency)
	for _, task := range tasks {
		byID[task.ID] = task
		inDegree[task.ID] = 0
	}
	for _, edge := range dependencies {
		if _, ok := byID[edge.PredecessorID]; !ok {
			continue
		}
		if _, ok := byID[edge.SuccessorID]; !ok {
			continue
		}
		inDegree[edge.SuccessorID]++
		incoming[edge.SuccessorID] = append(incoming[edge.SuccessorID], edge)
		outgoing[edge.PredecessorID] = append(outgoing[edge.PredecessorID], edge)
	}
	queue := make([]uuid.UUID, 0, len(tasks))
	for id, degree := range inDegree {
		if degree == 0 {
			queue = append(queue, id)
		}
	}
	order := make([]uuid.UUID, 0, len(tasks))
	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		order = append(order, id)
		for _, edge := range outgoing[id] {
			inDegree[edge.SuccessorID]--
			if inDegree[edge.SuccessorID] == 0 {
				queue = append(queue, edge.SuccessorID)
			}
		}
	}
	if len(order) != len(tasks) {
		return nil, 0, errPMDependencyCycle
	}

	result := make(map[uuid.UUID]planningTask, len(tasks))
	projectDuration := 0
	for _, id := range order {
		task := byID[id]
		start := 0
		for _, edge := range incoming[id] {
			start = max(start, result[edge.PredecessorID].EarliestFinish+edge.LagDays)
		}
		duration := taskDurationDays(task)
		item := planningTask{ID: id, Title: task.Title, Status: task.Status, AssigneeID: task.AssigneeID,
			DurationDays: duration, EarliestStart: start, EarliestFinish: start + duration}
		result[id] = item
		projectDuration = max(projectDuration, item.EarliestFinish)
	}
	for index := len(order) - 1; index >= 0; index-- {
		id := order[index]
		item := result[id]
		latestFinish := projectDuration
		if len(outgoing[id]) > 0 {
			latestFinish = math.MaxInt
			for _, edge := range outgoing[id] {
				latestFinish = min(latestFinish, result[edge.SuccessorID].LatestStart-edge.LagDays)
			}
		}
		item.LatestFinish = latestFinish
		item.LatestStart = latestFinish - item.DurationDays
		item.SlackDays = item.LatestStart - item.EarliestStart
		item.Critical = item.SlackDays == 0
		result[id] = item
	}
	out := make([]planningTask, 0, len(order))
	for _, id := range order {
		out = append(out, result[id])
	}
	return out, projectDuration, nil
}

func CreateTaskDependency(c *fiber.Ctx) error {
	var body struct {
		PredecessorID string `json:"predecessor_id"`
		SuccessorID   string `json:"successor_id"`
		LagDays       int    `json:"lag_days"`
	}
	if err := c.BodyParser(&body); err != nil || body.LagDays < 0 || body.LagDays > 3650 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "valid dependency and lag_days from 0 to 3650 are required"})
	}
	pred, predErr := uuid.Parse(strings.TrimSpace(body.PredecessorID))
	succ, succErr := uuid.Parse(strings.TrimSpace(body.SuccessorID))
	if predErr != nil || succErr != nil || pred == succ {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "two different valid task ids are required"})
	}
	workspaceID := CurrentWorkspaceID(c)
	db := database.GetDB(c)
	var tasks []models.Task
	if err := db.Where("workspace_id = ? AND id IN ?", workspaceID, []uuid.UUID{pred, succ}).Find(&tasks).Error; err != nil || len(tasks) != 2 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "tasks were not found in workspace"})
	}
	if tasks[0].ProjectID != tasks[1].ProjectID {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "dependency tasks must belong to one project"})
	}
	var projectTasks []models.Task
	var edges []models.TaskDependency
	db.Where("workspace_id = ? AND project_id = ?", workspaceID, tasks[0].ProjectID).Find(&projectTasks)
	db.Where("workspace_id = ? AND project_id = ?", workspaceID, tasks[0].ProjectID).Find(&edges)
	candidate := models.TaskDependency{ID: uuid.New(), WorkspaceID: workspaceID, ProjectID: tasks[0].ProjectID,
		PredecessorID: pred, SuccessorID: succ, LagDays: body.LagDays}
	if _, _, err := calculateCriticalPath(projectTasks, append(edges, candidate)); err != nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error(), "code": "PM_DEPENDENCY_CYCLE"})
	}
	if err := db.Create(&candidate).Error; err != nil {
		if errors.Is(err, gorm.ErrDuplicatedKey) {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "dependency already exists"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create dependency"})
	}
	return c.Status(fiber.StatusCreated).JSON(candidate)
}

func DeleteTaskDependency(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid dependency id"})
	}
	result := database.GetDB(c).Where("id = ? AND workspace_id = ?", id, CurrentWorkspaceID(c)).Delete(&models.TaskDependency{})
	if result.Error != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to delete dependency"})
	}
	if result.RowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "dependency not found"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func GetPMPlanning(c *fiber.Ctx) error {
	projectID, err := uuid.Parse(c.Query("project_id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "valid project_id is required"})
	}
	workspaceID := CurrentWorkspaceID(c)
	db := database.GetDB(c)
	var project models.Project
	if err := db.Where("id = ? AND workspace_id = ?", projectID, workspaceID).First(&project).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "project not found"})
	}
	var tasks []models.Task
	var dependencies []models.TaskDependency
	db.Where("workspace_id = ? AND project_id = ?", workspaceID, projectID).Order("created_at").Find(&tasks)
	db.Where("workspace_id = ? AND project_id = ?", workspaceID, projectID).Order("created_at").Find(&dependencies)
	planning, duration, err := calculateCriticalPath(tasks, dependencies)
	if err != nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error(), "code": "PM_DEPENDENCY_CYCLE"})
	}
	return c.JSON(fiber.Map{"project_id": project.ID, "project_name": project.Name, "duration_days": duration,
		"tasks": planning, "dependencies": dependencies, "generated_at": time.Now().UTC()})
}

type portfolioProject struct {
	ProjectID           uuid.UUID `json:"project_id"`
	ProjectName         string    `json:"project_name"`
	OpenPoints          int       `json:"open_points"`
	ActiveSprintPoints  int       `json:"active_sprint_points"`
	UnassignedPoints    int       `json:"unassigned_points"`
	CompletedSprints    int       `json:"completed_sprints"`
	AverageVelocity     float64   `json:"average_velocity"`
	ForecastSprints     *int      `json:"forecast_sprints"`
	CapacityUtilization *float64  `json:"capacity_utilization_percent"`
	ForecastConfidence  string    `json:"forecast_confidence"`
}

// GetPMPortfolio forecasts only from canonical completed-sprint telemetry. A
// project without at least two completed sprints reports insufficient history
// instead of fabricating a capacity number.
func GetPMPortfolio(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	db := database.GetDB(c)
	var projects []models.Project
	var tasks []models.Task
	var sprints []models.Sprint
	if err := db.Where("workspace_id = ?", workspaceID).Order("created_at").Find(&projects).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load portfolio"})
	}
	db.Where("workspace_id = ?", workspaceID).Find(&tasks)
	db.Where("workspace_id = ?", workspaceID).Find(&sprints)

	completedByProject := map[uuid.UUID][]models.Sprint{}
	activeSprintIDs := map[uuid.UUID]bool{}
	for _, sprint := range sprints {
		switch sprint.Status {
		case "completed":
			completedByProject[sprint.ProjectID] = append(completedByProject[sprint.ProjectID], sprint)
		case "active":
			activeSprintIDs[sprint.ID] = true
		}
	}
	items := make([]portfolioProject, 0, len(projects))
	for _, project := range projects {
		item := portfolioProject{ProjectID: project.ID, ProjectName: project.Name, ForecastConfidence: "insufficient_history"}
		velocityBySprint := map[uuid.UUID]int{}
		completedSprintIDs := map[uuid.UUID]bool{}
		for _, sprint := range completedByProject[project.ID] {
			completedSprintIDs[sprint.ID] = true
		}
		for _, task := range tasks {
			if task.ProjectID != project.ID {
				continue
			}
			points := max(0, task.StoryPoints)
			if task.Status != "done" {
				item.OpenPoints += points
				if task.AssigneeID == nil {
					item.UnassignedPoints += points
				}
			}
			if task.SprintID != nil && activeSprintIDs[*task.SprintID] && task.Status != "done" {
				item.ActiveSprintPoints += points
			}
			if task.SprintID != nil && completedSprintIDs[*task.SprintID] && task.Status == "done" {
				velocityBySprint[*task.SprintID] += points
			}
		}
		item.CompletedSprints = len(completedByProject[project.ID])
		if item.CompletedSprints > 0 {
			total := 0
			for _, sprint := range completedByProject[project.ID] {
				total += velocityBySprint[sprint.ID]
			}
			item.AverageVelocity = math.Round((float64(total)/float64(item.CompletedSprints))*10) / 10
		}
		if item.CompletedSprints >= 2 && item.AverageVelocity > 0 {
			forecast := int(math.Ceil(float64(item.OpenPoints) / item.AverageVelocity))
			utilization := math.Round((float64(item.ActiveSprintPoints)/item.AverageVelocity)*1000) / 10
			item.ForecastSprints = &forecast
			item.CapacityUtilization = &utilization
			if item.CompletedSprints >= 5 {
				item.ForecastConfidence = "high"
			} else {
				item.ForecastConfidence = "medium"
			}
		}
		items = append(items, item)
	}
	return c.JSON(fiber.Map{"projects": items, "generated_at": time.Now().UTC(), "method": "completed_sprint_velocity"})
}

// PlanPMSprint proposes backlog assignments using observed completed-sprint
// velocity. It never mutates tasks; the user must review and accept in the UI.
func PlanPMSprint(c *fiber.Ctx) error {
	var body struct {
		ProjectID string `json:"project_id"`
		SprintID  string `json:"sprint_id"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	projectID, projectErr := uuid.Parse(strings.TrimSpace(body.ProjectID))
	sprintID, sprintErr := uuid.Parse(strings.TrimSpace(body.SprintID))
	if projectErr != nil || sprintErr != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "valid project_id and sprint_id are required"})
	}
	workspaceID := CurrentWorkspaceID(c)
	db := database.GetDB(c)
	var target models.Sprint
	if err := db.Where("id = ? AND workspace_id = ? AND project_id = ? AND status = ?", sprintID, workspaceID, projectID, "planning").First(&target).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "planning sprint not found in project"})
	}
	var completed []models.Sprint
	db.Where("workspace_id = ? AND project_id = ? AND status = ?", workspaceID, projectID, "completed").Order("end_date desc NULLS LAST, created_at desc").Find(&completed)
	if len(completed) < 2 {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error": "two completed sprints are required for evidence-backed planning",
			"code":  "PM_INSUFFICIENT_PLANNING_HISTORY", "completed_sprints": len(completed),
		})
	}
	completedIDs := make([]uuid.UUID, 0, len(completed))
	for _, sprint := range completed {
		completedIDs = append(completedIDs, sprint.ID)
	}
	var historical []models.Task
	db.Where("workspace_id = ? AND project_id = ? AND sprint_id IN ? AND status = ?", workspaceID, projectID, completedIDs, "done").Find(&historical)
	totalVelocity := 0
	for _, task := range historical {
		totalVelocity += max(0, task.StoryPoints)
	}
	capacity := int(math.Round(float64(totalVelocity) / float64(len(completed))))
	if capacity < 1 {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error": "completed sprint history has no estimated delivered points",
			"code":  "PM_INSUFFICIENT_PLANNING_HISTORY", "completed_sprints": len(completed),
		})
	}
	var backlog []models.Task
	db.Where("workspace_id = ? AND project_id = ? AND sprint_id IS NULL AND status <> ?", workspaceID, projectID, "done").
		Order("priority DESC, created_at ASC").Find(&backlog)
	selected := make([]uuid.UUID, 0)
	load := 0
	for _, task := range backlog {
		points := max(1, task.StoryPoints)
		if load+points <= capacity {
			selected = append(selected, task.ID)
			load += points
		}
	}
	return c.JSON(fiber.Map{
		"selected_task_ids": selected, "capacity_points": capacity, "proposed_load_points": load,
		"average_velocity": float64(totalVelocity) / float64(len(completed)), "history_sprints": len(completed),
		"method": "priority_fit_observed_velocity", "requires_human_approval": true,
	})
}
