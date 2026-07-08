package models

import (
	"time"

	"gorm.io/gorm"
)

// WorkspaceSettings represents the global branding and settings for the company
type WorkspaceSettings struct {
	ID           string         `gorm:"type:uuid;primary_key;default:uuid_generate_v4()" json:"id"`
	CompanyName  string         `gorm:"type:varchar(255);not null;default:'Septimus Workspace'" json:"company_name"`
	LogoURL      string         `gorm:"type:varchar(1024)" json:"logo_url"`
	PrimaryColor string         `gorm:"type:varchar(50);default:'#4f46e5'" json:"primary_color"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"-"`
}
