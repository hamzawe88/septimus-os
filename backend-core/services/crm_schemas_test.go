package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"testing"

	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupCRMSchemaTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	for _, statement := range recordServiceTestSchema {
		if err := db.Exec(statement).Error; err != nil {
			t.Fatal(err)
		}
	}
	if err := db.Exec(`CREATE TABLE entity_schema_fields (
		id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, definition_id TEXT NOT NULL,
		schema_version INTEGER NOT NULL, schema_checksum TEXT NOT NULL, field_key TEXT NOT NULL,
		field_type TEXT NOT NULL, position INTEGER NOT NULL, required BOOLEAN NOT NULL,
		searchable BOOLEAN NOT NULL, indexed BOOLEAN NOT NULL, classification TEXT NOT NULL,
		read_roles TEXT NOT NULL, write_roles TEXT NOT NULL, config TEXT NOT NULL,
		created_at DATETIME
	)`).Error; err != nil {
		t.Fatal(err)
	}
	return db
}

func TestEnsureSystemCRMDefinitionsPublishesCompleteIdempotentContract(t *testing.T) {
	db := setupCRMSchemaTestDB(t)
	workspaceID := uuid.New()
	actorID := uuid.New()
	if err := EnsureSystemCRMDefinitions(db, workspaceID, &actorID); err != nil {
		t.Fatal(err)
	}
	if err := EnsureSystemCRMDefinitions(db, workspaceID, &actorID); err != nil {
		t.Fatalf("idempotent second seed failed: %v", err)
	}

	var definitions []models.EntityDefinition
	if err := db.Where("workspace_id = ?", workspaceID).Order("key").Find(&definitions).Error; err != nil {
		t.Fatal(err)
	}
	if len(definitions) != 8 {
		t.Fatalf("expected 8 CRM definitions, got %d", len(definitions))
	}
	for _, definition := range definitions {
		if definition.Status != models.EntityDefinitionStatusPublished || definition.CurrentVersion != crmSchemaContractVersion {
			t.Fatalf("definition %s is not published at v%d", definition.Key, crmSchemaContractVersion)
		}
		if !IsSystemManagedDefinition(definition) {
			t.Fatalf("definition %s is not marked system-managed", definition.Key)
		}
	}

	var versions, fields, relations, audits, events int64
	db.Model(&models.EntitySchemaVersion{}).Count(&versions)
	db.Model(&models.EntitySchemaField{}).Count(&fields)
	db.Model(&models.EntityRelation{}).Count(&relations)
	db.Model(&models.AuditLog{}).Count(&audits)
	db.Model(&models.OutboxEvent{}).Count(&events)
	if versions != 8 || fields < 60 || relations < 10 || audits != 8 || events != 8 {
		t.Fatalf("unexpected contract counts versions=%d fields=%d relations=%d audits=%d events=%d", versions, fields, relations, audits, events)
	}
}

func TestEnsureSystemCRMDefinitionsRefusesUserOwnedCollision(t *testing.T) {
	db := setupCRMSchemaTestDB(t)
	workspaceID := uuid.New()
	if err := db.Create(&models.EntityDefinition{
		ID: uuid.New(), WorkspaceID: workspaceID, Key: "crm_account",
		LabelAr: "خاص", LabelEn: "Custom", Status: models.EntityDefinitionStatusDraft,
		DraftRevision: 1, DraftSchema: []byte(`{}`), DraftUISchema: []byte(`{}`), Settings: []byte(`{}`),
	}).Error; err != nil {
		t.Fatal(err)
	}
	if err := EnsureSystemCRMDefinitions(db, workspaceID, nil); err == nil {
		t.Fatal("expected a user-owned system key collision to be rejected")
	}
	var count int64
	db.Model(&models.EntityDefinition{}).Where("workspace_id = ?", workspaceID).Count(&count)
	if count != 1 {
		t.Fatalf("transaction was not rolled back; definitions=%d", count)
	}
}

