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

	workspaceID := database.ParseUUID(req.WorkspaceID)
	if workspaceID == uuid.Nil {
		workspaceID = database.ParseUUID(c.Query("workspace_id"))
	}
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "workspace_id is required"})
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
	var workspaceID uuid.UUID
	if val := c.Locals("workspace_id"); val != nil {
		if str, ok := val.(string); ok {
			if id, err := uuid.Parse(str); err == nil {
				workspaceID = id
			}
		}
	}
	if workspaceID == uuid.Nil {
		if queryId := c.Query("workspace_id"); queryId != "" {
			if id, err := uuid.Parse(queryId); err == nil {
				workspaceID = id
			}
		}
	}
	if workspaceID == uuid.Nil {
		workspaceID = uuid.MustParse("797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e")
	}

	query := c.Query("q")
	if query == "" {
		query = c.Query("query", "report") // default search term if empty
	}
	limit := c.QueryInt("limit", 5)

	// Fetch embeddings from pgvector using the service
	results, err := services.SearchSimilar(workspaceID, query, limit)
	if err != nil || len(results) == 0 {
		log.Printf("Semantic Search fallback to ILIKE due to: %v", err)
		// Fallback to text search on DocumentEmbedding
		database.DB.Where("workspace_id = ? AND content ILIKE ?", workspaceID, "%"+query+"%").Limit(limit).Find(&results)
		if len(results) == 0 {
			// Second fallback: search directly in entities
			var entities []models.Entity
			database.DB.Where("workspace_id = ? AND (entity_type ILIKE ? OR data::text ILIKE ?)", workspaceID, "%"+query+"%", "%"+query+"%").Limit(limit).Find(&entities)
			for _, e := range entities {
				results = append(results, models.DocumentEmbedding{
					EntityType: e.EntityType,
					EntityID:   e.ID,
					Content:    string(e.Data),
				})
			}
		}
	}

	var finalResults []SemanticSearchResult
	for _, doc := range results {
		res := SemanticSearchResult{
			EntityType: doc.EntityType,
			EntityID:   doc.EntityID,
			Content:    doc.Content,
		}

		// Fetch the original entity to attach to the result
		var entity models.Entity
		if err := database.DB.First(&entity, "id = ?", doc.EntityID).Error; err == nil {
			var data map[string]interface{}
			if err := json.Unmarshal(entity.Data, &data); err == nil {
				res.EntityData = data
			}
		}

		finalResults = append(finalResults, res)
	}

	return c.JSON(fiber.Map{
		"query":   query,
		"results": finalResults,
	})
}
