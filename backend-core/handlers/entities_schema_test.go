package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupEntitySchemaTestApp(t *testing.T) (*fiber.App, *gorm.DB, uuid.UUID) {
	t.Helper()
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("access sqlite connection: %v", err)
	}
	sqlDB.SetMaxOpenConns(1)
	for _, statement := range []string{
		`CREATE TABLE entity_definitions (
			id TEXT PRIMARY KEY,
			workspace_id TEXT NOT NULL,
			key TEXT NOT NULL,
			label_ar TEXT NOT NULL,
			label_en TEXT NOT NULL,
			description_ar TEXT,
			description_en TEXT,
			status TEXT NOT NULL,
			current_version INTEGER NOT NULL,
			draft_revision INTEGER NOT NULL,
			title_field_key TEXT,
			draft_schema TEXT,
			draft_ui_schema TEXT,
			settings TEXT,
			created_by TEXT,
			updated_by TEXT,
			created_at DATETIME,
			updated_at DATETIME,
			deleted_at DATETIME
		)`,
		`CREATE TABLE entity_schema_versions (
			id TEXT PRIMARY KEY,
			workspace_id TEXT NOT NULL,
			definition_id TEXT NOT NULL,
			version INTEGER NOT NULL,
			json_schema TEXT NOT NULL,
			ui_schema TEXT,
			change_set TEXT,
			checksum TEXT,
			published_by TEXT,
			published_at DATETIME
		)`,
		`CREATE TABLE entities (
			id TEXT PRIMARY KEY,
			workspace_id TEXT NOT NULL,
			project_id TEXT,
			definition_id TEXT,
			schema_version INTEGER NOT NULL DEFAULT 0,
			record_version INTEGER NOT NULL DEFAULT 1,
			display_value TEXT NOT NULL DEFAULT '',
			created_by TEXT,
			updated_by TEXT,
			entity_type TEXT NOT NULL,
			data TEXT NOT NULL,
			created_at DATETIME,
			updated_at DATETIME,
			deleted_at DATETIME
		)`,
		`CREATE TABLE entity_relations (
			id TEXT PRIMARY KEY,
			workspace_id TEXT NOT NULL,
			source_definition_id TEXT NOT NULL,
			source_field_key TEXT NOT NULL,
			target_definition_id TEXT NOT NULL,
			cardinality TEXT NOT NULL,
			on_delete TEXT NOT NULL,
			label_ar TEXT,
			label_en TEXT,
			required BOOLEAN,
			created_at DATETIME,
			updated_at DATETIME
		)`,
		`CREATE TABLE entity_record_relations (
			id TEXT PRIMARY KEY,
			workspace_id TEXT NOT NULL,
			relation_id TEXT NOT NULL,
			source_record_id TEXT NOT NULL,
			target_record_id TEXT NOT NULL,
			created_at DATETIME
		)`,
		`CREATE TABLE outbox_events (
			id TEXT PRIMARY KEY,
			workspace_id TEXT NOT NULL,
			subject TEXT NOT NULL,
			event_type TEXT NOT NULL,
			aggregate_type TEXT NOT NULL,
			aggregate_id TEXT NOT NULL,
			payload TEXT NOT NULL,
			status TEXT NOT NULL,
			attempts INTEGER NOT NULL,
			available_at DATETIME NOT NULL,
			published_at DATETIME,
			last_error TEXT,
			created_at DATETIME,
			updated_at DATETIME
		)`,
		`CREATE TABLE audit_logs (
			id TEXT PRIMARY KEY,
			workspace_id TEXT,
			user_id TEXT,
			action TEXT NOT NULL,
			entity_type TEXT,
			entity_id TEXT,
			details TEXT,
			ip_address TEXT,
			created_at DATETIME
		)`,
	} {
		if err := db.Exec(statement).Error; err != nil {
			t.Fatalf("create test table: %v", err)
		}
	}
	database.DB = db
	workspaceID := uuid.New()
	workspace := &models.Workspace{ID: workspaceID, Tier: "business"}
	userID := uuid.New()

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("workspace", workspace)
		c.Locals("workspace_id", workspaceID.String())
		c.Locals("user_id", userID.String())
		return c.Next()
	})
	app.Post("/entities", CreateEntity)
	return app, db, workspaceID
}

