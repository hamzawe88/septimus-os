package handlers

import (
	"errors"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
	"gorm.io/gorm"
)

type restoreSchemaVersionRequest struct {
	ExpectedRevision int `json:"expected_revision"`
}

func ArchiveSchemaDefinition(c *fiber.Ctx) error {
	return setSchemaDefinitionArchived(c, true)
}

func RestoreSchemaDefinition(c *fiber.Ctx) error {
	return setSchemaDefinitionArchived(c, false)
}

func setSchemaDefinitionArchived(c *fiber.Ctx, archived bool) error {
	definition, err := findSchemaDefinition(c)
	if err != nil {
		return err
	}
	if err := rejectSystemManagedSchemaMutation(c, definition); err != nil {
		return err
	}
	next := models.EntityDefinitionStatusArchived
	action := "schema_definition.archive"
	event := "data.schema.archived"
	if !archived {
		if definition.Status != models.EntityDefinitionStatusArchived {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "schema definition is not archived", "code": "INVALID_SCHEMA_STATUS"})
		}
		next = models.EntityDefinitionStatusDraft
		if definition.CurrentVersion > 0 {
			next = models.EntityDefinitionStatusPublished
		}
		action = "schema_definition.restore"
		event = "data.schema.restored"
	} else if definition.Status == models.EntityDefinitionStatusArchived {
		return c.JSON(fiber.Map{"definition": definition})
	}
	if archived {
		var activeJobs int64
		if err := database.GetDB(c).Model(&models.EntitySchemaChangeJob{}).Where(
			"workspace_id = ? AND definition_id = ? AND job_type = ? AND status IN ?",
			definition.WorkspaceID, definition.ID, "migration",
			[]string{models.SchemaChangeJobStatusPending, models.SchemaChangeJobStatusRunning},
		).Count(&activeJobs).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to check active schema migrations"})
		}
		if activeJobs > 0 {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{
				"error": "schema cannot be archived while a migration is active",
				"code":  "SCHEMA_MIGRATION_ACTIVE",
			})
		}
	}
	actor := currentUserUUID(c)
	err = database.GetDB(c).Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&models.EntityDefinition{}).Where(
			"id = ? AND workspace_id = ? AND status = ?", definition.ID, definition.WorkspaceID, definition.Status,
		).Updates(map[string]interface{}{"status": next, "updated_by": actor, "updated_at": time.Now().UTC()})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return errSchemaRevisionConflict
		}
		if err := writeSchemaAudit(tx, definition, actor, action, c.IP(), map[string]interface{}{
			"from_status": definition.Status, "to_status": next,
		}); err != nil {
			return err
		}
		return services.EnqueueOutbox(tx, definition.WorkspaceID, "events."+event, event, "schema", definition.ID, map[string]interface{}{
			"definition_id": definition.ID.String(), "definition_key": definition.Key,
			"status": next, "schema_version": definition.CurrentVersion,
		})
	})
	if errors.Is(err, errSchemaRevisionConflict) {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "schema status changed concurrently", "code": "SCHEMA_STATUS_CONFLICT"})
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to update schema status"})
	}
	definition.Status = next
	return c.JSON(fiber.Map{"definition": definition})
}

// RestoreSchemaVersionToDraft never mutates an old version. It copies the
// selected immutable snapshot into a new draft revision that must pass impact,
// approval, and publish again to become the next version.
func RestoreSchemaVersionToDraft(c *fiber.Ctx) error {
	definition, err := findSchemaDefinition(c)
	if err != nil {
		return err
	}
	if err := rejectSystemManagedSchemaMutation(c, definition); err != nil {
		return err
	}
	versionNumber, parseErr := c.ParamsInt("version")
	if parseErr != nil || versionNumber < 1 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid schema version"})
	}
	var req restoreSchemaVersionRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	if req.ExpectedRevision != definition.DraftRevision {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error": "the schema draft revision is stale", "code": "SCHEMA_REVISION_CONFLICT",
			"current_revision": definition.DraftRevision,
		})
	}
	var version models.EntitySchemaVersion
	if err := database.GetDB(c).Where(
		"workspace_id = ? AND definition_id = ? AND version = ?",
		definition.WorkspaceID, definition.ID, versionNumber,
	).First(&version).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "schema version not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load schema version"})
	}
	fields := parseSchemaFields(version.UISchema)
	compiled, err := services.CompileSchemaDraft(definition.LabelAr, definition.LabelEn, fields)
	if err != nil {
		return schemaValidationResponse(c, err)
	}
	actor := currentUserUUID(c)
	err = database.GetDB(c).Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&models.EntityDefinition{}).Where(
			"id = ? AND workspace_id = ? AND draft_revision = ?",
			definition.ID, definition.WorkspaceID, req.ExpectedRevision,
		).Updates(map[string]interface{}{
			"draft_schema": compiled.JSONSchema, "draft_ui_schema": compiled.UISchema,
			"draft_revision": gorm.Expr("draft_revision + 1"),
			"updated_by":     actor, "updated_at": time.Now().UTC(),
		})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return errSchemaRevisionConflict
		}
		if err := writeSchemaAudit(tx, definition, actor, "schema_definition.version.restore_to_draft", c.IP(), map[string]interface{}{
			"source_version": versionNumber, "new_draft_revision": definition.DraftRevision + 1,
		}); err != nil {
			return err
		}
		return services.EnqueueOutbox(tx, definition.WorkspaceID, "events.data.schema.draft.restored",
			"data.schema.draft.restored", "schema", definition.ID, map[string]interface{}{
				"definition_id": definition.ID.String(), "definition_key": definition.Key,
				"source_version": versionNumber, "draft_revision": definition.DraftRevision + 1,
			})
	})
	if errors.Is(err, errSchemaRevisionConflict) {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "the schema draft changed concurrently", "code": "SCHEMA_REVISION_CONFLICT"})
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to restore schema version"})
	}
	definition.DraftRevision++
	definition.DraftSchema = compiled.JSONSchema
	definition.DraftUISchema = compiled.UISchema
	return c.JSON(schemaDefinitionResponse{Definition: definition, Fields: compiled.Fields})
}
