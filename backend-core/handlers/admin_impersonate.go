package handlers

import (
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/events"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
)

func ImpersonateUser(c *fiber.Ctx) error {
	adminID, _ := c.Locals("user_id").(string)
	role, _ := c.Locals("role").(string)
	var req struct {
		TargetUserID string `json:"target_user_id"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	targetUserID := req.TargetUserID
	if targetUserID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "target_user_id is required"})
	}

	// 1. Verify Super Admin role
	if role != "super_admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Access denied. Super Admin role required."})
	}

	// 2. Find target user
	var targetUser models.User
	if err := database.DB.Where("id = ?", targetUserID).First(&targetUser).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Target user not found"})
	}

	// 3. Generate a revocable 15-minute session.
	tokenString, err := issueUserSession(database.DB, targetUser, 15*time.Minute, map[string]interface{}{
		"is_impersonated":   true,
		"original_admin_id": adminID,
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Could not create impersonation session"})
	}
	setSessionCookie(c, tokenString, 15*time.Minute)

	// 4. Audit Log
	adminUUID := database.ParseUUID(adminID)
	metadata := map[string]string{
		"target_user_id": targetUser.ID.String(),
		"ip_address":     c.IP(),
		"session_ttl":    "15m",
	}
	// Using entity "User" as per blueprint
	services.LogEvent(&adminUUID, "auth.impersonate_user", "User", adminID, metadata, c.IP())

	// 5. Publish to NATS JetStream for AI Sidecar monitoring
	natsMsg := map[string]interface{}{
		"action":            "auth.impersonate_user",
		"original_admin_id": adminID,
		"target_user_id":    targetUser.ID.String(),
		"target_workspace":  targetUser.WorkspaceID.String(),
		"timestamp":         time.Now().UTC().Format(time.RFC3339),
		"metadata":          metadata,
	}

	// Stamped with the workspace being entered, so audit consumers can file the
	// event under the right tenant instead of inferring one.
	err = events.PublishTenantEvent("events.audit.impersonation.started", targetUser.WorkspaceID, natsMsg)
	if err != nil {
		fmt.Println("Warning: Failed to publish impersonation event:", err)
	}

	return c.JSON(fiber.Map{
		"user": fiber.Map{
			"id":              targetUser.ID,
			"email":           targetUser.Email,
			"workspace_id":    targetUser.WorkspaceID,
			"role":            targetUser.Role,
			"is_impersonated": true,
		},
	})
}
