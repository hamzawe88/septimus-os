package middleware

import (
	"crypto/subtle"
	"log"
	"os"

	"github.com/gofiber/fiber/v2"
)

// InternalTokenName is the header carrying the shared service-to-service secret.
const InternalTokenName = "X-Internal-Token"

// RequireInternalToken guards the /internal/* group so only trusted sidecars
// (which present INTERNAL_API_TOKEN) can reach service endpoints such as
// decrypted provider keys, entity mutation, and system message injection.
//
// The service boundary is fail-closed. Local development may opt into the
// insecure mode explicitly with ALLOW_INSECURE_DEV_AUTH=true; an empty token
// must never silently turn internal endpoints into public endpoints.
func RequireInternalToken(c *fiber.Ctx) error {
	expected := os.Getenv("INTERNAL_API_TOKEN")
	if expected == "" {
		if os.Getenv("APP_ENV") == "development" && os.Getenv("ALLOW_INSECURE_DEV_AUTH") == "true" {
			log.Printf("WARNING: allowing unauthenticated internal request in explicit development mode: %s", c.Path())
			return c.Next()
		}
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "internal service authentication is not configured"})
	}

	provided := c.Get(InternalTokenName)
	if provided == "" || subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) != 1 {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid internal token"})
	}
	return c.Next()
}
