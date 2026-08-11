package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

const maxSchemaDefinitionsPageSize = 100

type schemaDefinitionRequest struct {
	Key              string                      `json:"key"`
	LabelAr          string                      `json:"label_ar"`
	LabelEn          string                      `json:"label_en"`
	DescriptionAr    string                      `json:"description_ar"`
	DescriptionEn    string                      `json:"description_en"`
	TitleFieldKey    string                      `json:"title_field_key"`
	Fields           []services.SchemaFieldInput `json:"fields"`
	ExpectedRevision int                         `json:"expected_revision"`
}

type publishSchemaRequest struct {
	ExpectedRevision int    `json:"expected_revision"`
	ImpactJobID      string `json:"impact_job_id"`
}

type schemaDefinitionResponse struct {
	Definition models.EntityDefinition     `json:"definition"`
	Fields     []services.SchemaFieldInput `json:"fields"`
	Version    *models.EntitySchemaVersion `json:"version,omitempty"`
}

func currentUserUUID(c *fiber.Ctx) *uuid.UUID {
	raw, _ := c.Locals("user_id").(string)
	parsed, err := uuid.Parse(raw)
	if err != nil {
		return nil
	}
	return &parsed
}

func parseSchemaFields(uiSchema datatypes.JSON) []services.SchemaFieldInput {
	var payload struct {
		Fields []services.SchemaFieldInput `json:"fields"`
	}
	if err := json.Unmarshal(uiSchema, &payload); err != nil {
		return []services.SchemaFieldInput{}
	}
	return payload.Fields
}

func validateTitleFieldKey(titleFieldKey string, fields []services.SchemaFieldInput) error {
	titleFieldKey = strings.TrimSpace(titleFieldKey)
	if titleFieldKey == "" {
		return nil
	}
	for _, field := range fields {
		if field.Key == titleFieldKey && field.Type == "text" && field.Lifecycle != "hidden" {
			return nil
		}
	}
	return fmt.Errorf("title_field_key must reference a text field")
}

func schemaValidationResponse(c *fiber.Ctx, err error) error {
	var validationErr *services.SchemaValidationError
	if errors.As(err, &validationErr) {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
			"error":   "schema validation failed",
			"code":    "SCHEMA_VALIDATION_FAILED",
			"details": validationErr.Issues,
		})
	}
	return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
		"error": "invalid schema definition",
		"code":  "INVALID_SCHEMA_DEFINITION",
	})
}

func CreateSchemaDefinition(c *fiber.Ctx) error {
	workspace, ok := CurrentWorkspace(c)
	if !ok {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	workspaceID := workspace.ID

	var req schemaDefinitionRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	req.Key = strings.TrimSpace(req.Key)
	if !services.IsValidDefinitionKey(req.Key) || services.IsSystemEntityType(req.Key) || req.Key == "schema" {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
			"error": "key is invalid, reserved, or conflicts with a system entity",
			"code":  "INVALID_SCHEMA_KEY",
		})
	}
	if err := enforceSchemaFieldLimit(workspace, len(req.Fields)); err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
			"error": err.Error(),
			"code":  "SCHEMA_FIELD_LIMIT_EXCEEDED",
		})
	}
	var definitionCount int64
	if err := database.GetDB(c).Model(&models.EntityDefinition{}).
		Where("workspace_id = ? AND key NOT IN ?", workspaceID, services.SystemCRMDefinitionKeys()).
		Count(&definitionCount).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to check schema quota"})
	}
	if !services.WithinLimit(workspace, services.LimDataSchemas, definitionCount) {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
			"error": "the workspace has reached its schema definition limit",
			"code":  "SCHEMA_DEFINITION_LIMIT_EXCEEDED",
		})
	}

	compiled, err := services.CompileSchemaDraft(req.LabelAr, req.LabelEn, req.Fields)
	if err != nil {
		return schemaValidationResponse(c, err)
	}
	if err := validateTitleFieldKey(req.TitleFieldKey, compiled.Fields); err != nil {
		return schemaValidationResponse(c, &services.SchemaValidationError{Issues: []string{err.Error()}})
	}

	actor := currentUserUUID(c)
	definition := models.EntityDefinition{
		WorkspaceID:   workspaceID,
		Key:           req.Key,
		LabelAr:       strings.TrimSpace(req.LabelAr),
		LabelEn:       strings.TrimSpace(req.LabelEn),
		DescriptionAr: strings.TrimSpace(req.DescriptionAr),
		DescriptionEn: strings.TrimSpace(req.DescriptionEn),
		Status:        models.EntityDefinitionStatusDraft,
		DraftRevision: 1,
		TitleFieldKey: strings.TrimSpace(req.TitleFieldKey),
		DraftSchema:   compiled.JSONSchema,
		DraftUISchema: compiled.UISchema,
		Settings:      datatypes.JSON([]byte(`{}`)),
		CreatedBy:     actor,
		UpdatedBy:     actor,
	}
	if err := database.GetDB(c).Create(&definition).Error; err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "duplicate") {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{
				"error": "a schema definition with this key already exists",
				"code":  "SCHEMA_KEY_CONFLICT",
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create schema definition"})
	}

	services.LogEventForWorkspace(
		&workspaceID,
		actor,
		"schema_definition.create",
		"EntityDefinition",
		definition.ID.String(),
		map[string]interface{}{"key": definition.Key, "draft_revision": definition.DraftRevision},
		c.IP(),
	)
	return c.Status(fiber.StatusCreated).JSON(schemaDefinitionResponse{
		Definition: definition,
		Fields:     compiled.Fields,
	})
}

