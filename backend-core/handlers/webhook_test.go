package handlers

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupWebhookTestDB(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("Failed to open test memory db: %v", err)
	}

	createTables := []string{
		`CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT, industry TEXT, created_at DATETIME, updated_at DATETIME);`,
		`CREATE TABLE IF NOT EXISTS entities (id TEXT PRIMARY KEY, workspace_id TEXT, project_id TEXT, entity_type TEXT, data TEXT, created_at DATETIME, updated_at DATETIME, deleted_at DATETIME);`,
		`CREATE TABLE IF NOT EXISTS pending_approvals (id TEXT PRIMARY KEY, workspace_id TEXT, agent_name TEXT, action_type TEXT, payload TEXT, reason TEXT, status TEXT, requested_at DATETIME, resolved_at DATETIME, resolved_by TEXT);`,
		`CREATE TABLE IF NOT EXISTS workflows (id TEXT PRIMARY KEY, workspace_id TEXT, name TEXT, trigger_type TEXT, trigger_config TEXT, steps TEXT, is_active BOOLEAN, created_at DATETIME, updated_at DATETIME);`,
		`CREATE TABLE IF NOT EXISTS agent_collaboration_logs (id TEXT PRIMARY KEY, workspace_id TEXT, session_id TEXT, agent_name TEXT, action TEXT, input_data TEXT, output_data TEXT, loop_count INTEGER, status TEXT, created_at DATETIME);`,
	}

	for _, query := range createTables {
		if err := db.Exec(query).Error; err != nil {
			t.Fatalf("Failed to create sqlite table: %v", err)
		}
	}

	database.DB = db
}

func TestHandleExternalWebhook(t *testing.T) {
	setupWebhookTestDB(t)

	app := fiber.New()
	app.Post("/webhooks/external", HandleExternalWebhook)

	wsID := uuid.New().String()
	payload := map[string]interface{}{
		"event":        "crm.lead.new",
		"source":       "n8n",
		"workspace_id": wsID,
		"data": map[string]interface{}{
			"lead_name": "Sovereign Diwan Representative",
			"score":     95,
		},
	}
	body, _ := json.Marshal(payload)

	req := httptest.NewRequest("POST", "/webhooks/external", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("Test request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusAccepted {
		t.Errorf("Expected status 202 Accepted, got %d", resp.StatusCode)
	}

	var entity models.Entity
	if err := database.DB.First(&entity).Error; err != nil {
		t.Errorf("Expected webhook entity saved in DB, got error: %v", err)
	}
	if entity.EntityType != "webhook_payload" {
		t.Errorf("Expected entity_type 'webhook_payload', got '%s'", entity.EntityType)
	}
}

func TestResolveHITLFromWebhook(t *testing.T) {
	setupWebhookTestDB(t)

	pendingID := uuid.New()
	wsID := uuid.New()

	payloadData, _ := json.Marshal(map[string]interface{}{
		"action":       "create_entity",
		"workspace_id": wsID.String(),
		"entity_type":  "note",
		"data": map[string]interface{}{
			"content": "Secret note approved from n8n webhook",
		},
	})

	pending := models.PendingApproval{
		ID:          pendingID,
		AgentName:   "HR Specialist",
		ActionType:  "Create Confidential Note",
		Payload:     string(payloadData),
		Status:      "pending",
		RequestedAt: time.Now(),
	}
	if err := database.DB.Create(&pending).Error; err != nil {
		t.Fatalf("Failed to create pending approval in test DB: %v", err)
	}

	app := fiber.New()
	app.Post("/webhooks/external", HandleExternalWebhook)

	webhookInput := map[string]interface{}{
		"event":  "hitl.approval_resolved",
		"source": "n8n_action",
		"data": map[string]interface{}{
			"pending_id": pendingID.String(),
			"action":     "approve",
		},
	}
	body, _ := json.Marshal(webhookInput)

	req := httptest.NewRequest("POST", "/webhooks/external", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("Test request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusAccepted {
		t.Errorf("Expected status 202 Accepted, got %d", resp.StatusCode)
	}

	var updatedPending models.PendingApproval
	if err := database.DB.Where("id = ?", pendingID).First(&updatedPending).Error; err != nil {
		t.Fatalf("Failed fetching pending: %v", err)
	}
	if updatedPending.Status != "approved" {
		t.Errorf("Expected pending status 'approved', got '%s'", updatedPending.Status)
	}
	if updatedPending.ResolvedAt == nil {
		t.Errorf("Expected ResolvedAt to be set after webhook approval")
	}
}
