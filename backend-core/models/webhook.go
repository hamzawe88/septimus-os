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
	// Secret is returned exactly once by CreateWebhook and is never serialized
	// from list/read endpoints. It is encrypted before persistence.
	Secret    string    `gorm:"type:text" json:"-"` // Used to sign the webhook payload
	IsActive  bool      `gorm:"default:true"`
	CreatedAt time.Time `gorm:"autoCreateTime"`
	UpdatedAt time.Time `gorm:"autoUpdateTime"`
}

// WebhookDelivery is the replay ledger for authenticated public ingress.
// The composite unique key makes a signed delivery id single-use per tenant,
// including when several backend replicas receive the same retry concurrently.
type WebhookDelivery struct {
	ID          uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	WorkspaceID uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_webhook_delivery"`
	DeliveryID  string    `gorm:"type:varchar(128);not null;uniqueIndex:idx_webhook_delivery"`
	ReceivedAt  time.Time `gorm:"not null;index"`
}
