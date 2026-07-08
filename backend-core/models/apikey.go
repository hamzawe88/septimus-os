package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

type APIKey struct {
	ID          uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	WorkspaceID uuid.UUID      `gorm:"type:uuid;index;not null"`
	Workspace   Workspace      `gorm:"foreignKey:WorkspaceID;constraint:OnDelete:CASCADE;"`
	Name        string         `gorm:"type:varchar(100);not null"`
	KeyHash     string         `gorm:"type:varchar(255);not null;uniqueIndex"`
	Scopes      datatypes.JSON `gorm:"type:jsonb"` // ["read:leads", "write:leads", "read:invoices", "*"]
	ExpiresAt   *time.Time
	LastUsedAt  *time.Time
	IsActive    bool      `gorm:"default:true"`
	CreatedAt   time.Time `gorm:"autoCreateTime"`
}
