package handlers

import (
	"encoding/base64"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
)

const maxWorkDocStateBytes = 16 * 1024 * 1024

// CheckWorkDocAccess is used by the authenticated Yjs gateway. The gateway
// cannot safely infer tenant membership from a document name, so it asks the
// backend with the signed service token and both JWT-derived identities.
func CheckWorkDocAccess(c *fiber.Ctx) error {
	documentID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid document id"})
	}
	workspaceID, err := uuid.Parse(c.Get("X-Workspace-ID"))
	if err != nil || workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	userID, err := uuid.Parse(c.Get("X-User-ID"))
	if err != nil || userID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "user context is required"})
	}

	var user models.User
	if err := database.DB.Select("id").Where("id = ? AND workspace_id = ?", userID, workspaceID).First(&user).Error; err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "user is not a workspace member"})
	}

	var document models.WorkDoc
	if err := database.DB.Model(&models.WorkDoc{}).
		Joins("JOIN projects ON projects.id = work_docs.project_id").
		Where("work_docs.id = ? AND projects.workspace_id = ?", documentID, workspaceID).
		First(&document).Error; err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "document is not in this workspace"})
	}

	return c.SendStatus(fiber.StatusNoContent)
}

// GetWorkDocStateInternal returns the durable Yjs update for a document. It is
// intentionally only exposed to the authenticated collaboration service; user
// authorization is checked before that service opens the document.
func GetWorkDocStateInternal(c *fiber.Ctx) error {
	documentID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid document id"})
	}
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}

	var document models.WorkDoc
	if err := database.DB.Model(&models.WorkDoc{}).
		Select("work_docs.id", "work_docs.content").
		Joins("JOIN projects ON projects.id = work_docs.project_id").
		Where("work_docs.id = ? AND projects.workspace_id = ?", documentID, workspaceID).
		First(&document).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "document not found"})
	}

	return c.JSON(fiber.Map{"state": document.Content})
}

// SaveWorkDocStateInternal persists a complete Yjs state update. Hocuspocus
// debounces this hook, so the database holds the latest durable snapshot while
// collaboration stays in memory for low-latency editing.
func SaveWorkDocStateInternal(c *fiber.Ctx) error {
	documentID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid document id"})
	}
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}

	var req struct {
		State string `json:"state"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	if len(req.State) > base64.StdEncoding.EncodedLen(maxWorkDocStateBytes) {
		return c.Status(fiber.StatusRequestEntityTooLarge).JSON(fiber.Map{"error": "document state exceeds the maximum size"})
	}
	if req.State != "" {
		state, err := base64.StdEncoding.DecodeString(req.State)
		if err != nil || len(state) > maxWorkDocStateBytes {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid or oversized document state"})
		}
	}

	var document models.WorkDoc
	if err := database.DB.Model(&models.WorkDoc{}).
		Select("work_docs.id").
		Joins("JOIN projects ON projects.id = work_docs.project_id").
		Where("work_docs.id = ? AND projects.workspace_id = ?", documentID, workspaceID).
		First(&document).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "document not found"})
	}
	result := database.DB.Model(&models.WorkDoc{}).Where("id = ?", document.ID).Update("content", strings.TrimSpace(req.State))
	if result.Error != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to save document state"})
	}
	if result.RowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "document not found"})
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func CheckChannelAccess(c *fiber.Ctx) error {
	channelID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel id"})
	}
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	var channel models.Channel
	if err := database.DB.Where("id = ? AND workspace_id = ?", channelID, workspaceID).First(&channel).Error; err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "channel is not in this workspace"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}
