package handlers

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
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

// GetChannelMembers returns all members of a channel
func GetChannelMembers(c *fiber.Ctx) error {
	channelID := c.Params("id")
	userID, _ := c.Locals("user_id").(string)

	// verify user is a member of the channel or it is public
	var channel models.Channel
	if err := database.GetDB(c).First(&channel, "id = ?", channelID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Channel not found"})
	}

	if channel.Type == "PRIVATE" {
		var member models.ChannelMember
		if err := database.GetDB(c).Where("channel_id = ? AND user_id = ?", channelID, userID).First(&member).Error; err != nil {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "You are not a member of this channel"})
		}
	}

	var members []models.ChannelMember
	if err := database.GetDB(c).Preload("User").Where("channel_id = ?", channelID).Find(&members).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch members"})
	}

	return c.JSON(members)
}

type AddChannelMemberRequest struct {
	Email string `json:"email"`
}

// AddChannelMember adds a user to a private channel by email
func AddChannelMember(c *fiber.Ctx) error {
	channelID := c.Params("id")
	adminID, _ := c.Locals("user_id").(string)
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Workspace context is required"})
	}

	var req AddChannelMemberRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if req.Email == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Email is required"})
	}

	var channel models.Channel
	if err := database.GetDB(c).Select("id").Where("id = ? AND workspace_id = ?", channelID, workspaceID).First(&channel).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Channel not found"})
	}

	var adminMember models.ChannelMember
	if err := database.GetDB(c).Where("channel_id = ? AND user_id = ?", channelID, adminID).First(&adminMember).Error; err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "You are not a member of this channel"})
	}

	if adminMember.Role != "OWNER" && adminMember.Role != "ADMIN" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Only admins can add members"})
	}

	var targetUser models.User
	if err := database.GetDB(c).Where("LOWER(email) = ? AND workspace_id = ?", req.Email, workspaceID).First(&targetUser).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found"})
	}

	var existingMember models.ChannelMember
	if err := database.GetDB(c).Where("channel_id = ? AND user_id = ?", channelID, targetUser.ID).First(&existingMember).Error; err == nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "User is already a member"})
	}

	parsedChannelID, err := uuid.Parse(channelID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid channel ID"})
	}

	newMember := models.ChannelMember{
		ChannelID: parsedChannelID,
		UserID:    targetUser.ID,
		Role:      "MEMBER",
	}

	if err := database.GetDB(c).Create(&newMember).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to add member"})
	}

	// preload User to return it
	database.GetDB(c).Preload("User").First(&newMember, "channel_id = ? AND user_id = ?", channelID, targetUser.ID)

	return c.JSON(newMember)
}
