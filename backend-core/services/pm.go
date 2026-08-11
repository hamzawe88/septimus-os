package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/datatypes"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const PMInboxSystemKey = "pm_inbox"

var canonicalPMStatuses = map[string]struct{}{
	"todo": {}, "in_progress": {}, "review": {}, "blocked": {}, "done": {},
}

var ErrPMProjectNotFound = errors.New("PM project not found in workspace")

type CreatePMTaskInput struct {
	ID          uuid.UUID
	ProjectID   uuid.UUID
	Title       string
	Description string
	ParentID    *uuid.UUID
	Status      string
	Priority    int
	StoryPoints int
	AssigneeID  *uuid.UUID
	StartDate   *time.Time
	DueDate     *time.Time
	Metadata    map[string]interface{}
	Source      string
	CreatedAt   *time.Time
	UpdatedAt   *time.Time
}

// EnsurePMInboxProject returns the single system project used when a trusted
// integration explicitly requests an inbox destination. Normal user writes
// still have to provide a project id.
func EnsurePMInboxProject(db *gorm.DB, workspaceID uuid.UUID, actorID *uuid.UUID) (models.Project, error) {
	if db == nil || workspaceID == uuid.Nil {
		return models.Project{}, ErrPMProjectNotFound
	}
	var existing models.Project
	if err := db.Where("workspace_id = ? AND system_key = ?", workspaceID, PMInboxSystemKey).First(&existing).Error; err == nil {
		return existing, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return models.Project{}, err
	}

	creator := uuid.Nil
	if actorID != nil {
		creator = *actorID
	}
	if creator == uuid.Nil {
		var user models.User
		if err := db.Select("id").Where("workspace_id = ?", workspaceID).
			Order("created_at ASC, id ASC").First(&user).Error; err != nil {
			return models.Project{}, err
		}
		creator = user.ID
	}
	if creator == uuid.Nil {
		return models.Project{}, errors.New("PM Inbox requires at least one workspace member")
	}

	systemKey := PMInboxSystemKey
	settings := datatypes.JSON([]byte(`{"methodology":"kanban","transitions":{"todo":["in_progress"],"in_progress":["review","todo","blocked"],"review":["done","in_progress"],"blocked":["todo","in_progress"],"done":["in_progress"]}}`))
	project := models.Project{
		ID: uuid.New(), WorkspaceID: workspaceID, CreatedBy: creator,
		SystemKey: &systemKey, Name: "PM Inbox", Settings: settings,
	}
	if err := db.Clauses(clause.OnConflict{DoNothing: true}).Create(&project).Error; err != nil {
		return models.Project{}, err
	}
	if err := db.Where("workspace_id = ? AND system_key = ?", workspaceID, PMInboxSystemKey).First(&project).Error; err != nil {
		return models.Project{}, err
	}
	return project, nil
}

