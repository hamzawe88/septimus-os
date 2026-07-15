package handlers

import (
	"log"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
)

type SaveFactRequest struct {
	Content     string `json:"content"`
	WorkspaceID string `json:"workspace_id"`
}

func SaveInstitutionalFact(c *fiber.Ctx) error {
	var req SaveFactRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON"})
	}

	content := strings.TrimSpace(req.Content)
	if content == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "content is required"})
	}

	var workspaceID uuid.UUID
	if req.WorkspaceID != "" {
		workspaceID = database.ParseUUID(req.WorkspaceID)
	}
	if workspaceID == uuid.Nil {
		if val := c.Locals("workspace_id"); val != nil {
			if str, ok := val.(string); ok {
				workspaceID = database.ParseUUID(str)
			}
		}
	}
	if workspaceID == uuid.Nil {
		workspaceID = resolveDefaultWorkspaceID()
	}

	entityID := uuid.New()
	if err := services.StoreEmbedding(workspaceID, "fact", entityID, content); err != nil {
		log.Printf("SaveInstitutionalFact failed: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to store fact embedding"})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"id":           entityID,
		"workspace_id": workspaceID,
		"content":      content,
		"entity_type":  "fact",
	})
}

func GetInstitutionalFacts(c *fiber.Ctx) error {
	var workspaceID uuid.UUID
	if val := c.Locals("workspace_id"); val != nil {
		if str, ok := val.(string); ok {
			workspaceID = database.ParseUUID(str)
		}
	}
	if workspaceID == uuid.Nil {
		if qId := c.Query("workspace_id"); qId != "" {
			workspaceID = database.ParseUUID(qId)
		}
	}
	if workspaceID == uuid.Nil {
		workspaceID = resolveDefaultWorkspaceID()
	}

	var facts []models.DocumentEmbedding
	if err := database.DB.Where("workspace_id = ? AND entity_type = ?", workspaceID, "fact").Order("created_at desc").Find(&facts).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch facts"})
	}

	var out []fiber.Map
	for _, f := range facts {
		out = append(out, fiber.Map{
			"id":           f.ID,
			"entity_id":    f.EntityID,
			"workspace_id": f.WorkspaceID,
			"content":      f.Content,
			"created_at":   f.CreatedAt,
		})
	}
	return c.JSON(fiber.Map{"facts": out})
}

func DeleteInstitutionalFact(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "fact id is required"})
	}

	factUUID := database.ParseUUID(id)
	if factUUID == uuid.Nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid fact uuid"})
	}

	result := database.DB.Where("id = ? OR entity_id = ?", factUUID, factUUID).Delete(&models.DocumentEmbedding{})
	if result.Error != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to delete fact"})
	}
	return c.JSON(fiber.Map{"success": true, "deleted_rows": result.RowsAffected})
}
