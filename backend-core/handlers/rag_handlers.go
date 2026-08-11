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
)

// IngestEmbeddingsRequest is the batch of text chunks the AI sidecar sends to be
// embedded and stored in the unified `document_embeddings` store (the same
// store entities are indexed into), so documents and entities are searchable
// together through one retrieval surface.
type IngestEmbeddingsRequest struct {
	WorkspaceID string   `json:"workspace_id"`
	EntityType  string   `json:"entity_type"`
	EntityID    string   `json:"entity_id"`
	Chunks      []string `json:"chunks"`
}

// IngestEmbeddings embeds and stores each chunk via the same Gemini-backed path
// used for entity embeddings, guaranteeing one embedding model / dimension
// (768) across the whole knowledge base.
func IngestEmbeddings(c *fiber.Ctx) error {
	var req IngestEmbeddingsRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON"})
	}

	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "workspace_id is required"})
	}
	if req.WorkspaceID != "" && database.ParseUUID(req.WorkspaceID) != workspaceID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace metadata does not match request context"})
	}

	entityType := req.EntityType
	if entityType == "" {
		entityType = "document"
	}
	entityID := database.ParseUUID(req.EntityID)
	if entityID == uuid.Nil {
		entityID = uuid.New()
	}

	indexed := 0
	for _, chunk := range req.Chunks {
		if strings.TrimSpace(chunk) == "" {
			continue
		}
		if err := services.StoreEmbedding(workspaceID, entityType, entityID, chunk); err != nil {
			log.Printf("IngestEmbeddings: failed to store chunk: %v", err)
			continue
		}
		indexed++
	}

	return c.JSON(fiber.Map{"indexed": indexed, "total": len(req.Chunks)})
}

type SemanticSearchResult struct {
	Distance   float32                `json:"distance"` // (1 - Cosine Similarity) or similar metric from pgvector
	EntityType string                 `json:"entity_type"`
	EntityID   uuid.UUID              `json:"entity_id"`
	Content    string                 `json:"content"`
	EntityData map[string]interface{} `json:"entity_data,omitempty"`
}

func SearchSemantic(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "workspace_id is required"})
	}

	query := c.Query("q")
	if query == "" {
		query = c.Query("query", "report") // default search term if empty
	}
	limit := c.QueryInt("limit", 5)
	if limit < 1 {
		limit = 1
	}
	if limit > 50 {
		limit = 50
	}
	entityType := c.Query("entity_type")

	// Hybrid retrieval: dense (pgvector) + lexical (FTS) fused via RRF.
	results, err := services.SearchHybrid(workspaceID, entityType, query, limit)
	if err != nil || len(results) == 0 {
		log.Printf("Semantic Search fallback to ILIKE due to: %v", err)
		// Fallback to text search on DocumentEmbedding
		dbQuery := database.GetDB(c).Where("workspace_id = ? AND content ILIKE ?", workspaceID, "%"+query+"%")
		if entityType != "" {
			dbQuery = dbQuery.Where("entity_type = ?", entityType)
		}
		dbQuery.Limit(limit).Find(&results)
		if len(results) == 0 && entityType == "" {
			// Second fallback: search directly in entities (only if no specific entityType requested)
			var entities []models.Entity
			database.GetDB(c).Where("workspace_id = ? AND (entity_type ILIKE ? OR data::text ILIKE ?)", workspaceID, "%"+query+"%", "%"+query+"%").Limit(limit).Find(&entities)
			for _, e := range entities {
				results = append(results, models.DocumentEmbedding{
					EntityType: e.EntityType,
					EntityID:   e.ID,
					Content:    string(e.Data),
				})
			}
		}
	}

	entityIDs := make([]uuid.UUID, 0, len(results))
	seenEntityIDs := make(map[uuid.UUID]struct{}, len(results))
	for _, doc := range results {
		if doc.EntityID != uuid.Nil {
			if _, exists := seenEntityIDs[doc.EntityID]; !exists {
				seenEntityIDs[doc.EntityID] = struct{}{}
				entityIDs = append(entityIDs, doc.EntityID)
			}
		}
	}
	entityData := make(map[uuid.UUID]map[string]interface{}, len(entityIDs))
	if len(entityIDs) > 0 {
		var entities []models.Entity
		if err := database.GetDB(c).
			Where("workspace_id = ? AND id IN ?", workspaceID, entityIDs).
			Find(&entities).Error; err == nil {
			for _, entity := range entities {
				var data map[string]interface{}
				if json.Unmarshal(entity.Data, &data) == nil {
					entityData[entity.ID] = data
				}
			}
		}
	}

	finalResults := make([]SemanticSearchResult, 0, len(results))
	for _, doc := range results {
		res := SemanticSearchResult{
			EntityType: doc.EntityType,
			EntityID:   doc.EntityID,
			Content:    doc.Content,
			EntityData: entityData[doc.EntityID],
		}
		finalResults = append(finalResults, res)
	}

	return c.JSON(fiber.Map{
		"query":   query,
		"results": finalResults,
	})
}
