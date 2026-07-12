package services

import (
	"context"
	"errors"
	"fmt"
	"log"

	"github.com/google/generative-ai-go/genai"
	"github.com/google/uuid"
	"github.com/pgvector/pgvector-go"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"google.golang.org/api/option"
	"gorm.io/gorm/clause"
)

// GenerateEmbedding calls Gemini API to create an embedding of size 768.
func GenerateEmbedding(text string, apiKey string) ([]float32, error) {
	if apiKey == "" {
		return nil, errors.New("gemini API key is required")
	}

	ctx := context.Background()
	client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		return nil, err
	}
	defer client.Close()

	// text-embedding-004 produces 768 dimensions by default.
	em := client.EmbeddingModel("text-embedding-004")
	res, err := em.EmbedContent(ctx, genai.Text(text))
	if err != nil {
		return nil, err
	}

	if len(res.Embedding.Values) == 0 {
		return nil, errors.New("empty embedding returned")
	}

	return res.Embedding.Values, nil
}

// StoreEmbedding generates an embedding and saves it to pgvector.
func StoreEmbedding(workspaceID uuid.UUID, entityType string, entityID uuid.UUID, content string) error {
	// 1. Get the Gemini key from the unified `ai_providers` workspace settings.
	apiKey, err := GetProviderKey(workspaceID, "gemini")
	if err != nil {
		log.Printf("Gemini key unavailable for workspace %s: %v", workspaceID, err)
		return errors.New("no gemini api key configured")
	}

	// 2. Generate embedding
	vector, err := GenerateEmbedding(content, apiKey)
	if err != nil {
		return fmt.Errorf("failed to generate embedding: %w", err)
	}

	// 3. Store in DB
	doc := models.DocumentEmbedding{
		WorkspaceID: workspaceID,
		EntityType:  entityType,
		EntityID:    entityID,
		Content:     content,
		Embedding:   pgvector.NewVector(vector),
	}

	return database.DB.Create(&doc).Error
}

// SearchSimilar performs a semantic search using cosine distance
func SearchSimilar(workspaceID uuid.UUID, query string, limit int) ([]models.DocumentEmbedding, error) {
	// 1. Get the Gemini key from the unified `ai_providers` workspace settings.
	apiKey, err := GetProviderKey(workspaceID, "gemini")
	if err != nil {
		return nil, errors.New("no gemini api key configured")
	}

	// 2. Embed Query
	queryVector, err := GenerateEmbedding(query, apiKey)
	if err != nil {
		return nil, err
	}

	// 3. Search DB (Cosine Distance: <=>)
	var results []models.DocumentEmbedding
	err = database.DB.Order(clause.Expr{SQL: "embedding <=> ?", Vars: []interface{}{pgvector.NewVector(queryVector)}}).
		Where("workspace_id = ?", workspaceID).
		Limit(limit).
		Find(&results).Error

	return results, err
}
