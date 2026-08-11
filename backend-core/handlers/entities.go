package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/events"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// allowedEntityTypes is the complete list of valid entity types.
// To add a new module, append here — no schema migration needed.
var allowedEntityTypes = map[string]bool{
	"task":               true,
	"document":           true,
	"meeting":            true,
	"issue":              true,
	"lead":               true,
	"deal":               true,
	"crm_deal":           true,
	"invoice":            true,
	"expense":            true,
	"finance_invoice":    true,
	"finance_expense":    true,
	"ticket":             true,
	"leave_request":      true,
	"evaluation":         true,
	"hr_employee":        true,
	"hr_attendance":      true,
	"hr_leave":           true,
	"hr_leave_request":   true,
	"hr_job":             true,
	"hr_policy":          true,
	"crm_quote":          true,
	"ai_agent":           true,
	"user_orbit_task":    true,
	"user_orbit_profile": true,
}

func isRetiredPMEntityType(entityType string) bool {
	return entityType == "task" || entityType == "sub_task"
}

func retiredPMEntityError(c *fiber.Ctx) error {
	return c.Status(fiber.StatusGone).JSON(fiber.Map{
		"error": "task and subtask records use the canonical project-management API",
		"code":  "PM_CANONICAL_TASK_REQUIRED",
	})
}

type CreateEntityRequest struct {
	WorkspaceID string                 `json:"workspace_id"`
	ProjectID   string                 `json:"project_id"`
	EntityType  string                 `json:"entity_type"`
	Type        string                 `json:"type"`
	Data        map[string]interface{} `json:"data"`
}

// createEntityRecord validates the type, persists the entity, and publishes the
// created event. Shared by the HTTP CreateEntity handler and the human-approval
// executor so agent-proposed writes go through the same path once approved.
func createEntityRecord(workspaceID uuid.UUID, entityType string, data map[string]interface{}) (models.Entity, error) {
	return createEntityRecordWithDB(database.DB, workspaceID, nil, nil, entityType, data)
}

func createEntityRecordWithDB(
	db *gorm.DB,
	workspaceID uuid.UUID,
	projectID *uuid.UUID,
	actorID *uuid.UUID,
	entityType string,
	data map[string]interface{},
) (models.Entity, error) {
	if entityType == "" {
		return models.Entity{}, fmt.Errorf("entity_type is required")
	}
	if entityType == "schema" {
		return models.Entity{}, fmt.Errorf("schema definitions must use the schema registry API")
	}
	if isRetiredPMEntityType(entityType) {
		return models.Entity{}, fmt.Errorf("PM_CANONICAL_TASK_REQUIRED: task records must use the project-management API")
	}
	if entityType == "crm_opportunity" {
		principal := services.PrincipalForSystem("approved_ai")
		if actorID != nil {
			principal = services.PrincipalForUser(*actorID, "")
		}
		var opportunity models.Entity
		err := db.Transaction(func(tx *gorm.DB) error {
			company := strings.TrimSpace(fmt.Sprint(data["company"]))
			if company == "" {
				company = strings.TrimSpace(fmt.Sprint(data["title"]))
			}
			if company == "" {
				return fmt.Errorf("CRM opportunity requires company or title")
			}
			account, err := services.CreateDynamicRecordAs(tx, workspaceID, principal, "crm_account", map[string]interface{}{
				"name": company, "status": "prospect",
			})
			if err != nil {
				return err
			}
			stage := normalizeCRMStage(strings.TrimSpace(fmt.Sprint(data["stage"])))
			if _, valid := crmStageTransitions[stage]; !valid {
				stage = "new"
			}
			value, _ := data["value"].(float64)
			opportunity, err = services.CreateDynamicRecordAs(tx, workspaceID, principal, "crm_opportunity", map[string]interface{}{
				"title": company, "account": account.ID.String(), "stage": stage,
				"value": value, "currency": "SAR", "description": "AI-proposed record approved by a human reviewer",
			})
			return err
		})
		return opportunity, err
	}

	if !allowedEntityTypes[entityType] {
		actor := uuid.Nil
		if actorID != nil {
			actor = *actorID
		}
		return services.CreateDynamicRecord(db, workspaceID, actor, entityType, data)
	}

	dataBytes, err := json.Marshal(data)
	if err != nil {
		return models.Entity{}, err
	}

	entity := models.Entity{
		WorkspaceID:   workspaceID,
		ProjectID:     projectID,
		DefinitionID:  nil,
		SchemaVersion: 0,
		RecordVersion: 1,
		DisplayValue:  "",
		CreatedBy:     actorID,
		UpdatedBy:     actorID,
		EntityType:    entityType,
		Data:          datatypes.JSON(dataBytes),
	}
	if err := db.Create(&entity).Error; err != nil {
		return models.Entity{}, err
	}

	if err := events.PublishTenantEvent("events.entities.created", entity.WorkspaceID, map[string]interface{}{
		"event":     "entity.created",
		"entity_id": entity.ID.String(),
		"type":      entity.EntityType,
	}); err != nil {
		log.Printf("events.entities.created not published for entity %s: %v", entity.ID, err)
	}

	return entity, nil
}

