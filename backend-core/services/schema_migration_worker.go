package services

import (
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/datatypes"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	gormLogger "gorm.io/gorm/logger"
)

const schemaMigrationBatchSize = 100

// StartSchemaMigrationWorker claims only pending jobs. A crashed running job is
// intentionally not stolen: an authorized operator can inspect and resume it,
// while record schema_version makes every retry idempotent.
func StartSchemaMigrationWorker(db *gorm.DB) {
	if db == nil {
		return
	}
	workerDB := db.Session(&gorm.Session{Logger: db.Logger.LogMode(gormLogger.Warn)})
	go func() {
		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			job, claimed, err := claimSchemaMigrationJob(workerDB)
			if err != nil {
				log.Printf("schema migration claim: %v", err)
				continue
			}
			if !claimed {
				continue
			}
			if err := runClaimedSchemaMigration(workerDB, job.ID); err != nil {
				log.Printf("schema migration %s: %v", job.ID, err)
				_ = markSchemaMigrationFailed(workerDB, job.ID, err)
			}
		}
	}()
}

func claimSchemaMigrationJob(db *gorm.DB) (models.EntitySchemaChangeJob, bool, error) {
	var job models.EntitySchemaChangeJob
	err := db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE", Options: "SKIP LOCKED"}).
			Where("job_type = ? AND status = ? AND target_version > 0",
				"migration", models.SchemaChangeJobStatusPending).
			Order("created_at ASC").Limit(1).First(&job).Error; err != nil {
			return err
		}
		now := time.Now().UTC()
		updates := map[string]interface{}{
			"status":     models.SchemaChangeJobStatusRunning,
			"last_error": "",
		}
		if job.StartedAt == nil {
			updates["started_at"] = now
		}
		result := tx.Model(&models.EntitySchemaChangeJob{}).Where(
			"id = ? AND status = ?", job.ID, models.SchemaChangeJobStatusPending,
		).Updates(updates)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return gorm.ErrRecordNotFound
		}
		var definition models.EntityDefinition
		if err := tx.Where("id = ? AND workspace_id = ?", job.DefinitionID, job.WorkspaceID).First(&definition).Error; err != nil {
			return err
		}
		if err := writeSchemaMigrationAudit(tx, definition, job, "schema_definition.migration.start", map[string]interface{}{
			"target_version": job.TargetVersion,
		}); err != nil {
			return err
		}
		return EnqueueOutbox(tx, job.WorkspaceID, "events.data.schema.migration.started",
			"data.schema.migration.started", "schema", definition.ID, map[string]interface{}{
				"definition_id": definition.ID.String(), "definition_key": definition.Key,
				"migration_job_id": job.ID.String(), "schema_version": job.TargetVersion,
			})
	})
	if err == gorm.ErrRecordNotFound {
		return job, false, nil
	}
	return job, err == nil, err
}

func runClaimedSchemaMigration(db *gorm.DB, jobID uuid.UUID) error {
	for {
		done, err := processSchemaMigrationBatch(db, jobID)
		if err != nil || done {
			return err
		}
	}
}

