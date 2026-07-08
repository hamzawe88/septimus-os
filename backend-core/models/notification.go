package models

import (
	"time"

	"gorm.io/gorm"
)

// Notification represents a system or user notification in the workspace
type Notification struct {
	ID        string         `gorm:"type:uuid;primary_key;default:uuid_generate_v4()" json:"id"`
	UserID    string         `gorm:"type:uuid;index" json:"user_id"`
	Type      string         `gorm:"type:varchar(50);not null" json:"type"` // e.g., "mention", "system", "task_update"
	Title     string         `gorm:"type:varchar(255)" json:"title"`
	Message   string         `gorm:"type:text;not null" json:"message"`
	IsRead    bool           `gorm:"default:false" json:"is_read"`
	Link      string         `gorm:"type:varchar(255)" json:"link,omitempty"` // URL or deep link
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}
