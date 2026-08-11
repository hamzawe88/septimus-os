package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

const (
	EntityDefinitionStatusDraft     = "draft"
	EntityDefinitionStatusPublished = "published"
	EntityDefinitionStatusArchived  = "archived"
	SchemaChangeJobStatusPending    = "pending"
	SchemaChangeJobStatusRunning    = "running"
	SchemaChangeJobStatusPaused     = "paused"
	SchemaChangeJobStatusCompleted  = "completed"
	SchemaChangeJobStatusFailed     = "failed"
	SchemaChangeJobStatusCancelled  = "cancelled"
	OutboxStatusPending             = "pending"
	OutboxStatusPublished           = "published"
	OutboxStatusFailed              = "failed"
)

// EntityDefinition is the stable, tenant-scoped identity of a no-code data
// model. Labels may change, but Key becomes immutable after the first publish
// so API, workflow, and AI references remain stable.
type EntityDefinition struct {
	ID             uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	WorkspaceID    uuid.UUID      `gorm:"type:uuid;not null;index;uniqueIndex:idx_entity_definition_workspace_key" json:"workspace_id"`
	Key            string         `gorm:"type:varchar(63);not null;uniqueIndex:idx_entity_definition_workspace_key" json:"key"`
	LabelAr        string         `gorm:"type:varchar(120);not null" json:"label_ar"`
	LabelEn        string         `gorm:"type:varchar(120);not null" json:"label_en"`
	DescriptionAr  string         `gorm:"type:text" json:"description_ar"`
	DescriptionEn  string         `gorm:"type:text" json:"description_en"`
	Status         string         `gorm:"type:varchar(20);not null;default:'draft';index" json:"status"`
	CurrentVersion int            `gorm:"not null;default:0" json:"current_version"`
	DraftRevision  int            `gorm:"not null;default:1" json:"draft_revision"`
	TitleFieldKey  string         `gorm:"type:varchar(63)" json:"title_field_key"`
	DraftSchema    datatypes.JSON `gorm:"type:jsonb;not null;default:'{}'" json:"draft_schema"`
	DraftUISchema  datatypes.JSON `gorm:"type:jsonb;not null;default:'{}'" json:"draft_ui_schema"`
	Settings       datatypes.JSON `gorm:"type:jsonb;not null;default:'{}'" json:"settings"`
	CreatedBy      *uuid.UUID     `gorm:"type:uuid;index" json:"created_by,omitempty"`
	UpdatedBy      *uuid.UUID     `gorm:"type:uuid;index" json:"updated_by,omitempty"`
	CreatedAt      time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt      time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`
}

func (EntityDefinition) TableName() string {
	return "entity_definitions"
}

// EntitySchemaVersion is an immutable snapshot created by publishing a valid
// definition draft. Existing records retain the version they were validated
// against even after a newer draft is published.
type EntitySchemaVersion struct {
	ID           uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	WorkspaceID  uuid.UUID      `gorm:"type:uuid;not null;index" json:"workspace_id"`
	DefinitionID uuid.UUID      `gorm:"type:uuid;not null;index;uniqueIndex:idx_entity_schema_definition_version" json:"definition_id"`
	Version      int            `gorm:"not null;uniqueIndex:idx_entity_schema_definition_version" json:"version"`
	JSONSchema   datatypes.JSON `gorm:"type:jsonb;not null" json:"json_schema"`
	UISchema     datatypes.JSON `gorm:"type:jsonb;not null;default:'{}'" json:"ui_schema"`
	ChangeSet    datatypes.JSON `gorm:"type:jsonb;not null;default:'{}'" json:"change_set"`
	Checksum     string         `gorm:"type:char(64);not null" json:"checksum"`
	PublishedBy  *uuid.UUID     `gorm:"type:uuid;index" json:"published_by,omitempty"`
	PublishedAt  time.Time      `gorm:"not null;default:now()" json:"published_at"`
}

func (EntitySchemaVersion) TableName() string {
	return "entity_schema_versions"
}

// EntitySchemaField is the queryable, immutable field catalog for one
// published schema version. JSON Schema remains the validation source of truth;
// this projection lets RBAC, indexing, integrations, and impact analysis inspect
// fields without interpreting UI-specific JSON.
type EntitySchemaField struct {
	ID             uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	WorkspaceID    uuid.UUID      `gorm:"type:uuid;not null;index" json:"workspace_id"`
	DefinitionID   uuid.UUID      `gorm:"type:uuid;not null;index;uniqueIndex:idx_entity_schema_field_version_key" json:"definition_id"`
	SchemaVersion  int            `gorm:"not null;uniqueIndex:idx_entity_schema_field_version_key" json:"schema_version"`
	SchemaChecksum string         `gorm:"type:char(64);not null" json:"schema_checksum"`
	FieldKey       string         `gorm:"type:varchar(63);not null;uniqueIndex:idx_entity_schema_field_version_key" json:"field_key"`
	FieldType      string         `gorm:"type:varchar(32);not null;index" json:"field_type"`
	Position       int            `gorm:"not null" json:"position"`
	Required       bool           `gorm:"not null;default:false" json:"required"`
	Searchable     bool           `gorm:"not null;default:false" json:"searchable"`
	Indexed        bool           `gorm:"not null;default:false" json:"indexed"`
	Classification string         `gorm:"type:varchar(20);not null;default:'internal';index" json:"classification"`
	ReadRoles      datatypes.JSON `gorm:"type:jsonb;not null;default:'[]'" json:"read_roles"`
	WriteRoles     datatypes.JSON `gorm:"type:jsonb;not null;default:'[]'" json:"write_roles"`
	Config         datatypes.JSON `gorm:"type:jsonb;not null;default:'{}'" json:"config"`
	CreatedAt      time.Time      `gorm:"autoCreateTime" json:"created_at"`
}

func (EntitySchemaField) TableName() string { return "entity_schema_fields" }

// EntitySchemaChangeJob records an immutable impact report or a resumable
// record migration. IdempotencyKey prevents duplicate work when clients retry
// impact, approval, or publish requests.
type EntitySchemaChangeJob struct {
	ID                uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	WorkspaceID       uuid.UUID      `gorm:"type:uuid;not null;index" json:"workspace_id"`
	DefinitionID      uuid.UUID      `gorm:"type:uuid;not null;index" json:"definition_id"`
	SourceVersion     int            `gorm:"not null;default:0" json:"source_version"`
	TargetVersion     int            `gorm:"not null;default:0" json:"target_version"`
	DraftRevision     int            `gorm:"not null" json:"draft_revision"`
	TargetChecksum    string         `gorm:"type:char(64);not null" json:"target_checksum"`
	JobType           string         `gorm:"type:varchar(20);not null;index" json:"job_type"`
	Status            string         `gorm:"type:varchar(16);not null;default:'pending';index" json:"status"`
	Severity          string         `gorm:"type:varchar(16);not null;default:'safe'" json:"severity"`
	IdempotencyKey    string         `gorm:"type:char(64);not null;uniqueIndex" json:"-"`
	Report            datatypes.JSON `gorm:"type:jsonb;not null;default:'{}'" json:"report"`
	Plan              datatypes.JSON `gorm:"type:jsonb;not null;default:'[]'" json:"plan"`
	ProgressTotal     int64          `gorm:"not null;default:0" json:"progress_total"`
	ProgressProcessed int64          `gorm:"not null;default:0" json:"progress_processed"`
	ProgressFailed    int64          `gorm:"not null;default:0" json:"progress_failed"`
	Cursor            string         `gorm:"type:varchar(100)" json:"cursor,omitempty"`
	RequestedBy       *uuid.UUID     `gorm:"type:uuid;index" json:"requested_by,omitempty"`
	ApprovedBy        *uuid.UUID     `gorm:"type:uuid;index" json:"approved_by,omitempty"`
	ApprovedAt        *time.Time     `json:"approved_at,omitempty"`
	StartedAt         *time.Time     `json:"started_at,omitempty"`
	CompletedAt       *time.Time     `json:"completed_at,omitempty"`
	LastError         string         `gorm:"type:text" json:"last_error,omitempty"`
	CreatedAt         time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt         time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
}

func (EntitySchemaChangeJob) TableName() string { return "entity_schema_change_jobs" }

// EntityForm stores a tenant-scoped, revisioned presentation contract for
// creating, editing, or reading records without changing the published schema.
type EntityForm struct {
	ID              uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	WorkspaceID     uuid.UUID      `gorm:"type:uuid;not null;index" json:"workspace_id"`
	DefinitionID    uuid.UUID      `gorm:"type:uuid;not null;index" json:"definition_id"`
	NameAr          string         `gorm:"type:varchar(120);not null" json:"name_ar"`
	NameEn          string         `gorm:"type:varchar(120);not null" json:"name_en"`
	Mode            string         `gorm:"type:varchar(16);not null;default:'create'" json:"mode"`
	Status          string         `gorm:"type:varchar(16);not null;default:'active'" json:"status"`
	Layout          datatypes.JSON `gorm:"type:jsonb;not null;default:'{}'" json:"layout"`
	VisibilityRules datatypes.JSON `gorm:"type:jsonb;not null;default:'[]'" json:"visibility_rules"`
	Revision        int            `gorm:"not null;default:1" json:"revision"`
	IsDefault       bool           `gorm:"not null;default:false" json:"is_default"`
	CreatedBy       *uuid.UUID     `gorm:"type:uuid;index" json:"created_by,omitempty"`
	UpdatedBy       *uuid.UUID     `gorm:"type:uuid;index" json:"updated_by,omitempty"`
	CreatedAt       time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt       time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt       gorm.DeletedAt `gorm:"index" json:"-"`
}

func (EntityForm) TableName() string { return "entity_forms" }

// EntityView stores an allowlisted query and visual configuration. Query and
// config are validated before persistence and never interpreted as SQL.
type EntityView struct {
	ID           uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	WorkspaceID  uuid.UUID      `gorm:"type:uuid;not null;index" json:"workspace_id"`
	DefinitionID uuid.UUID      `gorm:"type:uuid;not null;index" json:"definition_id"`
	NameAr       string         `gorm:"type:varchar(120);not null" json:"name_ar"`
	NameEn       string         `gorm:"type:varchar(120);not null" json:"name_en"`
	ViewType     string         `gorm:"type:varchar(16);not null;default:'table'" json:"view_type"`
	Sharing      string         `gorm:"type:varchar(16);not null;default:'workspace'" json:"sharing"`
	Query        datatypes.JSON `gorm:"type:jsonb;not null;default:'{}'" json:"query"`
	Config       datatypes.JSON `gorm:"type:jsonb;not null;default:'{}'" json:"config"`
	Revision     int            `gorm:"not null;default:1" json:"revision"`
	IsDefault    bool           `gorm:"not null;default:false" json:"is_default"`
	OwnerID      *uuid.UUID     `gorm:"type:uuid;index" json:"owner_id,omitempty"`
	CreatedBy    *uuid.UUID     `gorm:"type:uuid;index" json:"created_by,omitempty"`
	UpdatedBy    *uuid.UUID     `gorm:"type:uuid;index" json:"updated_by,omitempty"`
	CreatedAt    time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt    time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"-"`
}

