package handlers

import (
	"encoding/json"
	"log"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
	"github.com/septimus-os/backend-core/services/crypto"
	"gorm.io/datatypes"
)

// aiProvidersKey is the settings key whose payload carries provider API keys
// that must be encrypted at rest and never returned in cleartext to browsers.
const aiProvidersKey = "ai_providers"

// callerWorkspaceID returns the workspace from the authenticated caller's JWT
// claims only. Unlike getWorkspaceID it never falls back to ?workspace_id —
// settings routes must not let a client name the tenant they act on.
func callerWorkspaceID(c *fiber.Ctx) uuid.UUID {
	str, _ := c.Locals("workspace_id").(string)
	if str == "" {
		return uuid.Nil
	}
	return database.ParseUUID(str)
}

// SaveSettings handles saving JSON settings for a workspace under a specific key
func SaveSettings(c *fiber.Ctx) error {
	key := c.Params("key")
	if key == "" {
		return c.Status(400).JSON(fiber.Map{"error": "key is required"})
	}

	// The workspace comes from the JWT, never from ?workspace_id. This route is
	// only JWT-protected, not permission-gated, so honouring the query param let
	// any authenticated user overwrite another tenant's settings — including
	// ai_providers, i.e. repointing that tenant's LLM baseUrl at a host they
	// control. ?workspace_id is now ignored: the frontend still sends one from
	// localStorage, which can legitimately be stale, so rejecting a mismatch
	// would lock real users out of their own settings for no security gain.
	// A mismatch is logged instead — it is either a stale client or a probe.
	workspaceID := callerWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	if q := c.Query("workspace_id"); q != "" && database.ParseUUID(q) != workspaceID {
		log.Printf("settings: ignoring ?workspace_id=%s for caller in workspace %s", q, workspaceID)
	}

	// We expect the body to be valid JSON
	var payload interface{}
	if err := c.BodyParser(&payload); err != nil {
		log.Printf("Error parsing settings payload: %v", err)
		return c.Status(400).JSON(fiber.Map{"error": "invalid JSON"})
	}

	// Encrypt provider API keys before persisting. An empty incoming key means
	// "keep the existing one" so the masked value the UI renders never clobbers
	// a real secret on re-save.
	if key == aiProvidersKey {
		var err error
		payload, err = encryptProviderKeys(workspaceID, payload)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "could not encrypt provider credentials"})
		}
	}

	jsonBytes, err := c.App().Config().JSONEncoder(payload)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to encode settings"})
	}

	var setting models.WorkspaceSetting
	result := database.GetDB(c).Where("workspace_id = ? AND key = ?", workspaceID, key).First(&setting)

	if result.Error == nil {
		// Update
		setting.Value = datatypes.JSON(jsonBytes)
		if err := database.GetDB(c).Save(&setting).Error; err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "failed to update settings"})
		}
	} else {
		// Create
		setting = models.WorkspaceSetting{
			WorkspaceID: workspaceID,
			Key:         key,
			Value:       datatypes.JSON(jsonBytes),
		}
		if err := database.GetDB(c).Create(&setting).Error; err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "failed to create settings"})
		}
	}

	var uid *uuid.UUID
	if idStr, ok := c.Locals("user_id").(string); ok && idStr != "" {
		if parsed := database.ParseUUID(idStr); parsed != uuid.Nil {
			uid = &parsed
		}
	}
	// Log the sanitized (masked) payload — never the raw secrets.
	logPayload := payload
	if key == aiProvidersKey {
		logPayload = maskProviderKeys(payload)
	}
	services.LogEvent(uid, "settings.update", "WorkspaceSetting", key, logPayload, c.IP())

	return c.JSON(fiber.Map{"status": "success"})
}

// GetSettings retrieves settings by key for browser-facing (JWT-protected)
// callers. Provider API keys are masked so secrets never reach the client.
func GetSettings(c *fiber.Ctx) error {
	return getSettings(c, false, callerWorkspaceID(c))
}

// GetSettingsInternal retrieves settings by key for trusted service-to-service
// callers (the AI sidecar) reachable only via the internal, token-gated group.
// Provider API keys are returned decrypted.
func GetSettingsInternal(c *fiber.Ctx) error {
	// The internal workspace middleware authenticated and validated this header.
	// Query parameters are deliberately ignored so a sidecar payload cannot read
	// another tenant's decrypted provider credentials.
	return getSettings(c, true, CurrentWorkspaceID(c))
}

