package services

import (
	"fmt"
	"testing"

	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestMaterializePublishedFieldsCreatesImmutableCatalog(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`CREATE TABLE entity_schema_fields (
		id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, definition_id TEXT NOT NULL,
		schema_version INTEGER NOT NULL, schema_checksum TEXT NOT NULL,
		field_key TEXT NOT NULL, field_type TEXT NOT NULL,
		position INTEGER NOT NULL, required BOOLEAN NOT NULL, searchable BOOLEAN NOT NULL,
		indexed BOOLEAN NOT NULL, classification TEXT NOT NULL, read_roles TEXT NOT NULL,
		write_roles TEXT NOT NULL, config TEXT NOT NULL, created_at DATETIME
	)`).Error; err != nil {
		t.Fatal(err)
	}
	compiled, err := CompileSchemaDraft("طلبات", "Orders", []SchemaFieldInput{{
		Key: "amount", LabelAr: "القيمة", LabelEn: "Amount", Type: "number",
		Searchable: true, Indexed: true, Classification: "CONFIDENTIAL",
		ReadRoles: []string{"Admin", "admin"}, WriteRoles: []string{"Owner"},
	}})
	if err != nil {
		t.Fatalf("compile schema: %v", err)
	}
	definition := models.EntityDefinition{ID: uuid.New(), WorkspaceID: uuid.New()}
	checksum := SchemaChecksum(compiled.JSONSchema, compiled.UISchema)
	if err := MaterializePublishedFields(
		db, definition, 3, checksum, compiled.Fields,
	); err != nil {
		t.Fatalf("materialize fields: %v", err)
	}
	var row models.EntitySchemaField
	if err := db.First(&row).Error; err != nil {
		t.Fatal(err)
	}
	if row.SchemaVersion != 3 || row.SchemaChecksum != checksum ||
		row.FieldKey != "amount" || row.Classification != "confidential" {
		t.Fatalf("unexpected catalog row: %+v", row)
	}
	if string(row.ReadRoles) != `["admin"]` || string(row.WriteRoles) != `["owner"]` {
		t.Fatalf("roles were not normalized: read=%s write=%s", row.ReadRoles, row.WriteRoles)
	}
}

func TestCompileSchemaDraftRejectsUnsafeFieldPolicy(t *testing.T) {
	_, err := CompileSchemaDraft("اختبار", "Test", []SchemaFieldInput{{
		Key: "secret", LabelAr: "سري", LabelEn: "Secret", Type: "text",
		Classification: "top-secret", ReadRoles: []string{"admin OR true"},
	}})
	if err == nil {
		t.Fatal("unsafe classification and role were accepted")
	}
}
