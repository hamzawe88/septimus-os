package main

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

type backendSessionIdentity struct {
	UserID      string `json:"user_id"`
	WorkspaceID string `json:"workspace_id"`
}

func validateBackendSession(tokenString string) (*backendSessionIdentity, int) {
	backendURL := strings.TrimRight(strings.TrimSpace(os.Getenv("BACKEND_URL")), "/")
	internalToken := strings.TrimSpace(os.Getenv("INTERNAL_API_TOKEN"))
	if backendURL == "" || internalToken == "" {
		return nil, fiber.StatusServiceUnavailable
	}

	req, err := http.NewRequest(http.MethodGet, backendURL+"/internal/auth/session", nil)
	if err != nil {
		return nil, fiber.StatusServiceUnavailable
	}
	req.Header.Set("Authorization", "Bearer "+tokenString)
	req.Header.Set("X-Internal-Token", internalToken)

	response, err := (&http.Client{Timeout: 5 * time.Second}).Do(req)
	if err != nil {
		return nil, fiber.StatusServiceUnavailable
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusUnauthorized || response.StatusCode == http.StatusForbidden {
		return nil, fiber.StatusUnauthorized
	}
	if response.StatusCode != http.StatusOK {
		return nil, fiber.StatusServiceUnavailable
	}

	var identity backendSessionIdentity
	if err := json.NewDecoder(io.LimitReader(response.Body, 4096)).Decode(&identity); err != nil {
		return nil, fiber.StatusServiceUnavailable
	}
	if strings.TrimSpace(identity.UserID) == "" || strings.TrimSpace(identity.WorkspaceID) == "" {
		return nil, fiber.StatusServiceUnavailable
	}
	return &identity, fiber.StatusOK
}

// JWTAuthMiddleware delegates authentication to backend-core, which validates
// signature, issuer, audience, expiry, and the revocable AuthSession record.
func JWTAuthMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		// The browser keeps the application JWT in a HttpOnly cookie. Direct
		// bearer use remains available to trusted clients, but Drive must accept
		// the same signed session after the frontend's same-origin proxy forwards
		// it. A malformed Authorization header is never silently bypassed.
		tokenString := c.Cookies("septimus_session")
		if authHeader := c.Get("Authorization"); authHeader != "" {
			parts := strings.Split(authHeader, " ")
			if len(parts) != 2 || parts[0] != "Bearer" {
				return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid Authorization format"})
			}
			tokenString = parts[1]
		}
		if tokenString == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Missing authentication"})
		}

		identity, validationStatus := validateBackendSession(tokenString)
		if validationStatus == fiber.StatusUnauthorized {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid, expired, or revoked session"})
		}
		if validationStatus != fiber.StatusOK {
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "Session validation is unavailable"})
		}
		c.Locals("user_id", identity.UserID)
		c.Locals("workspace_id", identity.WorkspaceID)

		return c.Next()
	}
}

// InternalAuthMiddleware verifies the X-Internal-Token for AI sidecar communication
func InternalAuthMiddleware() fiber.Handler {
	internalToken := os.Getenv("INTERNAL_API_TOKEN")
	if internalToken == "" {
		return func(c *fiber.Ctx) error {
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "INTERNAL_API_TOKEN is not configured"})
		}
	}

	return func(c *fiber.Ctx) error {
		reqToken := c.Get("X-Internal-Token")
		if reqToken != internalToken {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid internal token"})
		}
		return c.Next()
	}
}
