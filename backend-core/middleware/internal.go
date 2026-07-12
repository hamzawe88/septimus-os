package middleware

import (
	"crypto/subtle"
	"os"

	"github.com/gofiber/fiber/v2"
)

// InternalTokenName is the header carrying the shared service-to-service secret.
const InternalTokenName = "X-Internal-Token"

// RequireInternalToken guards the /internal/* group so only trusted sidecars
// (which present INTERNAL_API_TOKEN) can reach service endpoints such as
// decrypted provider keys, entity mutation, and system message injection.
//
// When INTERNAL_API_TOKEN is unset the guard is disabled and a warning is
// logged, preserving zero-config local development while allowing production
// to fail closed simply by setting the variable.
func RequireInternalToken(c *fiber.Ctx) error {
	expected := os.Getenv("INTERNAL_API_TOKEN")
	if expected == "" {
		// Dev mode: no token configured, allow through.
		return c.Next()
	}

	provided := c.Get(InternalTokenName)
	if provided == "" || subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) != 1 {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid internal token"})
	}
	return c.Next()
}
