package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

type Subscription struct {
	ID                   uuid.UUID  `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID          uuid.UUID  `gorm:"type:uuid;uniqueIndex;not null" json:"workspace_id"`
	Workspace            *Workspace `gorm:"foreignKey:WorkspaceID;constraint:OnDelete:CASCADE;" json:"-"`
	StripeCustomerID     *string    `gorm:"type:varchar(255);uniqueIndex" json:"stripe_customer_id"`
	StripeSubscriptionID *string    `gorm:"type:varchar(255);uniqueIndex" json:"stripe_subscription_id"`
	PaymentGateway       string     `gorm:"type:varchar(50);not null;default:'stripe'" json:"payment_gateway"` // 'stripe', 'moamalat', 'onepay'
	Tier                 string     `gorm:"type:varchar(50);not null;default:'free'" json:"tier"`
	Status               string     `gorm:"type:varchar(50);not null;default:'trialing'" json:"status"` // 'trialing', 'active', 'past_due', 'canceled'
	CurrentPeriodStart   time.Time  `json:"current_period_start"`
	CurrentPeriodEnd     time.Time  `json:"current_period_end"`
	CancelAtPeriodEnd    bool       `gorm:"default:false" json:"cancel_at_period_end"`
	CreatedAt            time.Time  `json:"created_at"`
	UpdatedAt            time.Time  `json:"updated_at"`
}

type Invoice struct {
	ID              uuid.UUID  `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID     uuid.UUID  `gorm:"type:uuid;index;not null" json:"workspace_id"`
	Workspace       *Workspace `gorm:"foreignKey:WorkspaceID;constraint:OnDelete:CASCADE;" json:"-"`
	StripeInvoiceID *string    `gorm:"type:varchar(255);uniqueIndex" json:"stripe_invoice_id"`
	PaymentGateway  string     `gorm:"type:varchar(50);not null;default:'stripe'" json:"payment_gateway"` // 'stripe', 'moamalat', 'onepay'
	AmountPaid      int64      `gorm:"not null" json:"amount_paid"` // in cents
	Currency        string     `gorm:"type:varchar(10);not null;default:'usd'" json:"currency"`
	Status          string     `gorm:"type:varchar(30);not null;default:'paid'" json:"status"` // 'paid', 'open', 'void', 'uncollectible'
	InvoicePDFURL   string     `gorm:"type:text" json:"invoice_pdf_url"`
	PaidAt          time.Time  `gorm:"not null;default:CURRENT_TIMESTAMP" json:"paid_at"`
	CreatedAt       time.Time  `json:"created_at"`
}

type SaaSPlan struct {
	ID            uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	TierID        string    `gorm:"type:varchar(50);uniqueIndex;not null" json:"tier_id"` // 'free', 'starter', 'business', 'enterprise'
	NameEn        string    `gorm:"type:varchar(100);not null" json:"name_en"`
	NameAr        string    `gorm:"type:varchar(100);not null" json:"name_ar"`
	Price         float64   `gorm:"type:numeric(10,2);not null;default:0.0" json:"price"`
	Currency      string    `gorm:"type:varchar(10);not null;default:'USD'" json:"currency"`
	DescriptionEn string    `gorm:"type:text" json:"description_en"`
	DescriptionAr string    `gorm:"type:text" json:"description_ar"`
	FeaturesEn    string    `gorm:"type:text" json:"features_en"` // JSON array string
	FeaturesAr    string    `gorm:"type:text" json:"features_ar"` // JSON array string
	Recommended   bool      `gorm:"default:false" json:"recommended"`
	Color         string    `gorm:"type:varchar(20);default:'slate'" json:"color"`
	// Entitlements (data-driven gating). Features overrides which feature_keys
	// are enabled; Limits overrides per-resource caps (-1 = unlimited). Both are
	// merged ON TOP of the built-in default matrix for the tier (see
	// services/entitlements.go), so empty {} means "use tier defaults".
	Features      datatypes.JSON `gorm:"type:jsonb;default:'{}'" json:"features"`
	Limits        datatypes.JSON `gorm:"type:jsonb;default:'{}'" json:"limits"`
	IsActive      bool      `gorm:"default:true" json:"is_active"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

func (SaaSPlan) TableName() string {
	return "saa_s_plans"
}
