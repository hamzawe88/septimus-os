package services

import (
	"log"

	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/datatypes"
)

// LogAction records a critical system action into the AuditLogs table
func LogAction(userID *uuid.UUID, action string, entityType string, entityID string, details datatypes.JSON, ipAddress string) {
	audit := models.AuditLog{
		UserID:     userID,
		Action:     action,
		EntityType: entityType,
		EntityID:   entityID,
		Details:    details,
		IPAddress:  ipAddress,
	}

	if err := database.DB.Create(&audit).Error; err != nil {
		log.Printf("[AuditLog] Failed to log action %s for entity %s: %v", action, entityType, err)
	}
}
