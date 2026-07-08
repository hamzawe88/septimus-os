package handlers

import (
	"encoding/json"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/events"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/datatypes"
)

// allowedEntityTypes is the complete list of valid entity types.
// To add a new module, append here — no schema migration needed.
var allowedEntityTypes = map[string]bool{
	"task":            true,
	"document":        true,
	"meeting":         true,
	"issue":           true,
	"lead":            true,
	"deal":            true,
	"invoice":         true,
	"expense":         true,
	"finance_invoice": true,
	"finance_expense": true,
	"ticket":          true,
	"leave_request":   true,
	"evaluation":      true,
	"hr_employee":     true,
	"ai_agent":        true,
	"schema":          true,
}

type CreateEntityRequest struct {
	WorkspaceID string                 `json:"workspace_id"`
	ProjectID   string                 `json:"project_id"`
	EntityType  string                 `json:"entity_type"`
	Data        map[string]interface{} `json:"data"`
}

func CreateEntity(c *fiber.Ctx) error {
	var req CreateEntityRequest

	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	workspaceID, err := uuid.Parse(req.WorkspaceID)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid Workspace ID"})
	}

	// ✅ Validate entity_type against allowlist
	if req.EntityType == "" {
		return c.Status(400).JSON(fiber.Map{"error": "entity_type is required"})
	}
	
	isValidType := allowedEntityTypes[req.EntityType]
	if !isValidType {
		// Check if it's a dynamic schema created by the user
		var schemaCount int64
		database.DB.Model(&models.Entity{}).Where("workspace_id = ? AND entity_type = ? AND data->>'name' = ?", workspaceID, "schema", req.EntityType).Count(&schemaCount)
		if schemaCount > 0 {
			isValidType = true
		}
	}

	if !isValidType {
		return c.Status(400).JSON(fiber.Map{
			"error":   "Invalid entity_type",
			"allowed": []string{"task", "document", "meeting", "issue", "lead", "deal", "invoice", "expense", "leave_request", "evaluation", "ai_agent", "schema"},
		})
	}

	var projectIDPtr *uuid.UUID
	if req.ProjectID != "" {
		parsed, err := uuid.Parse(req.ProjectID)
		if err == nil {
			projectIDPtr = &parsed
		}
	}

	dataBytes, err := json.Marshal(req.Data)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid Data format"})
	}

	entity := models.Entity{
		WorkspaceID: workspaceID,
		ProjectID:   projectIDPtr,
		EntityType:  req.EntityType,
		Data:        datatypes.JSON(dataBytes),
	}

	// Save to DB
	if result := database.DB.Create(&entity); result.Error != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to create entity"})
	}

	// Publish NATS event
	eventPayload, _ := json.Marshal(map[string]interface{}{
		"event":     "entity.created",
		"entity_id": entity.ID.String(),
		"type":      entity.EntityType,
	})
	events.PublishEvent("events.entities.created", eventPayload)

	return c.Status(201).JSON(fiber.Map{
		"message": "Entity created successfully",
		"entity":  entity,
	})
}

// GetEntities returns a filtered list of entities by workspace and optional type.
// GET /api/v1/entities?workspace_id=UUID&type=task
func GetEntities(c *fiber.Ctx) error {
	workspaceIDStr := c.Query("workspace_id")
	entityType := c.Query("type")

	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 50)

	if workspaceIDStr == "" {
		return c.Status(400).JSON(fiber.Map{"error": "workspace_id is required"})
	}

	workspaceID, err := uuid.Parse(workspaceIDStr)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid workspace_id"})
	}

	query := database.DB.Model(&models.Entity{}).Where("workspace_id = ?", workspaceID)
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
	Name *string                `json:"name"`
	Data map[string]interface{} `json:"data"`
}

// UpdateEntity updates an existing entity
// PUT /api/v1/entities/:id?workspace_id=UUID
func UpdateEntity(c *fiber.Ctx) error {
	id := c.Params("id")
	workspaceIDStr := c.Query("workspace_id")

	if workspaceIDStr == "" {
		return c.Status(400).JSON(fiber.Map{"error": "workspace_id is required"})
	}

	entityID, err := uuid.Parse(id)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid entity ID"})
	}

	workspaceID, err := uuid.Parse(workspaceIDStr)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid workspace_id"})
	}

	var req UpdateEntityRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	var entity models.Entity
	if err := database.DB.Where("id = ? AND workspace_id = ?", entityID, workspaceID).First(&entity).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Entity not found"})
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

		dataBytes, _ := json.Marshal(existingData)
		entity.Data = datatypes.JSON(dataBytes)
	}

	if err := database.DB.Save(&entity).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to update entity"})
	}

	// Publish NATS event
	eventPayload, _ := json.Marshal(map[string]interface{}{
		"event":     "entity.updated",
		"entity_id": entity.ID.String(),
		"type":      entity.EntityType,
	})
	events.PublishEvent("events.entities.updated", eventPayload)

	return c.JSON(fiber.Map{
		"message": "Entity updated successfully",
		"entity":  entity,
	})
}

// DeleteEntity deletes an entity by ID
// DELETE /api/v1/entities/:id?workspace_id=UUID
func DeleteEntity(c *fiber.Ctx) error {
	id := c.Params("id")
	workspaceIDStr := c.Query("workspace_id")

	if workspaceIDStr == "" {
		return c.Status(400).JSON(fiber.Map{"error": "workspace_id is required"})
	}

	entityID, err := uuid.Parse(id)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid entity ID"})
	}

	workspaceID, err := uuid.Parse(workspaceIDStr)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid workspace_id"})
	}

	var entity models.Entity
	if err := database.DB.Where("id = ? AND workspace_id = ?", entityID, workspaceID).First(&entity).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Entity not found"})
	}

	if err := database.DB.Delete(&entity).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to delete entity"})
	}

	// Publish NATS event
	eventPayload, _ := json.Marshal(map[string]interface{}{
		"event":     "entity.deleted",
		"entity_id": entity.ID.String(),
		"type":      entity.EntityType,
	})
	events.PublishEvent("events.entities.deleted", eventPayload)

	return c.JSON(fiber.Map{
		"message": "Entity deleted successfully",
	})
}
