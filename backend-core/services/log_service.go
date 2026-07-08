package services

import (
	"encoding/json"
	"log"

	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/datatypes"
)

// LogEvent async writes an audit log to the database
func LogEvent(userID *uuid.UUID, action, entityType, entityID string, details interface{}, ipAddress string) {
	// Execute in a goroutine for non-blocking I/O
	go func() {
		var detailsBytes []byte
		if details != nil {
			detailsBytes, _ = json.Marshal(details)
		} else {
			detailsBytes = []byte("{}")
		}

		auditLog := models.AuditLog{
			UserID:     userID,
			Action:     action,
			EntityType: entityType,
			EntityID:   entityID,
			Details:    datatypes.JSON(detailsBytes),
			IPAddress:  ipAddress,
		}

		if err := database.DB.Create(&auditLog).Error; err != nil {
			log.Printf("Failed to write audit log (%s): %v", action, err)
		}
	}()
}
