package handlers

import (
	"encoding/json"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/datatypes"

	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
)

// CreatePinnedTask creates a new channel_pinned_task entity
func CreatePinnedTask(c *fiber.Ctx) error {
	workspaceIDStr, _ := c.Locals("workspace_id").(string)
	userIDStr, _ := c.Locals("user_id").(string)
	channelIDStr := c.Params("channelId")

	workspaceID, err := uuid.Parse(workspaceIDStr)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid workspace ID"})
	}

	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid user ID"})
	}

	channelID, err := uuid.Parse(channelIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid channel ID"})
	}

	var payload models.ChannelPinnedTaskPayload
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	// Enforce context variables
	payload.WorkspaceID = workspaceID
	payload.ChannelID = channelID
	payload.CreatorID = userID
	if payload.Assignees == nil {
		payload.Assignees = []uuid.UUID{}
	}
	if payload.Checklist == nil {
		payload.Checklist = []models.PinnedTaskChecklistItem{}
	}

	// Convert payload to datatypes.JSON
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to serialize payload"})
	}

	entity := models.Entity{
		WorkspaceID: workspaceID,
		EntityType:  "channel_pinned_task",
		Data:        datatypes.JSON(payloadBytes),
	}

	tx := database.GetDB(c)
	if err := tx.Create(&entity).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create pinned task"})
	}

	// Audit Log
	metadata := map[string]string{"channel_id": channelID.String()}
	services.LogEvent(&userID, "entity.pinned_task.create", "Entity", entity.ID.String(), metadata, c.IP())

	// Centrifugo Broadcast
	natsPayload := map[string]interface{}{
		"type":       "system",
		"entityType": "channel_pinned_task",
		"action":     "created",
		"task":       entity,
	}
	PublishToCentrifugo(ChannelChannel(channelID), natsPayload)
	for _, assigneeID := range payload.Assignees {
		PublishToCentrifugo(UserChannel(assigneeID), natsPayload)
	}

	return c.Status(fiber.StatusCreated).JSON(entity)
}

// GetPinnedTasks returns all active pinned tasks for a channel
func GetPinnedTasks(c *fiber.Ctx) error {
	workspaceIDStr, _ := c.Locals("workspace_id").(string)
	channelIDStr := c.Params("channelId")

	workspaceID, err := uuid.Parse(workspaceIDStr)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid workspace ID"})
	}

	tx := database.GetDB(c)
	var tasks []models.Entity

	// Fetch entities where Data->>'channel_id' == channelID
	err = tx.Where("workspace_id = ? AND entity_type = ? AND data->>'channel_id' = ?", workspaceID, "channel_pinned_task", channelIDStr).
		Order("created_at DESC").
		Find(&tasks).Error

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch pinned tasks"})
	}

	return c.JSON(tasks)
}

// UpdatePinnedTask updates an existing pinned task
func UpdatePinnedTask(c *fiber.Ctx) error {
	workspaceIDStr, _ := c.Locals("workspace_id").(string)
	userIDStr, _ := c.Locals("user_id").(string)
	channelIDStr := c.Params("channelId")
	taskIDStr := c.Params("taskId")

	workspaceID, err := uuid.Parse(workspaceIDStr)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid workspace ID"})
	}

	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid user ID"})
	}

	var payload models.ChannelPinnedTaskPayload
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	tx := database.GetDB(c)
	var entity models.Entity
	if err := tx.Where("id = ? AND workspace_id = ? AND entity_type = ?", taskIDStr, workspaceID, "channel_pinned_task").First(&entity).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Pinned task not found"})
	}

	// Make sure the channel id remains the same
	payload.WorkspaceID = workspaceID
	if channelIDStr != "" {
		parsedChannel, parseErr := uuid.Parse(channelIDStr)
		if parseErr != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid channel ID"})
		}
		payload.ChannelID = parsedChannel
	}

	// Check if this task was originally created by this user or if they are just ticking a box.
	// For now, anyone in the channel can update (the route should be protected by channel membership middleware if any).

	// Convert payload to datatypes.JSON
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to serialize payload"})
	}

	entity.Data = datatypes.JSON(payloadBytes)
	entity.UpdatedAt = time.Now()

	if err := tx.Save(&entity).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update pinned task"})
	}

	// Audit Log
	metadata := map[string]string{"channel_id": channelIDStr}
	services.LogEvent(&userID, "entity.pinned_task.update", "Entity", entity.ID.String(), metadata, c.IP())

	// Centrifugo Broadcast
	natsPayload := map[string]interface{}{
		"type":       "system",
		"entityType": "channel_pinned_task",
		"action":     "updated",
		"task":       entity,
	}
	PublishToCentrifugo(ChannelChannel(payload.ChannelID), natsPayload)
	for _, assigneeID := range payload.Assignees {
		PublishToCentrifugo(UserChannel(assigneeID), natsPayload)
	}

	return c.JSON(entity)
}

// DeletePinnedTask deletes a channel_pinned_task entity
func DeletePinnedTask(c *fiber.Ctx) error {
	workspaceIDStr, _ := c.Locals("workspace_id").(string)
	userIDStr, _ := c.Locals("user_id").(string)
	channelIDStr := c.Params("channelId")
	taskIDStr := c.Params("taskId")

	workspaceID, err := uuid.Parse(workspaceIDStr)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid workspace ID"})
	}

	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid user ID"})
	}

	taskID, err := uuid.Parse(taskIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid task ID"})
	}
	channelID, err := uuid.Parse(channelIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid channel ID"})
	}

	tx := database.GetDB(c)
	if err := tx.Where("workspace_id = ? AND entity_type = ? AND data->>'channel_id' = ?", workspaceID, "channel_pinned_task", channelIDStr).
		Delete(&models.Entity{ID: taskID}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete pinned task"})
	}

	services.LogEvent(&userID, "entity.pinned_task.delete", "Entity", taskID.String(), nil, c.IP())

	// Centrifugo Broadcast: we just send the deleted ID to let clients remove it
	PublishToCentrifugo(ChannelChannel(channelID), map[string]interface{}{
		"type":       "system",
		"entityType": "channel_pinned_task",
		"action":     "delete",
		"deleted_id": taskID,
	})

	return c.SendStatus(fiber.StatusNoContent)
}

// GetMyPinnedTasks returns all active pinned tasks assigned to the current user
func GetMyPinnedTasks(c *fiber.Ctx) error {
	workspaceIDStr, _ := c.Locals("workspace_id").(string)
	userIDStr, _ := c.Locals("user_id").(string)

	workspaceID, err := uuid.Parse(workspaceIDStr)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid workspace ID"})
	}

	tx := database.GetDB(c)
	var tasks []models.Entity

	// jsonb_exists is equivalent to the `?` operator without colliding with
	// GORM's own `?` placeholders.
	err = tx.Where("workspace_id = ? AND entity_type = ? AND jsonb_exists(data->'assignees', ?)", workspaceID, "channel_pinned_task", userIDStr).
		Order("created_at DESC").
		Find(&tasks).Error

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch tasks"})
	}

	return c.JSON(tasks)
}
