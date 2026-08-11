package services

import (
	"errors"

	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/gorm"
)

var (
	ErrInvalidStorageReservation = errors.New("storage reservation must be positive")
	ErrStorageQuotaExceeded      = errors.New("storage quota exceeded")
)

// ReserveWorkspaceStorage performs the quota check and usage increment in one
// database statement. The predicate is evaluated while PostgreSQL updates the
// workspace row, so concurrent callers cannot all reserve the same remaining
// capacity.
func ReserveWorkspaceStorage(db *gorm.DB, workspaceID uuid.UUID, sizeBytes int64) error {
	if workspaceID == uuid.Nil || sizeBytes <= 0 {
		return ErrInvalidStorageReservation
	}

	reservation := db.Model(&models.Workspace{}).
		Where(
			"id = ? AND (storage_quota_bytes <= 0 OR storage_used_bytes + ? <= storage_quota_bytes)",
			workspaceID,
			sizeBytes,
		).
		Update("storage_used_bytes", gorm.Expr("storage_used_bytes + ?", sizeBytes))
	if reservation.Error != nil {
		return reservation.Error
	}
	if reservation.RowsAffected != 1 {
		return ErrStorageQuotaExceeded
	}
	return nil
}