func ListSchemaDefinitions(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}

	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 30)
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > maxSchemaDefinitionsPageSize {
		limit = 30
	}

	query := database.GetDB(c).Model(&models.EntityDefinition{}).
		Where("workspace_id = ?", workspaceID)
	if status := strings.TrimSpace(c.Query("status")); status != "" {
		switch status {
		case models.EntityDefinitionStatusDraft, models.EntityDefinitionStatusPublished, models.EntityDefinitionStatusArchived:
			query = query.Where("status = ?", status)
		default:
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid status filter"})
		}
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to count schema definitions"})
	}
	var definitions []models.EntityDefinition
	if err := query.Order("updated_at DESC").
		Limit(limit).
		Offset((page - 1) * limit).
		Find(&definitions).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to list schema definitions"})
	}
	return c.JSON(fiber.Map{
		"data":  definitions,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}

func GetSchemaDefinition(c *fiber.Ctx) error {
	definition, err := findSchemaDefinition(c)
	if err != nil {
		return err
	}
	response := schemaDefinitionResponse{
		Definition: definition,
		Fields:     parseSchemaFields(definition.DraftUISchema),
	}
	if definition.CurrentVersion > 0 {
		var version models.EntitySchemaVersion
		if err := database.GetDB(c).Where(
			"workspace_id = ? AND definition_id = ? AND version = ?",
			definition.WorkspaceID,
			definition.ID,
			definition.CurrentVersion,
		).First(&version).Error; err == nil {
			response.Version = &version
		}
	}
	return c.JSON(response)
}

func UpdateSchemaDefinitionDraft(c *fiber.Ctx) error {
	definition, err := findSchemaDefinition(c)
	if err != nil {
		return err
	}
	if err := rejectSystemManagedSchemaMutation(c, definition); err != nil {
		return err
	}
	var req schemaDefinitionRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	if req.ExpectedRevision <= 0 || req.ExpectedRevision != definition.DraftRevision {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error":            "the schema draft was changed by another editor",
			"code":             "SCHEMA_REVISION_CONFLICT",
			"current_revision": definition.DraftRevision,
		})
	}

	req.Key = strings.TrimSpace(req.Key)
	if req.Key == "" {
		req.Key = definition.Key
	}
	if definition.CurrentVersion > 0 && req.Key != definition.Key {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error": "schema key cannot change after publishing",
			"code":  "SCHEMA_KEY_IMMUTABLE",
		})
	}
	if !services.IsValidDefinitionKey(req.Key) || services.IsSystemEntityType(req.Key) || req.Key == "schema" {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
			"error": "key is invalid, reserved, or conflicts with a system entity",
			"code":  "INVALID_SCHEMA_KEY",
		})
	}
	workspace, ok := CurrentWorkspace(c)
	if !ok {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	if err := enforceSchemaFieldLimit(workspace, len(req.Fields)); err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
			"error": err.Error(),
			"code":  "SCHEMA_FIELD_LIMIT_EXCEEDED",
		})
	}

	compiled, compileErr := services.CompileSchemaDraft(req.LabelAr, req.LabelEn, req.Fields)
	if compileErr != nil {
		return schemaValidationResponse(c, compileErr)
	}
	if err := validateTitleFieldKey(req.TitleFieldKey, compiled.Fields); err != nil {
		return schemaValidationResponse(c, &services.SchemaValidationError{Issues: []string{err.Error()}})
	}

	actor := currentUserUUID(c)
	updates := map[string]interface{}{
		"key":             req.Key,
		"label_ar":        strings.TrimSpace(req.LabelAr),
		"label_en":        strings.TrimSpace(req.LabelEn),
		"description_ar":  strings.TrimSpace(req.DescriptionAr),
		"description_en":  strings.TrimSpace(req.DescriptionEn),
		"title_field_key": strings.TrimSpace(req.TitleFieldKey),
		"draft_schema":    compiled.JSONSchema,
		"draft_ui_schema": compiled.UISchema,
		"draft_revision":  gorm.Expr("draft_revision + 1"),
		"updated_by":      actor,
	}
	result := database.GetDB(c).Model(&models.EntityDefinition{}).
		Where("id = ? AND workspace_id = ? AND draft_revision = ?", definition.ID, definition.WorkspaceID, req.ExpectedRevision).
		Updates(updates)
	if result.Error != nil {
		if strings.Contains(strings.ToLower(result.Error.Error()), "duplicate") {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "a schema definition with this key already exists", "code": "SCHEMA_KEY_CONFLICT"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to update schema draft"})
	}
	if result.RowsAffected != 1 {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "the schema draft was changed by another editor", "code": "SCHEMA_REVISION_CONFLICT"})
	}
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", definition.ID, definition.WorkspaceID).First(&definition).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to reload schema draft"})
	}
	return c.JSON(schemaDefinitionResponse{Definition: definition, Fields: compiled.Fields})
}

