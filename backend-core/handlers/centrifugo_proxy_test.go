package handlers_test

import (
	"bytes"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/septimus-os/backend-core/handlers"
	"github.com/septimus-os/backend-core/middleware"
)

// The membership branches need a live DB, so these tests cover the parts that
// don't: the auth gate and the input-shape rejections. A denied verdict is a
// 200 with an {"error":...} body (Centrifugo's contract), NOT an HTTP error —
// only the auth gate returns a non-200.

func newProxyApp() *fiber.App {
	app := fiber.New()
	app.Post("/centrifugo/subscribe", handlers.CentrifugoSubscribe)
	return app
}

func post(t *testing.T, app *fiber.App, token, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest("POST", "/centrifugo/subscribe", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set(middleware.InternalTokenName, token)
	}
	resp, err := app.Test(req, 2000)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	rec := httptest.NewRecorder()
	rec.Code = resp.StatusCode
	buf := new(bytes.Buffer)
	_, _ = buf.ReadFrom(resp.Body)
	rec.Body = buf
	return rec
}

func TestCentrifugoSubscribe_RejectsMissingToken(t *testing.T) {
	t.Setenv("INTERNAL_API_TOKEN", "secret")
	app := newProxyApp()

	rec := post(t, app, "", `{"user":"u","channel":"channel_x"}`)
	if rec.Code != fiber.StatusUnauthorized {
		t.Errorf("missing token should be 401, got %d", rec.Code)
	}
}

func TestCentrifugoSubscribe_RejectsWrongToken(t *testing.T) {
	t.Setenv("INTERNAL_API_TOKEN", "secret")
	app := newProxyApp()

	rec := post(t, app, "nope", `{"user":"u","channel":"channel_x"}`)
	if rec.Code != fiber.StatusUnauthorized {
		t.Errorf("wrong token should be 401, got %d", rec.Code)
	}
}

func TestCentrifugoSubscribe_DeniesBadUUID(t *testing.T) {
	t.Setenv("INTERNAL_API_TOKEN", "secret")
	app := newProxyApp()

	// A non-UUID user is a 200 with a deny body (Centrifugo semantics), not a 4xx.
	rec := post(t, app, "secret", `{"user":"not-a-uuid","channel":"channel_x"}`)
	if rec.Code != fiber.StatusOK {
		t.Fatalf("expected 200 with deny body, got %d", rec.Code)
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte("permission denied")) {
		t.Errorf("expected a deny body, got %s", rec.Body.String())
	}
}

func TestCentrifugoSubscribe_DeniesUnknownChannelScheme(t *testing.T) {
	t.Setenv("INTERNAL_API_TOKEN", "secret")
	app := newProxyApp()

	rec := post(t, app, "secret", `{"user":"2f67ffe1-d96d-4cff-93b3-a8dd743b6907","channel":"totally_unknown"}`)
	if rec.Code != fiber.StatusOK || !bytes.Contains(rec.Body.Bytes(), []byte("permission denied")) {
		t.Errorf("unknown channel scheme must be denied, got %d %s", rec.Code, rec.Body.String())
	}
}

func TestCentrifugoSubscribe_FailsClosedWithoutToken(t *testing.T) {
	t.Setenv("INTERNAL_API_TOKEN", "")
	app := newProxyApp()

	rec := post(t, app, "", `{"user":"2f67ffe1-d96d-4cff-93b3-a8dd743b6907","channel":"totally_unknown"}`)
	if rec.Code != fiber.StatusServiceUnavailable {
		t.Errorf("missing internal token should fail closed with 503, got %d %s", rec.Code, rec.Body.String())
	}
}
