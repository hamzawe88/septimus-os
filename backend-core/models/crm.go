package models

import (
	"time"

	"github.com/google/uuid"
)

// CRMQuoteInvoiceConversion is the durable idempotency record for the
// quote-to-invoice boundary. The quote, invoice, opportunity update, audit row,
// and outbox event are committed in one transaction; this row makes retries
// return the original result instead of issuing a second invoice.
type CRMQuoteInvoiceConversion struct {
	ID             uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	WorkspaceID    uuid.UUID  `gorm:"type:uuid;not null;uniqueIndex:idx_crm_conversion_workspace_key;index" json:"workspace_id"`
	IdempotencyKey string     `gorm:"type:varchar(128);not null;uniqueIndex:idx_crm_conversion_workspace_key" json:"idempotency_key"`
	RequestHash    string     `gorm:"type:char(64);not null" json:"request_hash"`
	OpportunityID  uuid.UUID  `gorm:"type:uuid;not null;index" json:"opportunity_id"`
	QuoteID        uuid.UUID  `gorm:"type:uuid;not null;index" json:"quote_id"`
	InvoiceID      uuid.UUID  `gorm:"type:uuid;not null;index" json:"invoice_id"`
	CreatedBy      *uuid.UUID `gorm:"type:uuid;index" json:"created_by,omitempty"`
	CreatedAt      time.Time  `gorm:"autoCreateTime;not null" json:"created_at"`
}

func (CRMQuoteInvoiceConversion) TableName() string {
	return "crm_quote_invoice_conversions"
}

// CRMLegacyRecordLink is the durable, tenant-scoped migration ledger between
// pre-schema-builder CRM entities and their canonical dynamic records. A
// source can fan out to account/contact/opportunity records, while the unique
// key makes startup migration safe to retry across replicas.
type CRMLegacyRecordLink struct {
	ID                  uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	WorkspaceID         uuid.UUID `gorm:"type:uuid;not null;index;uniqueIndex:idx_crm_legacy_link" json:"workspace_id"`
	LegacyEntityID      uuid.UUID `gorm:"type:uuid;not null;index;uniqueIndex:idx_crm_legacy_link" json:"legacy_entity_id"`
	TargetDefinitionKey string    `gorm:"type:varchar(100);not null;uniqueIndex:idx_crm_legacy_link" json:"target_definition_key"`
	TargetRecordID      uuid.UUID `gorm:"type:uuid;not null;index" json:"target_record_id"`
	MigrationVersion    int       `gorm:"not null;default:1" json:"migration_version"`
	CreatedAt           time.Time `gorm:"autoCreateTime;not null" json:"created_at"`
}

func (CRMLegacyRecordLink) TableName() string { return "crm_legacy_record_links" }