func CreateEntity(c *fiber.Ctx) error {
	var req CreateEntityRequest

	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	// Tenant comes from the session only. The frontend still sends workspace_id
	// in the query and in the body, and this handler used to prefer both over
	// the JWT — so the value the client typed decided which tenant the row was
	// written into. Both are now ignored; req.WorkspaceID is accepted from the
	// wire but never trusted.
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(403).JSON(fiber.Map{"error": "workspace context is required"})
	}

	if req.EntityType == "" && req.Type != "" {
		req.EntityType = req.Type
	}
	if req.EntityType == "" {
		return c.Status(400).JSON(fiber.Map{"error": "entity_type is required"})
	}
	if isRetiredPMEntityType(req.EntityType) {
		return retiredPMEntityError(c)
	}
	if !allowedEntityTypes[req.EntityType] && req.EntityType != "schema" {
		entity, err := services.CreateDynamicRecordAs(
			database.GetDB(c), workspaceID, dynamicRecordPrincipal(c), req.EntityType, req.Data,
		)
		if err != nil {
			return dynamicRecordError(c, err)
		}
		return c.Status(fiber.StatusCreated).JSON(fiber.Map{
			"message": "Entity created successfully",
			"entity":  entity,
		})
	}

	var projectIDPtr *uuid.UUID
	if req.ProjectID != "" {
		parsed, err := uuid.Parse(req.ProjectID)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid project_id"})
		}
		var project models.Project
		if err := database.GetDB(c).Select("id").Where("id = ? AND workspace_id = ?", parsed, workspaceID).First(&project).Error; err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "project does not belong to this workspace"})
		}
		projectIDPtr = &parsed
	}

	entity, err := createEntityRecordWithDB(
		database.GetDB(c),
		workspaceID,
		projectIDPtr,
		currentUserUUID(c),
		req.EntityType,
		req.Data,
	)
	if err != nil {
		var validationErr *services.SchemaValidationError
		if errors.As(err, &validationErr) {
			return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
				"error":   "record does not conform to the published schema",
				"code":    "RECORD_SCHEMA_VALIDATION_FAILED",
				"details": validationErr.Issues,
			})
		}
		if strings.Contains(err.Error(), "invalid entity_type") ||
			strings.Contains(err.Error(), "schema definitions must") {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error(), "code": "INVALID_ENTITY_TYPE"})
		}
		return c.Status(500).JSON(fiber.Map{"error": "Failed to create entity"})
	}

	return c.Status(201).JSON(fiber.Map{
		"message": "Entity created successfully",
		"entity":  entity,
	})
}

// GetEntities returns a filtered list of entities by workspace and optional type.
// GET /api/v1/entities?workspace_id=UUID&type=task
func GetEntities(c *fiber.Ctx) error {
	// Session-derived; ?workspace_id= is ignored — see CreateEntity.
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(403).JSON(fiber.Map{"error": "workspace context is required"})
	}
	entityType := c.Query("type")
	if isRetiredPMEntityType(entityType) {
		return retiredPMEntityError(c)
	}
	if entityType != "" && !allowedEntityTypes[entityType] {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "dynamic records must use the schema-aware data API",
			"code":  "DYNAMIC_DATA_API_REQUIRED",
		})
	}

	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 50)
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 200 {
		limit = 50
	}

	// Dynamic records have field-level read policies and therefore must use the
	// dedicated /data/:definitionKey API. Keeping them out of this legacy mixed
	// endpoint prevents a read-policy bypass.
	query := database.GetDB(c).Model(&models.Entity{}).
		Where("workspace_id = ? AND definition_id IS NULL", workspaceID)
	if entityType != "" {
		query = query.Where("entity_type = ?", entityType)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to count entities"})
	}

	offset := (page - 1) * limit
	var entities []models.Entity
	if result := query.Order("created_at DESC").Limit(limit).Offset(offset).Find(&entities); result.Error != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch entities"})
	}

	totalPages := (int(total) + limit - 1) / limit

	return c.JSON(fiber.Map{
		"data":        entities,
		"total":       total,
		"page":        page,
		"limit":       limit,
		"total_pages": totalPages,
	})
}

