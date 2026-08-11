package services

import (
	"encoding/json"
	"fmt"
	"testing"

	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestDynamicRecordPersistsFormulaRelationAndOutboxAtomically(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	for _, statement := range recordServiceTestSchema {
		if err := db.Exec(statement).Error; err != nil {
			t.Fatalf("migrate test database: %v", err)
		}
	}
	workspaceID := uuid.New()
	actorID := uuid.New()
	customers := createPublishedTestDefinition(t, db, workspaceID, "customers", []SchemaFieldInput{
		{Key: "name", LabelAr: "الاسم", LabelEn: "Name", Type: "text", Required: true},
	}, "name")
	customer, err := CreateDynamicRecord(db, workspaceID, actorID, "customers", map[string]interface{}{"name": "Acme"})
	if err != nil {
		t.Fatalf("create target: %v", err)
	}

	ordersFields := []SchemaFieldInput{
		{Key: "title", LabelAr: "العنوان", LabelEn: "Title", Type: "text", Required: true},
		{Key: "quantity", LabelAr: "الكمية", LabelEn: "Quantity", Type: "integer", Required: true},
		{Key: "price", LabelAr: "السعر", LabelEn: "Price", Type: "number", Required: true},
		{Key: "total", LabelAr: "الإجمالي", LabelEn: "Total", Type: "formula", Formula: &FormulaFieldConfig{Expression: "[quantity] * [price]", ResultType: "number"}},
		{Key: "customer", LabelAr: "العميل", LabelEn: "Customer", Type: "relation", Required: true, Relation: &RelationFieldConfig{
			TargetDefinitionKey: customers.Key, Cardinality: "one", OnDelete: "restrict",
		}},
	}
	orders := createPublishedTestDefinition(t, db, workspaceID, "orders", ordersFields, "title")
	if err := SyncPublishedRelations(db, orders, ordersFields); err != nil {
		t.Fatalf("sync relation: %v", err)
	}
	order, err := CreateDynamicRecord(db, workspaceID, actorID, "orders", map[string]interface{}{
		"title": "Order 1", "quantity": float64(2), "price": float64(15),
		"total": float64(999), "customer": customer.ID.String(),
	})
	if err != nil {
		t.Fatalf("create order: %v", err)
	}
	var data map[string]interface{}
	_ = json.Unmarshal(order.Data, &data)
	if data["total"] != float64(30) {
		t.Fatalf("server did not replace client formula value: %#v", data)
	}
	var links, events, audits int64
	db.Model(&models.EntityRecordRelation{}).Where("source_record_id = ?", order.ID).Count(&links)
	db.Model(&models.OutboxEvent{}).Count(&events)
	db.Model(&models.AuditLog{}).Count(&audits)
	if links != 1 || events != 2 || audits != 2 {
		t.Fatalf("expected one relation, two outbox events, and two audits; links=%d events=%d audits=%d", links, events, audits)
	}
}

var recordServiceTestSchema = []string{
	`CREATE TABLE entity_definitions (
		id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, key TEXT NOT NULL,
		label_ar TEXT NOT NULL, label_en TEXT NOT NULL, description_ar TEXT,
		description_en TEXT, status TEXT NOT NULL, current_version INTEGER NOT NULL,
		draft_revision INTEGER NOT NULL, title_field_key TEXT, draft_schema TEXT,
		draft_ui_schema TEXT, settings TEXT, created_by TEXT, updated_by TEXT,
		created_at DATETIME, updated_at DATETIME, deleted_at DATETIME
	)`,
	`CREATE TABLE entity_schema_versions (
		id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, definition_id TEXT NOT NULL,
		version INTEGER NOT NULL, json_schema TEXT NOT NULL, ui_schema TEXT,
		change_set TEXT, checksum TEXT, published_by TEXT, published_at DATETIME
	)`,
	`CREATE TABLE entities (
		id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT,
		definition_id TEXT, schema_version INTEGER NOT NULL, record_version INTEGER NOT NULL,
		display_value TEXT, created_by TEXT, updated_by TEXT, entity_type TEXT NOT NULL,
		data TEXT NOT NULL, created_at DATETIME, updated_at DATETIME, deleted_at DATETIME
	)`,
	`CREATE TABLE entity_relations (
		id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, source_definition_id TEXT NOT NULL,
		source_field_key TEXT NOT NULL, target_definition_id TEXT NOT NULL,
		cardinality TEXT NOT NULL, on_delete TEXT NOT NULL, label_ar TEXT, label_en TEXT,
		required BOOLEAN, created_at DATETIME, updated_at DATETIME
	)`,
	`CREATE TABLE entity_record_relations (
		id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, relation_id TEXT NOT NULL,
		source_record_id TEXT NOT NULL, target_record_id TEXT NOT NULL, created_at DATETIME
	)`,
	`CREATE TABLE outbox_events (
		id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, subject TEXT NOT NULL,
		event_type TEXT NOT NULL, aggregate_type TEXT NOT NULL, aggregate_id TEXT NOT NULL,
		payload TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL,
		available_at DATETIME NOT NULL, published_at DATETIME, last_error TEXT,
		created_at DATETIME, updated_at DATETIME
	)`,
	`CREATE TABLE audit_logs (
		id TEXT PRIMARY KEY, workspace_id TEXT, user_id TEXT, action TEXT NOT NULL,
		entity_type TEXT, entity_id TEXT, details TEXT, ip_address TEXT, created_at DATETIME
	)`,
}

func createPublishedTestDefinition(t *testing.T, db *gorm.DB, workspaceID uuid.UUID, key string, fields []SchemaFieldInput, titleKey string) models.EntityDefinition {
	t.Helper()
	compiled, err := CompileSchemaDraft(key, key, fields)
	if err != nil {
		t.Fatalf("compile %s: %v", key, err)
	}
	definition := models.EntityDefinition{
		ID: uuid.New(), WorkspaceID: workspaceID, Key: key, LabelAr: key, LabelEn: key,
		Status: models.EntityDefinitionStatusPublished, CurrentVersion: 1, DraftRevision: 1,
		TitleFieldKey: titleKey, DraftSchema: compiled.JSONSchema, DraftUISchema: compiled.UISchema,
	}
	if err := db.Create(&definition).Error; err != nil {
		t.Fatalf("create definition %s: %v", key, err)
	}
	version := models.EntitySchemaVersion{
		ID: uuid.New(), WorkspaceID: workspaceID, DefinitionID: definition.ID, Version: 1,
		JSONSchema: compiled.JSONSchema, UISchema: compiled.UISchema,
		Checksum: SchemaChecksum(compiled.JSONSchema, compiled.UISchema),
	}
	if err := db.Create(&version).Error; err != nil {
		t.Fatalf("create version %s: %v", key, err)
	}
	return definition
}
