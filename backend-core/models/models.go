package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type Workspace struct {
	ID                uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	Slug              string    `gorm:"type:varchar(63);uniqueIndex;not null;default:'default'"`
	Name              string    `gorm:"type:varchar(255);not null"`
	Industry          string    `gorm:"type:varchar(100)"`
	Tier              string    `gorm:"type:varchar(50);not null;default:'free'"`   // 'free', 'starter', 'business', 'enterprise'
	Status            string    `gorm:"type:varchar(30);not null;default:'active'"` // 'active', 'suspended', 'cancelled'
	StorageQuotaBytes int64     `gorm:"type:bigint;not null;default:10737418240"`   // 10 GB default
	StorageUsedBytes  int64     `gorm:"type:bigint;not null;default:0"`
	CreatedAt         time.Time
	UpdatedAt         time.Time
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
	EmployeeID *string        `gorm:"type:varchar(50);uniqueIndex"`
	Avatar     string         `gorm:"type:text"`
	Data       datatypes.JSON `gorm:"type:jsonb"`
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

type Project struct {
	ID              uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	WorkspaceID     uuid.UUID      `gorm:"type:uuid;index"`
	CreatedBy       uuid.UUID      `gorm:"type:uuid;index"`
	SystemKey       *string        `gorm:"type:varchar(63);index" json:"SystemKey,omitempty"`
	Name            string         `gorm:"type:varchar(100);not null"`
	Settings        datatypes.JSON `gorm:"type:jsonb;default:'{}'"` // Store agile/scrum configs here
	DriveFolderLink string         `gorm:"type:varchar(255)"`       // Link to Google Drive Folder
	CreatedAt       time.Time      `gorm:"autoCreateTime"`
	UpdatedAt       time.Time      `gorm:"autoUpdateTime"`
}

type Entity struct {
	ID            uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID   uuid.UUID      `gorm:"type:uuid;index:idx_workspace_type_entities" json:"workspace_id"`
	Workspace     Workspace      `gorm:"foreignKey:WorkspaceID" json:"-"`
	ProjectID     *uuid.UUID     `gorm:"type:uuid;index" json:"project_id"`
	Project       *Project       `gorm:"foreignKey:ProjectID" json:"-"`
	DefinitionID  *uuid.UUID     `gorm:"type:uuid;index" json:"definition_id,omitempty"`
	SchemaVersion int            `gorm:"not null;default:0" json:"schema_version"`
	RecordVersion int            `gorm:"not null;default:1" json:"record_version"`
	DisplayValue  string         `gorm:"type:varchar(500)" json:"display_value,omitempty"`
	CreatedBy     *uuid.UUID     `gorm:"type:uuid;index" json:"created_by,omitempty"`
	UpdatedBy     *uuid.UUID     `gorm:"type:uuid;index" json:"updated_by,omitempty"`
	EntityType    string         `gorm:"type:varchar(100);not null;index:idx_workspace_type_entities" json:"entity_type"`
	Data          datatypes.JSON `gorm:"type:jsonb;not null;index:,type:gin" json:"data"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}

type WorkDoc struct {
	ID           uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	WorkspaceID  uuid.UUID `gorm:"type:uuid;index"`
	ProjectID    uuid.UUID `gorm:"type:uuid;index;not null"`
	Project      Project   `gorm:"foreignKey:ProjectID;constraint:OnDelete:CASCADE;"`
	Title        string    `gorm:"type:varchar(255);not null"`
	TemplateType string    `gorm:"type:varchar(50);default:'empty'"`
	Content      string    `gorm:"type:text"`
	CreatedBy    uuid.UUID `gorm:"type:uuid;index"`
	User         User      `gorm:"foreignKey:CreatedBy"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

type Channel struct {
	ID          uuid.UUID       `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID uuid.UUID       `gorm:"type:uuid;index" json:"workspace_id"`
	Workspace   Workspace       `gorm:"foreignKey:WorkspaceID" json:"-"`
	ProjectID   *uuid.UUID      `gorm:"type:uuid;index" json:"project_id,omitempty"`
	Project     Project         `gorm:"foreignKey:ProjectID" json:"-"`
	Name        string          `gorm:"type:varchar(255);not null" json:"name"`
	Description string          `gorm:"type:text" json:"description,omitempty"`
	Type        string          `gorm:"type:varchar(20);default:'PUBLIC'" json:"type"`
	CreatedByID *uuid.UUID      `gorm:"type:uuid;index" json:"created_by_id,omitempty"`
	CreatedBy   *User           `gorm:"foreignKey:CreatedByID" json:"-"`
	IsArchived  bool            `gorm:"default:false" json:"is_archived"`
	IsSystem    bool            `gorm:"default:false" json:"is_system"`
	Members     []ChannelMember `gorm:"foreignKey:ChannelID" json:"members,omitempty"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

type Message struct {
	ID uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	// Denormalised tenant key. Messages are reachable only through a channel, so
	// this duplicates channels.workspace_id — but a row-level tenant policy can
	// only be written against a column on the table itself. BeforeCreate fills it
	// from the channel, so no create path has to remember to set it.
	WorkspaceID    uuid.UUID       `gorm:"type:uuid;index" json:"workspace_id"`
	ChannelID      uuid.UUID       `gorm:"type:uuid;not null;index" json:"channel_id"`
	Channel        Channel         `gorm:"foreignKey:ChannelID;constraint:OnDelete:CASCADE;" json:"-"`
	SenderID       uuid.UUID       `gorm:"type:uuid;not null;index" json:"sender_id"`
	User           *User           `gorm:"foreignKey:SenderID;constraint:OnDelete:CASCADE;" json:"user,omitempty"`
	ParentID       *uuid.UUID      `gorm:"type:uuid;index" json:"parent_id,omitempty"`
	Replies        []Message       `gorm:"foreignKey:ParentID;constraint:OnDelete:CASCADE;" json:"-"`
	Content        string          `gorm:"type:text;not null" json:"content"`
	IsAIGenerated  bool            `gorm:"default:false" json:"is_ai_generated"`
	AIAgentRole    string          `gorm:"type:varchar(50)" json:"ai_agent_role,omitempty"`
	AIProposal     *datatypes.JSON `gorm:"type:jsonb" json:"ai_proposal,omitempty"`
	AttachmentURL  string          `gorm:"type:varchar(255)" json:"attachment_url,omitempty"`
	AttachmentType string          `gorm:"type:varchar(50)" json:"attachment_type,omitempty"`
	EntityType     string          `gorm:"type:varchar(50)" json:"entity_type,omitempty"`
	EntityID       *uuid.UUID      `gorm:"type:uuid;index" json:"entity_id,omitempty"`
	CreatedAt      time.Time       `gorm:"autoCreateTime;not null" json:"created_at"`
	UpdatedAt      time.Time       `gorm:"autoUpdateTime" json:"updated_at"`
}

// ─── Organization & RBAC Domain ──────────────────────────────────────────────

type Department struct {
	ID                uuid.UUID   `gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	WorkspaceID       uuid.UUID   `gorm:"type:uuid;index" json:"workspace_id"`
	Name              string      `gorm:"type:varchar(100);not null"`
	ParentID          *uuid.UUID  `gorm:"type:uuid;index"`
	Parent            *Department `gorm:"foreignKey:ParentID"`
	ManagerID         *uuid.UUID  `gorm:"type:uuid;index"`
	StorageQuotaBytes int64       `gorm:"type:bigint;not null;default:0"` // 0 means no limit (uses workspace limit)
	StorageUsedBytes  int64       `gorm:"type:bigint;not null;default:0"`
	MaxFileSize       int64       `gorm:"type:bigint;not null;default:10485760"` // Default 10MB limit per file
	CreatedAt         time.Time
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
	ID          uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	WorkspaceID *uuid.UUID     `gorm:"type:uuid;index"`
	UserID      *uuid.UUID     `gorm:"type:uuid;index"`
	User        *User          `gorm:"foreignKey:UserID;constraint:OnDelete:SET NULL;"`
	Action      string         `gorm:"type:varchar(100);not null;index"` // e.g. "project.delete"
	EntityType  string         `gorm:"type:varchar(50);index"`           // e.g. "Project"
	EntityID    string         `gorm:"type:varchar(50);index"`
	Details     datatypes.JSON `gorm:"type:jsonb"`
	IPAddress   string         `gorm:"type:varchar(50)"`
	CreatedAt   time.Time      `gorm:"autoCreateTime;index;not null"`
}

// ─── Geofenced Attendance Domain ─────────────────────────────────────────────

type OfficeLocation struct {
	ID           uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	WorkspaceID  uuid.UUID `gorm:"type:uuid;index"`
	Name         string    `gorm:"type:varchar(100);not null"`
	Latitude     float64   `gorm:"type:decimal(10,8);not null"`
	Longitude    float64   `gorm:"type:decimal(11,8);not null"`
	RadiusMeters int       `gorm:"default:50"`
	CreatedAt    time.Time
}

type AttendanceLog struct {
	ID uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	// Denormalised tenant key — see the note on Message.WorkspaceID.
	// Derived from the employee's workspace by BeforeCreate.
	WorkspaceID  uuid.UUID      `gorm:"type:uuid;index"`
	UserID       uuid.UUID      `gorm:"type:uuid;not null;index"`
	User         User           `gorm:"foreignKey:UserID"`
	OfficeID     uuid.UUID      `gorm:"type:uuid;not null;index"`
	Office       OfficeLocation `gorm:"foreignKey:OfficeID"`
	CheckInTime  time.Time      `gorm:"not null"`
	CheckInLat   float64        `gorm:"type:decimal(10,8)"`
	CheckInLng   float64        `gorm:"type:decimal(11,8)"`
	CheckOutTime *time.Time
	CheckOutLat  *float64 `gorm:"type:decimal(10,8)"`
	CheckOutLng  *float64 `gorm:"type:decimal(11,8)"`
	Status       string   `gorm:"type:varchar(50)"` // 'present', 'late', 'absent'
}

// Employee is the relational anchor for the HR module.
//
// Employees were previously stored only as generic JSONB entities
// (entity_type='hr_employee'), which left AttendanceLog (keyed by UserID) and
// payroll with no first-class link to a person. This table is that missing
// link: UserID ties an employee to their login — and through it to their
// AttendanceLog rows — while EmployeeNumber is the stable business key.
// Attributes keeps the JSONB flexibility the entity model offered for
// org-specific fields, so the migration loses nothing.
//
// The read-compat backfill (migration 2026073002) populates this table from
// existing hr_employee entities and records the source in LegacyEntityID so
// re-runs stay idempotent.
type Employee struct {
	ID          uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID uuid.UUID `gorm:"type:uuid;not null;index:idx_employees_workspace" json:"workspace_id"`
	// UserID links the employee to their login account, and through it to
	// AttendanceLog.UserID. Nullable — not every employee has a system login.
	UserID *uuid.UUID `gorm:"type:uuid;index:idx_employees_user" json:"user_id,omitempty"`

	EmployeeNumber string     `gorm:"type:varchar(50)" json:"employee_number,omitempty"`
	FullName       string     `gorm:"type:varchar(200);not null" json:"full_name"`
	FullNameAr     string     `gorm:"type:varchar(200)" json:"full_name_ar,omitempty"`
	Email          string     `gorm:"type:varchar(255)" json:"email,omitempty"`
	Phone          string     `gorm:"type:varchar(50)" json:"phone,omitempty"`
	Department     string     `gorm:"type:varchar(100);index" json:"department,omitempty"`
	Position       string     `gorm:"type:varchar(150)" json:"position,omitempty"`
	ManagerID      *uuid.UUID `gorm:"type:uuid;index" json:"manager_id,omitempty"`
	EmploymentType string     `gorm:"type:varchar(50)" json:"employment_type,omitempty"` // full_time, part_time, contract
	Status         string     `gorm:"type:varchar(50);not null;default:'active'" json:"status"`

	HireDate        *time.Time `gorm:"type:date" json:"hire_date,omitempty"`
	TerminationDate *time.Time `gorm:"type:date" json:"termination_date,omitempty"`

	// Compensation — the fields PayrollRunModal reads, now typed and validated.
	BaseSalary         float64 `gorm:"type:decimal(12,2);not null;default:0" json:"base_salary"`
	HousingAllowance   float64 `gorm:"type:decimal(12,2);not null;default:0" json:"housing_allowance"`
	TransportAllowance float64 `gorm:"type:decimal(12,2);not null;default:0" json:"transport_allowance"`
	IBAN               string  `gorm:"type:varchar(34)" json:"iban,omitempty"`

	// Gulf-compliance fields — drive the residency/insurance expiry alerts.
	Nationality     string     `gorm:"type:varchar(100)" json:"nationality,omitempty"`
	IqamaExpiry     *time.Time `gorm:"type:date" json:"iqama_expiry,omitempty"`
	InsuranceExpiry *time.Time `gorm:"type:date" json:"insurance_expiry,omitempty"`

	// LegacyEntityID ties a row back to the hr_employee entity it was backfilled
	// from, keeping the migration and any re-run idempotent.
	LegacyEntityID *uuid.UUID `gorm:"type:uuid;index" json:"legacy_entity_id,omitempty"`
	// Attributes preserves org-specific JSONB fields from the entity model.
	Attributes datatypes.JSON `gorm:"type:jsonb" json:"attributes,omitempty"`

	CreatedBy *uuid.UUID     `gorm:"type:uuid" json:"created_by,omitempty"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}

// LeaveBalance is a per-employee, per-type, per-year leave ledger.
//
// It is the relational half of the leave engine (G2): entitlement is computed
// from Saudi labour law by tenure (annual = 21 days, 30 after 5 years of
// service — Art. 109), stored here alongside carry-over and manual HR
// adjustments. Remaining = Entitled + CarriedOver + Adjustment − Taken is
// derived at read time, never stored, so it can never drift.
//
// Keyed to Employee.ID (not the loosely-name-linked hr_leave_request entities),
// so a balance always belongs to exactly one person.
type LeaveBalance struct {
	ID          uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID uuid.UUID `gorm:"type:uuid;not null;index:idx_leave_balances_workspace" json:"workspace_id"`
	EmployeeID  uuid.UUID `gorm:"type:uuid;not null;index:idx_leave_balances_employee" json:"employee_id"`

	LeaveType string `gorm:"type:varchar(50);not null" json:"leave_type"` // annual, sick, hajj, maternity, unpaid
	Year      int    `gorm:"not null" json:"year"`

	EntitledDays    float64 `gorm:"type:decimal(6,2);not null;default:0" json:"entitled_days"`
	CarriedOverDays float64 `gorm:"type:decimal(6,2);not null;default:0" json:"carried_over_days"`
	AdjustmentDays  float64 `gorm:"type:decimal(6,2);not null;default:0" json:"adjustment_days"`
	TakenDays       float64 `gorm:"type:decimal(6,2);not null;default:0" json:"taken_days"`

	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}

// LeaveRequest is the relational replacement for hr_leave_request JSONB
// entities. The entity version linked an employee by NAME string, which made
// reliable balance deduction impossible; this table carries EmployeeID, so an
// approval can atomically move the requested days onto that person's
// LeaveBalance.TakenDays inside one transaction.
type LeaveRequest struct {
	ID          uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID uuid.UUID `gorm:"type:uuid;not null;index:idx_leave_requests_workspace" json:"workspace_id"`
	EmployeeID  uuid.UUID `gorm:"type:uuid;not null;index:idx_leave_requests_employee" json:"employee_id"`

	LeaveType string     `gorm:"type:varchar(50);not null;default:'annual'" json:"leave_type"`
	StartDate *time.Time `gorm:"type:date" json:"start_date,omitempty"`
	EndDate   *time.Time `gorm:"type:date" json:"end_date,omitempty"`
	Days      float64    `gorm:"type:decimal(6,2);not null;default:0" json:"days"`
	Reason    string     `gorm:"type:text" json:"reason,omitempty"`
	// Status transitions pending → approved | rejected. Deduction happens only
	// on the transition into approved, and is reversed on a move back out.
	Status    string     `gorm:"type:varchar(20);not null;default:'pending'" json:"status"`
	DecidedBy *uuid.UUID `gorm:"type:uuid" json:"decided_by,omitempty"`
	DecidedAt *time.Time `json:"decided_at,omitempty"`

	CreatedBy *uuid.UUID     `gorm:"type:uuid" json:"created_by,omitempty"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}

// PayrollRun is one month's payroll for a workspace. Generating a run snapshots
// every active employee into a Payslip with statutory GOSI applied, so the
// figures are frozen at run time and never recomputed from mutable employee
// rows afterwards. status: draft → posted.
type PayrollRun struct {
	ID          uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID uuid.UUID `gorm:"type:uuid;not null;index:idx_payroll_runs_workspace" json:"workspace_id"`

	Year  int `gorm:"not null" json:"year"`
	Month int `gorm:"not null" json:"month"` // 1–12

	Status        string  `gorm:"type:varchar(20);not null;default:'draft'" json:"status"`
	Currency      string  `gorm:"type:varchar(8);not null;default:'SAR'" json:"currency"`
	EmployeeCount int     `gorm:"not null;default:0" json:"employee_count"`
	TotalGross    float64 `gorm:"type:decimal(14,2);not null;default:0" json:"total_gross"`
	TotalGOSI     float64 `gorm:"type:decimal(14,2);not null;default:0" json:"total_gosi"`
	TotalNet      float64 `gorm:"type:decimal(14,2);not null;default:0" json:"total_net"`

	CreatedBy *uuid.UUID     `gorm:"type:uuid" json:"created_by,omitempty"`
	PostedAt  *time.Time     `json:"posted_at,omitempty"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`

	Payslips []Payslip `gorm:"foreignKey:PayrollRunID" json:"payslips,omitempty"`
}

// Payslip is one employee's line in a PayrollRun — a frozen snapshot including
// the GOSI split (employee deduction + employer contribution) and the net.
type Payslip struct {
	ID           uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID  uuid.UUID `gorm:"type:uuid;not null;index:idx_payslips_workspace" json:"workspace_id"`
	PayrollRunID uuid.UUID `gorm:"type:uuid;not null;index:idx_payslips_run" json:"payroll_run_id"`
	EmployeeID   uuid.UUID `gorm:"type:uuid;not null;index" json:"employee_id"`
	EmployeeName string    `gorm:"type:varchar(200)" json:"employee_name"`

	BaseSalary         float64 `gorm:"type:decimal(12,2);not null;default:0" json:"base_salary"`
	HousingAllowance   float64 `gorm:"type:decimal(12,2);not null;default:0" json:"housing_allowance"`
	TransportAllowance float64 `gorm:"type:decimal(12,2);not null;default:0" json:"transport_allowance"`
	OtherAllowances    float64 `gorm:"type:decimal(12,2);not null;default:0" json:"other_allowances"`
	GrossSalary        float64 `gorm:"type:decimal(12,2);not null;default:0" json:"gross_salary"`

	GosiEmployee    float64 `gorm:"type:decimal(12,2);not null;default:0" json:"gosi_employee"`
	GosiEmployer    float64 `gorm:"type:decimal(12,2);not null;default:0" json:"gosi_employer"`
	OtherDeductions float64 `gorm:"type:decimal(12,2);not null;default:0" json:"other_deductions"`
	NetSalary       float64 `gorm:"type:decimal(12,2);not null;default:0" json:"net_salary"`

	IBAN        string `gorm:"type:varchar(34)" json:"iban,omitempty"`
	Nationality string `gorm:"type:varchar(100)" json:"nationality,omitempty"`
	IsSaudi     bool   `gorm:"not null;default:false" json:"is_saudi"`

	CreatedAt time.Time `json:"created_at"`
}

// PerformanceGoal is an employee OKR / goal with quantitative progress (M3).
// Progress is derived from CurrentValue / TargetValue at read time so it never
// drifts from its inputs; a non-numeric goal can still be driven by status.
type PerformanceGoal struct {
	ID          uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID uuid.UUID `gorm:"type:uuid;not null;index:idx_goals_workspace" json:"workspace_id"`
	EmployeeID  uuid.UUID `gorm:"type:uuid;not null;index:idx_goals_employee" json:"employee_id"`

	Title        string  `gorm:"type:varchar(255);not null" json:"title"`
	Description  string  `gorm:"type:text" json:"description,omitempty"`
	Metric       string  `gorm:"type:varchar(100)" json:"metric,omitempty"` // unit label, e.g. "%", "deals"
	TargetValue  float64 `gorm:"type:decimal(14,2);not null;default:0" json:"target_value"`
	CurrentValue float64 `gorm:"type:decimal(14,2);not null;default:0" json:"current_value"`
	Period       string  `gorm:"type:varchar(20)" json:"period,omitempty"`                 // e.g. 2026-Q3
	Status       string  `gorm:"type:varchar(20);not null;default:'active'" json:"status"` // active/completed/cancelled

	CreatedBy *uuid.UUID     `gorm:"type:uuid" json:"created_by,omitempty"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}

// PerformanceReview is a periodic evaluation of an employee (M3). It moves
// draft → submitted → acknowledged: the employee only ever sees it (and can
// acknowledge it) once the reviewer submits, so a work-in-progress rating is
// never disclosed.
type PerformanceReview struct {
	ID          uuid.UUID  `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID uuid.UUID  `gorm:"type:uuid;not null;index:idx_reviews_workspace" json:"workspace_id"`
	EmployeeID  uuid.UUID  `gorm:"type:uuid;not null;index:idx_reviews_employee" json:"employee_id"`
	ReviewerID  *uuid.UUID `gorm:"type:uuid" json:"reviewer_id,omitempty"`

	Period        string `gorm:"type:varchar(20)" json:"period,omitempty"` // e.g. 2026-H1
	OverallRating int    `gorm:"not null;default:0" json:"overall_rating"` // 1–5
	Strengths     string `gorm:"type:text" json:"strengths,omitempty"`
	Improvements  string `gorm:"type:text" json:"improvements,omitempty"`
	Status        string `gorm:"type:varchar(20);not null;default:'draft'" json:"status"` // draft/submitted/acknowledged

	AcknowledgedAt *time.Time     `json:"acknowledged_at,omitempty"`
	CreatedBy      *uuid.UUID     `gorm:"type:uuid" json:"created_by,omitempty"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}

// Candidate is one applicant moving through the recruitment pipeline (ATS, M3).
// Stage: applied → screening → interview → offer → hired | rejected. Hiring a
// candidate creates a real Employee and records the link in HiredEmployeeID.
type Candidate struct {
	ID          uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID uuid.UUID `gorm:"type:uuid;not null;index:idx_candidates_workspace" json:"workspace_id"`

	FullName string `gorm:"type:varchar(200);not null" json:"full_name"`
	Email    string `gorm:"type:varchar(255)" json:"email,omitempty"`
	Phone    string `gorm:"type:varchar(50)" json:"phone,omitempty"`
	Position string `gorm:"type:varchar(150)" json:"position,omitempty"`
	Stage    string `gorm:"type:varchar(20);not null;default:'applied'" json:"stage"`
	Rating   int    `gorm:"not null;default:0" json:"rating"` // 1–5
	Source   string `gorm:"type:varchar(100)" json:"source,omitempty"`
	Notes    string `gorm:"type:text" json:"notes,omitempty"`

	HiredEmployeeID *uuid.UUID `gorm:"type:uuid" json:"hired_employee_id,omitempty"`

	CreatedBy *uuid.UUID     `gorm:"type:uuid" json:"created_by,omitempty"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}

// ─── Project Management (PM) Domain Expansion ───────────────────────────────

type Task struct {
	ID uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	// Denormalised tenant key — see the note on Message.WorkspaceID.
	// Derived from the parent project by BeforeCreate.
	WorkspaceID   uuid.UUID      `gorm:"type:uuid;index"`
	ProjectID     uuid.UUID      `gorm:"type:uuid;not null;index"`
	Project       *Project       `gorm:"foreignKey:ProjectID;constraint:OnDelete:CASCADE;"`
	Title         string         `gorm:"type:varchar(255);not null"`
	Description   string         `gorm:"type:text"`
	ParentID      *uuid.UUID     `gorm:"type:uuid;index"`
	Parent        *Task          `gorm:"foreignKey:ParentID;constraint:OnDelete:CASCADE;"`
	Path          string         `gorm:"type:ltree;index:,type:gist"`
	Status        string         `gorm:"type:varchar(50);default:'todo'"` // 'todo', 'in_progress', 'review', 'done'
	Priority      int            `gorm:"type:int;default:0"`
	AssigneeID    *uuid.UUID     `gorm:"type:uuid;index"`
	Assignee      *User          `gorm:"foreignKey:AssigneeID;constraint:OnDelete:SET NULL;"`
	SprintID      *uuid.UUID     `gorm:"type:uuid;index"`
	Sprint        *Sprint        `gorm:"foreignKey:SprintID;constraint:OnDelete:SET NULL;"`
	EpicID        *uuid.UUID     `gorm:"type:uuid;index"`
	StoryPoints   int            `gorm:"type:int;default:0"`
	Metadata      datatypes.JSON `gorm:"type:jsonb;default:'{}'"` // Store estimation, labels, etc.
	StartDate     *time.Time     `gorm:"type:timestamp"`
	DueDate       *time.Time     `gorm:"type:timestamp"`
	RecordVersion int            `gorm:"not null;default:1" json:"RecordVersion"`
	CreatedAt     time.Time      `gorm:"autoCreateTime"`
	UpdatedAt     time.Time      `gorm:"autoUpdateTime"`
}

type TaskHistory struct {
	ID             uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	TaskID         uuid.UUID `gorm:"type:uuid;not null;index"`
	Task           *Task     `gorm:"foreignKey:TaskID;constraint:OnDelete:CASCADE;"`
	PreviousStatus string    `gorm:"type:varchar(50)"`
	NewStatus      string    `gorm:"type:varchar(50);not null"`
	ChangedAt      time.Time `gorm:"autoCreateTime"`
}

// TaskDependency is the canonical PM scheduling edge. Both task ids are
// denormalised with workspace/project keys so RLS and cross-project validation
// remain explicit and indexable.
type TaskDependency struct {
	ID            uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	WorkspaceID   uuid.UUID `gorm:"type:uuid;not null;index" json:"workspace_id"`
	ProjectID     uuid.UUID `gorm:"type:uuid;not null;index" json:"project_id"`
	PredecessorID uuid.UUID `gorm:"type:uuid;not null;index;uniqueIndex:idx_task_dependency_edge" json:"predecessor_id"`
	SuccessorID   uuid.UUID `gorm:"type:uuid;not null;index;uniqueIndex:idx_task_dependency_edge" json:"successor_id"`
	LagDays       int       `gorm:"not null;default:0" json:"lag_days"`
	CreatedAt     time.Time `gorm:"autoCreateTime" json:"created_at"`
}

// PMLegacyRecordLink is the durable tenant-scoped bridge from the retired
// JSONB task/sub_task entities to their canonical relational task rows. The
// source records stay intact for audit and rollback, while this unique mapping
// makes startup migration safe to retry across replicas.
type PMLegacyRecordLink struct {
	ID               uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	WorkspaceID      uuid.UUID `gorm:"type:uuid;not null;index;uniqueIndex:idx_pm_legacy_link" json:"workspace_id"`
	LegacyEntityID   uuid.UUID `gorm:"type:uuid;not null;index;uniqueIndex:idx_pm_legacy_link" json:"legacy_entity_id"`
	LegacyEntityType string    `gorm:"type:varchar(20);not null" json:"legacy_entity_type"`
	TargetTaskID     uuid.UUID `gorm:"type:uuid;not null;index" json:"target_task_id"`
	MigrationVersion int       `gorm:"not null;default:1" json:"migration_version"`
	CreatedAt        time.Time `gorm:"autoCreateTime;not null" json:"created_at"`
}

func (PMLegacyRecordLink) TableName() string { return "pm_legacy_record_links" }

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
	TriggerName string         `gorm:"type:varchar(100)"`       // e.g. "task.done"
	Status      string         `gorm:"type:varchar(50)"`        // "success" | "failed" | "partial"
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
	ID                uuid.UUID               `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	WorkspaceID       uuid.UUID               `gorm:"type:uuid;index;not null" json:"workspace_id"`
	Workspace         *Workspace              `gorm:"foreignKey:WorkspaceID;constraint:OnDelete:CASCADE;" json:"-"`
	TemplateID        *uuid.UUID              `gorm:"type:uuid;index" json:"template_id"`
	Template          *CorrespondenceTemplate `gorm:"foreignKey:TemplateID;constraint:OnDelete:SET NULL;" json:"template,omitempty"`
	SerialNumber      string                  `gorm:"type:varchar(100);index" json:"serial_number"` // e.g. SO-HR-2026-0001
	Title             string                  `gorm:"type:varchar(500);not null" json:"title"`
	Content           string                  `gorm:"type:text;not null" json:"content"`                      // Rich HTML / Text
	SenderType        string                  `gorm:"type:varchar(50);default:'internal'" json:"sender_type"` // internal, external
	SenderDetails     datatypes.JSON          `gorm:"type:jsonb;default:'{}'" json:"sender_details"`
	RecipientDetails  datatypes.JSON          `gorm:"type:jsonb;default:'{}'" json:"recipient_details"`
	SecurityLevel     string                  `gorm:"type:varchar(50);default:'normal'" json:"security_level"`         // normal, confidential, top_secret
	Status            string                  `gorm:"type:varchar(50);default:'draft';index" json:"status"`            // draft, pending_approval, signed, dispatched, archived
	Path              string                  `gorm:"type:ltree;index:idx_correspondences_path,type:gist" json:"path"` // Forwarding hierarchy e.g. hr_mgr.ops_mgr
	TSV               string                  `gorm:"type:tsvector" json:"-"`
	Attachments       datatypes.JSON          `gorm:"type:jsonb;default:'[]'" json:"attachments"`
	QRToken           string                  `gorm:"type:varchar(255);index" json:"qr_token"`     // Token encrypted/hashed for QR code check
	QRCodeURL         string                  `gorm:"type:text" json:"qr_code_url"`                // Verification link / QR code content
	ExternalReference string                  `gorm:"type:varchar(255)" json:"external_reference"` // External signature or reference info
	CreatedByID       uuid.UUID               `gorm:"type:uuid;index;not null" json:"created_by_id"`
	CreatedBy         *User                   `gorm:"foreignKey:CreatedByID" json:"created_by,omitempty"`
	CurrentHolderID   uuid.UUID               `gorm:"type:uuid;index" json:"current_holder_id"` // Current officer responsible
	CurrentHolder     *User                   `gorm:"foreignKey:CurrentHolderID" json:"current_holder,omitempty"`
	SignedAt          *time.Time              `json:"signed_at"`
	ArchivedAt        *time.Time              `json:"archived_at"`
	CreatedAt         time.Time               `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt         time.Time               `gorm:"autoUpdateTime" json:"updated_at"`
}

type CorrespondenceForwardLog struct {
	ID               uuid.UUID       `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	CorrespondenceID uuid.UUID       `gorm:"type:uuid;index;not null" json:"correspondence_id"`
	Correspondence   *Correspondence `gorm:"foreignKey:CorrespondenceID;constraint:OnDelete:CASCADE;" json:"-"`
	FromUserID       uuid.UUID       `gorm:"type:uuid;not null" json:"from_user_id"`
	FromUser         *User           `gorm:"foreignKey:FromUserID" json:"from_user,omitempty"`
	ToUserID         uuid.UUID       `gorm:"type:uuid;not null" json:"to_user_id"`
	ToUser           *User           `gorm:"foreignKey:ToUserID" json:"to_user,omitempty"`
	OfficialNote     string          `gorm:"type:text" json:"official_note"`
	PathSegment      string          `gorm:"type:varchar(255)" json:"path_segment"`
	ForwardedAt      time.Time       `gorm:"autoCreateTime" json:"forwarded_at"`
}

type FileRecord struct {
	ID           uuid.UUID  `gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	WorkspaceID  uuid.UUID  `gorm:"type:uuid;index"`
	DepartmentID *uuid.UUID `gorm:"type:uuid;index"`
	UploadedBy   uuid.UUID  `gorm:"type:uuid;index"`
	FileName     string     `gorm:"type:varchar(255);not null"`
	OriginalName string     `gorm:"type:varchar(255);not null"`
	MimeType     string     `gorm:"type:varchar(100)"`
	SizeBytes    int64      `gorm:"type:bigint;not null"`
	FilePath     string     `gorm:"type:varchar(500);not null"`
	CreatedAt    time.Time
}

// ── Tenant-key derivation hooks ──────────────────────────────────────────────
//
// messages, tasks, and attendance_logs reach their workspace only through a
// parent row, so PostgreSQL had nothing on the table itself to write a
// row-level tenant policy against. Rather than make every create path remember
// to stamp the workspace, these hooks derive it from the parent whenever the
// caller left it empty. That keeps a single source of truth (the parent) and
// makes it impossible to insert a tenant-less row through GORM.
//
// Each hook is a no-op when WorkspaceID is already set, so callers that do know
// the workspace stay authoritative and pay no extra query.

// BeforeCreate fills WorkspaceID from the message's channel.
func (m *Message) BeforeCreate(tx *gorm.DB) error {
	if m.WorkspaceID != uuid.Nil || m.ChannelID == uuid.Nil {
		return nil
	}
	var row struct {
		WorkspaceID uuid.UUID `gorm:"column:workspace_id"`
	}
	if err := tx.Model(&Channel{}).Select("workspace_id").
		Where("id = ?", m.ChannelID).Scan(&row).Error; err != nil {
		return err
	}
	m.WorkspaceID = row.WorkspaceID
	return nil
}

// BeforeCreate fills WorkspaceID from the task's project.
func (t *Task) BeforeCreate(tx *gorm.DB) error {
	if t.WorkspaceID != uuid.Nil || t.ProjectID == uuid.Nil {
		return nil
	}
	var row struct {
		WorkspaceID uuid.UUID `gorm:"column:workspace_id"`
	}
	if err := tx.Model(&Project{}).Select("workspace_id").
		Where("id = ?", t.ProjectID).Scan(&row).Error; err != nil {
		return err
	}
	t.WorkspaceID = row.WorkspaceID
	return nil
}

// BeforeCreate fills WorkspaceID from the employee's user record.
func (a *AttendanceLog) BeforeCreate(tx *gorm.DB) error {
	if a.WorkspaceID != uuid.Nil || a.UserID == uuid.Nil {
		return nil
	}
	var row struct {
		WorkspaceID uuid.UUID `gorm:"column:workspace_id"`
	}
	if err := tx.Model(&User{}).Select("workspace_id").
		Where("id = ?", a.UserID).Scan(&row).Error; err != nil {
		return err
	}
	a.WorkspaceID = row.WorkspaceID
	return nil
}
