package middleware

import (
	"log"
	"strings"

	"github.com/gofiber/fiber/v2"
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
		if err := database.DB.Preload("RoleRef").Where("id = ?", userID).First(&user).Error; err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "user not found"})
		}

		// If user role string is "Admin" or "SuperAdmin", allow bypass immediately
		if strings.EqualFold(user.Role, "admin") || strings.EqualFold(user.Role, "superadmin") {
			return c.Next()
		}
		if user.RoleRef != nil && (strings.EqualFold(user.RoleRef.Name, "admin") || strings.EqualFold(user.RoleRef.Name, "superadmin")) {
			return c.Next()
		}

		// If user has no role or is a basic guest with no permissions
		if user.RoleID == nil {
			log.Printf("Access denied: User %s has no role. Required: %s", userID, requiredPermission)
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "access denied: insufficient permissions"})
		}

		// Check RolePermission mapping
		var count int64
		database.DB.Model(&models.RolePermission{}).
			Joins("JOIN permissions ON role_permissions.permission_id = permissions.id").
			Where("role_permissions.role_id = ? AND permissions.name = ?", user.RoleID, requiredPermission).
			Count(&count)

		if count == 0 {
			log.Printf("Access denied: User %s (Role: %s) missing permission %s", userID, user.RoleRef.Name, requiredPermission)
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "access denied: insufficient permissions"})
		}

		return c.Next()
	}
}
