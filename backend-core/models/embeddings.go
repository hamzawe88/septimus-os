package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/pgvector/pgvector-go"
)

// DocumentEmbedding represents a vector embedding of any entity in the system for RAG (AI) search.
type DocumentEmbedding struct {
	ID          uuid.UUID       `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	WorkspaceID uuid.UUID       `gorm:"type:uuid;not null;index" json:"workspace_id"`
	EntityType  string          `gorm:"type:varchar(50);not null" json:"entity_type"` // e.g., "task", "crm_deal", "message"
	EntityID    uuid.UUID       `gorm:"type:uuid;not null" json:"entity_id"`
	Content     string          `gorm:"type:text;not null" json:"content"`  // The raw text that was embedded
	Embedding   pgvector.Vector `gorm:"type:vector(768);not null" json:"-"` // 768 dimensions
	// EmbeddingModel records which embedder produced Embedding. Gemini
	// text-embedding-004 and Ollama nomic-embed-text are both 768-dimensional but
	// occupy completely different vector spaces: a cosine distance between one
	// model's document and another model's query is meaningless. EmbedText falls
	// back from Gemini to Ollama whenever a key expires, so without this column a
	// workspace silently splits into two incomparable halves and older documents
	// stop being retrievable — with no error anywhere. Searches filter on it.
	EmbeddingModel string    `gorm:"type:varchar(64);not null;default:'gemini:text-embedding-004';index" json:"embedding_model"`
	CreatedAt      time.Time `json:"created_at"`
}
