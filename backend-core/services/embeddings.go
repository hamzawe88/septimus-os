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
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/pgvector/pgvector-go"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"google.golang.org/genai"
	"gorm.io/gorm/clause"
)

// The document_embeddings table is a vector(768) column; every embedder we
// plug in must produce exactly this dimension (Gemini text-embedding-004 and
// Ollama nomic-embed-text both do).
const embeddingDimensions = 768

// GenerateEmbedding calls Gemini API to create an embedding of size 768.
func GenerateEmbedding(text string, apiKey string) ([]float32, error) {
	return GenerateEmbeddingContext(context.Background(), text, apiKey)
}

// GenerateEmbeddingContext is the cancellable form used by latency-sensitive
// search surfaces such as the global command menu.
func GenerateEmbeddingContext(ctx context.Context, text string, apiKey string) ([]float32, error) {
	if apiKey == "" {
		return nil, errors.New("gemini API key is required")
	}

	client, err := genai.NewClient(ctx, &genai.ClientConfig{
		APIKey:  apiKey,
		Backend: genai.BackendGeminiAPI,
	})
	if err != nil {
		return nil, err
	}

	dimensions := int32(embeddingDimensions)
	res, err := client.Models.EmbedContent(
		ctx,
		"gemini-embedding-001",
		genai.Text(text),
		&genai.EmbedContentConfig{OutputDimensionality: &dimensions},
	)
	if err != nil {
		return nil, err
	}

	if len(res.Embeddings) == 0 || len(res.Embeddings[0].Values) == 0 {
		return nil, errors.New("empty embedding returned")
	}

	return res.Embeddings[0].Values, nil
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
	return generateOllamaEmbeddingContext(context.Background(), baseURL, text)
}