// CreatePMTaskInTransaction is the canonical creation primitive shared by HTTP,
// internal AI/meeting tools, and legacy migration. The task aggregate, initial
// history, and outbox event must be committed by the caller's transaction.
func CreatePMTaskInTransaction(tx *gorm.DB, workspaceID uuid.UUID, input CreatePMTaskInput) (models.Task, error) {
	if tx == nil || workspaceID == uuid.Nil {
		return models.Task{}, errors.New("PM task creation requires database and workspace")
	}
	input.Title = strings.TrimSpace(input.Title)
	if input.Title == "" || len([]rune(input.Title)) > 255 {
		return models.Task{}, errors.New("task title must contain 1-255 characters")
	}
	if input.Priority < 0 || input.Priority > 3 {
		return models.Task{}, errors.New("priority must be between 0 and 3")
	}
	if input.StoryPoints < 0 || input.StoryPoints > 100 {
		return models.Task{}, errors.New("story_points must be between 0 and 100")
	}
	if input.StartDate != nil && input.DueDate != nil && input.DueDate.Before(*input.StartDate) {
		return models.Task{}, errors.New("due_date must not be before start_date")
	}
	if input.Status == "" {
		input.Status = "todo"
	}
	if _, ok := canonicalPMStatuses[input.Status]; !ok {
		return models.Task{}, fmt.Errorf("unsupported PM status %q", input.Status)
	}
	var project models.Project
	if err := tx.Where("id = ? AND workspace_id = ?", input.ProjectID, workspaceID).First(&project).Error; err != nil {
		return models.Task{}, ErrPMProjectNotFound
	}

	taskID := input.ID
	if taskID == uuid.Nil {
		taskID = uuid.New()
	}
	path := strings.ReplaceAll(taskID.String(), "-", "_")
	if input.ParentID != nil && *input.ParentID != uuid.Nil {
		var parent models.Task
		if err := tx.Where("id = ? AND workspace_id = ? AND project_id = ?", *input.ParentID, workspaceID, project.ID).
			First(&parent).Error; err != nil {
			return models.Task{}, errors.New("parent task not found in project")
		}
		path = parent.Path + "." + path
	}
	if input.AssigneeID != nil && *input.AssigneeID != uuid.Nil {
		var count int64
		if err := tx.Model(&models.User{}).Where("id = ? AND workspace_id = ?", *input.AssigneeID, workspaceID).Count(&count).Error; err != nil || count == 0 {
			return models.Task{}, errors.New("assignee is not a workspace member")
		}
	}
	metadata := input.Metadata
	if metadata == nil {
		metadata = map[string]interface{}{}
	}
	metadataBytes, err := json.Marshal(metadata)
	if err != nil {
		return models.Task{}, fmt.Errorf("marshal task metadata: %w", err)
	}
	task := models.Task{
		ID: taskID, WorkspaceID: workspaceID, ProjectID: project.ID,
		Title: input.Title, Description: strings.TrimSpace(input.Description),
		ParentID: input.ParentID, Path: path, Status: input.Status,
		Priority: input.Priority, StoryPoints: input.StoryPoints,
		AssigneeID: input.AssigneeID, StartDate: input.StartDate, DueDate: input.DueDate,
		Metadata: datatypes.JSON(metadataBytes), RecordVersion: 1,
	}
	if input.CreatedAt != nil {
		task.CreatedAt = *input.CreatedAt
	}
	if input.UpdatedAt != nil {
		task.UpdatedAt = *input.UpdatedAt
	}
	if err := tx.Create(&task).Error; err != nil {
		return models.Task{}, err
	}
	if err := tx.Create(&models.TaskHistory{
		ID: uuid.New(), TaskID: task.ID, PreviousStatus: "", NewStatus: task.Status,
	}).Error; err != nil {
		return models.Task{}, err
	}
	payload := map[string]interface{}{
		"type": "task_created", "task_id": task.ID.String(), "project_id": task.ProjectID.String(),
		"title": task.Title, "description": task.Description, "story_points": task.StoryPoints,
		"status": task.Status, "priority": task.Priority, "record_version": task.RecordVersion,
		"source": nonEmptyPMSource(input.Source),
	}
	if task.ParentID != nil {
		payload["parent_id"] = task.ParentID.String()
	}
	if err := EnqueueOutbox(tx, workspaceID, "events.tasks.created", "task.created", "task", task.ID, payload); err != nil {
		return models.Task{}, err
	}
	return task, nil
}

func CreatePMTask(db *gorm.DB, workspaceID uuid.UUID, input CreatePMTaskInput) (models.Task, error) {
	var task models.Task
	err := db.Transaction(func(tx *gorm.DB) error {
		created, err := CreatePMTaskInTransaction(tx, workspaceID, input)
		task = created
		return err
	})
	return task, err
}

func nonEmptyPMSource(source string) string {
	if strings.TrimSpace(source) == "" {
		return "http"
	}
	return strings.TrimSpace(source)
}