func (EntityView) TableName() string { return "entity_views" }

// EntityRelation is the published contract for one relation field. It is
// tenant-scoped on both sides so a malformed draft can never create a
// cross-workspace edge.
type EntityRelation struct {
	ID                 uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	WorkspaceID        uuid.UUID `gorm:"type:uuid;not null;index" json:"workspace_id"`
	SourceDefinitionID uuid.UUID `gorm:"type:uuid;not null;index;uniqueIndex:idx_entity_relation_source_field" json:"source_definition_id"`
	SourceFieldKey     string    `gorm:"type:varchar(63);not null;uniqueIndex:idx_entity_relation_source_field" json:"source_field_key"`
	TargetDefinitionID uuid.UUID `gorm:"type:uuid;not null;index" json:"target_definition_id"`
	Cardinality        string    `gorm:"type:varchar(12);not null" json:"cardinality"`
	OnDelete           string    `gorm:"type:varchar(12);not null;default:'restrict'" json:"on_delete"`
	LabelAr            string    `gorm:"type:varchar(120)" json:"label_ar"`
	LabelEn            string    `gorm:"type:varchar(120)" json:"label_en"`
	Required           bool      `gorm:"not null;default:false" json:"required"`
	CreatedAt          time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt          time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

func (EntityRelation) TableName() string { return "entity_relations" }

// EntityRecordRelation stores materialized record links separately from JSONB,
// making referential checks and reverse traversal reliable and indexable.
type EntityRecordRelation struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	WorkspaceID    uuid.UUID `gorm:"type:uuid;not null;index" json:"workspace_id"`
	RelationID     uuid.UUID `gorm:"type:uuid;not null;index;uniqueIndex:idx_record_relation_edge" json:"relation_id"`
	SourceRecordID uuid.UUID `gorm:"type:uuid;not null;index;uniqueIndex:idx_record_relation_edge" json:"source_record_id"`
	TargetRecordID uuid.UUID `gorm:"type:uuid;not null;index;uniqueIndex:idx_record_relation_edge" json:"target_record_id"`
	CreatedAt      time.Time `gorm:"autoCreateTime" json:"created_at"`
}

