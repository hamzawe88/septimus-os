package handlers

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type schemaImpactRequest struct {
	ExpectedRevision int `json:"expected_revision"`
}

func AnalyzeSchemaDefinitionImpact(c *fiber.Ctx) error {
	definition, err := findSchemaDefinition(c)
	if err != nil {
		return err
	}
	var req schemaImpactRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	if req.ExpectedRevision != definition.DraftRevision {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error": "the schema draft revision is stale", "code": "SCHEMA_REVISION_CONFLICT",
			"current_revision": definition.DraftRevision,
		})
	}
	fields := parseSchemaFields(definition.DraftUISchema)
	compiled, compileErr := services.CompileSchemaDraft(definition.LabelAr, definition.LabelEn, fields)
	if compileErr != nil {
		return schemaValidationResponse(c, compileErr)
	}
	if err := validateTitleFieldKey(definition.TitleFieldKey, compiled.Fields); err != nil {
		return schemaValidationResponse(c, &services.SchemaValidationError{Issues: []string{err.Error()}})
	}
	if err := services.ValidateRelationTargets(database.GetDB(c), definition.WorkspaceID, compiled.Fields); err != nil {
		return schemaValidationResponse(c, &services.SchemaValidationError{Issues: []string{err.Error()}})
	}
	report, err := services.AnalyzeSchemaImpact(database.GetDB(c), definition, compiled)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to analyze schema impact"})
	}
	reportJSON, err := services.MarshalSchemaImpact(report)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to encode schema impact"})
	}
	planJSON, err := services.MarshalMigrationPlan(report.Plan)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to encode migration plan"})
	}
	idempotencyKey := schemaJobIdempotencyKey(
		"impact", definition.WorkspaceID.String(), definition.ID.String(),
		fmt.Sprint(definition.DraftRevision), report.TargetChecksum,
	)
	var job models.EntitySchemaChangeJob
	db := database.GetDB(c)
	if err := db.Where("idempotency_key = ?", idempotencyKey).First(&job).Error; err == nil {
		return c.JSON(fiber.Map{"job": job, "report": report})
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load schema impact"})
	}

	now := time.Now().UTC()
	job = models.EntitySchemaChangeJob{
		ID: uuid.New(), WorkspaceID: definition.WorkspaceID, DefinitionID: definition.ID,
		SourceVersion: definition.CurrentVersion, DraftRevision: definition.DraftRevision,
		TargetChecksum: report.TargetChecksum, JobType: "impact",
		Status: models.SchemaChangeJobStatusCompleted, Severity: report.Severity,
		IdempotencyKey: idempotencyKey, Report: reportJSON, Plan: planJSON,
		ProgressTotal: report.RecordCount, ProgressProcessed: report.RecordCount,
		RequestedBy: currentUserUUID(c), StartedAt: &now, CompletedAt: &now,
	}
	if err := db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&job).Error; err != nil {
			return err
		}
		if err := writeSchemaAudit(tx, definition, currentUserUUID(c), "schema_definition.impact", c.IP(), map[string]interface{}{
			"job_id": job.ID, "severity": report.Severity, "can_approve": report.CanApprove,
			"draft_revision": definition.DraftRevision, "target_checksum": report.TargetChecksum,
		}); err != nil {
			return err
		}
		return services.EnqueueOutbox(tx, definition.WorkspaceID, "events.data.schema.impact.completed",
			"data.schema.impact.completed", "schema", definition.ID, map[string]interface{}{
				"definition_id": definition.ID.String(), "definition_key": definition.Key,
				"impact_job_id": job.ID.String(), "severity": report.Severity,
				"can_approve": report.CanApprove, "target_checksum": report.TargetChecksum,
			})
	}); err != nil {
		if errors.Is(err, gorm.ErrDuplicatedKey) {
			if findErr := db.Where("idempotency_key = ?", idempotencyKey).First(&job).Error; findErr == nil {
				return c.JSON(fiber.Map{"job": job, "report": report})
			}
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to save schema impact"})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"job": job, "report": report})
}

func ApproveSchemaChangeJob(c *fiber.Ctx) error {
	definition, job, err := findSchemaChangeJob(c)
	if err != nil {
		return err
	}
	if job.JobType != "impact" || job.Status != models.SchemaChangeJobStatusCompleted {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "only completed impact reviews can be approved", "code": "IMPACT_NOT_READY"})
	}
	var report services.SchemaImpactReport
	if err := json.Unmarshal(job.Report, &report); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "stored impact report is invalid"})
	}
	if !report.CanApprove {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
			"error": "blocking schema changes must be corrected before approval",
			"code":  "SCHEMA_CHANGE_BLOCKED", "blocking_reasons": report.BlockingReasons,
		})
	}
	if job.ApprovedAt != nil {
		var existingMigration *models.EntitySchemaChangeJob
		if len(report.Plan) > 0 {
			key := schemaJobIdempotencyKey("migration", job.ID.String(), report.TargetChecksum)
			var existing models.EntitySchemaChangeJob
			if err := database.GetDB(c).Where("idempotency_key = ?", key).First(&existing).Error; err == nil {
				existingMigration = &existing
			}
		}
		return c.JSON(fiber.Map{"job": job, "migration_job": existingMigration})
	}
	actor := currentUserUUID(c)
	now := time.Now().UTC()
	var migration *models.EntitySchemaChangeJob
	err = database.GetDB(c).Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&models.EntitySchemaChangeJob{}).
			Where("id = ? AND workspace_id = ? AND definition_id = ? AND approved_at IS NULL",
				job.ID, definition.WorkspaceID, definition.ID).
			Updates(map[string]interface{}{"approved_by": actor, "approved_at": now})
		if result.Error != nil {
			return result.Error
		}
		if len(report.Plan) > 0 {
			key := schemaJobIdempotencyKey("migration", job.ID.String(), report.TargetChecksum)
			var candidate models.EntitySchemaChangeJob
			findErr := tx.Where("idempotency_key = ?", key).First(&candidate).Error
			if errors.Is(findErr, gorm.ErrRecordNotFound) {
				candidate = models.EntitySchemaChangeJob{
					ID: uuid.New(), WorkspaceID: definition.WorkspaceID, DefinitionID: definition.ID,
					SourceVersion: job.SourceVersion, DraftRevision: job.DraftRevision,
					TargetChecksum: job.TargetChecksum, JobType: "migration",
					Status: models.SchemaChangeJobStatusPending, Severity: job.Severity,
					IdempotencyKey: key, Report: job.Report, Plan: job.Plan,
					ProgressTotal: report.RecordCount, RequestedBy: job.RequestedBy,
					ApprovedBy: actor, ApprovedAt: &now,
				}
				if createErr := tx.Create(&candidate).Error; createErr != nil {
					return createErr
				}
			} else if findErr != nil {
				return findErr
			}
			migration = &candidate
		}
		if err := writeSchemaAudit(tx, definition, actor, "schema_definition.impact.approve", c.IP(), map[string]interface{}{
			"job_id": job.ID, "severity": job.Severity, "migration_required": len(report.Plan) > 0,
		}); err != nil {
			return err
		}
		return services.EnqueueOutbox(tx, definition.WorkspaceID, "events.data.schema.impact.approved",
			"data.schema.impact.approved", "schema", definition.ID, map[string]interface{}{
				"definition_id": definition.ID.String(), "definition_key": definition.Key,
				"impact_job_id": job.ID.String(), "severity": job.Severity,
			})
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to approve schema impact"})
	}
	job.ApprovedBy, job.ApprovedAt = actor, &now
	return c.JSON(fiber.Map{"job": job, "migration_job": migration})
}

