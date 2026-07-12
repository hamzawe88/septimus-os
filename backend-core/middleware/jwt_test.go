package middleware_test

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/septimus-os/backend-core/middleware"
)

func newJWTApp(t *testing.T) *fiber.App {
	t.Helper()
	app := fiber.New()
	app.Get("/protected", middleware.JWTMiddleware(), func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"user_id":      c.Locals("user_id"),
			"workspace_id": c.Locals("workspace_id"),
		})
	})
	return app
}

func signToken(t *testing.T, secret string, claims jwt.MapClaims) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("failed to sign token: %v", err)
	}
	return signed
}

func TestJWTMiddleware_MissingHeaderRejected(t *testing.T) {
	t.Setenv("JWT_SECRET", "unit-test-jwt-secret")
	app := newJWTApp(t)

	req := httptest.NewRequest("GET", "/protected", nil)
	resp, err := app.Test(req, 2000)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusUnauthorized {
		t.Errorf("missing Authorization should be 401, got %d", resp.StatusCode)
	}
}

func TestJWTMiddleware_MalformedHeaderRejected(t *testing.T) {
	t.Setenv("JWT_SECRET", "unit-test-jwt-secret")
	app := newJWTApp(t)

	req := httptest.NewRequest("GET", "/protected", nil)
	req.Header.Set("Authorization", "not-a-bearer-token")
	resp, err := app.Test(req, 2000)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusUnauthorized {
		t.Errorf("malformed header should be 401, got %d", resp.StatusCode)
	}
}

func TestJWTMiddleware_ForgedSignatureRejected(t *testing.T) {
	t.Setenv("JWT_SECRET", "unit-test-jwt-secret")
	app := newJWTApp(t)

	// Signed with a different key — must never validate. This is the exact
	// attack the removed hardcoded fallback secret would have enabled.
	forged := signToken(t, "super_secret_septimus_key", jwt.MapClaims{
		"sub": "attacker",
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	req := httptest.NewRequest("GET", "/protected", nil)
	req.Header.Set("Authorization", "Bearer "+forged)
	resp, err := app.Test(req, 2000)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusUnauthorized {
		t.Errorf("forged token should be 401, got %d", resp.StatusCode)
	}
}

func TestJWTMiddleware_ExpiredTokenRejected(t *testing.T) {
	t.Setenv("JWT_SECRET", "unit-test-jwt-secret")
	app := newJWTApp(t)

	expired := signToken(t, "unit-test-jwt-secret", jwt.MapClaims{
		"sub": "user-1",
		"exp": time.Now().Add(-time.Hour).Unix(),
	})
	req := httptest.NewRequest("GET", "/protected", nil)
	req.Header.Set("Authorization", "Bearer "+expired)
	resp, err := app.Test(req, 2000)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusUnauthorized {
		t.Errorf("expired token should be 401, got %d", resp.StatusCode)
	}
}

func TestJWTMiddleware_ValidTokenSetsLocals(t *testing.T) {
	t.Setenv("JWT_SECRET", "unit-test-jwt-secret")
	app := newJWTApp(t)

	valid := signToken(t, "unit-test-jwt-secret", jwt.MapClaims{
		"sub":          "user-1",
		"workspace_id": "ws-1",
		"exp":          time.Now().Add(time.Hour).Unix(),
	})
	req := httptest.NewRequest("GET", "/protected", nil)
	req.Header.Set("Authorization", "Bearer "+valid)
	resp, err := app.Test(req, 2000)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusOK {
		t.Fatalf("valid token should pass, got %d", resp.StatusCode)
	}
}
