package middleware_test

import (
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/septimus-os/backend-core/middleware"
)

func newInternalApp() *fiber.App {
	app := fiber.New()
	app.Get("/internal/ping", middleware.RequireInternalToken, func(c *fiber.Ctx) error {
		return c.SendStatus(fiber.StatusOK)
	})
	return app
}

func TestRequireInternalToken_FailsClosedWhenUnset(t *testing.T) {
	t.Setenv("INTERNAL_API_TOKEN", "")
	app := newInternalApp()

	req := httptest.NewRequest("GET", "/internal/ping", nil)
	resp, err := app.Test(req, 2000)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusServiceUnavailable {
		t.Errorf("missing internal token should fail closed, got %d", resp.StatusCode)
	}
}

func TestRequireInternalToken_MissingHeaderRejected(t *testing.T) {
	t.Setenv("INTERNAL_API_TOKEN", "prod-token")
	app := newInternalApp()

	req := httptest.NewRequest("GET", "/internal/ping", nil)
	resp, err := app.Test(req, 2000)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusUnauthorized {
		t.Errorf("missing header should be 401, got %d", resp.StatusCode)
	}
}

func TestRequireInternalToken_WrongTokenRejected(t *testing.T) {
	t.Setenv("INTERNAL_API_TOKEN", "prod-token")
	app := newInternalApp()

	req := httptest.NewRequest("GET", "/internal/ping", nil)
	req.Header.Set(middleware.InternalTokenName, "wrong-token")
	resp, err := app.Test(req, 2000)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusUnauthorized {
		t.Errorf("wrong token should be 401, got %d", resp.StatusCode)
	}
}

func TestRequireInternalToken_CorrectTokenAccepted(t *testing.T) {
	t.Setenv("INTERNAL_API_TOKEN", "prod-token")
	app := newInternalApp()

	req := httptest.NewRequest("GET", "/internal/ping", nil)
	req.Header.Set(middleware.InternalTokenName, "prod-token")
	resp, err := app.Test(req, 2000)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusOK {
		t.Errorf("correct token should pass, got %d", resp.StatusCode)
	}
}
