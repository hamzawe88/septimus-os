package models

import (
	"time"

	"github.com/google/uuid"
)

type Sprint struct {
	ID        uuid.UUID  `gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	ProjectID uuid.UUID  `gorm:"type:uuid;not null;index"`
	Project   *Project   `gorm:"foreignKey:ProjectID;constraint:OnDelete:CASCADE;"`
	Name      string     `gorm:"type:varchar(100);not null"`
	Goal      string     `gorm:"type:text"`
	Status    string     `gorm:"type:varchar(50);default:'planning'"` // 'planning', 'active', 'completed'
	StartDate         *time.Time 
	EndDate           *time.Time 
	CalendarEventLink string     `gorm:"type:varchar(255)"` // Link to Google Calendar Event
	CreatedAt         time.Time  `gorm:"autoCreateTime"`
	UpdatedAt         time.Time  `gorm:"autoUpdateTime"`
}
