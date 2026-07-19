package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// setupIntegrationsTestDB gives the test an isolated in-memory DB with a seeded
// workspace, so it never depends on global state from another test file.
func setupIntegrationsTestDB(t *testing.T) uuid.UUID {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT, industry TEXT, tier TEXT, created_at DATETIME, updated_at DATETIME);`,
		`CREATE TABLE IF NOT EXISTS workspace_integrations (id TEXT PRIMARY KEY, workspace_id TEXT, provider TEXT, access_token TEXT, refresh_token TEXT, expiry DATETIME, metadata TEXT, created_at DATETIME, updated_at DATETIME);`,
		`CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, user_id TEXT, action TEXT, entity_type TEXT, entity_id TEXT, details TEXT, ip_address TEXT, created_at DATETIME);`,
	}
	for _, s := range stmts {
		if err := db.Exec(s).Error; err != nil {
			t.Fatalf("create table: %v", err)
		}
	}
	wsID := uuid.New()
	db.Exec(`INSERT INTO workspaces (id, name, tier) VALUES (?, ?, ?)`, wsID.String(), "Test WS", "free")
	database.DB = db
	return wsID
}

func seedIntegration(wsID uuid.UUID, provider string) {
	database.DB.Exec(
		`INSERT INTO workspace_integrations (id, workspace_id, provider, access_token, metadata) VALUES (?, ?, ?, ?, ?)`,
		uuid.New().String(), wsID.String(), provider, "tok_"+provider, "{}",
	)
}

// withWorkspace wraps a handler, stamping the workspace_id local like the JWT
// middleware would.
func withWorkspace(wsID uuid.UUID, h fiber.Handler) fiber.Handler {
	return func(c *fiber.Ctx) error {
		c.Locals("workspace_id", wsID.String())
		return h(c)
	}
}

func TestNormalizeProvider(t *testing.T) {
	cases := map[string]string{
		"google_drive":    "google",
		"google_calendar": "google",
		"google_sheets":   "google",
		"google":          "google",
		"whatsapp":        "whatsapp",
		"zendesk":         "zendesk",
		"odoo":            "odoo",
		"":                "",
	}
	for in, want := range cases {
		if got := normalizeProvider(in); got != want {
			t.Errorf("normalizeProvider(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestGetIntegrationsStatusMapping(t *testing.T) {
	wsID := setupIntegrationsTestDB(t)
	// A single "google" credential must light up all three Google sub-integrations.
	seedIntegration(wsID, "google")
	seedIntegration(wsID, "whatsapp")

	app := fiber.New()
	app.Get("/integrations", withWorkspace(wsID, GetIntegrations))

	resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/integrations", nil))
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	var body struct {
		Integrations []IntegrationDef `json:"integrations"`
	}
	json.NewDecoder(resp.Body).Decode(&body)

	status := map[string]string{}
	for _, i := range body.Integrations {
		status[i.ID] = i.Status
	}
	for _, id := range []string{"google_drive", "google_calendar", "google_sheets", "whatsapp"} {
		if status[id] != "connected" {
			t.Errorf("%s status = %q, want connected", id, status[id])
		}
	}
	if status["zendesk"] != "disconnected" {
		t.Errorf("zendesk status = %q, want disconnected", status["zendesk"])
	}
}

func TestSendWhatsAppMessageValidation(t *testing.T) {
	wsID := setupIntegrationsTestDB(t)
	app := fiber.New()
	app.Post("/wa", withWorkspace(wsID, SendWhatsAppMessage))

	post := func(payload any) int {
		b, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/wa", bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
		resp, _ := app.Test(req)
		return resp.StatusCode
	}

	// Missing required fields → 400 (before any integration lookup).
	if code := post(map[string]string{"to": ""}); code != http.StatusBadRequest {
		t.Errorf("missing fields: status = %d, want 400", code)
	}
	// Valid body but WhatsApp is not connected → 400.
	if code := post(map[string]string{"to": "+218900000000", "message": "hi"}); code != http.StatusBadRequest {
		t.Errorf("not-connected: status = %d, want 400", code)
	}
}

func TestCreateZendeskTicketValidation(t *testing.T) {
	wsID := setupIntegrationsTestDB(t)
	app := fiber.New()
	app.Post("/zd", withWorkspace(wsID, CreateZendeskTicket))

	// Missing subject/description → 400.
	b, _ := json.Marshal(map[string]string{"subject": ""})
	req := httptest.NewRequest(http.MethodPost, "/zd", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	resp, _ := app.Test(req)
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("missing fields: status = %d, want 400", resp.StatusCode)
	}
}