func ListSchemaChangeJobs(c *fiber.Ctx) error {
	definition, err := findSchemaDefinition(c)
	if err != nil {
		return err
	}
	var jobs []models.EntitySchemaChangeJob
	if err := database.GetDB(c).Where(
		"workspace_id = ? AND definition_id = ?", definition.WorkspaceID, definition.ID,
	).Order("created_at DESC").Limit(100).Find(&jobs).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to list schema change jobs"})
	}
	return c.JSON(fiber.Map{"data": jobs})
}

func PauseSchemaChangeJob(c *fiber.Ctx) error {
	return setSchemaMigrationJobStatus(c, models.SchemaChangeJobStatusPaused)
}

func ResumeSchemaChangeJob(c *fiber.Ctx) error {
	return setSchemaMigrationJobStatus(c, models.SchemaChangeJobStatusPending)
}

func setSchemaMigrationJobStatus(c *fiber.Ctx, next string) error {
	definition, job, err := findSchemaChangeJob(c)
	if err != nil {
		return err
	}
	if job.JobType != "migration" || job.TargetVersion <= 0 {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "migration job is not ready", "code": "MIGRATION_NOT_READY"})
	}
	allowed := false
	if next == models.SchemaChangeJobStatusPaused {
		allowed = job.Status == models.SchemaChangeJobStatusPending || job.Status == models.SchemaChangeJobStatusRunning
	} else {
		allowed = job.Status == models.SchemaChangeJobStatusPaused || job.Status == models.SchemaChangeJobStatusFailed
	}
	if !allowed {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "invalid migration job status transition", "code": "INVALID_JOB_TRANSITION"})
	}
	updates := map[string]interface{}{"status": next, "last_error": ""}
	if next == models.SchemaChangeJobStatusPending {
		updates["completed_at"] = nil
	}
	action := "schema_definition.migration.pause"
	eventType := "data.schema.migration.paused"
	if next == models.SchemaChangeJobStatusPending {
		action = "schema_definition.migration.resume"
		eventType = "data.schema.migration.resumed"
	}
	if err := database.GetDB(c).Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&models.EntitySchemaChangeJob{}).Where(
			"id = ? AND workspace_id = ? AND definition_id = ? AND status = ?",
			job.ID, definition.WorkspaceID, definition.ID, job.Status,
		).Updates(updates)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return errSchemaRevisionConflict
		}
		if err := writeSchemaAudit(tx, definition, currentUserUUID(c), action, c.IP(), map[string]interface{}{
			"migration_job_id": job.ID, "from_status": job.Status, "to_status": next,
		}); err != nil {
			return err
		}
		return services.EnqueueOutbox(tx, definition.WorkspaceID, "events."+eventType, eventType, "schema", definition.ID, map[string]interface{}{
			"definition_id": definition.ID.String(), "definition_key": definition.Key,
			"migration_job_id": job.ID.String(), "status": next,
		})
	}); err != nil {
		if errors.Is(err, errSchemaRevisionConflict) {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "migration status changed concurrently", "code": "MIGRATION_STATUS_CONFLICT"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to update migration job"})
	}
	job.Status = next
	job.LastError = ""
	return c.JSON(fiber.Map{"job": job})
}

