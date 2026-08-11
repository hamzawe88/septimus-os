package services

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/events"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/datatypes"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	gormLogger "gorm.io/gorm/logger"
)

const maxOutboxAttempts = 12

func EnqueueOutbox(tx *gorm.DB, workspaceID uuid.UUID, subject, eventType, aggregateType string, aggregateID uuid.UUID, payload map[string]interface{}) error {
	if tx == nil || workspaceID == uuid.Nil || aggregateID == uuid.Nil {
		return fmt.Errorf("outbox requires database, workspace, and aggregate")
	}
	payload["workspace_id"] = workspaceID.String()
	payload["event"] = eventType
	raw, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal outbox payload: %w", err)
	}
	item := models.OutboxEvent{
		ID:          uuid.New(),
		WorkspaceID: workspaceID, Subject: subject, EventType: eventType,
		AggregateType: aggregateType, AggregateID: aggregateID,
		Payload: datatypes.JSON(raw), Status: models.OutboxStatusPending,
		AvailableAt: time.Now().UTC(),
	}
	return tx.Create(&item).Error
}

// StartOutboxDispatcher runs an at-least-once publisher. Rows stay locked while
// publishing so replicas cannot concurrently claim the same event.
func StartOutboxDispatcher(db *gorm.DB) {
	if db == nil {
		return
	}
	workerDB := db.Session(&gorm.Session{Logger: db.Logger.LogMode(gormLogger.Warn)})
	go func() {
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		for range ticker.C {
			if err := DispatchOutboxBatch(workerDB, 50); err != nil {
				log.Printf("outbox dispatcher: %v", err)
			}
		}
	}()
}

func DispatchOutboxBatch(db *gorm.DB, limit int) error {
	if limit < 1 || limit > 100 {
		limit = 50
	}
	return db.Transaction(func(tx *gorm.DB) error {
		var items []models.OutboxEvent
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE", Options: "SKIP LOCKED"}).
			Where("status IN ? AND available_at <= ? AND attempts < ?",
				[]string{models.OutboxStatusPending, models.OutboxStatusFailed}, time.Now().UTC(), maxOutboxAttempts).
			Order("created_at ASC").Limit(limit).Find(&items).Error; err != nil {
			return err
		}
		for _, item := range items {
			var payload map[string]interface{}
			if err := json.Unmarshal(item.Payload, &payload); err != nil {
				markOutboxFailure(tx, item, err)
				continue
			}
			err := events.PublishTenantEvent(item.Subject, item.WorkspaceID, payload)
			if err != nil {
				markOutboxFailure(tx, item, err)
				continue
			}
			now := time.Now().UTC()
			if err := tx.Model(&models.OutboxEvent{}).Where("id = ?", item.ID).Updates(map[string]interface{}{
				"status": models.OutboxStatusPublished, "attempts": item.Attempts + 1,
				"published_at": now, "last_error": "",
			}).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func markOutboxFailure(tx *gorm.DB, item models.OutboxEvent, publishErr error) {
	attempts := item.Attempts + 1
	delay := time.Duration(1<<min(attempts, 8)) * time.Second
	_ = tx.Model(&models.OutboxEvent{}).Where("id = ?", item.ID).Updates(map[string]interface{}{
		"status": models.OutboxStatusFailed, "attempts": attempts,
		"available_at": time.Now().UTC().Add(delay), "last_error": publishErr.Error(),
	}).Error
}
