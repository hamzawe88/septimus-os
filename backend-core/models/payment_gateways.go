package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

// PaymentGatewaySettings stores global SaaS settings for payment integrations
// Managed strictly by Super Admins
type PaymentGatewaySettings struct {
	ID           uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	GatewayName  string         `gorm:"type:varchar(50);uniqueIndex;not null" json:"gateway_name"` // "stripe", "moamalat", "onepay"
	IsActive     bool           `gorm:"default:false" json:"is_active"`
	IsTestMode   bool           `gorm:"default:true" json:"is_test_mode"`
	Credentials  datatypes.JSON `gorm:"type:jsonb;not null" json:"credentials"` // Store securely (keys, tokens, merchant IDs)
	Currency     string         `gorm:"type:varchar(10);default:'USD'" json:"currency"`
	SortOrder    int            `gorm:"default:0" json:"sort_order"`
	CreatedAt    time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt    time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
}