func generateOllamaEmbeddingContext(ctx context.Context, baseURL, text string) ([]float32, error) {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if err := ValidateOutboundURL(baseURL); err != nil {
		return nil, fmt.Errorf("ollama URL rejected: %w", err)
	}
	model := os.Getenv("OLLAMA_EMBED_MODEL")
	if model == "" {
		model = "nomic-embed-text"
	}

	payload, err := json.Marshal(map[string]string{"model": model, "prompt": text})
	if err != nil {
		return nil, err
	}

	client := NewSafeHTTPClient(60 * time.Second)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+"/api/embeddings", bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
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

// Model identifiers stored alongside every vector. Comparing vectors across
// these is meaningless even though both are 768-dimensional.
const (
	modelGemini = "gemini:text-embedding-004"
	modelOllama = "ollama:"
)

// EmbedText produces the workspace's embedding for a text. It prefers the
// configured Gemini key (cloud quality) and falls back to local Ollama
// (nomic-embed-text) so the knowledge base works with zero external keys.
//
// It returns the model identifier alongside the vector: both embedders emit 768
// dimensions but into different vector spaces, so callers must record which one
// produced a stored vector and must never mix them at query time.
func EmbedText(workspaceID uuid.UUID, text string) ([]float32, string, error) {
	return EmbedTextContext(context.Background(), workspaceID, text)
}

func EmbedTextContext(ctx context.Context, workspaceID uuid.UUID, text string) ([]float32, string, error) {
	if apiKey, err := GetProviderKey(workspaceID, "gemini"); err == nil && apiKey != "" {
		if v, gerr := GenerateEmbeddingContext(ctx, text, apiKey); gerr == nil {
			return v, modelGemini, nil
		} else {
			log.Printf("Gemini embedding failed for workspace %s (falling back to Ollama): %v", workspaceID, gerr)
		}
	}
	model := os.Getenv("OLLAMA_EMBED_MODEL")
	if model == "" {
		model = "nomic-embed-text"
	}
	v, err := generateOllamaEmbeddingContext(ctx, ollamaEmbedURL(workspaceID), text)
	if err != nil {
		return nil, "", err
	}
	return v, modelOllama + model, nil
}

// StoreEmbedding generates an embedding and saves it to pgvector.
func StoreEmbedding(workspaceID uuid.UUID, entityType string, entityID uuid.UUID, content string) error {
	vector, model, err := EmbedText(workspaceID, content)
	if err != nil {
		return fmt.Errorf("failed to generate embedding: %w", err)
	}

	doc := models.DocumentEmbedding{
		WorkspaceID:    workspaceID,
		EntityType:     entityType,
		EntityID:       entityID,
		Content:        content,
		Embedding:      pgvector.NewVector(vector),
		EmbeddingModel: model,
	}

	return database.DB.Create(&doc).Error
}

// SearchSimilar performs a semantic search using cosine distance
func SearchSimilar(workspaceID uuid.UUID, query string, limit int) ([]models.DocumentEmbedding, error) {
	return SearchSimilarByType(workspaceID, "", query, limit)
}

// SearchSimilarByType performs a semantic search using cosine distance filtered by entity_type if provided
func SearchSimilarByType(workspaceID uuid.UUID, entityType string, query string, limit int) ([]models.DocumentEmbedding, error) {
	return SearchSimilarByTypeContext(context.Background(), workspaceID, entityType, query, limit)
}

func SearchSimilarByTypeContext(ctx context.Context, workspaceID uuid.UUID, entityType string, query string, limit int) ([]models.DocumentEmbedding, error) {
	queryVector, model, err := EmbedTextContext(ctx, workspaceID, query)
	if err != nil {
		return nil, err
	}

	// Search DB (Cosine Distance: <=>)
	var results []models.DocumentEmbedding
	queryDB := database.DB.WithContext(ctx).Order(clause.Expr{SQL: "embedding <=> ?", Vars: []interface{}{pgvector.NewVector(queryVector)}}).
		Where("workspace_id = ?", workspaceID).
		// Only compare against vectors from the same embedder. Rows written by a
		// different model live in a different vector space, so including them
		// returns confident nonsense rather than no result.
		Where("embedding_model = ?", model)
	if entityType != "" {
		queryDB = queryDB.Where("entity_type = ?", entityType)
	}
	err = queryDB.Limit(limit).Find(&results).Error

	return results, err
}

// SearchHybrid combines dense (pgvector cosine) and lexical (Postgres full-text)
// retrieval via Reciprocal Rank Fusion. It improves recall — especially for
// Arabic and exact-term/identifier queries where pure embeddings under-retrieve.
// Each arm is best-effort: if one errors or returns nothing, the other still
// answers, so hybrid is never worse than the previous dense-only search.
func SearchHybrid(workspaceID uuid.UUID, entityType string, query string, limit int) ([]models.DocumentEmbedding, error) {
	return SearchHybridContext(context.Background(), workspaceID, entityType, query, limit)
}

func SearchHybridContext(ctx context.Context, workspaceID uuid.UUID, entityType string, query string, limit int) ([]models.DocumentEmbedding, error) {
	if limit <= 0 {
		limit = 5
	}
	// Pull a wider candidate pool from each arm before fusing down to `limit`.
	pool := limit * 4
	if pool < 20 {
		pool = 20
	}

	lexical := searchLexicalContext(ctx, workspaceID, entityType, query, pool)
	dense, denseErr := SearchSimilarByTypeContext(ctx, workspaceID, entityType, query, pool)

	if len(lexical) == 0 {
		if denseErr != nil {
			return dense, denseErr
		}
		return capResults(dense, limit), nil
	}
	if len(dense) == 0 {
		return capResults(lexical, limit), nil
	}
	return reciprocalRankFusion(limit, dense, lexical), nil
}

// searchLexical runs a language-agnostic full-text search over the embedded
// content. The 'simple' config tokenizes without a stemming dictionary, which
// is the correct choice for Arabic (Postgres ships no Arabic FTS dictionary).
//
// Deliberately NOT filtered by embedding_model: lexical matching reads `content`
// and is independent of which embedder wrote the row. That makes this arm the
// safety net for a workspace whose provider changed — documents the dense arm
// can no longer compare against are still reachable by their words.
func searchLexical(workspaceID uuid.UUID, entityType, query string, limit int) []models.DocumentEmbedding {
	return searchLexicalContext(context.Background(), workspaceID, entityType, query, limit)
}

func searchLexicalContext(ctx context.Context, workspaceID uuid.UUID, entityType, query string, limit int) []models.DocumentEmbedding {
	var results []models.DocumentEmbedding
	q := database.DB.WithContext(ctx).
		Where("workspace_id = ?", workspaceID).
		Where("to_tsvector('simple', content) @@ plainto_tsquery('simple', ?)", query).
		Order(clause.Expr{
			SQL:  "ts_rank_cd(to_tsvector('simple', content), plainto_tsquery('simple', ?)) DESC",
			Vars: []interface{}{query},
		})
	if entityType != "" {
		q = q.Where("entity_type = ?", entityType)
	}
	_ = q.Limit(limit).Find(&results).Error
	return results
}

// reciprocalRankFusion merges ranked lists: score(d) = Σ 1/(k + rank), k=60.
// Documents are keyed by EntityID (falling back to row ID) so the same source
// ranked by both arms accumulates a higher fused score.
func reciprocalRankFusion(limit int, lists ...[]models.DocumentEmbedding) []models.DocumentEmbedding {
	const k = 60.0
	type scored struct {
		doc   models.DocumentEmbedding
		score float64
	}
	byKey := map[uuid.UUID]*scored{}
	order := []uuid.UUID{}
	for _, list := range lists {
		for rank, d := range list {
			key := d.EntityID
			if key == uuid.Nil {
				key = d.ID
			}
			s, ok := byKey[key]
			if !ok {
				s = &scored{doc: d}
				byKey[key] = s
				order = append(order, key)
			}
			s.score += 1.0 / (k + float64(rank+1))
		}
	}
	sort.SliceStable(order, func(i, j int) bool {
		return byKey[order[i]].score > byKey[order[j]].score
	})
	out := make([]models.DocumentEmbedding, 0, limit)
	for _, key := range order {
		out = append(out, byKey[key].doc)
		if len(out) >= limit {
			break
		}
	}
	return out
}

func capResults(list []models.DocumentEmbedding, limit int) []models.DocumentEmbedding {
	if len(list) > limit {
		return list[:limit]
	}
	return list
}
