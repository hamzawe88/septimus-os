package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrPMTaskNotFound    = errors.New("pm task not found")
	ErrInvalidTransition = errors.New("invalid task transition")
)

const (
	maxProjectNameLength = 100
	maxTaskTitleLength   = 255
	maxSprintNameLength  = 100
	maxStoryPoints       = 100
)

var validTaskStatuses = map[string]struct{}{
	"todo": {}, "in_progress": {}, "review": {}, "blocked": {}, "done": {},
}

func validateProjectName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" || len([]rune(name)) > maxProjectNameLength {
		return "", fmt.Errorf("project name must contain 1-%d characters", maxProjectNameLength)
	}
	return name, nil
}

func validateProjectSettings(raw json.RawMessage) (json.RawMessage, error) {
	if len(raw) == 0 {
		encoded, err := json.Marshal(DefaultConfig)
		return encoded, err
	}
	var config ProjectConfig
	if err := json.Unmarshal(raw, &config); err != nil {
		return nil, fmt.Errorf("settings must be valid JSON: %w", err)
	}
	if len(config.Transitions) == 0 {
		var object map[string]interface{}
		if err := json.Unmarshal(raw, &object); err == nil && len(object) == 0 {
			encoded, marshalErr := json.Marshal(DefaultConfig)
			return encoded, marshalErr
		}
		return nil, errors.New("settings.transitions is required")
	}
	for source, targets := range config.Transitions {
		if _, ok := validTaskStatuses[source]; !ok {
			return nil, fmt.Errorf("unsupported transition source %q", source)
		}
		if len(targets) == 0 {
			return nil, fmt.Errorf("transition source %q has no targets", source)
		}
		for _, target := range targets {
			if _, ok := validTaskStatuses[target]; !ok {
				return nil, fmt.Errorf("unsupported transition target %q", target)
			}
		}
	}
	return raw, nil
}

func validateTaskInput(title string, priority, storyPoints int) (string, error) {
	title = strings.TrimSpace(title)
	if title == "" || len([]rune(title)) > maxTaskTitleLength {
		return "", fmt.Errorf("task title must contain 1-%d characters", maxTaskTitleLength)
	}
	if priority < 0 || priority > 3 {
		return "", errors.New("priority must be between 0 and 3")
	}
	if storyPoints < 0 || storyPoints > maxStoryPoints {
		return "", fmt.Errorf("story_points must be between 0 and %d", maxStoryPoints)
	}
	return title, nil
}

func projectConfig(project *models.Project) ProjectConfig {
	if project == nil || len(project.Settings) == 0 {
		return DefaultConfig
	}
	var config ProjectConfig
	if err := json.Unmarshal(project.Settings, &config); err != nil || len(config.Transitions) == 0 {
		return DefaultConfig
	}
	return config
}

// TransitionTaskForWorkspace is the only write path for relational task status.
// The aggregate, history entry, optimistic version, and durable event commit
// together, whether the caller is HTTP, Workflow, or an internal service.
func TransitionTaskForWorkspace(
	db *gorm.DB,
	workspaceID, taskID uuid.UUID,
	newStatus string,
	actorID *uuid.UUID,
	source string,
) (models.Task, string, error) {
	if db == nil || workspaceID == uuid.Nil || taskID == uuid.Nil {
		return models.Task{}, "", ErrPMTaskNotFound
	}
	newStatus = strings.TrimSpace(newStatus)
	if _, ok := validTaskStatuses[newStatus]; !ok {
		return models.Task{}, "", fmt.Errorf("%w: unsupported status %q", ErrInvalidTransition, newStatus)
	}

	var result models.Task
	var previousStatus string
	err := db.Transaction(func(tx *gorm.DB) error {
		var task models.Task
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Preload("Project").
			Where("id = ? AND workspace_id = ?", taskID, workspaceID).
			First(&task).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrPMTaskNotFound
			}
			return err
		}
		previousStatus = task.Status
		if previousStatus == newStatus {
			result = task
			return nil
		}
		if !CanTransition(previousStatus, newStatus, projectConfig(task.Project)) {
			return fmt.Errorf("%w: %s -> %s", ErrInvalidTransition, previousStatus, newStatus)
		}

		nextVersion := task.RecordVersion + 1
		if nextVersion < 2 {
			nextVersion = 2
		}
		if err := tx.Model(&models.Task{}).
			Where("id = ? AND workspace_id = ?", task.ID, workspaceID).
			Updates(map[string]interface{}{"status": newStatus, "record_version": nextVersion}).Error; err != nil {
			return err
		}
		task.Status = newStatus
		task.RecordVersion = nextVersion
		if err := tx.Create(&models.TaskHistory{
			ID: uuid.New(), TaskID: task.ID, PreviousStatus: previousStatus, NewStatus: newStatus,
		}).Error; err != nil {
			return err
		}
		payload := map[string]interface{}{
			"type": "task_updated", "task_id": task.ID.String(),
			"project_id": task.ProjectID.String(), "previous_status": previousStatus,
			"new_status": newStatus, "record_version": nextVersion, "source": source,
		}
		if actorID != nil && *actorID != uuid.Nil {
			payload["actor_id"] = actorID.String()
		}
		if err := services.EnqueueOutbox(tx, workspaceID, "events.tasks.updated", "task.transitioned", "task", task.ID, payload); err != nil {
			return err
		}
		result = task
		return nil
	})
	return result, previousStatus, err
}
