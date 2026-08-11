package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/gorm"
)

const pmLegacyMigrationVersion = 1

type PMLegacyMigrationReport struct {
	Sources  int64 `json:"sources"`
	Migrated int64 `json:"migrated"`
	Skipped  int64 `json:"skipped"`
}

func MigrateAllLegacyPM(db *gorm.DB) (PMLegacyMigrationReport, error) {
	var total PMLegacyMigrationReport
	var workspaceIDs []uuid.UUID
	if err := db.Model(&models.Workspace{}).Pluck("id", &workspaceIDs).Error; err != nil {
		return total, err
	}
	for _, workspaceID := range workspaceIDs {
		report, err := MigrateLegacyPMWorkspace(db, workspaceID)
		if err != nil {
			return total, fmt.Errorf("migrate legacy PM workspace %s: %w", workspaceID, err)
		}
		total.Sources += report.Sources
		total.Migrated += report.Migrated
		total.Skipped += report.Skipped
	}
	return total, nil
}

// MigrateLegacyPMWorkspace runs roots before children so sub_task rows created
// by the retired endpoint can resolve either a legacy parent link or an already
// relational parent task. Every source is committed independently and remains
// untouched for audit/rollback.
func MigrateLegacyPMWorkspace(db *gorm.DB, workspaceID uuid.UUID) (PMLegacyMigrationReport, error) {
	var report PMLegacyMigrationReport
	if db == nil || workspaceID == uuid.Nil {
		return report, errors.New("PM migration requires database and workspace")
	}
	for _, entityType := range []string{"task", "sub_task"} {
		var sources []models.Entity
		if err := db.Where(
			"workspace_id = ? AND entity_type = ? AND definition_id IS NULL", workspaceID, entityType,
		).Order("created_at ASC, id ASC").Find(&sources).Error; err != nil {
			return report, err
		}
		for _, source := range sources {
			report.Sources++
			skipped, err := migrateLegacyPMSource(db, source)
			if err != nil {
				return report, fmt.Errorf("%s %s: %w", source.EntityType, source.ID, err)
			}
			if skipped {
				report.Skipped++
			} else {
				report.Migrated++
			}
		}
	}
	return report, nil
}

