package models

import (
	"time"

	"github.com/google/uuid"
)

// AuthSession backs every browser JWT with revocable server-side state.
type AuthSession struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey"`
	UserID      uuid.UUID  `gorm:"type:uuid;not null;index"`
	WorkspaceID uuid.UUID  `gorm:"type:uuid;not null;index"`
	ExpiresAt   time.Time  `gorm:"not null;index"`
	RevokedAt   *time.Time `gorm:"index"`
	CreatedAt   time.Time  `gorm:"autoCreateTime"`
}
