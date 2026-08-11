package handlers

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupPMTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	statements := []string{
		`CREATE TABLE projects (
			id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, created_by TEXT NOT NULL,
			name TEXT NOT NULL, system_key TEXT, settings TEXT, drive_folder_link TEXT,
			created_at DATETIME, updated_at DATETIME
		)`,
		`CREATE TABLE sprints (
			id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
			name TEXT NOT NULL, goal TEXT, status TEXT, start_date DATETIME, end_date DATETIME,
			calendar_event_link TEXT, record_version INTEGER NOT NULL DEFAULT 1,
			created_at DATETIME, updated_at DATETIME
		)`,
		`CREATE TABLE tasks (
			id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
			title TEXT NOT NULL, description TEXT, parent_id TEXT, path TEXT, status TEXT,
			priority INTEGER, assignee_id TEXT, sprint_id TEXT, epic_id TEXT,
			story_points INTEGER, metadata TEXT, start_date DATETIME, due_date DATETIME,
			record_version INTEGER NOT NULL DEFAULT 1, created_at DATETIME, updated_at DATETIME
		)`,
		`CREATE TABLE task_histories (
			id TEXT PRIMARY KEY, task_id TEXT NOT NULL, previous_status TEXT,
			new_status TEXT NOT NULL, changed_at DATETIME
		)`,
		`CREATE TABLE task_dependencies (
			id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
			predecessor_id TEXT NOT NULL, successor_id TEXT NOT NULL, lag_days INTEGER NOT NULL DEFAULT 0,
			created_at DATETIME, UNIQUE(predecessor_id, successor_id)
		)`,
		`CREATE TABLE outbox_events (
			id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, subject TEXT NOT NULL,
			event_type TEXT NOT NULL, aggregate_type TEXT NOT NULL, aggregate_id TEXT NOT NULL,
			payload TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
			available_at DATETIME NOT NULL, published_at DATETIME, last_error TEXT,
			created_at DATETIME, updated_at DATETIME
		)`,
	}
	for _, statement := range statements {
		if err := db.Exec(statement).Error; err != nil {
			t.Fatal(err)
		}
	}
	return db
}

func seedPMTask(t *testing.T, db *gorm.DB, status string) (uuid.UUID, models.Task) {
	t.Helper()
	workspaceID := uuid.New()
	project := models.Project{
		ID: uuid.New(), WorkspaceID: workspaceID, CreatedBy: uuid.New(),
		Name: "Canonical PM", Settings: mustJSON(t, DefaultConfig),
	}
	if err := db.Create(&project).Error; err != nil {
		t.Fatal(err)
	}
	task := models.Task{
		ID: uuid.New(), WorkspaceID: workspaceID, ProjectID: project.ID,
		Title: "Atomic transition", Status: status, Path: "atomic", RecordVersion: 1,
	}
	if err := db.Create(&task).Error; err != nil {
		t.Fatal(err)
	}
	return workspaceID, task
}

