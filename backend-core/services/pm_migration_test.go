package services

import (
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupPMMigrationTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	statements := []string{
		`CREATE TABLE users (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, created_at DATETIME)`,
		`CREATE TABLE projects (
			id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, created_by TEXT NOT NULL,
			system_key TEXT, name TEXT NOT NULL, settings TEXT, drive_folder_link TEXT,
			created_at DATETIME, updated_at DATETIME
		)`,
		`CREATE UNIQUE INDEX idx_projects_test_system ON projects(workspace_id, system_key) WHERE system_key IS NOT NULL`,
		`CREATE TABLE entities (
			id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT, definition_id TEXT,
			schema_version INTEGER, record_version INTEGER, display_value TEXT, created_by TEXT,
			updated_by TEXT, entity_type TEXT NOT NULL, data TEXT NOT NULL,
			created_at DATETIME, updated_at DATETIME, deleted_at DATETIME
		)`,
		`CREATE TABLE tasks (
			id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
			title TEXT NOT NULL, description TEXT, parent_id TEXT, path TEXT, status TEXT,
			priority INTEGER, assignee_id TEXT, sprint_id TEXT, epic_id TEXT,
			story_points INTEGER, metadata TEXT, start_date DATETIME, due_date DATETIME,
			record_version INTEGER, created_at DATETIME, updated_at DATETIME
		)`,
		`CREATE TABLE task_histories (
			id TEXT PRIMARY KEY, task_id TEXT NOT NULL, previous_status TEXT,
			new_status TEXT NOT NULL, changed_at DATETIME
		)`,
		`CREATE TABLE outbox_events (
			id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, subject TEXT, event_type TEXT,
			aggregate_type TEXT, aggregate_id TEXT, payload TEXT, status TEXT,
			attempts INTEGER, available_at DATETIME, published_at DATETIME,
			last_error TEXT, created_at DATETIME, updated_at DATETIME
		)`,
		`CREATE TABLE pm_legacy_record_links (
			id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, legacy_entity_id TEXT NOT NULL,
			legacy_entity_type TEXT NOT NULL, target_task_id TEXT NOT NULL,
			migration_version INTEGER, created_at DATETIME,
			UNIQUE(workspace_id, legacy_entity_id)
		)`,
	}
	for _, statement := range statements {
		if err := db.Exec(statement).Error; err != nil {
			t.Fatalf("schema: %v", err)
		}
	}
	return db
}

