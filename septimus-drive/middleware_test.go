package main

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
)

func TestJWTAuthMiddlewareAcceptsHttpOnlySessionCookie(t *testing.T) {
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Internal-Token") != "test-internal-token" ||
			r.Header.Get("Authorization") != "Bearer server-session" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"user_id":"user-1","workspace_id":"workspace-1"}`))
	}))
	defer backend.Close()
	t.Setenv("BACKEND_URL", backend.URL)
	t.Setenv("INTERNAL_API_TOKEN", "test-internal-token")

	app := fiber.New()
	app.Get("/protected", JWTAuthMiddleware(), func(c *fiber.Ctx) error {
		return c.SendString(c.Locals("workspace_id").(string))
	})
	req := httptest.NewRequest("GET", "/protected", nil)
	req.AddCookie(&http.Cookie{Name: "septimus_session", Value: "server-session", HttpOnly: true})

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestJWTAuthMiddlewareRejectsRevokedBackendSession(t *testing.T) {
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "revoked", http.StatusUnauthorized)
	}))
	defer backend.Close()
	t.Setenv("BACKEND_URL", backend.URL)
	t.Setenv("INTERNAL_API_TOKEN", "test-internal-token")

	app := fiber.New()
	app.Get("/protected", JWTAuthMiddleware(), func(c *fiber.Ctx) error {
		return c.SendStatus(fiber.StatusOK)
	})
	req := httptest.NewRequest("GET", "/protected", nil)
	req.AddCookie(&http.Cookie{Name: "septimus_session", Value: "revoked-session", HttpOnly: true})

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", resp.StatusCode)
	}
}
