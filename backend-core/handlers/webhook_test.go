package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
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

func setupWebhookTestDB(t *testing.T) {
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("Failed to open test memory db: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("Failed to access sqlite connection: %v", err)
	}
	sqlDB.SetMaxOpenConns(1)

	createTables := []string{
		`CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT, industry TEXT, created_at DATETIME, updated_at DATETIME);`,
		`CREATE TABLE IF NOT EXISTS entities (
			id TEXT PRIMARY KEY,
			workspace_id TEXT,
			project_id TEXT,
			definition_id TEXT,
			schema_version INTEGER NOT NULL DEFAULT 0,
			record_version INTEGER NOT NULL DEFAULT 1,
			display_value TEXT NOT NULL DEFAULT '',
			created_by TEXT,
			updated_by TEXT,
			entity_type TEXT,
			data TEXT,
			created_at DATETIME,
			updated_at DATETIME,
			deleted_at DATETIME
		);`,
		`CREATE TABLE IF NOT EXISTS pending_approvals (id TEXT PRIMARY KEY, workspace_id TEXT, agent_name TEXT, action_type TEXT, payload TEXT, reason TEXT, status TEXT, requested_at DATETIME, resolved_at DATETIME, resolved_by TEXT);`,
		`CREATE TABLE IF NOT EXISTS workflows (id TEXT PRIMARY KEY, workspace_id TEXT, name TEXT, trigger_type TEXT, trigger_config TEXT, steps TEXT, is_active BOOLEAN, created_at DATETIME, updated_at DATETIME);`,
		`CREATE TABLE IF NOT EXISTS agent_collaboration_logs (id TEXT PRIMARY KEY, workspace_id TEXT, session_id TEXT, agent_name TEXT, action TEXT, input_data TEXT, output_data TEXT, loop_count INTEGER, status TEXT, created_at DATETIME);`,
		`CREATE TABLE IF NOT EXISTS webhook_subscriptions (id TEXT PRIMARY KEY, workspace_id TEXT, target_url TEXT, events TEXT, secret TEXT, is_active BOOLEAN, created_at DATETIME, updated_at DATETIME);`,
		`CREATE TABLE IF NOT EXISTS webhook_deliveries (id TEXT PRIMARY KEY, workspace_id TEXT, delivery_id TEXT, received_at DATETIME, UNIQUE(workspace_id, delivery_id));`,
	}

	for _, query := range createTables {
		if err := db.Exec(query).Error; err != nil {
			t.Fatalf("Failed to create sqlite table: %v", err)
		}
	}

	database.DB = db
}

func signTestWebhook(body []byte, secret string) (timestamp, deliveryID, signature string) {
	return services.SignWebhookDelivery(secret, body)
}

func TestHandleExternalWebhook(t *testing.T) {
	setupWebhookTestDB(t)

	app := fiber.New()
	app.Post("/webhooks/external", HandleExternalWebhook)

	wsID := uuid.New().String()
	database.DB.Exec(`INSERT INTO webhook_subscriptions (id, workspace_id, target_url, events, secret, is_active) VALUES (?, ?, ?, ?, ?, ?)`, uuid.New().String(), wsID, "https://example.com/webhook", `["*"]`, "test-secret", true)
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
	timestamp, deliveryID, signature := signTestWebhook(body, "test-secret")
	req.Header.Set("X-Septimus-Signature", signature)
	req.Header.Set("X-Septimus-Timestamp", timestamp)
	req.Header.Set("X-Septimus-Delivery-ID", deliveryID)

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

	replay := httptest.NewRequest("POST", "/webhooks/external", bytes.NewBuffer(body))
	replay.Header.Set("Content-Type", "application/json")
	replay.Header.Set("X-Septimus-Signature", signature)
	replay.Header.Set("X-Septimus-Timestamp", timestamp)
	replay.Header.Set("X-Septimus-Delivery-ID", deliveryID)
	replayResp, err := app.Test(replay, -1)
	if err != nil {
		t.Fatalf("Replay request failed: %v", err)
	}
	if replayResp.StatusCode != fiber.StatusUnauthorized {
		t.Errorf("Expected replay to be rejected with 401, got %d", replayResp.StatusCode)
	}
}