func migrateLegacyPMSource(db *gorm.DB, source models.Entity) (bool, error) {
	var existing int64
	if err := db.Model(&models.PMLegacyRecordLink{}).Where(
		"workspace_id = ? AND legacy_entity_id = ?", source.WorkspaceID, source.ID,
	).Count(&existing).Error; err != nil {
		return false, err
	}
	if existing > 0 {
		return true, nil
	}
	return false, db.Transaction(func(tx *gorm.DB) error {
		// Recheck under the write transaction. The unique ledger constraint is the
		// final guard if multiple replicas migrate the same workspace at startup.
		var link models.PMLegacyRecordLink
		if err := tx.Where("workspace_id = ? AND legacy_entity_id = ?", source.WorkspaceID, source.ID).First(&link).Error; err == nil {
			return nil
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		var data map[string]interface{}
		if err := json.Unmarshal(source.Data, &data); err != nil {
			return fmt.Errorf("decode legacy data: %w", err)
		}

		parentID, parentProjectID := resolveLegacyPMParent(tx, source.WorkspaceID, data)
		projectID := parentProjectID
		if projectID == uuid.Nil {
			projectID = resolveLegacyPMProject(tx, source, data)
		}
		if projectID == uuid.Nil {
			project, err := EnsurePMInboxProject(tx, source.WorkspaceID, source.CreatedBy)
			if err != nil {
				return err
			}
			projectID = project.ID
		}

		metadata := map[string]interface{}{
			"legacy_entity_id": source.ID.String(), "legacy_entity_type": source.EntityType,
			"migration_version": pmLegacyMigrationVersion,
		}
		if source.EntityType == "sub_task" && parentID == nil {
			metadata["legacy_parent_unresolved"] = firstText(data, "parent_task_id", "parent_id")
		}
		assigneeID := validWorkspaceUUID(tx, source.WorkspaceID, firstText(data, "assignee_id", "assignee", "owner_id"))
		createdAt, updatedAt := source.CreatedAt, source.UpdatedAt
		task, err := CreatePMTaskInTransaction(tx, source.WorkspaceID, CreatePMTaskInput{
			ProjectID:   projectID,
			Title:       nonEmpty(firstText(data, "title", "name", "subject"), source.DisplayValue, "Legacy task "+source.ID.String()[:8]),
			Description: firstText(data, "description", "details", "notes"), ParentID: parentID,
			Status: normalizePMStatus(firstText(data, "status", "state")), Priority: normalizePMPriority(data),
			StoryPoints: boundedPMPoints(integerValue(data, "story_points", "points", "estimate")),
			AssigneeID:  assigneeID, StartDate: pmTimeValue(data, "start_date", "starts_at"),
			DueDate: pmTimeValue(data, "due_date", "due_at", "deadline"), Metadata: metadata,
			Source: "legacy_migration", CreatedAt: &createdAt, UpdatedAt: &updatedAt,
		})
		if err != nil {
			return err
		}
		return tx.Create(&models.PMLegacyRecordLink{
			ID: uuid.New(), WorkspaceID: source.WorkspaceID, LegacyEntityID: source.ID,
			LegacyEntityType: source.EntityType, TargetTaskID: task.ID,
			MigrationVersion: pmLegacyMigrationVersion,
		}).Error
	})
}

func resolveLegacyPMProject(tx *gorm.DB, source models.Entity, data map[string]interface{}) uuid.UUID {
	candidates := []uuid.UUID{}
	if source.ProjectID != nil {
		candidates = append(candidates, *source.ProjectID)
	}
	if parsed := parseUUID(firstText(data, "project_id", "project")); parsed != uuid.Nil {
		candidates = append(candidates, parsed)
	}
	for _, candidate := range candidates {
		var count int64
		if tx.Model(&models.Project{}).Where("id = ? AND workspace_id = ?", candidate, source.WorkspaceID).Count(&count).Error == nil && count == 1 {
			return candidate
		}
	}
	return uuid.Nil
}

func resolveLegacyPMParent(tx *gorm.DB, workspaceID uuid.UUID, data map[string]interface{}) (*uuid.UUID, uuid.UUID) {
	sourceParentID := parseUUID(firstText(data, "parent_task_id", "parent_id"))
	if sourceParentID == uuid.Nil {
		return nil, uuid.Nil
	}
	var parent models.Task
	if err := tx.Where("id = ? AND workspace_id = ?", sourceParentID, workspaceID).First(&parent).Error; err == nil {
		return &parent.ID, parent.ProjectID
	}
	var link models.PMLegacyRecordLink
	if err := tx.Where("workspace_id = ? AND legacy_entity_id = ?", workspaceID, sourceParentID).First(&link).Error; err != nil {
		return nil, uuid.Nil
	}
	if err := tx.Where("id = ? AND workspace_id = ?", link.TargetTaskID, workspaceID).First(&parent).Error; err != nil {
		return nil, uuid.Nil
	}
	return &parent.ID, parent.ProjectID
}

func normalizePMStatus(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "in_progress", "in-progress", "in progress", "active", "processing", "started":
		return "in_progress"
	case "review", "in_review", "qa":
		return "review"
	case "blocked", "stuck", "on_hold", "on hold":
		return "blocked"
	case "done", "completed", "complete", "closed", "resolved":
		return "done"
	default:
		return "todo"
	}
}

func normalizePMPriority(data map[string]interface{}) int {
	text := strings.ToLower(firstText(data, "priority"))
	switch text {
	case "urgent", "critical", "highest", "high":
		return 3
	case "medium", "normal":
		return 2
	case "low":
		return 1
	}
	value := integerValue(data, "priority")
	if value > 3 {
		return 3
	}
	return value
}

func boundedPMPoints(value int) int {
	if value > 100 {
		return 100
	}
	return value
}

func validWorkspaceUUID(tx *gorm.DB, workspaceID uuid.UUID, value string) *uuid.UUID {
	parsed := parseUUID(value)
	if parsed == uuid.Nil {
		return nil
	}
	var count int64
	if tx.Model(&models.User{}).Where("id = ? AND workspace_id = ?", parsed, workspaceID).Count(&count).Error != nil || count != 1 {
		return nil
	}
	return &parsed
}

func pmTimeValue(data map[string]interface{}, keys ...string) *time.Time {
	value := firstText(data, keys...)
	if value == "" {
		return nil
	}
	parsed, ok := parseFlexibleTime(value)
	if !ok {
		return nil
	}
	return &parsed
}
