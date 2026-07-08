package middleware

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
)

// hashAPIKey takes a plain API key and returns its SHA256 hash.
func hashAPIKey(key string) string {
	hasher := sha256.New()
	hasher.Write([]byte(key))
	return hex.EncodeToString(hasher.Sum(nil))
}

// RequireAPIKey validates the X-API-Key header against the database.
func RequireAPIKey(c *fiber.Ctx) error {
	apiKeyHeader := c.Get("X-API-Key")
	if apiKeyHeader == "" {
		// Sometimes people send it as Bearer token
		authHeader := c.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			apiKeyHeader = strings.TrimPrefix(authHeader, "Bearer ")
		}
	}

	if apiKeyHeader == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Missing API Key"})
	}

	hashedKey := hashAPIKey(apiKeyHeader)

	var apiKeyRecord models.APIKey
	if err := database.DB.Where("key_hash = ? AND is_active = ?", hashedKey, true).First(&apiKeyRecord).Error; err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid API Key"})
	}

	// Check expiration
	if apiKeyRecord.ExpiresAt != nil && time.Now().After(*apiKeyRecord.ExpiresAt) {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "API Key has expired"})
	}

	// Update LastUsedAt (optional, could be done asynchronously to save latency)
	now := time.Now()
	database.DB.Model(&apiKeyRecord).Update("last_used_at", now)

	// Inject workspace ID for downstream handlers
	c.Locals("workspace_id", apiKeyRecord.WorkspaceID.String())
	c.Locals("api_key_id", apiKeyRecord.ID.String())

	return c.Next()
}