func findSchemaChangeJob(c *fiber.Ctx) (models.EntityDefinition, models.EntitySchemaChangeJob, error) {
	definition, err := findSchemaDefinition(c)
	if err != nil {
		return models.EntityDefinition{}, models.EntitySchemaChangeJob{}, err
	}
	jobID, parseErr := uuid.Parse(c.Params("jobId"))
	if parseErr != nil {
		return definition, models.EntitySchemaChangeJob{}, c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid schema change job id"})
	}
	var job models.EntitySchemaChangeJob
	if err := database.GetDB(c).Where(
		"id = ? AND workspace_id = ? AND definition_id = ?", jobID, definition.WorkspaceID, definition.ID,
	).First(&job).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return definition, job, c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "schema change job not found"})
		}
		return definition, job, c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load schema change job"})
	}
	return definition, job, nil
}

func schemaJobIdempotencyKey(parts ...string) string {
	sum := sha256.Sum256([]byte(stringsJoin(parts, "\x1f")))
	return hex.EncodeToString(sum[:])
}

func stringsJoin(values []string, separator string) string {
	result := ""
	for index, value := range values {
		if index > 0 {
			result += separator
		}
		result += value
	}
	return result
}

func writeSchemaAudit(tx *gorm.DB, definition models.EntityDefinition, actor *uuid.UUID, action, ip string, details map[string]interface{}) error {
	details["definition_key"] = definition.Key
	raw, err := json.Marshal(details)
	if err != nil {
		return err
	}
	workspaceID := definition.WorkspaceID
	return tx.Create(&models.AuditLog{
		ID: uuid.New(), WorkspaceID: &workspaceID, UserID: actor,
		Action: action, EntityType: "EntityDefinition", EntityID: definition.ID.String(),
		Details: datatypes.JSON(raw), IPAddress: ip,
	}).Error
}