func newJSONTestRequest(path string, body []byte) *http.Request {
	request := httptest.NewRequest("POST", path, bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	return request
}

func TestCreateEntityRejectsSchemaType(t *testing.T) {
	app, db, _ := setupEntitySchemaTestApp(t)
	body, _ := json.Marshal(map[string]interface{}{
		"entity_type": "schema",
		"data":        map[string]interface{}{"name": "unsafe"},
	})
	response, err := app.Test(newJSONTestRequest("/entities", body), -1)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if response.StatusCode != fiber.StatusBadRequest {
		t.Fatalf("expected 400, got %d", response.StatusCode)
	}
	var count int64
	db.Model(&models.Entity{}).Count(&count)
	if count != 0 {
		t.Fatalf("schema payload persisted through generic entity route")
	}
}

func TestCreateDynamicEntityUsesPublishedSchema(t *testing.T) {
	app, db, workspaceID := setupEntitySchemaTestApp(t)
	compiled, err := services.CompileSchemaDraft("زيارات العملاء", "Customer visits", []services.SchemaFieldInput{
		{Key: "title", LabelAr: "العنوان", LabelEn: "Title", Type: "text", Required: true},
		{Key: "score", LabelAr: "التقييم", LabelEn: "Score", Type: "number"},
	})
	if err != nil {
		t.Fatalf("compile schema: %v", err)
	}
	definition := models.EntityDefinition{
		ID:             uuid.New(),
		WorkspaceID:    workspaceID,
		Key:            "customer_visits",
		LabelAr:        "زيارات العملاء",
		LabelEn:        "Customer visits",
		Status:         models.EntityDefinitionStatusPublished,
		CurrentVersion: 1,
		DraftRevision:  1,
		TitleFieldKey:  "title",
		DraftSchema:    compiled.JSONSchema,
		DraftUISchema:  compiled.UISchema,
	}
	if err := db.Create(&definition).Error; err != nil {
		t.Fatalf("create definition: %v", err)
	}
	version := models.EntitySchemaVersion{
		ID:           uuid.New(),
		WorkspaceID:  workspaceID,
		DefinitionID: definition.ID,
		Version:      1,
		JSONSchema:   compiled.JSONSchema,
		UISchema:     compiled.UISchema,
		Checksum:     services.SchemaChecksum(compiled.JSONSchema, compiled.UISchema),
	}
	if err := db.Create(&version).Error; err != nil {
		t.Fatalf("create version: %v", err)
	}

	validBody, _ := json.Marshal(map[string]interface{}{
		"entity_type": "customer_visits",
		"data": map[string]interface{}{
			"title": "Quarterly review",
			"score": 95,
		},
	})
	validResponse, err := app.Test(newJSONTestRequest("/entities", validBody), -1)
	if err != nil {
		t.Fatalf("valid request failed: %v", err)
	}
	if validResponse.StatusCode != fiber.StatusCreated {
		responseBody, _ := io.ReadAll(validResponse.Body)
		t.Fatalf("expected 201, got %d: %s", validResponse.StatusCode, responseBody)
	}
	var saved models.Entity
	if err := db.First(&saved).Error; err != nil {
		t.Fatalf("load saved record: %v", err)
	}
	if saved.DefinitionID == nil || *saved.DefinitionID != definition.ID || saved.SchemaVersion != 1 {
		t.Fatalf("record was not bound to the published definition: %+v", saved)
	}
	if saved.DisplayValue != "Quarterly review" {
		t.Fatalf("unexpected display value %q", saved.DisplayValue)
	}

	invalidBody, _ := json.Marshal(map[string]interface{}{
		"entity_type": "customer_visits",
		"data":        map[string]interface{}{"score": "not-a-number"},
	})
	invalidResponse, err := app.Test(newJSONTestRequest("/entities", invalidBody), -1)
	if err != nil {
		t.Fatalf("invalid request failed: %v", err)
	}
	if invalidResponse.StatusCode != fiber.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d", invalidResponse.StatusCode)
	}
}

