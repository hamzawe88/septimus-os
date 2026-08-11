package middleware

import (
	"log"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// RequireRole gates a route on the caller's workspace role claim. Role strings
// are stored inconsistently across the codebase ("ADMIN", "admin", "Owner"), so
// matching is case-insensitive. super_admin always passes.
//
// Use this for routes that are privileged by seniority rather than by a named
// permission; CheckPermission remains the right tool when a permission row
// exists for the action.
func RequireRole(allowed ...string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		role, _ := c.Locals("role").(string)
		if role == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
		}
		if strings.EqualFold(role, "super_admin") || strings.EqualFold(role, "superadmin") {
			return c.Next()
		}
		for _, a := range allowed {
			if strings.EqualFold(role, a) {
				return c.Next()
			}
		}
		log.Printf("Access denied: role %q not in %v for %s", role, allowed, c.Path())
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "access denied: insufficient role"})
	}
}
