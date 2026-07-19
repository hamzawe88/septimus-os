package middleware_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/septimus-os/backend-core/middleware"
	"github.com/septimus-os/backend-core/models"
)

func TestFeatureGateMiddleware(t *testing.T) {
	app := fiber.New()

	// Mock endpoint requiring 'business' tier
	app.Get("/api/v1/ai/miner", func(c *fiber.Ctx) error {
		// Mock local workspace inject
		tier := c.Get("X-Mock-Tier", "free")
		c.Locals("workspace", &models.Workspace{
			Name: "Mock Workspace",
			Tier: tier,
		})
		return c.Next()
	}, middleware.FeatureGateMiddleware("business"), func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "success", "data": "AI Miner result"})
	})

	// Test 1: Request with 'free' tier should fail with 402 Payment Required
	reqFree := httptest.NewRequest(http.MethodGet, "/api/v1/ai/miner", nil)
	reqFree.Header.Set("X-Mock-Tier", "free")
	respFree, err := app.Test(reqFree)
	if err != nil {
		t.Fatalf("App test failed: %v", err)
	}
	if respFree.StatusCode != http.StatusPaymentRequired {
		t.Errorf("Expected status 402 for free tier, got %d", respFree.StatusCode)
	}
	var bodyFree map[string]interface{}
	json.NewDecoder(respFree.Body).Decode(&bodyFree)
	if bodyFree["code"] != "UPGRADE_REQUIRED" {
		t.Errorf("Expected UPGRADE_REQUIRED code, got %v", bodyFree["code"])
	}

	// Test 2: Request with 'starter' tier should fail with 402 Payment Required
	reqStarter := httptest.NewRequest(http.MethodGet, "/api/v1/ai/miner", nil)
	reqStarter.Header.Set("X-Mock-Tier", "starter")
	respStarter, _ := app.Test(reqStarter)
	if respStarter.StatusCode != http.StatusPaymentRequired {
		t.Errorf("Expected status 402 for starter tier, got %d", respStarter.StatusCode)
	}

	// Test 3: Request with 'business' tier should succeed (200 OK)
	reqBusiness := httptest.NewRequest(http.MethodGet, "/api/v1/ai/miner", nil)
	reqBusiness.Header.Set("X-Mock-Tier", "business")
	respBusiness, _ := app.Test(reqBusiness)
	if respBusiness.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200 for business tier, got %d", respBusiness.StatusCode)
	}

	// Test 4: Request with 'enterprise' tier should succeed (200 OK)
	reqEnterprise := httptest.NewRequest(http.MethodGet, "/api/v1/ai/miner", nil)
	reqEnterprise.Header.Set("X-Mock-Tier", "enterprise")
	respEnterprise, _ := app.Test(reqEnterprise)
	if respEnterprise.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200 for enterprise tier, got %d", respEnterprise.StatusCode)
	}
}
