package services

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/google/generative-ai-go/genai"
	"github.com/google/uuid"
	"github.com/pgvector/pgvector-go"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"google.golang.org/api/option"
	"gorm.io/gorm/clause"
)

// The document_embeddings table is a vector(768) column; every embedder we
// plug in must produce exactly this dimension (Gemini text-embedding-004 and
// Ollama nomic-embed-text both do).
const embeddingDimensions = 768

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

// ollamaEmbedURL resolves the Ollama server for a workspace: the ollama
// provider's baseUrl from settings, then OLLAMA_BASE_URL, then the Docker
// host default.
func ollamaEmbedURL(workspaceID uuid.UUID) string {
	if u := GetProviderBaseURL(workspaceID, "ollama"); u != "" {
		return u
	}
	if u := os.Getenv("OLLAMA_BASE_URL"); u != "" {
		return u
	}
	return "http://host.docker.internal:11434"
}

// generateOllamaEmbedding embeds text with a local Ollama model (default
// nomic-embed-text, 768-dim) — no external API key required.
func generateOllamaEmbedding(baseURL, text string) ([]float32, error) {
	model := os.Getenv("OLLAMA_EMBED_MODEL")
	if model == "" {
		model = "nomic-embed-text"
	}

	payload, err := json.Marshal(map[string]string{"model": model, "prompt": text})
	if err != nil {
		return nil, err
	}

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Post(baseURL+"/api/embeddings", "application/json", bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("ollama embeddings request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ollama embeddings returned status %d", resp.StatusCode)
	}

	var out struct {
		Embedding []float32 `json:"embedding"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	if len(out.Embedding) != embeddingDimensions {
		return nil, fmt.Errorf("ollama model %q produced %d dimensions, need %d — use a 768-dim model like nomic-embed-text", model, len(out.Embedding), embeddingDimensions)
	}
	return out.Embedding, nil
}

// EmbedText produces the workspace's embedding for a text. It prefers the
// configured Gemini key (cloud quality) and falls back to local Ollama
// (nomic-embed-text) so the knowledge base works with zero external keys.
// Both produce 768 dimensions, so stored vectors stay comparable per source.
func EmbedText(workspaceID uuid.UUID, text string) ([]float32, error) {
	if apiKey, err := GetProviderKey(workspaceID, "gemini"); err == nil && apiKey != "" {
		if v, gerr := GenerateEmbedding(text, apiKey); gerr == nil {
			return v, nil
		} else {
			log.Printf("Gemini embedding failed for workspace %s (falling back to Ollama): %v", workspaceID, gerr)
		}
	}
	return generateOllamaEmbedding(ollamaEmbedURL(workspaceID), text)
}

// StoreEmbedding generates an embedding and saves it to pgvector.
func StoreEmbedding(workspaceID uuid.UUID, entityType string, entityID uuid.UUID, content string) error {
	vector, err := EmbedText(workspaceID, content)
	if err != nil {
		return fmt.Errorf("failed to generate embedding: %w", err)
	}

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
	return SearchSimilarByType(workspaceID, "", query, limit)
}

// SearchSimilarByType performs a semantic search using cosine distance filtered by entity_type if provided
func SearchSimilarByType(workspaceID uuid.UUID, entityType string, query string, limit int) ([]models.DocumentEmbedding, error) {
	queryVector, err := EmbedText(workspaceID, query)
	if err != nil {
		return nil, err
	}

	// Search DB (Cosine Distance: <=>)
	var results []models.DocumentEmbedding
	queryDB := database.DB.Order(clause.Expr{SQL: "embedding <=> ?", Vars: []interface{}{pgvector.NewVector(queryVector)}}).
		Where("workspace_id = ?", workspaceID)
	if entityType != "" {
		queryDB = queryDB.Where("entity_type = ?", entityType)
	}
	err = queryDB.Limit(limit).Find(&results).Error

	return results, err
}
