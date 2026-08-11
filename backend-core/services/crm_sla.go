package services

import (
	"encoding/json"
	"log"
	"time"

	"github.com/septimus-os/backend-core/models"
	"gorm.io/gorm"
)

// StartCRMSLAWorker maintains SLA state from the canonical ticket records.
// Updates use record-version compare-and-swap, so user edits always win races.
func StartCRMSLAWorker(db *gorm.DB) {
	if db == nil {
		return
	}
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for {
			if err := RefreshCRMTicketSLAs(db, time.Now().UTC()); err != nil {
				log.Printf("CRM SLA worker: %v", err)
			}
			<-ticker.C
		}
	}()
}

func RefreshCRMTicketSLAs(db *gorm.DB, now time.Time) error {
	if db.Dialector.Name() == "postgres" {
		return refreshPostgresCRMTicketSLAs(db, now)
	}
	// Portable path retained for SQLite unit tests and development tools.
	var definitions []models.EntityDefinition
	if err := db.Where("key = ? AND status = ?", "crm_ticket", models.EntityDefinitionStatusPublished).Find(&definitions).Error; err != nil {
		return err
	}
	for _, definition := range definitions {
		var tickets []models.Entity
		if err := db.Where("workspace_id = ? AND definition_id = ?", definition.WorkspaceID, definition.ID).Find(&tickets).Error; err != nil {
			return err
		}
		for _, ticket := range tickets {
			data := map[string]interface{}{}
			if json.Unmarshal(ticket.Data, &data) != nil {
				continue
			}
			status, _ := data["status"].(string)
			if status == "resolved" || status == "closed" {
				continue
			}
			dueText, _ := data["sla_due_at"].(string)
			due, err := time.Parse(time.RFC3339, dueText)
			if err != nil {
				continue
			}
			nextStatus := "on_track"
			if !due.After(now) {
				nextStatus = "breached"
			} else if due.Sub(now) <= 2*time.Hour {
				nextStatus = "due_soon"
			}
			currentStatus, _ := data["sla_status"].(string)
			if currentStatus == nextStatus {
				continue
			}
			updates := map[string]interface{}{"sla_status": nextStatus}
			if nextStatus == "breached" {
				updates["escalation_level"] = int(crmNumber(data["escalation_level"])) + 1
			}
			_, err = UpdateDynamicRecordAs(db, definition.WorkspaceID, PrincipalForSystem("crm_sla"), "crm_ticket", ticket.ID, ticket.RecordVersion, updates)
			if err != nil && err != ErrRecordVersionConflict {
				return err
			}
		}
	}
	return nil
}

func refreshPostgresCRMTicketSLAs(db *gorm.DB, now time.Time) error {
	// Process bounded batches. The SQL CASE selects only records whose persisted
	// SLA state differs from the state implied by sla_due_at; closed/resolved and
	// malformed legacy rows never enter application memory.
	for batch := 0; batch < 10; batch++ {
		var tickets []models.Entity
		err := db.Table("entities AS e").
			Select("e.*").
			Joins("JOIN entity_definitions d ON d.id = e.definition_id AND d.workspace_id = e.workspace_id").
			Where("d.key = ? AND d.status = ? AND e.deleted_at IS NULL", "crm_ticket", models.EntityDefinitionStatusPublished).
			Where("COALESCE(e.data->>'status', '') NOT IN ('resolved', 'closed')").
			Where("COALESCE(e.data->>'sla_due_at', '') ~ ?", `^\d{4}-\d{2}-\d{2}T`).
			Where(`COALESCE(e.data->>'sla_status', '') <> CASE
				WHEN (e.data->>'sla_due_at')::timestamptz <= ? THEN 'breached'
				WHEN (e.data->>'sla_due_at')::timestamptz <= ? THEN 'due_soon'
				ELSE 'on_track' END`, now, now.Add(2*time.Hour)).
			Order("e.updated_at ASC").Limit(500).Find(&tickets).Error
		if err != nil {
			return err
		}
		if len(tickets) == 0 {
			return nil
		}
		for _, ticket := range tickets {
			data := map[string]interface{}{}
			if json.Unmarshal(ticket.Data, &data) != nil {
				continue
			}
			due, err := time.Parse(time.RFC3339, textValue(data["sla_due_at"]))
			if err != nil {
				continue
			}
			nextStatus := "on_track"
			if !due.After(now) {
				nextStatus = "breached"
			} else if due.Sub(now) <= 2*time.Hour {
				nextStatus = "due_soon"
			}
			updates := map[string]interface{}{"sla_status": nextStatus}
			if nextStatus == "breached" {
				updates["escalation_level"] = int(crmNumber(data["escalation_level"])) + 1
			}
			_, updateErr := UpdateDynamicRecordAs(db, ticket.WorkspaceID, PrincipalForSystem("crm_sla"), "crm_ticket", ticket.ID, ticket.RecordVersion, updates)
			if updateErr != nil && updateErr != ErrRecordVersionConflict {
				return updateErr
			}
		}
		if len(tickets) < 500 {
			return nil
		}
	}
	return nil
}

func textValue(value interface{}) string {
	text, _ := value.(string)
	return text
}

func crmNumber(value interface{}) float64 {
	switch typed := value.(type) {
	case float64:
		return typed
	case int:
		return float64(typed)
	default:
		return 0
	}
}