func TestCRMSystemLifecycleFieldsRequireDedicatedCommands(t *testing.T) {
	db := setupCRMSchemaTestDB(t)
	workspaceID := uuid.New()
	userID := uuid.New()
	if err := EnsureSystemCRMDefinitions(db, workspaceID, nil); err != nil {
		t.Fatal(err)
	}
	account, err := CreateDynamicRecordAs(db, workspaceID, PrincipalForUser(userID, "member"), "crm_account", map[string]interface{}{
		"name": "Command Guard Account", "status": "prospect",
	})
	if err != nil {
		t.Fatalf("ordinary account fields should remain schema-editable: %v", err)
	}
	_, err = CreateDynamicRecordAs(db, workspaceID, PrincipalForUser(userID, "member"), "crm_opportunity", map[string]interface{}{
		"title": "Forbidden won opportunity", "account": account.ID.String(), "stage": "closed_won",
		"value": 100, "currency": "SAR",
	})
	assertSystemCommandRequired(t, err)

	opportunity, err := CreateDynamicRecordAs(db, workspaceID, PrincipalForUser(userID, "member"), "crm_opportunity", map[string]interface{}{
		"title": "Safe default opportunity", "account": account.ID.String(), "value": 100, "currency": "SAR",
	})
	if err != nil {
		t.Fatalf("default-new opportunity should be creatable through the record API: %v", err)
	}
	_, err = UpdateDynamicRecordAs(db, workspaceID, PrincipalForUser(userID, "member"), "crm_opportunity", opportunity.ID, opportunity.RecordVersion, map[string]interface{}{
		"stage": "closed_won",
	})
	assertSystemCommandRequired(t, err)
	_, err = UpdateDynamicRecordAs(db, workspaceID, RecordPrincipal{Source: "api_key"}, "crm_opportunity", opportunity.ID, opportunity.RecordVersion, map[string]interface{}{
		"stage": "closed_won",
	})
	assertSystemCommandRequired(t, err)

	command := PrincipalForUser(userID, "member")
	command.Source = "crm_pipeline"
	if _, err = UpdateDynamicRecordAs(db, workspaceID, command, "crm_opportunity", opportunity.ID, opportunity.RecordVersion, map[string]interface{}{
		"stage": "contacted",
	}); err != nil {
		t.Fatalf("dedicated pipeline command was rejected: %v", err)
	}
	_, err = CreateDynamicRecordAs(db, workspaceID, PrincipalForUser(userID, "member"), "crm_ticket", map[string]interface{}{
		"subject": "Bypass ticket", "status": "open", "priority": "urgent", "channel": "portal", "sla_status": "on_track", "escalation_level": 0,
	})
	assertSystemCommandRequired(t, err)
	assertSystemCommandRequired(t, DeleteDynamicRecordAs(db, workspaceID, PrincipalForUser(userID, "member"), "crm_account", account.ID))
}

func TestCRMRecordAIProjectionExcludesPIIAndConfidentialFields(t *testing.T) {
	db := setupCRMSchemaTestDB(t)
	workspaceID := uuid.New()
	userID := uuid.New()
	if err := EnsureSystemCRMDefinitions(db, workspaceID, nil); err != nil {
		t.Fatal(err)
	}
	contact, err := CreateDynamicRecordAs(db, workspaceID, PrincipalForUser(userID, "member"), "crm_contact", map[string]interface{}{
		"full_name": "Private Person", "email": "private@example.test", "phone": "+218900000000",
		"job_title": "Procurement lead", "source": "referral", "consent_status": "granted",
		"notes": "Confidential negotiation note",
	})
	if err != nil {
		t.Fatal(err)
	}
	projected, err := GetDynamicRecordForAIAs(db, workspaceID, PrincipalForUser(userID, "member"), "crm_contact", contact.ID)
	if err != nil {
		t.Fatal(err)
	}
	var data map[string]interface{}
	if err := json.Unmarshal(projected.Data, &data); err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{"full_name", "email", "phone", "notes"} {
		if _, exists := data[forbidden]; exists {
			t.Fatalf("AI projection leaked %s: %#v", forbidden, data)
		}
	}
	if data["job_title"] != "Procurement lead" || data["source"] != "referral" {
		t.Fatalf("AI-safe semantic fields were removed: %#v", data)
	}
	if projected.DisplayValue != "" {
		t.Fatalf("PII title leaked through display_value: %q", projected.DisplayValue)
	}
}

func assertSystemCommandRequired(t *testing.T, err error) {
	t.Helper()
	var operation *RecordOperationError
	if !errors.As(err, &operation) || operation.Code != systemRecordCommandRequiredCode {
		t.Fatalf("expected %s, got %v", systemRecordCommandRequiredCode, err)
	}
}
