package services

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/datatypes"
)

func TestMigrateLegacyCRMWorkspaceBuildsCanonicalGraphIdempotently(t *testing.T) {
	db := setupCRMSchemaTestDB(t)
	if err := db.Exec(`CREATE TABLE crm_legacy_record_links (
		id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, legacy_entity_id TEXT NOT NULL,
		target_definition_key TEXT NOT NULL, target_record_id TEXT NOT NULL,
		migration_version INTEGER NOT NULL, created_at DATETIME,
		UNIQUE(workspace_id, legacy_entity_id, target_definition_key)
	)`).Error; err != nil {
		t.Fatal(err)
	}
	workspaceID := uuid.New()
	if err := EnsureSystemCRMDefinitions(db, workspaceID, nil); err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC().Add(-time.Hour)
	leadID := uuid.New()
	legacy := []models.Entity{
		legacyCRMEntity(leadID, workspaceID, "lead", now, map[string]interface{}{
			"name": "Platform rollout", "company": "Acme", "contact_person": "Sara",
			"email": "sara@example.test", "value": 2500, "status": "qualified", "source": "referral",
		}),
		legacyCRMEntity(uuid.New(), workspaceID, "ticket", now, map[string]interface{}{
			"name": "Cannot sign in", "customer": "Acme", "priority": "urgent", "status": "open",
			"messages": []interface{}{map[string]interface{}{"body": "Please help", "channel": "portal"}},
		}),
		legacyCRMEntity(uuid.New(), workspaceID, "crm_quote", now, map[string]interface{}{
			"lead_id": leadID.String(), "quote_number": "Q-OLD-1", "subtotal": 100,
			"tax_rate": 15, "tax_amount": 15, "total_amount": 115,
			"items": []interface{}{map[string]interface{}{"description": "Service", "quantity": 1, "unitPrice": 100}},
		}),
	}
	if err := db.Create(&legacy).Error; err != nil {
		t.Fatal(err)
	}

	first, err := MigrateLegacyCRMWorkspace(db, workspaceID)
	if err != nil {
		t.Fatal(err)
	}
	if first.Sources != 3 || first.Migrated != 3 || first.Skipped != 0 {
		t.Fatalf("unexpected first report: %#v", first)
	}
	second, err := MigrateLegacyCRMWorkspace(db, workspaceID)
	if err != nil {
		t.Fatal(err)
	}
	if second.Sources != 3 || second.Migrated != 0 || second.Skipped != 3 {
		t.Fatalf("migration was not idempotent: %#v", second)
	}

	expected := map[string]int64{
		"crm_account": 1, "crm_contact": 1, "crm_opportunity": 1,
		"crm_ticket": 1, "crm_ticket_message": 1, "crm_quote": 1, "crm_quote_line": 1,
	}
	for entityType, count := range expected {
		var actual int64
		db.Model(&models.Entity{}).Where("workspace_id = ? AND entity_type = ? AND definition_id IS NOT NULL", workspaceID, entityType).Count(&actual)
		if actual != count {
			t.Fatalf("expected %d %s records, got %d", count, entityType, actual)
		}
	}
	var links int64
	db.Model(&models.CRMLegacyRecordLink{}).Where("workspace_id = ?", workspaceID).Count(&links)
	if links != 7 {
		t.Fatalf("expected seven migration links, got %d", links)
	}
}

func legacyCRMEntity(id, workspaceID uuid.UUID, entityType string, createdAt time.Time, data map[string]interface{}) models.Entity {
	raw, _ := json.Marshal(data)
	return models.Entity{
		ID: id, WorkspaceID: workspaceID, EntityType: entityType, Data: datatypes.JSON(raw),
		RecordVersion: 1, CreatedAt: createdAt, UpdatedAt: createdAt,
	}
}