func TestPreviewSchemaFormulaUsesDraftContract(t *testing.T) {
	app, db, workspaceID := setupEntitySchemaTestApp(t)
	compiled, err := services.CompileSchemaDraft("طلبات", "Orders", []services.SchemaFieldInput{
		{Key: "quantity", LabelAr: "الكمية", LabelEn: "Quantity", Type: "integer"},
		{Key: "price", LabelAr: "السعر", LabelEn: "Price", Type: "number"},
		{Key: "total", LabelAr: "الإجمالي", LabelEn: "Total", Type: "formula", Formula: &services.FormulaFieldConfig{
			Expression: "[quantity] * [price]", ResultType: "number",
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	definition := models.EntityDefinition{
		ID: uuid.New(), WorkspaceID: workspaceID, Key: "preview_orders",
		LabelAr: "طلبات", LabelEn: "Orders", Status: models.EntityDefinitionStatusDraft,
		DraftRevision: 1, DraftSchema: compiled.JSONSchema, DraftUISchema: compiled.UISchema,
	}
	if err := db.Create(&definition).Error; err != nil {
		t.Fatal(err)
	}
	app.Post("/schema/:id/formula-preview", PreviewSchemaFormula)
	body, _ := json.Marshal(map[string]interface{}{
		"expression": "[quantity] * [price]",
		"values":     map[string]interface{}{"quantity": 3, "price": 12.5},
	})
	response, err := app.Test(newJSONTestRequest(
		"/schema/"+definition.ID.String()+"/formula-preview", body,
	), -1)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != fiber.StatusOK {
		raw, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d: %s", response.StatusCode, raw)
	}
	var payload struct {
		Result float64 `json:"result"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatal(err)
	}
	if payload.Result != 37.5 {
		t.Fatalf("unexpected formula result %v", payload.Result)
	}
}

func TestListSchemaActivityIsDefinitionAndWorkspaceScoped(t *testing.T) {
	app, db, workspaceID := setupEntitySchemaTestApp(t)
	definition := models.EntityDefinition{
		ID: uuid.New(), WorkspaceID: workspaceID, Key: "activity_orders",
		LabelAr: "طلبات", LabelEn: "Orders", Status: models.EntityDefinitionStatusDraft,
	}
	if err := db.Create(&definition).Error; err != nil {
		t.Fatal(err)
	}
	otherDefinition := uuid.New()
	logs := []models.AuditLog{
		{
			ID: uuid.New(), WorkspaceID: &workspaceID, Action: "schema_definition.publish",
			EntityType: "EntityDefinition", EntityID: definition.ID.String(), CreatedAt: time.Now(),
		},
		{
			ID: uuid.New(), WorkspaceID: &workspaceID, Action: "schema_definition.archive",
			EntityType: "EntityDefinition", EntityID: otherDefinition.String(), CreatedAt: time.Now(),
		},
	}
	if err := db.Create(&logs).Error; err != nil {
		t.Fatal(err)
	}

	app.Get("/schema/:id/activity", ListSchemaActivity)
	request := httptest.NewRequest(
		http.MethodGet,
		"/schema/"+definition.ID.String()+"/activity",
		nil,
	)
	response, err := app.Test(request, -1)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != fiber.StatusOK {
		raw, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d: %s", response.StatusCode, raw)
	}
	var payload struct {
		Data []schemaActivityItem `json:"data"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatal(err)
	}
	if len(payload.Data) != 1 || payload.Data[0].Action != "schema_definition.publish" {
		t.Fatalf("unexpected activity payload: %+v", payload.Data)
	}
}
