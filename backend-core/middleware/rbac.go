package middleware

import (
	"log"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
)

// CheckPermission returns a middleware that checks if the authenticated user has the required permission
func CheckPermission(requiredPermission string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userIDStr, ok := c.Locals("user_id").(string)
		if !ok || userIDStr == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
		}

		userID := database.ParseUUID(userIDStr)

		var user models.User
		userQuery := database.GetDB(c).Preload("RoleRef").Where("id = ?", userID)
		if global, _ := c.Locals("allow_global_access").(bool); !global {
			workspaceIDStr, ok := c.Locals("workspace_id").(string)
			workspaceID := database.ParseUUID(workspaceIDStr)
			if !ok || workspaceID == uuid.Nil {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
			}
			userQuery = userQuery.Where("workspace_id = ?", workspaceID)
		}
		if err := userQuery.First(&user).Error; err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "user not found"})
		}

		// Workspace owners and admins have full authority inside their tenant;
		// global super-admins retain the control-plane bypass.
		if strings.EqualFold(user.Role, "owner") ||
			strings.EqualFold(user.Role, "admin") ||
			strings.EqualFold(user.Role, "super_admin") ||
			strings.EqualFold(user.Role, "superadmin") {
			return c.Next()
		}
		if user.RoleRef != nil &&
			(strings.EqualFold(user.RoleRef.Name, "owner") ||
				strings.EqualFold(user.RoleRef.Name, "admin") ||
				strings.EqualFold(user.RoleRef.Name, "super_admin") ||
				strings.EqualFold(user.RoleRef.Name, "superadmin")) {
			return c.Next()
		}

		// If user has no role or is a basic guest with no permissions
		if user.RoleID == nil {
			log.Printf("Access denied: User %s has no role. Required: %s", userID, requiredPermission)
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "access denied: insufficient permissions"})
		}

		// Check RolePermission mapping
		var count int64
		database.GetDB(c).Model(&models.RolePermission{}).
			Joins("JOIN permissions ON role_permissions.permission_id = permissions.id").
			Where("role_permissions.role_id = ? AND permissions.name = ?", user.RoleID, requiredPermission).
			Count(&count)

		if count == 0 {
			roleName := user.Role
			if user.RoleRef != nil {
				roleName = user.RoleRef.Name
			}
			log.Printf("Access denied: User %s (Role: %s) missing permission %s", userID, roleName, requiredPermission)
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "access denied: insufficient permissions"})
		}

		return c.Next()
	}
}