func processSchemaMigrationBatch(db *gorm.DB, jobID uuid.UUID) (bool, error) {
	done := false
	err := db.Transaction(func(tx *gorm.DB) error {
		var job models.EntitySchemaChangeJob
		if err := tx.Where("id = ?", jobID).First(&job).Error; err != nil {
			return err
		}
		if job.Status == models.SchemaChangeJobStatusPaused {
			done = true
			return nil
		}
		if job.Status != models.SchemaChangeJobStatusRunning {
			return fmt.Errorf("migration job is no longer running")
		}
		var definition models.EntityDefinition
		if err := tx.Where(
			"id = ? AND workspace_id = ?", job.DefinitionID, job.WorkspaceID,
		).First(&definition).Error; err != nil {
			return err
		}
		var version models.EntitySchemaVersion
		if err := tx.Where(
			"workspace_id = ? AND definition_id = ? AND version = ? AND checksum = ?",
			job.WorkspaceID, job.DefinitionID, job.TargetVersion, job.TargetChecksum,
		).First(&version).Error; err != nil {
			return fmt.Errorf("target schema version is unavailable: %w", err)
		}
		var plan []SchemaMigrationOperation
		if err := json.Unmarshal(job.Plan, &plan); err != nil {
			return fmt.Errorf("decode migration plan: %w", err)
		}
		fields := parseFields(version.UISchema)
		var records []models.Entity
		if err := tx.Where(
			"workspace_id = ? AND definition_id = ? AND schema_version < ? AND deleted_at IS NULL",
			job.WorkspaceID, job.DefinitionID, job.TargetVersion,
		).Order("id ASC").Limit(schemaMigrationBatchSize).Find(&records).Error; err != nil {
			return err
		}
		if len(records) == 0 {
			now := time.Now().UTC()
			if err := tx.Model(&models.EntitySchemaChangeJob{}).Where(
				"id = ? AND status = ?", job.ID, models.SchemaChangeJobStatusRunning,
			).Updates(map[string]interface{}{
				"status":       models.SchemaChangeJobStatusCompleted,
				"completed_at": now, "last_error": "",
			}).Error; err != nil {
				return err
			}
			if err := writeSchemaMigrationAudit(tx, definition, job, "schema_definition.migration.complete", map[string]interface{}{
				"target_version": job.TargetVersion, "processed": job.ProgressProcessed,
			}); err != nil {
				return err
			}
			if err := EnqueueOutbox(tx, job.WorkspaceID, "events.data.schema.migration.completed",
				"data.schema.migration.completed", "schema", definition.ID, map[string]interface{}{
					"definition_id": definition.ID.String(), "definition_key": definition.Key,
					"migration_job_id": job.ID.String(), "schema_version": job.TargetVersion,
				}); err != nil {
				return err
			}
			done = true
			return nil
		}
		principal := PrincipalForSystem("schema_migration")
		processed := 0
		for _, record := range records {
			var before map[string]interface{}
			if err := json.Unmarshal(record.Data, &before); err != nil {
				return fmt.Errorf("record %s contains invalid JSON: %w", record.ID, err)
			}
			after := cloneRecordData(before)
			if err := applySchemaMigrationPlan(plan, after); err != nil {
				return fmt.Errorf("record %s migration failed: %w", record.ID, err)
			}
			ApplyFieldDefaults(fields, after)
			removeComputedInput(fields, after)
			if err := ApplyFormulaFields(fields, after); err != nil {
				return fmt.Errorf("record %s formula migration failed: %w", record.ID, err)
			}
			if err := ValidateRecordAgainstSchema(version.JSONSchema, after); err != nil {
				return fmt.Errorf("record %s does not satisfy target schema: %w", record.ID, err)
			}
			if err := ValidateRecordReferences(tx, job.WorkspaceID, fields, after); err != nil {
				return fmt.Errorf("record %s references are invalid: %w", record.ID, err)
			}
			raw, err := json.Marshal(after)
			if err != nil {
				return err
			}
			result := tx.Model(&models.Entity{}).Where(
				"id = ? AND workspace_id = ? AND definition_id = ? AND schema_version < ?",
				record.ID, job.WorkspaceID, job.DefinitionID, job.TargetVersion,
			).Updates(map[string]interface{}{
				"data": datatypes.JSON(raw), "schema_version": job.TargetVersion,
				"record_version": gorm.Expr("record_version + 1"),
				"display_value":  DefinitionDisplayValue(definition, after),
				"updated_at":     time.Now().UTC(),
			})
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected == 0 {
				continue
			}
			processed++
			record.Data = datatypes.JSON(raw)
			record.SchemaVersion = job.TargetVersion
			record.RecordVersion++
			record.DisplayValue = DefinitionDisplayValue(definition, after)
			if err := replaceRecordRelations(tx, definition, record, fields, after); err != nil {
				return err
			}
			if err := WriteRecordAudit(tx, "data.record.migrate", definition, record, principal, fields, before, after); err != nil {
				return err
			}
			if err := enqueueRecordEvent(tx, "migrated", definition, record, fields, before, after); err != nil {
				return err
			}
		}
		lastID := records[len(records)-1].ID.String()
		return tx.Model(&models.EntitySchemaChangeJob{}).Where(
			"id = ? AND status = ?", job.ID, models.SchemaChangeJobStatusRunning,
		).Updates(map[string]interface{}{
			"progress_processed": gorm.Expr("progress_processed + ?", processed),
			"cursor":             lastID,
		}).Error
	})
	return done, err
}

