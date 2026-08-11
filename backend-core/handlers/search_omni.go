package handlers

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
)

type omniSearchResult struct {
	ID         uuid.UUID              `json:"id"`
	EntityType string                 `json:"entity_type"`
	Data       map[string]interface{} `json:"data,omitempty"`
	Content    string                 `json:"content,omitempty"`
	Match      string                 `json:"match"`
}

func omniSnippet(content string) string {
	content = strings.Join(strings.Fields(content), " ")
	runes := []rune(content)
	if len(runes) > 280 {
		return string(runes[:280]) + "…"
	}
	return content
}

// SearchOmni combines exact JSONB/entity matches with the shared hybrid
// pgvector + FTS retrieval surface. Exact matches stay first for identifiers
// and names; semantic matches extend recall for natural-language Arabic and
// English queries. Embedding providers are bounded so a missing local model can
// never freeze the command menu.
func SearchOmni(c *fiber.Ctx) error {
	query := strings.TrimSpace(c.Query("q"))
	if len([]rune(query)) < 2 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "query must contain at least two characters"})
	}

	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "workspace context is required"})
	}
	limit := c.QueryInt("limit", 30)
	if limit < 1 {
		limit = 1
	}
	if limit > 50 {
		limit = 50
	}
	entityType := strings.TrimSpace(c.Query("entity_type"))

	exactLimit := limit
	var exact []models.Entity
	exactQuery := database.GetDB(c).
		Where("workspace_id = ?", workspaceID).
		Where("(entity_type ILIKE ? OR data::text ILIKE ?)", "%"+query+"%", "%"+query+"%")
	if entityType != "" {
		exactQuery = exactQuery.Where("entity_type = ?", entityType)
	}
	if err := exactQuery.Order("updated_at DESC").Limit(exactLimit).Find(&exact).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to search entities"})
	}

	searchContext, cancel := context.WithTimeout(context.Background(), 1800*time.Millisecond)
	defer cancel()
	semantic, semanticErr := services.SearchHybridContext(searchContext, workspaceID, entityType, query, limit)

	entityIDs := make([]uuid.UUID, 0, len(semantic))
	for _, result := range semantic {
		if result.EntityID != uuid.Nil {
			entityIDs = append(entityIDs, result.EntityID)
		}
	}
	semanticEntities := map[uuid.UUID]models.Entity{}
	if len(entityIDs) > 0 {
		var entities []models.Entity
		if err := database.GetDB(c).Where("workspace_id = ? AND id IN ?", workspaceID, entityIDs).Find(&entities).Error; err == nil {
			for _, entity := range entities {
				semanticEntities[entity.ID] = entity
			}
		}
	}

	results := make([]omniSearchResult, 0, limit)
	positions := map[uuid.UUID]int{}
	for _, entity := range exact {
		data := map[string]interface{}{}
		_ = json.Unmarshal(entity.Data, &data)
		positions[entity.ID] = len(results)
		results = append(results, omniSearchResult{
			ID: entity.ID, EntityType: entity.EntityType, Data: data, Match: "lexical",
		})
		if len(results) >= limit {
			break
		}
	}
	for _, embedding := range semantic {
		if position, exists := positions[embedding.EntityID]; exists {
			results[position].Match = "hybrid"
			if results[position].Content == "" {
				results[position].Content = omniSnippet(embedding.Content)
			}
			continue
		}
		if len(results) >= limit {
			break
		}
		result := omniSearchResult{
			ID: embedding.EntityID, EntityType: embedding.EntityType,
			Content: omniSnippet(embedding.Content), Match: "semantic",
		}
		if entity, exists := semanticEntities[embedding.EntityID]; exists {
			result.EntityType = entity.EntityType
			result.Data = map[string]interface{}{}
			_ = json.Unmarshal(entity.Data, &result.Data)
		}
		positions[embedding.EntityID] = len(results)
		results = append(results, result)
	}

	response := fiber.Map{"results": results, "query": query, "mode": "hybrid"}
	if semanticErr != nil {
		// Exact and FTS results remain a valid response when the configured dense
		// provider is unavailable. Expose degradation without leaking internals.
		response["semantic_status"] = "degraded"
	} else {
		response["semantic_status"] = "ready"
	}
	return c.JSON(response)
}
