package handlers

import (
	"log"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
	"gorm.io/datatypes"
)

// SaveSettings handles saving JSON settings for a workspace under a specific key
func SaveSettings(c *fiber.Ctx) error {
	workspaceIDStr := c.Query("workspace_id")
	key := c.Params("key")

	if workspaceIDStr == "" || key == "" {
		return c.Status(400).JSON(fiber.Map{"error": "workspace_id and key are required"})
	}

	workspaceID := database.ParseUUID(workspaceIDStr)
	if workspaceID == uuid.Nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid workspace_id"})
	}

	// We expect the body to be valid JSON
	var payload interface{}
	if err := c.BodyParser(&payload); err != nil {
		log.Printf("Error parsing settings payload: %v", err)
		return c.Status(400).JSON(fiber.Map{"error": "invalid JSON"})
	}

	jsonBytes, err := c.App().Config().JSONEncoder(payload)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to encode settings"})
	}

	var setting models.WorkspaceSetting
	result := database.DB.Where("workspace_id = ? AND key = ?", workspaceID, key).First(&setting)

	if result.Error == nil {
		// Update
		setting.Value = datatypes.JSON(jsonBytes)
		if err := database.DB.Save(&setting).Error; err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "failed to update settings"})
		}
	} else {
		// Create
		setting = models.WorkspaceSetting{
			WorkspaceID: workspaceID,
			Key:         key,
			Value:       datatypes.JSON(jsonBytes),
		}
		if err := database.DB.Create(&setting).Error; err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "failed to create settings"})
		}
	}

	var uid *uuid.UUID
	if idStr, ok := c.Locals("user_id").(string); ok && idStr != "" {
		if parsed := database.ParseUUID(idStr); parsed != uuid.Nil {
			uid = &parsed
		}
	}
	services.LogEvent(uid, "settings.update", "WorkspaceSetting", key, payload, c.IP())

	return c.JSON(fiber.Map{"status": "success", "setting": setting})
}

// GetSettings retrieves settings by key
func GetSettings(c *fiber.Ctx) error {
	workspaceIDStr := c.Query("workspace_id")
	key := c.Params("key")

	if workspaceIDStr == "" || key == "" {
		return c.Status(400).JSON(fiber.Map{"error": "workspace_id and key are required"})
	}

	workspaceID := database.ParseUUID(workspaceIDStr)
	if workspaceID == uuid.Nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid workspace_id"})
	}

	var setting models.WorkspaceSetting
	result := database.DB.Where("workspace_id = ? AND key = ?", workspaceID, key).First(&setting)

	if result.Error != nil {
		return c.Status(404).JSON(fiber.Map{"error": "settings not found"})
	}

	// Unmarshal JSON to return raw structure instead of string
	var val interface{}
	_ = c.App().Config().JSONDecoder(setting.Value, &val)

	return c.JSON(val)
}
