package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type Workspace struct {
	ID        uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	Name      string    `gorm:"type:varchar(255);not null"`
	Industry  string    `gorm:"type:varchar(100)"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

type WorkspaceSetting struct {
	ID          uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	WorkspaceID uuid.UUID      `gorm:"type:uuid;index;uniqueIndex:idx_workspace_setting"`
	Workspace   *Workspace     `gorm:"foreignKey:WorkspaceID;constraint:OnDelete:CASCADE;"`
	Key         string         `gorm:"type:varchar(255);not null;uniqueIndex:idx_workspace_setting"` // e.g. "ai_providers"
	Value       datatypes.JSON `gorm:"type:jsonb;not null"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type WorkspaceIntegration struct {
	ID           uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	WorkspaceID  uuid.UUID `gorm:"type:uuid;index;uniqueIndex:idx_workspace_provider"`
	Workspace    Workspace `gorm:"foreignKey:WorkspaceID;constraint:OnDelete:CASCADE;"`
	Provider     string    `gorm:"type:varchar(50);not null;uniqueIndex:idx_workspace_provider"` // e.g., "google"
	AccessToken  string    `gorm:"type:text;not null"`
	RefreshToken string    `gorm:"type:text"`
	Expiry       time.Time
	Metadata     datatypes.JSON `gorm:"type:jsonb;default:'{}'"` // Store SpreadsheetID, etc.
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

type User struct {
	ID           uuid.UUID   `gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	WorkspaceID  uuid.UUID   `gorm:"type:uuid;index"`
	Workspace    Workspace   `gorm:"foreignKey:WorkspaceID"`
	Email        string      `gorm:"type:varchar(255);unique;not null"`
	PasswordHash string      `gorm:"type:varchar(255);not null"`
	Role         string      `gorm:"type:varchar(50);not null"` // Legacy string role (can be migrated)
	RoleID       *uuid.UUID  `gorm:"type:uuid;index"`
	RoleRef      *Role       `gorm:"foreignKey:RoleID;constraint:OnDelete:SET NULL;"`
	DepartmentID *uuid.UUID  `gorm:"type:uuid;index"`
	Department   *Department `gorm:"foreignKey:DepartmentID;constraint:OnDelete:SET NULL;"`
	JobTitle     string      `gorm:"type:varchar(100)"`
	// Pointer so absent values insert NULL — the unique index rejects a second
	// empty string but allows any number of NULLs
	EmployeeID   *string     `gorm:"type:varchar(50);uniqueIndex"`
	Avatar       string      `gorm:"type:text"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

type Project struct {
	ID          uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	WorkspaceID uuid.UUID      `gorm:"type:uuid;index"`
	CreatedBy   uuid.UUID      `gorm:"type:uuid;index"`
	Name            string         `gorm:"type:varchar(100);not null"`
	Settings        datatypes.JSON `gorm:"type:jsonb;default:'{}'"` // Store agile/scrum configs here
	DriveFolderLink string         `gorm:"type:varchar(255)"` // Link to Google Drive Folder
	CreatedAt       time.Time      `gorm:"autoCreateTime"`
	UpdatedAt       time.Time      `gorm:"autoUpdateTime"`
}

type Entity struct {
	ID          uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID uuid.UUID      `gorm:"type:uuid;index" json:"workspace_id"`
	Workspace   Workspace      `gorm:"foreignKey:WorkspaceID" json:"-"`
	ProjectID   *uuid.UUID     `gorm:"type:uuid;index" json:"project_id"`
	Project     *Project       `gorm:"foreignKey:ProjectID" json:"-"`
	EntityType  string         `gorm:"type:varchar(100);not null;index" json:"entity_type"`
	Data        datatypes.JSON `gorm:"type:jsonb;not null" json:"data"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}

type WorkDoc struct {
	ID        uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	ProjectID uuid.UUID `gorm:"type:uuid;index;not null"`
	Project   Project   `gorm:"foreignKey:ProjectID;constraint:OnDelete:CASCADE;"`
	Title     string    `gorm:"type:varchar(255);not null"`
	TemplateType string `gorm:"type:varchar(50);default:'empty'"`
	Content   string    `gorm:"type:text"`
	CreatedBy uuid.UUID `gorm:"type:uuid;index"`
	User      User      `gorm:"foreignKey:CreatedBy"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

type Channel struct {
	ID          uuid.UUID  `gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	WorkspaceID uuid.UUID  `gorm:"type:uuid;index"`
	Workspace   Workspace  `gorm:"foreignKey:WorkspaceID"`
	ProjectID   *uuid.UUID `gorm:"type:uuid;index"`
	Project     Project    `gorm:"foreignKey:ProjectID"`
	Name        string     `gorm:"type:varchar(255);not null"`
	Type        string     `gorm:"type:varchar(20);default:'PUBLIC'"`
	CreatedByID *uuid.UUID `gorm:"type:uuid;index"`
	CreatedBy   *User      `gorm:"foreignKey:CreatedByID"`
	IsArchived  bool       `gorm:"default:false"`
	IsSystem    bool       `gorm:"default:false"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type Message struct {
	ID            uuid.UUID       `gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	ChannelID     uuid.UUID       `gorm:"type:uuid;not null;index"`
	Channel       Channel         `gorm:"foreignKey:ChannelID;constraint:OnDelete:CASCADE;"`
	SenderID      uuid.UUID       `gorm:"type:uuid;not null;index"`
	User          *User           `gorm:"foreignKey:SenderID;constraint:OnDelete:CASCADE;"`
	ParentID      *uuid.UUID      `gorm:"type:uuid;index"`
	Replies       []Message       `gorm:"foreignKey:ParentID"`
	Content       string          `gorm:"type:text;not null"`
	IsAIGenerated bool            `gorm:"default:false"`
	AIAgentRole   string          `gorm:"type:varchar(50)"`
	AIProposal    *datatypes.JSON `gorm:"type:jsonb"`
	AttachmentURL  string          `gorm:"type:varchar(255)"`
	AttachmentType string          `gorm:"type:varchar(50)"`
	EntityType    string          `gorm:"type:varchar(50)"`
	EntityID      *uuid.UUID      `gorm:"type:uuid;index"`
	CreatedAt     time.Time       `gorm:"autoCreateTime"`
	UpdatedAt     time.Time       `gorm:"autoUpdateTime"`
}

// ─── Organization & RBAC Domain ──────────────────────────────────────────────

type Department struct {
	ID        uuid.UUID   `gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	Name      string      `gorm:"type:varchar(100);not null"`
	ParentID  *uuid.UUID  `gorm:"type:uuid;index"`
	Parent    *Department `gorm:"foreignKey:ParentID"`
	ManagerID *uuid.UUID  `gorm:"type:uuid;index"`
	CreatedAt time.Time
}

type Role struct {
	ID           uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	Name         string    `gorm:"type:varchar(50);not null;uniqueIndex"`
	Description  string    `gorm:"type:text"`
	IsSystemRole bool      `gorm:"default:false"`
}

type Permission struct {
	ID     uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	Name   string    `gorm:"type:varchar(100);not null;uniqueIndex"`
	Module string    `gorm:"type:varchar(50)"`
}

type RolePermission struct {
	RoleID       uuid.UUID  `gorm:"type:uuid;primaryKey"`
	PermissionID uuid.UUID  `gorm:"type:uuid;primaryKey"`
	Role         Role       `gorm:"foreignKey:RoleID;constraint:OnDelete:CASCADE;"`
	Permission   Permission `gorm:"foreignKey:PermissionID;constraint:OnDelete:CASCADE;"`
}

type AuditLog struct {
	ID         uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	UserID     *uuid.UUID     `gorm:"type:uuid;index"`
	User       *User          `gorm:"foreignKey:UserID;constraint:OnDelete:SET NULL;"`
	Action     string         `gorm:"type:varchar(100);not null;index"` // e.g. "project.delete"
	EntityType string         `gorm:"type:varchar(50);index"`           // e.g. "Project"
	EntityID   string         `gorm:"type:varchar(50);index"`
	Details    datatypes.JSON `gorm:"type:jsonb"`
	IPAddress  string         `gorm:"type:varchar(50)"`
	CreatedAt  time.Time      `gorm:"autoCreateTime;index"`
}

// ─── Geofenced Attendance Domain ─────────────────────────────────────────────

type OfficeLocation struct {
	ID           uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	Name         string    `gorm:"type:varchar(100);not null"`
	Latitude     float64   `gorm:"type:decimal(10,8);not null"`
	Longitude    float64   `gorm:"type:decimal(11,8);not null"`
	RadiusMeters int       `gorm:"default:50"`
	CreatedAt    time.Time
}

type AttendanceLog struct {
	ID           uuid.UUID       `gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	UserID       uuid.UUID       `gorm:"type:uuid;not null;index"`
	User         User            `gorm:"foreignKey:UserID"`
	OfficeID     uuid.UUID       `gorm:"type:uuid;not null;index"`
	Office       OfficeLocation  `gorm:"foreignKey:OfficeID"`
	CheckInTime  time.Time       `gorm:"not null"`
	CheckInLat   float64         `gorm:"type:decimal(10,8)"`
	CheckInLng   float64         `gorm:"type:decimal(11,8)"`
	CheckOutTime *time.Time
	CheckOutLat  *float64        `gorm:"type:decimal(10,8)"`
	CheckOutLng  *float64        `gorm:"type:decimal(11,8)"`
	Status       string          `gorm:"type:varchar(50)"` // 'present', 'late', 'absent'
}

// ─── Project Management (PM) Domain Expansion ───────────────────────────────

type Task struct {
	ID          uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	ProjectID   uuid.UUID      `gorm:"type:uuid;not null;index"`
	Project     *Project       `gorm:"foreignKey:ProjectID;constraint:OnDelete:CASCADE;"`
	Title       string         `gorm:"type:varchar(255);not null"`
	Description string         `gorm:"type:text"`
	ParentID    *uuid.UUID     `gorm:"type:uuid;index"`
	Parent      *Task          `gorm:"foreignKey:ParentID;constraint:OnDelete:CASCADE;"`
	Path        string         `gorm:"type:ltree;index:,type:gist"`
	Status      string         `gorm:"type:varchar(50);default:'todo'"` // 'todo', 'in_progress', 'review', 'done'
	Priority    int            `gorm:"type:int;default:0"`
	AssigneeID  *uuid.UUID     `gorm:"type:uuid;index"`
	Assignee    *User          `gorm:"foreignKey:AssigneeID;constraint:OnDelete:SET NULL;"`
	SprintID    *uuid.UUID     `gorm:"type:uuid;index"`
	Sprint      *Sprint        `gorm:"foreignKey:SprintID;constraint:OnDelete:SET NULL;"`
	EpicID      *uuid.UUID     `gorm:"type:uuid;index"`
	StoryPoints int            `gorm:"type:int;default:0"`
	Metadata    datatypes.JSON `gorm:"type:jsonb;default:'{}'"` // Store estimation, labels, etc.
	StartDate   *time.Time     `gorm:"type:timestamp"`
	DueDate     *time.Time     `gorm:"type:timestamp"`
	CreatedAt   time.Time      `gorm:"autoCreateTime"`
	UpdatedAt   time.Time      `gorm:"autoUpdateTime"`
}

type TaskHistory struct {
	ID             uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	TaskID         uuid.UUID `gorm:"type:uuid;not null;index"`
	Task           *Task     `gorm:"foreignKey:TaskID;constraint:OnDelete:CASCADE;"`
	PreviousStatus string    `gorm:"type:varchar(50)"`
	NewStatus      string    `gorm:"type:varchar(50);not null"`
	ChangedAt      time.Time `gorm:"autoCreateTime"`
}

type ChannelMember struct {
	ID        uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	ChannelID uuid.UUID `gorm:"type:uuid;index;uniqueIndex:idx_channel_user"`
	Channel   Channel   `gorm:"foreignKey:ChannelID"`
	UserID    uuid.UUID `gorm:"type:uuid;index;uniqueIndex:idx_channel_user"`
	User      User      `gorm:"foreignKey:UserID"`
	Role      string    `gorm:"type:varchar(20);default:'MEMBER'"`
	IsMuted   bool      `gorm:"default:false"`
	JoinedAt  time.Time
}

// ─── Workflow Automation Domain ─────────────────────────────────────────────

type Workflow struct {
	ID          uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	WorkspaceID uuid.UUID      `gorm:"type:uuid;index"`
	Workspace   *Workspace     `gorm:"foreignKey:WorkspaceID"`
	Name        string         `gorm:"type:varchar(255);not null"`
	IsActive    bool           `gorm:"default:true"`
	Nodes       datatypes.JSON `gorm:"type:jsonb;default:'[]'"`
	Edges       datatypes.JSON `gorm:"type:jsonb;default:'[]'"`
	CreatedAt   time.Time      `gorm:"autoCreateTime"`
	UpdatedAt   time.Time      `gorm:"autoUpdateTime"`
}

// WorkflowRun tracks each execution of a workflow
type WorkflowRun struct {
	ID          uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	WorkflowID  uuid.UUID      `gorm:"type:uuid;index;not null"`
	Workflow    *Workflow      `gorm:"foreignKey:WorkflowID;constraint:OnDelete:CASCADE;"`
	TriggerName string         `gorm:"type:varchar(100)"`  // e.g. "task.done"
	Status      string         `gorm:"type:varchar(50)"` // "success" | "failed" | "partial"
	Context     datatypes.JSON `gorm:"type:jsonb;default:'{}'"` // event data snapshot
	CreatedAt   time.Time      `gorm:"autoCreateTime"`
}

// ─── Official Correspondence & Institutional Registry Domain ────────────────

type CorrespondenceTemplate struct {
	ID                uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	WorkspaceID       uuid.UUID      `gorm:"type:uuid;index;not null" json:"workspace_id"`
	Workspace         *Workspace     `gorm:"foreignKey:WorkspaceID;constraint:OnDelete:CASCADE;" json:"-"`
	TemplateName      string         `gorm:"type:varchar(255);not null" json:"template_name"`
	LogoURL           string         `gorm:"type:text" json:"logo_url"`
	CompanyHeaderData datatypes.JSON `gorm:"type:jsonb;default:'{}'" json:"company_header_data"` // Name, TaxID, CR, Addresses (AR/EN)
	CompanyFooterData datatypes.JSON `gorm:"type:jsonb;default:'{}'" json:"company_footer_data"` // Phones, Email, Bank Info, Legal Disclaimer
	StylingConfig     datatypes.JSON `gorm:"type:jsonb;default:'{}'" json:"styling_config"`      // PrimaryColor, Font, Margins
	IsDefault         bool           `gorm:"default:false" json:"is_default"`
	CreatedAt         time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt         time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
}

type Correspondence struct {
	ID                uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	WorkspaceID       uuid.UUID      `gorm:"type:uuid;index;not null" json:"workspace_id"`
	Workspace         *Workspace     `gorm:"foreignKey:WorkspaceID;constraint:OnDelete:CASCADE;" json:"-"`
	TemplateID        *uuid.UUID     `gorm:"type:uuid;index" json:"template_id"`
	Template          *CorrespondenceTemplate `gorm:"foreignKey:TemplateID;constraint:OnDelete:SET NULL;" json:"template,omitempty"`
	SerialNumber      string         `gorm:"type:varchar(100);index" json:"serial_number"` // e.g. SO-HR-2026-0001
	Title             string         `gorm:"type:varchar(500);not null" json:"title"`
	Content           string         `gorm:"type:text;not null" json:"content"` // Rich HTML / Text
	SenderType        string         `gorm:"type:varchar(50);default:'internal'" json:"sender_type"` // internal, external
	SenderDetails     datatypes.JSON `gorm:"type:jsonb;default:'{}'" json:"sender_details"`
	RecipientDetails  datatypes.JSON `gorm:"type:jsonb;default:'{}'" json:"recipient_details"`
	SecurityLevel     string         `gorm:"type:varchar(50);default:'normal'" json:"security_level"` // normal, confidential, top_secret
	Status            string         `gorm:"type:varchar(50);default:'draft';index" json:"status"` // draft, pending_approval, signed, dispatched, archived
	Path              string         `gorm:"type:ltree;index:idx_correspondences_path,type:gist" json:"path"` // Forwarding hierarchy e.g. hr_mgr.ops_mgr
	TSV               string         `gorm:"type:tsvector" json:"-"`
	Attachments       datatypes.JSON `gorm:"type:jsonb;default:'[]'" json:"attachments"`
	QRToken           string         `gorm:"type:varchar(255);index" json:"qr_token"`           // Token encrypted/hashed for QR code check
	QRCodeURL         string         `gorm:"type:text" json:"qr_code_url"`                      // Verification link / QR code content
	ExternalReference string         `gorm:"type:varchar(255)" json:"external_reference"`       // External signature or reference info
	CreatedByID       uuid.UUID      `gorm:"type:uuid;index;not null" json:"created_by_id"`
	CreatedBy         *User          `gorm:"foreignKey:CreatedByID" json:"created_by,omitempty"`
	CurrentHolderID   uuid.UUID      `gorm:"type:uuid;index" json:"current_holder_id"`          // Current officer responsible
	CurrentHolder     *User          `gorm:"foreignKey:CurrentHolderID" json:"current_holder,omitempty"`
	SignedAt          *time.Time     `json:"signed_at"`
	ArchivedAt        *time.Time     `json:"archived_at"`
	CreatedAt         time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt         time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
}

type CorrespondenceForwardLog struct {
	ID               uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	CorrespondenceID uuid.UUID      `gorm:"type:uuid;index;not null" json:"correspondence_id"`
	Correspondence   *Correspondence `gorm:"foreignKey:CorrespondenceID;constraint:OnDelete:CASCADE;" json:"-"`
	FromUserID       uuid.UUID      `gorm:"type:uuid;not null" json:"from_user_id"`
	FromUser         *User          `gorm:"foreignKey:FromUserID" json:"from_user,omitempty"`
	ToUserID         uuid.UUID      `gorm:"type:uuid;not null" json:"to_user_id"`
	ToUser           *User          `gorm:"foreignKey:ToUserID" json:"to_user,omitempty"`
	OfficialNote     string         `gorm:"type:text" json:"official_note"`
	PathSegment      string         `gorm:"type:varchar(255)" json:"path_segment"`
	ForwardedAt      time.Time      `gorm:"autoCreateTime" json:"forwarded_at"`
}
