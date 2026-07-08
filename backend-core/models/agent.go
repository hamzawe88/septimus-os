package models

import (
	"time"

	"github.com/google/uuid"
)

// AIConfig stores the configuration for the active AI provider
type AIConfig struct {
	ID        uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	Provider  string    `gorm:"size:50;not null;default:'openai'" json:"provider"` // 'openai', 'gemini', 'anthropic'
	Model     string    `gorm:"size:100;not null;default:'gpt-4o-mini'" json:"model"`
	APIKey    string    `gorm:"type:text;not null" json:"-"` // Hidden from JSON responses
	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

// AgentState tracks the running/killed state of each specialized agent
type AgentState struct {
	ID        uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	Name      string    `gorm:"type:varchar(50);not null" json:"name"`
	Role      string    `gorm:"type:varchar(50)" json:"role"`
	Status    string    `gorm:"type:varchar(50);not null;default:'running'" json:"status"` // 'running', 'idle', 'stopped', 'killed'
	Config    string    `gorm:"type:jsonb" json:"config"` // JSON containing tools, system prompt, etc.
	LoopCount int       `gorm:"default:0" json:"loop_count"`
	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updated_at"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
}

// AgentCollaborationLog tracks the audit trail of multi-agent operations
type AgentCollaborationLog struct {
	ID         uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	SessionID  uuid.UUID `gorm:"type:uuid;index" json:"session_id"`
	AgentName  string    `gorm:"size:50;index" json:"agent_name"`
	Action     string    `gorm:"size:100" json:"action"`
	InputData  string    `gorm:"type:text" json:"input_data"`
	OutputData string    `gorm:"type:text" json:"output_data"`
	LoopCount  int       `gorm:"default:0" json:"loop_count"`
	Status     string    `gorm:"size:50" json:"status"` // running, completed, failed, killed
	CreatedAt  time.Time `gorm:"autoCreateTime" json:"created_at"`
}

// PendingApproval tracks tasks/messages from CommAgent waiting for human review
type PendingApproval struct {
	ID          uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	AgentName   string    `gorm:"size:50" json:"agent_name"`
	ActionType  string    `gorm:"size:100" json:"action_type"`
	Payload     string    `gorm:"type:jsonb" json:"payload"` // JSON encoded payload of the proposed action
	Reason      string    `gorm:"type:text" json:"reason"`   // Why it was flagged as sensitive
	Status      string    `gorm:"size:50;default:'pending'" json:"status"` // pending, approved, rejected
	RequestedAt time.Time `gorm:"autoCreateTime" json:"requested_at"`
	ResolvedAt  *time.Time `json:"resolved_at"`
	ResolvedBy  *uuid.UUID `gorm:"type:uuid" json:"resolved_by"`
}