func applySchemaMigrationPlan(plan []SchemaMigrationOperation, data map[string]interface{}) error {
	for _, operation := range plan {
		switch operation.Operation {
		case "set_default":
			if value, exists := data[operation.FieldKey]; !exists || value == nil {
				data[operation.FieldKey] = operation.Value
			}
		case "remove_field":
			delete(data, operation.FieldKey)
		case "convert_type":
			value, exists := data[operation.FieldKey]
			if !exists || value == nil {
				continue
			}
			text := strings.TrimSpace(fmt.Sprint(value))
			switch operation.ToType {
			case "text":
				data[operation.FieldKey] = text
			case "integer":
				parsed, err := strconv.ParseInt(text, 10, 64)
				if err != nil {
					return err
				}
				data[operation.FieldKey] = parsed
			case "number":
				parsed, err := strconv.ParseFloat(text, 64)
				if err != nil {
					return err
				}
				data[operation.FieldKey] = parsed
			default:
				return fmt.Errorf("unsupported target type %s", operation.ToType)
			}
		case "relation_one_to_many":
			if value, exists := data[operation.FieldKey]; exists && value != nil {
				if _, alreadyArray := value.([]interface{}); !alreadyArray {
					data[operation.FieldKey] = []interface{}{value}
				}
			}
		case "recalculate_formula":
			// ApplyFormulaFields recalculates the complete dependency graph.
		default:
			return fmt.Errorf("unsupported migration operation %s", operation.Operation)
		}
	}
	return nil
}

func writeSchemaMigrationAudit(tx *gorm.DB, definition models.EntityDefinition, job models.EntitySchemaChangeJob, action string, details map[string]interface{}) error {
	details["definition_key"] = definition.Key
	details["migration_job_id"] = job.ID.String()
	raw, err := json.Marshal(details)
	if err != nil {
		return err
	}
	workspaceID := definition.WorkspaceID
	return tx.Create(&models.AuditLog{
		ID: uuid.New(), WorkspaceID: &workspaceID, UserID: job.ApprovedBy,
		Action: action, EntityType: "EntityDefinition", EntityID: definition.ID.String(),
		Details: datatypes.JSON(raw),
	}).Error
}

func safeMigrationError(err error) string {
	value := err.Error()
	if len(value) > 1000 {
		return value[:1000]
	}
	return value
}

func markSchemaMigrationFailed(db *gorm.DB, jobID uuid.UUID, migrationErr error) error {
	return db.Transaction(func(tx *gorm.DB) error {
		var job models.EntitySchemaChangeJob
		if err := tx.Where("id = ?", jobID).First(&job).Error; err != nil {
			return err
		}
		if job.Status != models.SchemaChangeJobStatusRunning {
			return nil
		}
		if err := tx.Model(&models.EntitySchemaChangeJob{}).Where(
			"id = ? AND status = ?", job.ID, models.SchemaChangeJobStatusRunning,
		).Updates(map[string]interface{}{
			"status": models.SchemaChangeJobStatusFailed, "progress_failed": gorm.Expr("progress_failed + 1"),
			"last_error": safeMigrationError(migrationErr),
		}).Error; err != nil {
			return err
		}
		var definition models.EntityDefinition
		if err := tx.Where("id = ? AND workspace_id = ?", job.DefinitionID, job.WorkspaceID).First(&definition).Error; err != nil {
			return err
		}
		if err := writeSchemaMigrationAudit(tx, definition, job, "schema_definition.migration.fail", map[string]interface{}{
			"target_version": job.TargetVersion, "error": safeMigrationError(migrationErr),
		}); err != nil {
			return err
		}
		return EnqueueOutbox(tx, job.WorkspaceID, "events.data.schema.migration.failed",
			"data.schema.migration.failed", "schema", definition.ID, map[string]interface{}{
				"definition_id": definition.ID.String(), "definition_key": definition.Key,
				"migration_job_id": job.ID.String(), "schema_version": job.TargetVersion,
			})
	})
}
