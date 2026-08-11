package services

import (
	"encoding/json"
	"fmt"
	"testing"

	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/datatypes"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestFieldPoliciesProtectWritesReadsEventsAndAudit(t *testing.T) {
	includeSensitive := true
	fields := []SchemaFieldInput{
		{Key: "title", Type: "text", Classification: "internal"},
		{
			Key: "salary", Type: "number", Classification: "pii",
			ReadRoles: []string{"admin"}, WriteRoles: []string{"admin"},
			IncludeInAI: &includeSensitive, IncludeInEvents: &includeSensitive,
		},
	}
	member := PrincipalForUser(uuid.New(), "member")
	if err := ValidateFieldWrites(fields, map[string]interface{}{"salary": 100}, member); err == nil {
		t.Fatal("member could write an admin-only field")
	}
	record := models.Entity{Data: datatypes.JSON([]byte(`{"title":"A","salary":100}`)), DisplayValue: "A"}
	projected := ProjectRecordForRead(record, models.EntityDefinition{TitleFieldKey: "salary"}, fields, member)
	var projectedData map[string]interface{}
	_ = json.Unmarshal(projected.Data, &projectedData)
	if _, exists := projectedData["salary"]; exists || projected.DisplayValue != "" {
		t.Fatalf("read policy leaked protected data: data=%v display=%q", projectedData, projected.DisplayValue)
	}
	eventData := EventRecordData(fields, map[string]interface{}{"title": "A", "salary": 100})
	if _, exists := eventData["salary"]; exists {
		t.Fatalf("PII leaked into event data: %v", eventData)
	}
	if FieldIncludedInAI(fields[1]) {
		t.Fatal("PII was included in AI indexing despite an unsafe explicit override")
	}
}

func TestValidateRecordReferencesRequiresWorkspaceOwnershipAndCleanFile(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{
		`CREATE TABLE users (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL)`,
		`CREATE TABLE drive_files (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, data TEXT NOT NULL)`,
		`CREATE TABLE work_docs (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL)`,
		`CREATE TABLE file_records (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL)`,
	} {
		if err := db.Exec(statement).Error; err != nil {
			t.Fatal(err)
		}
	}
	workspaceID := uuid.New()
	otherWorkspaceID := uuid.New()
	memberID := uuid.New()
	fileID := uuid.New()
	if err := db.Exec(`INSERT INTO users (id, workspace_id) VALUES (?, ?)`, memberID, workspaceID).Error; err != nil {
		t.Fatal(err)
	}
	cleanMetadata := `{"status":"ready","security_policy":"malware_scan_passed"}`
	if err := db.Exec(`INSERT INTO drive_files (id, workspace_id, data) VALUES (?, ?, ?)`, fileID, workspaceID, cleanMetadata).Error; err != nil {
		t.Fatal(err)
	}
	fields := []SchemaFieldInput{
		{Key: "owner", Type: "user"},
		{Key: "attachment", Type: "file"},
	}
	if err := ValidateRecordReferences(db, workspaceID, fields, map[string]interface{}{
		"owner": memberID.String(), "attachment": fileID.String(),
	}); err != nil {
		t.Fatalf("valid references rejected: %v", err)
	}
	if err := ValidateRecordReferences(db, otherWorkspaceID, fields, map[string]interface{}{
		"owner": memberID.String(), "attachment": fileID.String(),
	}); err == nil {
		t.Fatal("cross-workspace references were accepted")
	}
}

func TestWriteRecordAuditRedactsSensitiveValues(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`CREATE TABLE audit_logs (
		id TEXT PRIMARY KEY, workspace_id TEXT, user_id TEXT, action TEXT,
		entity_type TEXT, entity_id TEXT, details TEXT, ip_address TEXT, created_at DATETIME
	)`).Error; err != nil {
		t.Fatal(err)
	}
	workspaceID := uuid.New()
	definition := models.EntityDefinition{WorkspaceID: workspaceID, Key: "employees"}
	record := models.Entity{ID: uuid.New(), SchemaVersion: 1, RecordVersion: 2}
	fields := []SchemaFieldInput{{Key: "salary", Type: "number", Classification: "pii"}}
	if err := WriteRecordAudit(
		db, "data.record.update", definition, record, PrincipalForUser(uuid.New(), "admin"), fields,
		map[string]interface{}{"salary": 100}, map[string]interface{}{"salary": 200},
	); err != nil {
		t.Fatal(err)
	}
	var audit models.AuditLog
	if err := db.First(&audit).Error; err != nil {
		t.Fatal(err)
	}
	if string(audit.Details) == "" || containsAny(string(audit.Details), `"salary":100`, `"salary":200`) {
		t.Fatalf("sensitive values leaked into audit: %s", audit.Details)
	}
}

func containsAny(value string, candidates ...string) bool {
	for _, candidate := range candidates {
		if len(candidate) > 0 && len(value) >= len(candidate) {
			for index := 0; index+len(candidate) <= len(value); index++ {
				if value[index:index+len(candidate)] == candidate {
					return true
				}
			}
		}
	}
	return false
}
