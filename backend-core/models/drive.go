package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

// DriveFolder represents a hierarchical folder using PostgreSQL ltree.
// The `path` field stores the ltree representation.
type DriveFolder struct {
	ID          uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	WorkspaceID uuid.UUID `gorm:"type:uuid;not null;index"`
	Name        string    `gorm:"type:varchar(255);not null"`
	Path        string    `gorm:"type:ltree;not null"` // Using string mapped to ltree via GORM
	CreatedBy   uuid.UUID `gorm:"type:uuid;not null"`
	CreatedAt   time.Time `gorm:"autoCreateTime"`

	Workspace Workspace `gorm:"foreignKey:WorkspaceID;constraint:OnDelete:CASCADE;"`
	Creator   User      `gorm:"foreignKey:CreatedBy"`
}

// DrivePermission represents the access control rules for folders
type DrivePermission struct {
	ID              uuid.UUID  `gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	FolderID        uuid.UUID  `gorm:"type:uuid;not null;index"`
	UserID          *uuid.UUID `gorm:"type:uuid"`
	RoleID          *uuid.UUID `gorm:"type:uuid"`
	PermissionLevel string     `gorm:"type:varchar(50);not null"` // Viewer, Editor, Co-owner, etc.

	Folder DriveFolder `gorm:"foreignKey:FolderID;constraint:OnDelete:CASCADE;"`
	User   *User       `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE;"`
	Role   *Role       `gorm:"foreignKey:RoleID;constraint:OnDelete:CASCADE;"`
}

// DriveFile represents the actual files metadata using the JSONB Entity Pattern
type DriveFile struct {
	ID             uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	WorkspaceID    uuid.UUID      `gorm:"type:uuid;not null;index"`
	FolderID       *uuid.UUID     `gorm:"type:uuid;index"`
	Name           string         `gorm:"type:varchar(255);not null"`
	CurrentVersion int            `gorm:"default:1"`
	IsLocked       bool           `gorm:"default:false"`
	LockedBy       *uuid.UUID     `gorm:"type:uuid"`
	Data           datatypes.JSON `gorm:"type:jsonb;not null;default:'{}'::jsonb"` // status, url, size, mimetype, ai_tags, ai_summary, security_policy
	CreatedAt      time.Time      `gorm:"autoCreateTime"`
	UpdatedAt      time.Time      `gorm:"autoUpdateTime"`

	Workspace Workspace    `gorm:"foreignKey:WorkspaceID;constraint:OnDelete:CASCADE;"`
	Folder    *DriveFolder `gorm:"foreignKey:FolderID;constraint:OnDelete:SET NULL;"`
	Locker    *User        `gorm:"foreignKey:LockedBy;constraint:OnDelete:SET NULL;"`
}
