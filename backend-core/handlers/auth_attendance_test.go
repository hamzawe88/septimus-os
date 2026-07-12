package handlers_test

import (
	"bytes"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/septimus-os/backend-core/handlers"
)

func TestLogin_InvalidBody(t *testing.T) {
	app := fiber.New()
	app.Post("/login", handlers.Login)

	req := httptest.NewRequest("POST", "/login", bytes.NewBufferString("not-a-json"))
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, 2000)
	if err != nil {
		t.Fatalf("Failed to execute request: %v", err)
	}

	if resp.StatusCode != fiber.StatusBadRequest {
		t.Errorf("Expected status %d for invalid JSON body, got %d", fiber.StatusBadRequest, resp.StatusCode)
	}
}

func TestCheckIn_Unauthorized(t *testing.T) {
	app := fiber.New()
	app.Post("/check-in", handlers.CheckIn)

	req := httptest.NewRequest("POST", "/check-in", bytes.NewBufferString(`{"office_id":"123"}`))
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, 2000)
	if err != nil {
		t.Fatalf("Failed to execute request: %v", err)
	}

	if resp.StatusCode != fiber.StatusUnauthorized {
		t.Errorf("Expected status %d for unauthenticated check-in, got %d", fiber.StatusUnauthorized, resp.StatusCode)
	}
}

func TestCheckIn_InvalidOfficeID(t *testing.T) {
	app := fiber.New()
	// Middleware mock injects a valid user_id into Locals
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("user_id", "550e8400-e29b-41d4-a716-446655440000")
		return c.Next()
	})
	app.Post("/check-in", handlers.CheckIn)

	req := httptest.NewRequest("POST", "/check-in", bytes.NewBufferString(`{"office_id":"not-a-valid-uuid"}`))
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, 2000)
	if err != nil {
		t.Fatalf("Failed to execute request: %v", err)
	}

	if resp.StatusCode != fiber.StatusBadRequest {
		t.Errorf("Expected status %d for invalid office_id, got %d", fiber.StatusBadRequest, resp.StatusCode)
	}
}

func TestLocalsSafety_NoPanicOnNil(t *testing.T) {
	app := fiber.New()
	app.Get("/test-locals", func(c *fiber.Ctx) error {
		// Verify comma-ok extraction from nil Locals returns empty string without panicking
		val, ok := c.Locals("non_existent_key").(string)
		if ok || val != "" {
			t.Errorf("Expected empty string and false from nil Locals, got %q, %v", val, ok)
		}
		return c.SendStatus(fiber.StatusOK)
	})

	req := httptest.NewRequest("GET", "/test-locals", nil)
	resp, err := app.Test(req, 2000)
	if err != nil {
		t.Fatalf("Failed to execute request: %v", err)
	}

	if resp.StatusCode != fiber.StatusOK {
		t.Errorf("Expected status %d, got %d", fiber.StatusOK, resp.StatusCode)
	}
}