func (EntityRecordRelation) TableName() string { return "entity_record_relations" }

// OutboxEvent is written in the same database transaction as the aggregate.
// A background dispatcher retries publication, preventing committed records
// from silently losing Workflow/n8n/Centrifugo/AI events.
type OutboxEvent struct {
	ID            uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	WorkspaceID   uuid.UUID      `gorm:"type:uuid;not null;index" json:"workspace_id"`
	Subject       string         `gorm:"type:varchar(180);not null" json:"subject"`
	EventType     string         `gorm:"type:varchar(180);not null;index" json:"event_type"`
	AggregateType string         `gorm:"type:varchar(80);not null" json:"aggregate_type"`
	AggregateID   uuid.UUID      `gorm:"type:uuid;not null;index" json:"aggregate_id"`
	Payload       datatypes.JSON `gorm:"type:jsonb;not null" json:"payload"`
	Status        string         `gorm:"type:varchar(16);not null;default:'pending';index" json:"status"`
	Attempts      int            `gorm:"not null;default:0" json:"attempts"`
	AvailableAt   time.Time      `gorm:"not null;index" json:"available_at"`
	PublishedAt   *time.Time     `json:"published_at,omitempty"`
	LastError     string         `gorm:"type:text" json:"last_error,omitempty"`
	CreatedAt     time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt     time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
}

func (OutboxEvent) TableName() string { return "outbox_events" }