// getSettings reads one settings key. workspaceID is supplied by the caller —
// derived from the JWT for browser routes, from the query for internal ones —
// so a browser can never read another tenant's settings by changing a param.
func getSettings(c *fiber.Ctx, decrypt bool, workspaceID uuid.UUID) error {
	key := c.Params("key")

	if key == "" {
		return c.Status(400).JSON(fiber.Map{"error": "key is required"})
	}
	if workspaceID == uuid.Nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid workspace_id"})
	}

	var setting models.WorkspaceSetting
	result := database.GetDB(c).Where("workspace_id = ? AND key = ?", workspaceID, key).First(&setting)

	if result.Error != nil {
		return c.Status(404).JSON(fiber.Map{"error": "settings not found"})
	}

	// Unmarshal JSON to return raw structure instead of string
	var val interface{}
	_ = c.App().Config().JSONDecoder(setting.Value, &val)

	if key == aiProvidersKey {
		if decrypt {
			val = decryptProviderKeys(val)
		} else {
			val = maskProviderKeys(val)
		}
	}

	return c.JSON(val)
}

// ── Provider-key transforms ──────────────────────────────────────────────────

// providerList coerces the settings payload into a slice of provider objects.
func providerList(payload interface{}) []map[string]interface{} {
	raw, ok := payload.([]interface{})
	if !ok {
		return nil
	}
	out := make([]map[string]interface{}, 0, len(raw))
	for _, item := range raw {
		if m, ok := item.(map[string]interface{}); ok {
			out = append(out, m)
		}
	}
	return out
}

// encryptProviderKeys encrypts each non-empty apiKey. An empty (or masked)
// incoming key is replaced with the currently stored ciphertext for that
// provider, so the UI can safely re-save without resubmitting the secret.
func encryptProviderKeys(workspaceID uuid.UUID, payload interface{}) (interface{}, error) {
	providers := providerList(payload)
	if providers == nil {
		return payload, nil
	}

	// Load existing stored (still-encrypted) keys keyed by provider id.
	existing := map[string]string{}
	var setting models.WorkspaceSetting
	if err := database.DB.Where("workspace_id = ? AND key = ?", workspaceID, aiProvidersKey).First(&setting).Error; err == nil {
		var prev interface{}
		if err := json.Unmarshal(setting.Value, &prev); err == nil {
			for _, p := range providerList(prev) {
				if id, ok := p["id"].(string); ok {
					if k, ok := p["apiKey"].(string); ok {
						existing[id] = k
					}
				}
			}
		}
	}

	for _, p := range providers {
		id, _ := p["id"].(string)
		incoming, _ := p["apiKey"].(string)

		if incoming == "" || isMasked(incoming) {
			// Preserve whatever is already stored (already ciphertext).
			if prev, ok := existing[id]; ok {
				p["apiKey"] = prev
			} else {
				p["apiKey"] = ""
			}
			continue
		}
		enc, err := crypto.Encrypt(incoming)
		if err != nil {
			log.Printf("settings: could not encrypt api key for %q: %v", id, err)
			return nil, err
		}
		p["apiKey"] = enc
	}
	return payload, nil
}

// maskProviderKeys replaces stored keys with a display-safe mask.
func maskProviderKeys(payload interface{}) interface{} {
	for _, p := range providerList(payload) {
		stored, _ := p["apiKey"].(string)
		plain, err := crypto.Decrypt(stored)
		if err != nil {
			plain = stored
		}
		p["apiKey"] = crypto.Mask(plain)
		p["hasApiKey"] = plain != ""
	}
	return payload
}

// decryptProviderKeys returns real cleartext keys for internal callers.
func decryptProviderKeys(payload interface{}) interface{} {
	for _, p := range providerList(payload) {
		stored, _ := p["apiKey"].(string)
		plain, err := crypto.Decrypt(stored)
		if err != nil {
			continue
		}
		p["apiKey"] = plain
	}
	return payload
}

// isMasked reports whether an incoming apiKey is the display mask the UI
// rendered (it contains bullet characters), which must never overwrite the
// real stored secret. The UI never submits bullets for a genuinely new key.
func isMasked(v string) bool {
	return strings.ContainsRune(v, '•')
}