// UpdateEntityRequest represents the expected payload for updating an entity
type UpdateEntityRequest struct {
	Name            *string                `json:"name"`
	Data            map[string]interface{} `json:"data"`
	ExpectedVersion *int                   `json:"expected_version"`
}

// UpdateEntity updates an existing entity
// PUT /api/v1/entities/:id?workspace_id=UUID
func UpdateEntity(c *fiber.Ctx) error {
	id := c.Params("id")
	// Session-derived; ?workspace_id= is ignored — see CreateEntity.
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(403).JSON(fiber.Map{"error": "workspace context is required"})
	}

	entityID, err := uuid.Parse(id)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid entity ID"})
	}

	var req UpdateEntityRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	var entity models.Entity
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", entityID, workspaceID).First(&entity).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Entity not found"})
	}
	if isRetiredPMEntityType(entity.EntityType) {
		return retiredPMEntityError(c)
	}

	if req.Data != nil {
		// Merge existing data with new data
		var existingData map[string]interface{}
		if len(entity.Data) > 0 {
			json.Unmarshal(entity.Data, &existingData)
		} else {
			existingData = make(map[string]interface{})
		}

		for k, v := range req.Data {
			existingData[k] = v
		}

		if entity.DefinitionID != nil {
			if req.ExpectedVersion == nil || *req.ExpectedVersion != entity.RecordVersion {
				return c.Status(fiber.StatusConflict).JSON(fiber.Map{
					"error":           "the record was changed by another editor",
					"code":            "RECORD_VERSION_CONFLICT",
					"current_version": entity.RecordVersion,
				})
			}
			updated, updateErr := services.UpdateDynamicRecordAs(
				database.GetDB(c), workspaceID, dynamicRecordPrincipal(c), entity.EntityType,
				entity.ID, *req.ExpectedVersion, existingData,
			)
			if updateErr != nil {
				return dynamicRecordError(c, updateErr)
			}
			return c.JSON(fiber.Map{"message": "Entity updated successfully", "entity": updated})
		}

		dataBytes, marshalErr := json.Marshal(existingData)
		if marshalErr != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid Data format"})
		}
		entity.Data = datatypes.JSON(dataBytes)
		entity.UpdatedBy = currentUserUUID(c)
	}

	if err := database.GetDB(c).Save(&entity).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to update entity"})
	}

	// Publish NATS event
	if err := events.PublishTenantEvent("events.entities.updated", entity.WorkspaceID, map[string]interface{}{
		"event":     "entity.updated",
		"entity_id": entity.ID.String(),
		"type":      entity.EntityType,
	}); err != nil {
		log.Printf("events.entities.updated not published for entity %s: %v", entity.ID, err)
	}

	return c.JSON(fiber.Map{
		"message": "Entity updated successfully",
		"entity":  entity,
	})
}

// DeleteEntity deletes an entity by ID
// DELETE /api/v1/entities/:id?workspace_id=UUID
func DeleteEntity(c *fiber.Ctx) error {
	id := c.Params("id")
	// Session-derived; ?workspace_id= is ignored — see CreateEntity.
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(403).JSON(fiber.Map{"error": "workspace context is required"})
	}

	entityID, err := uuid.Parse(id)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid entity ID"})
	}

	var entity models.Entity
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", entityID, workspaceID).First(&entity).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Entity not found"})
	}
	if isRetiredPMEntityType(entity.EntityType) {
		return retiredPMEntityError(c)
	}
	if entity.DefinitionID != nil {
		if err := services.DeleteDynamicRecordAs(
			database.GetDB(c), workspaceID, dynamicRecordPrincipal(c), entity.EntityType, entity.ID,
		); err != nil {
			return dynamicRecordError(c, err)
		}
		return c.JSON(fiber.Map{"message": "Entity deleted successfully"})
	}

	if err := database.GetDB(c).Delete(&entity).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to delete entity"})
	}

	if uidStr, ok := c.Locals("user_id").(string); ok && uidStr != "" {
		uid := database.ParseUUID(uidStr)
		services.LogEvent(&uid, "entity.delete", "Entity", entity.ID.String(), map[string]string{"type": entity.EntityType}, c.IP())
	}

	// Publish NATS event
	if err := events.PublishTenantEvent("events.entities.deleted", entity.WorkspaceID, map[string]interface{}{
		"event":     "entity.deleted",
		"entity_id": entity.ID.String(),
		"type":      entity.EntityType,
	}); err != nil {
		log.Printf("events.entities.deleted not published for entity %s: %v", entity.ID, err)
	}

	return c.JSON(fiber.Map{
		"message": "Entity deleted successfully",
	})
}
