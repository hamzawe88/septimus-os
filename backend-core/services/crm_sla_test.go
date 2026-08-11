package services

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestRefreshCRMTicketSLAsBreachesAndEscalatesOnce(t *testing.T) {
	db := setupCRMSchemaTestDB(t)
	workspaceID := uuid.New()
	if err := EnsureSystemCRMDefinitions(db, workspaceID, nil); err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	ticket, err := CreateDynamicRecordAs(db, workspaceID, PrincipalForSystem("crm_ticket_command"), "crm_ticket", map[string]interface{}{
		"subject": "Urgent request", "status": "open", "priority": "urgent", "channel": "portal",
		"sla_due_at": now.Add(-time.Minute).Format(time.RFC3339), "sla_status": "on_track", "escalation_level": 0,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := RefreshCRMTicketSLAs(db, now); err != nil {
		t.Fatal(err)
	}
	updated, err := GetDynamicRecord(db, workspaceID, "crm_ticket", ticket.ID)
	if err != nil {
		t.Fatal(err)
	}
	data := map[string]interface{}{}
	_ = json.Unmarshal(updated.Data, &data)
	if data["sla_status"] != "breached" || data["escalation_level"] != float64(1) {
		t.Fatalf("ticket was not breached and escalated: %#v", data)
	}
	if err := RefreshCRMTicketSLAs(db, now.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	again, _ := GetDynamicRecord(db, workspaceID, "crm_ticket", ticket.ID)
	_ = json.Unmarshal(again.Data, &data)
	if data["escalation_level"] != float64(1) {
		t.Fatalf("unchanged breach was escalated repeatedly: %#v", data)
	}
}
