package handlers

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
)

type UpdateChannelRequest struct {
	Name       string `json:"name"`
	Type       string `json:"type"`
	IsArchived *bool  `json:"is_archived"`
}

// UpdateChannel allows channel owners or admins to modify channel settings
func UpdateChannel(c *fiber.Ctx) error {
	channelID := c.Params("id")
	userID, _ := c.Locals("user_id").(string)
	wsRole, _ := c.Locals("role").(string)
	isAdmin := strings.ToUpper(wsRole) == "ADMIN" || strings.ToUpper(wsRole) == "OWNER"

	// Check permissions
	var member models.ChannelMember
	err := database.GetDB(c).Where("channel_id = ? AND user_id = ?", channelID, userID).First(&member).Error
	if err != nil && !isAdmin {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "You are not a member of this channel"})
	}

	if !isAdmin && member.Role != "OWNER" && member.Role != "ADMIN" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Only admins can modify this channel"})
	}

	var channel models.Channel
	if err := database.GetDB(c).First(&channel, "id = ?", channelID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Channel not found"})
	}

	if channel.IsSystem {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "System channels cannot be modified"})
	}

	var req UpdateChannelRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	if req.Name != "" {
		channel.Name = req.Name
	}
	if req.Type != "" {
		channel.Type = req.Type
	}
	if req.IsArchived != nil {
		channel.IsArchived = *req.IsArchived
	}

	database.GetDB(c).Save(&channel)

	return c.JSON(channel)
}

// DeleteChannel allows channel owners to completely delete a channel
func DeleteChannel(c *fiber.Ctx) error {
	channelID := c.Params("id")
	userID, _ := c.Locals("user_id").(string)
	wsRole, _ := c.Locals("role").(string)
	isAdmin := strings.ToUpper(wsRole) == "ADMIN" || strings.ToUpper(wsRole) == "OWNER"

	var channel models.Channel
	if err := database.GetDB(c).First(&channel, "id = ?", channelID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Channel not found"})
	}

	if channel.IsSystem {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "System channels cannot be deleted"})
	}

	var member models.ChannelMember
	err := database.GetDB(c).Where("channel_id = ? AND user_id = ?", channelID, userID).First(&member).Error
	if err != nil && !isAdmin {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "You are not a member of this channel"})
	}

	// Only owners can delete (unless it is a DM, where any member can delete/close it)
	if !isAdmin && member.Role != "OWNER" && channel.Type != "DM" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Only the channel owner or workspace admin can delete it"})
	}

	// The request already runs inside TenantEnforcer's transaction, so a nested
	// Begin/Commit here detached it ("transaction has already been committed or
	// rolled back"). Use the request handle; returning a fiber error makes the
	// middleware roll back, keeping this multi-step delete atomic.
	tx := database.GetDB(c)

	if err := tx.Where("channel_id = ?", channelID).Delete(&models.Message{}).Error; err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to delete channel messages")
	}

	if err := tx.Where("channel_id = ?", channelID).Delete(&models.ChannelMember{}).Error; err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to delete channel members")
	}

	if err := tx.Where("id = ?", channelID).Delete(&models.Channel{}).Error; err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to delete channel")
	}

	return c.JSON(fiber.Map{"message": "Channel deleted successfully"})
}
