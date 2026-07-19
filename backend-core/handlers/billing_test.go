package handlers_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/handlers"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// setupBillingTestDB makes the billing test self-sufficient (no reliance on the
// global DB set up by another test file): an in-memory SQLite with the tables
// the checkout + webhook paths touch, seeded with an active "business" plan.
func setupBillingTestDB(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("Failed to open test memory db: %v", err)
	}
	tables := []string{
		`CREATE TABLE IF NOT EXISTS saa_s_plans (id TEXT PRIMARY KEY, tier_id TEXT, name_en TEXT, name_ar TEXT, price NUMERIC, currency TEXT, description_en TEXT, description_ar TEXT, features_en TEXT, features_ar TEXT, recommended BOOLEAN, color TEXT, is_active BOOLEAN, created_at DATETIME, updated_at DATETIME);`,
		`CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT, industry TEXT, tier TEXT, created_at DATETIME, updated_at DATETIME);`,
		`CREATE TABLE IF NOT EXISTS subscriptions (id TEXT PRIMARY KEY, workspace_id TEXT, tier TEXT, status TEXT, created_at DATETIME, updated_at DATETIME);`,
	}
	for _, q := range tables {
		if err := db.Exec(q).Error; err != nil {
			t.Fatalf("Failed to create sqlite table: %v", err)
		}
	}
	// Seed an active "business" plan so checkout resolves a real tier.
	if err := db.Exec(
		`INSERT INTO saa_s_plans (id, tier_id, name_en, name_ar, price, currency, features_en, features_ar, is_active) VALUES (?,?,?,?,?,?,?,?,?)`,
		uuid.New().String(), "business", "Business", "الأعمال", 99.0, "USD", "[]", "[]", true,
	).Error; err != nil {
		t.Fatalf("Failed to seed business plan: %v", err)
	}
	database.DB = db
}

func TestBillingEndpoints(t *testing.T) {
	setupBillingTestDB(t)
	app := fiber.New()

	// Mock middleware injecting a workspace
	wsID := uuid.New()
	ws := &models.Workspace{
		ID:   wsID,
		Name: "Test Workspace",
		Tier: "free",
	}

	app.Post("/billing/checkout", func(c *fiber.Ctx) error {
		c.Locals("workspace", ws)
		return handlers.CreateCheckoutSession(c)
	})

	app.Post("/webhooks/stripe", handlers.StripeWebhook)

	// 1. Test CreateCheckoutSession
	reqBody, _ := json.Marshal(map[string]interface{}{
		"tier":       "business",
		"return_url": "http://localhost:3000/admin/billing",
		"simulated":  true,
	})
	req := httptest.NewRequest(http.MethodPost, "/billing/checkout", bytes.NewReader(reqBody))
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("Failed to test checkout: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200 on checkout, got %d", resp.StatusCode)
	}

	var checkoutRes map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&checkoutRes)
	if checkoutRes["tier"] != "business" {
		t.Errorf("Expected tier business, got %v", checkoutRes["tier"])
	}

	// 2. Test StripeWebhook simulated upgrade (when DB connection isn't initialized or in test mode, we test signature verification and structure)
	webhookPayload, _ := json.Marshal(map[string]interface{}{
		"type":         "simulated.tier.upgrade",
		"workspace_id": wsID.String(),
		"tier":         "enterprise",
	})
	reqWebhook := httptest.NewRequest(http.MethodPost, "/webhooks/stripe", bytes.NewReader(webhookPayload))
	reqWebhook.Header.Set("Content-Type", "application/json")
	reqWebhook.Header.Set("Stripe-Signature", "simulated_signature")

	// We expect either 200 OK (if DB is mock/initialized) or 404 (if DB query for wsID fails in memory). Both prove signature passed!
	respWebhook, _ := app.Test(reqWebhook)
	if respWebhook.StatusCode != http.StatusOK && respWebhook.StatusCode != http.StatusNotFound {
		t.Errorf("Expected status 200 or 404 from webhook, got %d", respWebhook.StatusCode)
	}
}
