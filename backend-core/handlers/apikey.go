package handlers

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/datatypes"
)

type CreateAPIKeyInput struct {
	Name   string   `json:"name"`
	Scopes []string `json:"scopes"`
}

func generateRandomString(n int) (string, error) {
	b := make([]byte, n)
	_, err := rand.Read(b)
	if err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(b), nil
}

func CreateAPIKey(c *fiber.Ctx) error {
	workspaceIDStr, _ := c.Locals("workspace_id").(string)
	workspaceID, err := uuid.Parse(workspaceIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid workspace ID"})
	}

	var input CreateAPIKeyInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request input"})
	}

	if len(input.Scopes) == 0 {
		input.Scopes = []string{"*"}
	}
	scopesJSON, _ := json.Marshal(input.Scopes)

	// Generate raw API key: sk_live_<random>
	randomStr, err := generateRandomString(32)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to generate key"})
	}
	rawKey := "sk_live_" + randomStr

	// Hash it for storage
	hasher := sha256.New()
	hasher.Write([]byte(rawKey))
	hashedKey := hex.EncodeToString(hasher.Sum(nil))

	apiKey := models.APIKey{
		WorkspaceID: workspaceID,
		Name:        input.Name,
		KeyHash:     hashedKey,
		Scopes:      datatypes.JSON(scopesJSON),
		IsActive:    true,
	}

	if err := database.GetDB(c).Create(&apiKey).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create API key"})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"id":         apiKey.ID,
		"name":       apiKey.Name,
		"scopes":     input.Scopes,
		"secret_key": rawKey, // ONLY RETURNED ONCE!
		"created_at": apiKey.CreatedAt,
	})
}

func GetAPIKeys(c *fiber.Ctx) error {
	workspaceIDStr, _ := c.Locals("workspace_id").(string)
	workspaceID, err := uuid.Parse(workspaceIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid workspace ID"})
	}

	var keys []models.APIKey
	if err := database.GetDB(c).Where("workspace_id = ?", workspaceID).Find(&keys).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch API keys"})
	}

	return c.JSON(keys)
}

func RevokeAPIKey(c *fiber.Ctx) error {
	idStr := c.Params("id")
	workspaceIDStr, _ := c.Locals("workspace_id").(string)

	if err := database.GetDB(c).Model(&models.APIKey{}).
		Where("id = ? AND workspace_id = ?", idStr, workspaceIDStr).
		Update("is_active", false).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to revoke API key"})
	}

	return c.SendStatus(fiber.StatusNoContent)
}
