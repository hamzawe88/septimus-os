package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

type WebhookSubscription struct {
	ID          uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	WorkspaceID uuid.UUID      `gorm:"type:uuid;index;not null"`
	Workspace   Workspace      `gorm:"foreignKey:WorkspaceID;constraint:OnDelete:CASCADE;"`
	TargetURL   string         `gorm:"type:varchar(512);not null"`
	Events      datatypes.JSON `gorm:"type:jsonb;not null"` // e.g. ["tasks.create", "sprints.start"]
	Secret      string         `gorm:"type:varchar(255)"`   // Used to sign the webhook payload
	IsActive    bool           `gorm:"default:true"`
	CreatedAt   time.Time      `gorm:"autoCreateTime"`
	UpdatedAt   time.Time      `gorm:"autoUpdateTime"`
}