func mustJSON(t *testing.T, value interface{}) []byte {
	t.Helper()
	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func TestTransitionTaskForWorkspaceCommitsAggregateHistoryAndOutbox(t *testing.T) {
	db := setupPMTestDB(t)
	workspaceID, task := seedPMTask(t, db, "todo")
	actorID := uuid.New()

	updated, previous, err := TransitionTaskForWorkspace(db, workspaceID, task.ID, "in_progress", &actorID, "test")
	if err != nil {
		t.Fatal(err)
	}
	if previous != "todo" || updated.Status != "in_progress" || updated.RecordVersion != 2 {
		t.Fatalf("unexpected transition result previous=%s status=%s version=%d", previous, updated.Status, updated.RecordVersion)
	}
	var histories, outbox int64
	db.Model(&models.TaskHistory{}).Where("task_id = ?", task.ID).Count(&histories)
	db.Model(&models.OutboxEvent{}).Where("aggregate_id = ?", task.ID).Count(&outbox)
	if histories != 1 || outbox != 1 {
		t.Fatalf("transition must commit one history and outbox row; history=%d outbox=%d", histories, outbox)
	}
}

func TestTransitionTaskForWorkspaceRejectsInvalidJumpWithoutWrites(t *testing.T) {
	db := setupPMTestDB(t)
	workspaceID, task := seedPMTask(t, db, "todo")

	_, _, err := TransitionTaskForWorkspace(db, workspaceID, task.ID, "done", nil, "test")
	if !errors.Is(err, ErrInvalidTransition) {
		t.Fatalf("expected invalid transition error, got %v", err)
	}
	var persisted models.Task
	if err := db.First(&persisted, "id = ?", task.ID).Error; err != nil {
		t.Fatal(err)
	}
	var histories, outbox int64
	db.Model(&models.TaskHistory{}).Where("task_id = ?", task.ID).Count(&histories)
	db.Model(&models.OutboxEvent{}).Where("aggregate_id = ?", task.ID).Count(&outbox)
	if persisted.Status != "todo" || histories != 0 || outbox != 0 {
		t.Fatalf("invalid transition wrote data status=%s history=%d outbox=%d", persisted.Status, histories, outbox)
	}
}

func TestPMContractRejectsDirectStatusAndUnsafePagination(t *testing.T) {
	app := fiber.New()
	app.Put("/tasks/:id", UpdateTask)
	app.Get("/tasks", GetTasks)

	statusBody := bytes.NewBufferString(`{"status":"done"}`)
	statusRequest := httptest.NewRequest(http.MethodPut, "/tasks/"+uuid.NewString(), statusBody)
	statusRequest.Header.Set("Content-Type", "application/json")
	statusResponse, err := app.Test(statusRequest)
	if err != nil {
		t.Fatal(err)
	}
	if statusResponse.StatusCode != http.StatusBadRequest {
		t.Fatalf("direct status update returned %d", statusResponse.StatusCode)
	}

	paginationResponse, err := app.Test(httptest.NewRequest(http.MethodGet, "/tasks?limit=0", nil))
	if err != nil {
		t.Fatal(err)
	}
	if paginationResponse.StatusCode != http.StatusBadRequest {
		t.Fatalf("unsafe pagination returned %d", paginationResponse.StatusCode)
	}
}

func TestStartSprintAllowsOnlyOneActiveSprintPerProject(t *testing.T) {
	db := setupPMTestDB(t)
	oldDB := database.DB
	database.DB = db
	t.Cleanup(func() { database.DB = oldDB })
	workspaceID := uuid.New()
	project := models.Project{ID: uuid.New(), WorkspaceID: workspaceID, CreatedBy: uuid.New(), Name: "Sprint Guard", Settings: mustJSON(t, DefaultConfig)}
	if err := db.Create(&project).Error; err != nil {
		t.Fatal(err)
	}
	active := models.Sprint{ID: uuid.New(), WorkspaceID: workspaceID, ProjectID: project.ID, Name: "Active", Status: "active", RecordVersion: 1}
	planning := models.Sprint{ID: uuid.New(), WorkspaceID: workspaceID, ProjectID: project.ID, Name: "Planning", Status: "planning", RecordVersion: 1}
	if err := db.Create(&active).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&planning).Error; err != nil {
		t.Fatal(err)
	}

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("workspace", &models.Workspace{ID: workspaceID})
		return c.Next()
	})
	app.Put("/sprints/:id/start", StartSprint)
	response, err := app.Test(httptest.NewRequest(http.MethodPut, "/sprints/"+planning.ID.String()+"/start", nil))
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("second active sprint returned %d", response.StatusCode)
	}
}

func TestLegacyTaskEntityWritesFailClosed(t *testing.T) {
	db := setupPMTestDB(t)
	_, err := createEntityRecordWithDB(db, uuid.New(), nil, nil, "task", map[string]interface{}{"title": "legacy"})
	if err == nil || !strings.Contains(err.Error(), "PM_CANONICAL_TASK_REQUIRED") {
		t.Fatalf("legacy task write was not rejected: %v", err)
	}
}

func TestCalculateCriticalPathAndRejectCycle(t *testing.T) {
	projectID := uuid.New()
	workspaceID := uuid.New()
	taskA := models.Task{ID: uuid.New(), WorkspaceID: workspaceID, ProjectID: projectID, Title: "A", StoryPoints: 2}
	taskB := models.Task{ID: uuid.New(), WorkspaceID: workspaceID, ProjectID: projectID, Title: "B", StoryPoints: 3}
	taskC := models.Task{ID: uuid.New(), WorkspaceID: workspaceID, ProjectID: projectID, Title: "C", StoryPoints: 1}
	edges := []models.TaskDependency{
		{PredecessorID: taskA.ID, SuccessorID: taskB.ID, LagDays: 1},
		{PredecessorID: taskA.ID, SuccessorID: taskC.ID},
	}

	planning, duration, err := calculateCriticalPath([]models.Task{taskA, taskB, taskC}, edges)
	if err != nil {
		t.Fatal(err)
	}
	if duration != 6 {
		t.Fatalf("duration=%d, want 6", duration)
	}
	byID := map[uuid.UUID]planningTask{}
	for _, item := range planning {
		byID[item.ID] = item
	}
	if !byID[taskA.ID].Critical || !byID[taskB.ID].Critical || byID[taskC.ID].Critical {
		t.Fatalf("unexpected critical path: %#v", byID)
	}
	if byID[taskC.ID].SlackDays != 3 {
		t.Fatalf("parallel task slack=%d, want 3", byID[taskC.ID].SlackDays)
	}

	cycle := append(edges, models.TaskDependency{PredecessorID: taskB.ID, SuccessorID: taskA.ID})
	if _, _, err := calculateCriticalPath([]models.Task{taskA, taskB, taskC}, cycle); !errors.Is(err, errPMDependencyCycle) {
		t.Fatalf("cycle error=%v, want errPMDependencyCycle", err)
	}
}
