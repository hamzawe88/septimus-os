package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
)

type UpdateMemberRoleRequest struct {
	UserID string `json:"user_id"`
	Role   string `json:"role"` // OWNER, ADMIN, MODERATOR, MEMBER
}

type MuteMemberRequest struct {
	UserID  string `json:"user_id"`
	IsMuted bool   `json:"is_muted"`
}

// UpdateMemberRole allows OWNER or ADMIN to change someone's role
func UpdateMemberRole(c *fiber.Ctx) error {
	channelID := c.Params("id")
	adminID, _ := c.Locals("user_id").(string)

	var req UpdateMemberRoleRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	// Check if the current user has permission
	var adminMember models.ChannelMember
	if err := database.GetDB(c).Where("channel_id = ? AND user_id = ?", channelID, adminID).First(&adminMember).Error; err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "You are not a member of this channel"})
	}

	if adminMember.Role != "OWNER" && adminMember.Role != "ADMIN" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Only admins can change roles"})
	}

	// Prevent downgrading the OWNER unless by another OWNER (or prevent it altogether for simplicity)
	var targetMember models.ChannelMember
	if err := database.GetDB(c).Where("channel_id = ? AND user_id = ?", channelID, req.UserID).First(&targetMember).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Target user is not a member of this channel"})
	}

	if targetMember.Role == "OWNER" && adminMember.Role != "OWNER" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Only owners can modify other owners"})
	}

	// Validate role
	if req.Role != "OWNER" && req.Role != "ADMIN" && req.Role != "MODERATOR" && req.Role != "MEMBER" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid role"})
	}

	targetMember.Role = req.Role
	if err := database.GetDB(c).Save(&targetMember).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update role"})
	}

	return c.JSON(targetMember)
}

// MuteMember allows OWNER, ADMIN, or MODERATOR to mute/unmute a MEMBER
func MuteMember(c *fiber.Ctx) error {
	channelID := c.Params("id")
	adminID, _ := c.Locals("user_id").(string)

	var req MuteMemberRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	var adminMember models.ChannelMember
	if err := database.GetDB(c).Where("channel_id = ? AND user_id = ?", channelID, adminID).First(&adminMember).Error; err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "You are not a member of this channel"})
	}

	if adminMember.Role != "OWNER" && adminMember.Role != "ADMIN" && adminMember.Role != "MODERATOR" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "You do not have permission to mute users"})
	}

	var targetMember models.ChannelMember
	if err := database.GetDB(c).Where("channel_id = ? AND user_id = ?", channelID, req.UserID).First(&targetMember).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Target user is not a member of this channel"})
	}

	// Prevent muting admins/owners/moderators unless you are higher tier
	if targetMember.Role == "OWNER" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Cannot mute the owner"})
	}
	if (targetMember.Role == "ADMIN" || targetMember.Role == "MODERATOR") && adminMember.Role == "MODERATOR" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Moderators can only mute normal members"})
	}

	targetMember.IsMuted = req.IsMuted
	if err := database.GetDB(c).Save(&targetMember).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update mute status"})
	}

	return c.JSON(targetMember)
}