func TestMigrateLegacyPMIsTenantScopedIdempotentAndPreservesHierarchy(t *testing.T) {
	db := setupPMMigrationTestDB(t)
	workspaceA, workspaceB := uuid.New(), uuid.New()
	userA, userB := uuid.New(), uuid.New()
	now := time.Now().UTC().Add(-time.Hour)
	for _, row := range []struct{ ID, Workspace uuid.UUID }{{userA, workspaceA}, {userB, workspaceB}} {
		if err := db.Exec(`INSERT INTO users (id, workspace_id, created_at) VALUES (?, ?, ?)`, row.ID, row.Workspace, now).Error; err != nil {
			t.Fatal(err)
		}
	}
	projectID, parentID := uuid.New(), uuid.New()
	if err := db.Exec(`INSERT INTO projects (id, workspace_id, created_by, name, settings, created_at, updated_at)
		VALUES (?, ?, ?, 'Delivery', '{}', ?, ?)`, projectID, workspaceA, userA, now, now).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO tasks (id, workspace_id, project_id, title, path, status, priority, story_points, metadata, record_version, created_at, updated_at)
		VALUES (?, ?, ?, 'Parent', ?, 'todo', 1, 0, '{}', 1, ?, ?)`, parentID, workspaceA, projectID, nonEmptyPMPath(parentID), now, now).Error; err != nil {
		t.Fatal(err)
	}
	legacyRoot, legacyChild, otherTenant := uuid.New(), uuid.New(), uuid.New()
	sources := []struct {
		ID, Workspace uuid.UUID
		Type, Data    string
	}{
		{legacyRoot, workspaceA, "task", `{"title":"Imported root","status":"completed","priority":"high","points":8}`},
		{legacyChild, workspaceA, "sub_task", fmt.Sprintf(`{"title":"Imported child","parent_task_id":"%s","status":"pending"}`, parentID)},
		{otherTenant, workspaceB, "task", `{"title":"Other tenant"}`},
	}
	for _, source := range sources {
		if err := db.Exec(`INSERT INTO entities (id, workspace_id, entity_type, data, schema_version, record_version, display_value, created_at, updated_at)
			VALUES (?, ?, ?, ?, 0, 1, '', ?, ?)`, source.ID, source.Workspace, source.Type, source.Data, now, now).Error; err != nil {
			t.Fatal(err)
		}
	}

	first, err := MigrateLegacyPMWorkspace(db, workspaceA)
	if err != nil {
		t.Fatal(err)
	}
	if first.Sources != 2 || first.Migrated != 2 || first.Skipped != 0 {
		t.Fatalf("unexpected first report: %+v", first)
	}
	var links, sourceRows, workspaceBTasks, inboxes int64
	db.Model(&models.PMLegacyRecordLink{}).Where("workspace_id = ?", workspaceA).Count(&links)
	db.Model(&models.Entity{}).Where("workspace_id = ? AND entity_type IN ?", workspaceA, []string{"task", "sub_task"}).Count(&sourceRows)
	db.Model(&models.Task{}).Where("workspace_id = ?", workspaceB).Count(&workspaceBTasks)
	db.Model(&models.Project{}).Where("workspace_id = ? AND system_key = ?", workspaceA, PMInboxSystemKey).Count(&inboxes)
	if links != 2 || sourceRows != 2 || workspaceBTasks != 0 || inboxes != 1 {
		t.Fatalf("tenant/source invariants failed links=%d sources=%d other_tasks=%d inboxes=%d", links, sourceRows, workspaceBTasks, inboxes)
	}
	var childLink models.PMLegacyRecordLink
	if err := db.Where("workspace_id = ? AND legacy_entity_id = ?", workspaceA, legacyChild).First(&childLink).Error; err != nil {
		t.Fatal(err)
	}
	var child models.Task
	if err := db.Where("id = ? AND workspace_id = ?", childLink.TargetTaskID, workspaceA).First(&child).Error; err != nil {
		t.Fatal(err)
	}
	if child.ParentID == nil || *child.ParentID != parentID || child.ProjectID != projectID {
		t.Fatalf("hierarchy not preserved: %+v", child)
	}
	var rootLink models.PMLegacyRecordLink
	db.Where("workspace_id = ? AND legacy_entity_id = ?", workspaceA, legacyRoot).First(&rootLink)
	var root models.Task
	db.First(&root, "id = ?", rootLink.TargetTaskID)
	if root.Status != "done" || root.Priority != 3 || root.StoryPoints != 8 {
		t.Fatalf("root mapping incorrect: %+v", root)
	}

	second, err := MigrateLegacyPMWorkspace(db, workspaceA)
	if err != nil {
		t.Fatal(err)
	}
	if second.Sources != 2 || second.Migrated != 0 || second.Skipped != 2 {
		t.Fatalf("migration is not idempotent: %+v", second)
	}
	var tasksAfter, outboxAfter int64
	db.Model(&models.Task{}).Where("workspace_id = ?", workspaceA).Count(&tasksAfter)
	db.Model(&models.OutboxEvent{}).Where("workspace_id = ?", workspaceA).Count(&outboxAfter)
	if tasksAfter != 3 || outboxAfter != 2 {
		t.Fatalf("retry duplicated writes tasks=%d outbox=%d", tasksAfter, outboxAfter)
	}
}

func nonEmptyPMPath(id uuid.UUID) string {
	value := id.String()
	result := make([]byte, len(value))
	for index := range value {
		if value[index] == '-' {
			result[index] = '_'
		} else {
			result[index] = value[index]
		}
	}
	return string(result)
}