func ValidateSchemaDefinition(c *fiber.Ctx) error {
	definition, err := findSchemaDefinition(c)
	if err != nil {
		return err
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
	return c.JSON(fiber.Map{
		"valid":          true,
		"draft_revision": definition.DraftRevision,
		"field_count":    len(compiled.Fields),
		"checksum":       services.SchemaChecksum(compiled.JSONSchema, compiled.UISchema),
	})
}

func PublishSchemaDefinition(c *fiber.Ctx) error {
	definition, err := findSchemaDefinition(c)
	if err != nil {
		return err
	}
	if err := rejectSystemManagedSchemaMutation(c, definition); err != nil {
		return err
	}
	var req publishSchemaRequest
	if len(c.Body()) > 0 {
		if err := c.BodyParser(&req); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
		}
	}
	if req.ExpectedRevision <= 0 || req.ExpectedRevision != definition.DraftRevision {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error":            "the schema draft revision is stale",
			"code":             "SCHEMA_REVISION_CONFLICT",
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

	actor := currentUserUUID(c)
	nextVersion := definition.CurrentVersion + 1
	targetChecksum := services.SchemaChecksum(compiled.JSONSchema, compiled.UISchema)
	changeSetPayload := map[string]interface{}{
		"from_version":   definition.CurrentVersion,
		"to_version":     nextVersion,
		"draft_revision": definition.DraftRevision,
	}
	var impactJob *models.EntitySchemaChangeJob
	var migrationJob *models.EntitySchemaChangeJob
	if definition.CurrentVersion > 0 {
		impactID, parseErr := uuid.Parse(strings.TrimSpace(req.ImpactJobID))
		if parseErr != nil {
			return c.Status(fiber.StatusPreconditionRequired).JSON(fiber.Map{
				"error": "a current impact review is required before publishing",
				"code":  "SCHEMA_IMPACT_REQUIRED",
			})
		}
		var loaded models.EntitySchemaChangeJob
		if err := database.GetDB(c).Where(
			"id = ? AND workspace_id = ? AND definition_id = ? AND job_type = ?",
			impactID, definition.WorkspaceID, definition.ID, "impact",
		).First(&loaded).Error; err != nil {
			return c.Status(fiber.StatusPreconditionFailed).JSON(fiber.Map{"error": "schema impact review was not found", "code": "SCHEMA_IMPACT_STALE"})
		}
		var report services.SchemaImpactReport
		if err := json.Unmarshal(loaded.Report, &report); err != nil ||
			loaded.Status != models.SchemaChangeJobStatusCompleted ||
			loaded.SourceVersion != definition.CurrentVersion ||
			loaded.DraftRevision != definition.DraftRevision ||
			loaded.TargetChecksum != targetChecksum ||
			!report.CanApprove {
			return c.Status(fiber.StatusPreconditionFailed).JSON(fiber.Map{"error": "schema impact review is stale or blocked", "code": "SCHEMA_IMPACT_STALE"})
		}
		if loaded.Severity != services.SchemaChangeSafe && loaded.ApprovedAt == nil {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "schema impact requires authorized approval", "code": "SCHEMA_IMPACT_APPROVAL_REQUIRED"})
		}
		impactJob = &loaded
		changeSetPayload["impact"] = report
		changeSetPayload["impact_job_id"] = loaded.ID
		if len(report.Plan) > 0 {
			var pending models.EntitySchemaChangeJob
			key := schemaJobIdempotencyKey("migration", loaded.ID.String(), report.TargetChecksum)
			if err := database.GetDB(c).Where(
				"idempotency_key = ? AND job_type = ? AND approved_at IS NOT NULL", key, "migration",
			).First(&pending).Error; err != nil {
				return c.Status(fiber.StatusPreconditionFailed).JSON(fiber.Map{"error": "approved migration plan is missing", "code": "SCHEMA_MIGRATION_PLAN_REQUIRED"})
			}
			migrationJob = &pending
			changeSetPayload["migration_job_id"] = pending.ID
		}
	}
	changeSet, _ := json.Marshal(changeSetPayload)
	version := models.EntitySchemaVersion{
		WorkspaceID:  definition.WorkspaceID,
		DefinitionID: definition.ID,
		Version:      nextVersion,
		JSONSchema:   compiled.JSONSchema,
		UISchema:     compiled.UISchema,
		ChangeSet:    datatypes.JSON(changeSet),
		Checksum:     targetChecksum,
		PublishedBy:  actor,
	}

	txErr := database.GetDB(c).Transaction(func(tx *gorm.DB) error {
		var locked models.EntityDefinition
		if err := tx.Raw(
			`SELECT * FROM entity_definitions
			 WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL
			 FOR UPDATE`,
			definition.ID,
			definition.WorkspaceID,
		).Scan(&locked).Error; err != nil {
			return err
		}
		if locked.ID == uuid.Nil {
			return gorm.ErrRecordNotFound
		}
		if locked.DraftRevision != req.ExpectedRevision || locked.CurrentVersion != definition.CurrentVersion {
			return errSchemaRevisionConflict
		}
		if impactJob != nil {
			var lockedImpact models.EntitySchemaChangeJob
			if err := tx.Raw(
				`SELECT * FROM entity_schema_change_jobs
				 WHERE id = ? AND workspace_id = ? AND definition_id = ?
				 FOR UPDATE`,
				impactJob.ID, definition.WorkspaceID, definition.ID,
			).Scan(&lockedImpact).Error; err != nil {
				return err
			}
			if lockedImpact.ID == uuid.Nil || lockedImpact.DraftRevision != locked.DraftRevision ||
				lockedImpact.SourceVersion != locked.CurrentVersion ||
				lockedImpact.TargetChecksum != targetChecksum ||
				(lockedImpact.Severity != services.SchemaChangeSafe && lockedImpact.ApprovedAt == nil) {
				return errSchemaImpactStale
			}
		}
		if err := tx.Create(&version).Error; err != nil {
			return err
		}
		if err := services.MaterializePublishedFields(
			tx, definition, nextVersion, version.Checksum, compiled.Fields,
		); err != nil {
			return err
		}
		if err := services.SyncPublishedRelations(tx, definition, compiled.Fields); err != nil {
			return err
		}
		if err := tx.Model(&models.EntityDefinition{}).
			Where("id = ? AND workspace_id = ?", definition.ID, definition.WorkspaceID).
			Updates(map[string]interface{}{
				"status":          models.EntityDefinitionStatusPublished,
				"current_version": nextVersion,
				"updated_by":      actor,
			}).Error; err != nil {
			return err
		}
		if migrationJob != nil {
			result := tx.Model(&models.EntitySchemaChangeJob{}).Where(
				"id = ? AND workspace_id = ? AND definition_id = ? AND target_version = 0",
				migrationJob.ID, definition.WorkspaceID, definition.ID,
			).Updates(map[string]interface{}{
				"target_version": nextVersion,
				"status":         models.SchemaChangeJobStatusPending,
			})
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return errSchemaImpactStale
			}
		}
		if err := writeSchemaAudit(tx, definition, actor, "schema_definition.publish", c.IP(), map[string]interface{}{
			"version": nextVersion, "checksum": version.Checksum,
			"impact_job_id": req.ImpactJobID,
		}); err != nil {
			return err
		}
		return services.EnqueueOutbox(tx, definition.WorkspaceID, "events.data.schema.published",
			"data.schema.published", "schema", definition.ID, map[string]interface{}{
				"definition_id": definition.ID.String(), "definition_key": definition.Key,
				"schema_version": nextVersion, "checksum": version.Checksum,
			})
	})
	if errors.Is(txErr, errSchemaRevisionConflict) {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "the schema changed during publishing", "code": "SCHEMA_REVISION_CONFLICT"})
	}
	if errors.Is(txErr, errSchemaImpactStale) {
		return c.Status(fiber.StatusPreconditionFailed).JSON(fiber.Map{"error": "schema impact changed during publishing", "code": "SCHEMA_IMPACT_STALE"})
	}
	if txErr != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to publish schema definition"})
	}

	definition.Status = models.EntityDefinitionStatusPublished
	definition.CurrentVersion = nextVersion
	response := fiber.Map{
		"definition": definition, "fields": compiled.Fields, "version": version,
	}
	if migrationJob != nil {
		migrationJob.TargetVersion = nextVersion
		response["migration_job"] = migrationJob
	}
	return c.JSON(response)
}

