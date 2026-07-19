package models

import (
	"time"

	"github.com/google/uuid"
)

// AITokenUsage is a durable, workspace-scoped record of a single LLM call's
// token consumption and estimated cost. The ai-sidecar posts one row per call
// to POST /internal/ai/usage; the cost dashboard (GET /reports/ai/cost)
// aggregates over it. Previously usage only lived in stdout logs and an
// in-memory counter (lost on restart) — this table makes it queryable.
type AITokenUsage struct {
	ID               uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID      uuid.UUID `gorm:"type:uuid;index;not null" json:"workspace_id"`
	Provider         string    `gorm:"type:varchar(50)" json:"provider"`
	Model            string    `gorm:"type:varchar(100);index" json:"model"`
	Tier             string    `gorm:"type:varchar(20)" json:"tier"`
	PromptTokens     int       `gorm:"default:0" json:"prompt_tokens"`
	CompletionTokens int       `gorm:"default:0" json:"completion_tokens"`
	TotalTokens      int       `gorm:"index;default:0" json:"total_tokens"`
	CostUSD          float64   `gorm:"type:numeric(12,6);default:0" json:"cost_usd"`
	CreatedAt        time.Time `gorm:"autoCreateTime;index" json:"created_at"`
}
