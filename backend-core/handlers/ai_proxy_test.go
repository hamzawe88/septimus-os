package handlers_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/septimus-os/backend-core/handlers"
	"github.com/septimus-os/backend-core/middleware"
)

// The proxy's security contract: forwarded requests must carry the internal
// token and the JWT-derived identity headers, and must NOT leak the browser's
// Authorization header into the internal network.
func TestProxyToAISidecar_SecurityHeaders(t *testing.T) {
	var got http.Header
	sidecar := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Clone()
		w.WriteHeader(http.StatusOK)
	}))
	defer sidecar.Close()

	t.Setenv("AI_SIDECAR_URL", sidecar.URL)
	t.Setenv("INTERNAL_API_TOKEN", "unit-test-internal-token")

	app := fiber.New()
	// Mimic JWTMiddleware having authenticated the caller.
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("user_id", "user-123")
		c.Locals("workspace_id", "ws-456")
		return c.Next()
	})
	app.Post("/api/v1/ai/chat", handlers.ProxyToAISidecar)

	req := httptest.NewRequest("POST", "/api/v1/ai/chat", nil)
	req.Header.Set("Authorization", "Bearer browser-jwt-must-not-leak")
	resp, err := app.Test(req, 5000)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusOK {
		t.Fatalf("proxy roundtrip failed with status %d", resp.StatusCode)
	}

	if v := got.Get(middleware.InternalTokenName); v != "unit-test-internal-token" {
		t.Errorf("internal token header = %q, want the shared secret", v)
	}
	if v := got.Get("X-Workspace-Id"); v != "ws-456" {
		t.Errorf("X-Workspace-Id = %q, want ws-456", v)
	}
	if v := got.Get("X-User-Id"); v != "user-123" {
		t.Errorf("X-User-Id = %q, want user-123", v)
	}
	if v := got.Get("Authorization"); v != "" {
		t.Errorf("Authorization header leaked to the sidecar: %q", v)
	}
}

func TestProxyToAISidecar_UnreachableSidecarFails(t *testing.T) {
	// Closed port: the proxy must surface an error, not hang or fake success.
	t.Setenv("AI_SIDECAR_URL", "http://127.0.0.1:1")
	t.Setenv("INTERNAL_API_TOKEN", "unit-test-internal-token")

	app := fiber.New()
	app.Post("/api/v1/ai/chat", handlers.ProxyToAISidecar)

	req := httptest.NewRequest("POST", "/api/v1/ai/chat", nil)
	resp, err := app.Test(req, 5000)
	if err != nil {
		// fiber surfaces the dial error through the handler chain; either an
		// error return or a 5xx status is an acceptable failure signal.
		return
	}
	if resp.StatusCode < 500 {
		t.Errorf("unreachable sidecar should yield a 5xx, got %d", resp.StatusCode)
	}
}
