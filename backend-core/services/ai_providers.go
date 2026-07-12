package services

import (
	"encoding/json"
	"errors"
	"os"

	"github.com/google/uuid"

	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services/crypto"
)

// providerSetting mirrors one entry of the workspace `ai_providers` JSON array
// (the same shape the settings UI saves and the sidecar reads).
type providerSetting struct {
	Provider string `json:"provider"`
	APIKey   string `json:"apiKey"`
	IsActive bool   `json:"isActive"`
	BaseURL  string `json:"baseUrl"`
}

// GetProviderKey returns the decrypted API key for the named provider from the
// workspace `ai_providers` settings — the single source of truth for provider
// keys across the whole system (chat, embeddings, sidecar). Falls back to env
// vars for well-known providers when the setting is absent.
//
// Note: embeddings always use Gemini regardless of the active chat provider, so
// callers look up "gemini" specifically; a stored gemini key is used even when
// another provider is the active chat model.
func GetProviderKey(workspaceID uuid.UUID, provider string) (string, error) {
	var setting models.WorkspaceSetting
	if err := database.DB.Where("workspace_id = ? AND key = ?", workspaceID, "ai_providers").First(&setting).Error; err == nil {
		var providers []providerSetting
		if err := json.Unmarshal(setting.Value, &providers); err == nil {
			for _, p := range providers {
				if p.Provider == provider && p.APIKey != "" {
					return crypto.Decrypt(p.APIKey)
				}
			}
		}
	}

	// Env fallback for well-known providers (dev / unconfigured workspaces).
	switch provider {
	case "gemini":
		if k := os.Getenv("GOOGLE_API_KEY"); k != "" {
			return k, nil
		}
	case "openai":
		if k := os.Getenv("OPENAI_API_KEY"); k != "" {
			return k, nil
		}
	}
	return "", errors.New("no api key configured for provider " + provider)
}