func ListSchemaVersions(c *fiber.Ctx) error {
	definition, err := findSchemaDefinition(c)
	if err != nil {
		return err
	}
	var versions []models.EntitySchemaVersion
	if err := database.GetDB(c).Where(
		"workspace_id = ? AND definition_id = ?",
		definition.WorkspaceID,
		definition.ID,
	).Order("version DESC").Find(&versions).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to list schema versions"})
	}
	return c.JSON(fiber.Map{"data": versions})
}

func findSchemaDefinition(c *fiber.Ctx) (models.EntityDefinition, error) {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return models.EntityDefinition{}, c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return models.EntityDefinition{}, c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid schema definition id"})
	}
	var definition models.EntityDefinition
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", id, workspaceID).First(&definition).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return models.EntityDefinition{}, c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "schema definition not found"})
		}
		return models.EntityDefinition{}, c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load schema definition"})
	}
	return definition, nil
}

var errSchemaRevisionConflict = errors.New("schema revision conflict")
var errSchemaImpactStale = errors.New("schema impact stale")

func enforceSchemaFieldLimit(workspace *models.Workspace, fieldCount int) error {
	limit := services.GetLimit(workspace, services.LimSchemaFields)
	if limit == services.Unlimited {
		return nil
	}
	if limit <= 0 || int64(fieldCount) > limit {
		return fmt.Errorf("field count exceeds the workspace plan limit of %d", limit)
	}
	return nil
}