func TestHandleZendeskWebhookUsesCanonicalCRMAndRejectsReplay(t *testing.T) {
	db := setupCRMTestDB(t)
	for _, statement := range []string{
		`CREATE TABLE webhook_subscriptions (
			id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, target_url TEXT,
			events TEXT, secret TEXT, is_active BOOLEAN, created_at DATETIME, updated_at DATETIME
		)`,
		`CREATE TABLE webhook_deliveries (
			id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, delivery_id TEXT NOT NULL,
			received_at DATETIME, UNIQUE(workspace_id, delivery_id)
		)`,
	} {
		if err := db.Exec(statement).Error; err != nil {
			t.Fatal(err)
		}
	}
	database.DB = db
	workspaceID := uuid.New()
	if err := services.EnsureSystemCRMDefinitions(db, workspaceID, nil); err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(
		`INSERT INTO webhook_subscriptions (id, workspace_id, target_url, events, secret, is_active) VALUES (?, ?, ?, ?, ?, ?)`,
		uuid.New().String(), workspaceID.String(), "https://example.test/zendesk", `["*"]`, "test-secret", true,
	).Error; err != nil {
		t.Fatal(err)
	}

	app := fiber.New()
	app.Post("/zendesk", func(c *fiber.Ctx) error {
		c.Locals("workspace", &models.Workspace{ID: workspaceID})
		return c.Next()
	}, HandleZendeskWebhook)

	post := func(payload map[string]interface{}, timestamp, deliveryID, signature string) *http.Response {
		t.Helper()
		body, err := json.Marshal(payload)
		if err != nil {
			t.Fatal(err)
		}
		if timestamp == "" {
			timestamp, deliveryID, signature = signTestWebhook(body, "test-secret")
		}
		req := httptest.NewRequest("POST", "/zendesk", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Septimus-Timestamp", timestamp)
		req.Header.Set("X-Septimus-Delivery-ID", deliveryID)
		req.Header.Set("X-Septimus-Signature", signature)
		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatal(err)
		}
		return resp
	}

	initial := map[string]interface{}{
		"ticket_id": "zd-1001", "subject": "Cannot sign in",
		"description": "The customer receives an invalid session message.", "priority": "high",
	}
	body, _ := json.Marshal(initial)
	timestamp, deliveryID, signature := signTestWebhook(body, "test-secret")
	created := post(initial, timestamp, deliveryID, signature)
	if created.StatusCode != fiber.StatusCreated {
		t.Fatalf("expected canonical ticket creation, got %d", created.StatusCode)
	}
	created.Body.Close()

	principal := services.PrincipalForSystem("crm_ticket_command")
	result, err := services.QueryDynamicRecordsAs(db, workspaceID, principal, "crm_ticket", services.RecordQueryRequest{Limit: 10})
	if err != nil || len(result.Data) != 1 {
		t.Fatalf("expected one canonical CRM ticket, got records=%d err=%v", len(result.Data), err)
	}
	firstData := entityData(result.Data[0])
	if firstData["external_provider"] != "zendesk" || firstData["external_ticket_id"] != "zd-1001" || firstData["priority"] != "high" {
		t.Fatalf("unexpected canonical ticket projection: %#v", firstData)
	}
	firstSLA := fmt.Sprint(firstData["sla_due_at"])
	var legacyCount, messageCount, outboxCount int64
	db.Model(&models.Entity{}).Where("workspace_id = ? AND entity_type = ?", workspaceID, "support_ticket").Count(&legacyCount)
	db.Model(&models.Entity{}).Where("workspace_id = ? AND entity_type = ?", workspaceID, "crm_ticket_message").Count(&messageCount)
	db.Model(&models.OutboxEvent{}).Where("workspace_id = ?", workspaceID).Count(&outboxCount)
	if legacyCount != 0 || messageCount != 1 || outboxCount < 2 {
		t.Fatalf("expected canonical transaction and outbox; legacy=%d messages=%d outbox=%d", legacyCount, messageCount, outboxCount)
	}

	replay := post(initial, timestamp, deliveryID, signature)
	if replay.StatusCode != fiber.StatusUnauthorized {
		t.Fatalf("expected replay rejection, got %d", replay.StatusCode)
	}
	replay.Body.Close()

	comment := map[string]interface{}{
		"ticket_id": "zd-1001", "subject": "Cannot sign in",
		"description": "A second diagnostic comment without a priority change.",
	}
	updated := post(comment, "", "", "")
	if updated.StatusCode != fiber.StatusOK {
		t.Fatalf("expected idempotent external-ticket update, got %d", updated.StatusCode)
	}
	updated.Body.Close()

	result, err = services.QueryDynamicRecordsAs(db, workspaceID, principal, "crm_ticket", services.RecordQueryRequest{Limit: 10})
	if err != nil || len(result.Data) != 1 {
		t.Fatalf("Zendesk external id created a duplicate ticket; records=%d err=%v", len(result.Data), err)
	}
	updatedData := entityData(result.Data[0])
	if updatedData["priority"] != "high" || fmt.Sprint(updatedData["sla_due_at"]) != firstSLA {
		t.Fatalf("comment-only update changed priority/SLA: %#v", updatedData)
	}
	db.Model(&models.Entity{}).Where("workspace_id = ? AND entity_type = ?", workspaceID, "crm_ticket_message").Count(&messageCount)
	if messageCount != 2 {
		t.Fatalf("expected two canonical ticket messages, got %d", messageCount)
	}
}

func TestResolveHITLFromWebhook(t *testing.T) {
	setupWebhookTestDB(t)

	pendingID := uuid.New()
	wsID := uuid.New()
	database.DB.Exec(`INSERT INTO webhook_subscriptions (id, workspace_id, target_url, events, secret, is_active) VALUES (?, ?, ?, ?, ?, ?)`, uuid.New().String(), wsID.String(), "https://example.com/webhook", `["*"]`, "test-secret", true)

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
		WorkspaceID: wsID,
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
		"event":        "hitl.approval_resolved",
		"source":       "n8n_action",
		"workspace_id": wsID.String(),
		"data": map[string]interface{}{
			"pending_id": pendingID.String(),
			"action":     "approve",
		},
	}
	body, _ := json.Marshal(webhookInput)

	req := httptest.NewRequest("POST", "/webhooks/external", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	timestamp, deliveryID, signature := signTestWebhook(body, "test-secret")
	req.Header.Set("X-Septimus-Signature", signature)
	req.Header.Set("X-Septimus-Timestamp", timestamp)
	req.Header.Set("X-Septimus-Delivery-ID", deliveryID)

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

// A caller authenticated for one tenant must not be able to resolve another
// tenant's queued approval by knowing its id. resolveHITLFromWebhook used to
// look the record up by id alone.
func TestResolveHITLIsScopedToTenant(t *testing.T) {
	setupWebhookTestDB(t)

	victimWS := uuid.New()
	attackerWS := uuid.New()
	pendingID := uuid.New()

	pending := models.PendingApproval{
		ID:          pendingID,
		WorkspaceID: victimWS,
		AgentName:   "HR Specialist",
		ActionType:  "Create Confidential Note",
		Payload:     `{"action":"noop"}`,
		Status:      "pending",
		RequestedAt: time.Now(),
	}
	if err := database.DB.Create(&pending).Error; err != nil {
		t.Fatalf("seed pending approval: %v", err)
	}

	data := map[string]interface{}{"pending_id": pendingID.String(), "action": "approve"}

	// Authenticated as the attacker's tenant: must not touch the victim's row.
	resolveHITLFromWebhook(attackerWS, "hitl.approval_resolved", data)

	var after models.PendingApproval
	if err := database.DB.Where("id = ?", pendingID).First(&after).Error; err != nil {
		t.Fatalf("reload pending approval: %v", err)
	}
	if after.Status != "pending" {
		t.Fatalf("another tenant resolved the approval: status = %q", after.Status)
	}
	if after.ResolvedAt != nil {
		t.Error("ResolvedAt was set by a foreign tenant")
	}

	// The owning tenant still can.
	resolveHITLFromWebhook(victimWS, "hitl.approval_resolved", data)
	if err := database.DB.Where("id = ?", pendingID).First(&after).Error; err != nil {
		t.Fatalf("reload pending approval: %v", err)
	}
	if after.Status != "approved" {
		t.Fatalf("the owning tenant could not resolve its own approval: status = %q", after.Status)
	}
}
