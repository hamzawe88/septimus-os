package middleware_test

import (
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/septimus-os/backend-core/middleware"
)

// The permission-lookup paths need a live database; what must hold without one
// is that an unauthenticated request is rejected before any DB access.
func TestCheckPermission_NoUserRejectedBeforeDB(t *testing.T) {
	app := fiber.New()
	app.Get("/admin", middleware.CheckPermission("admin.manage"), func(c *fiber.Ctx) error {
		return c.SendStatus(fiber.StatusOK)
	})

	req := httptest.NewRequest("GET", "/admin", nil)
	resp, err := app.Test(req, 2000)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusUnauthorized {
		t.Errorf("request without user_id should be 401, got %d", resp.StatusCode)
	}
}

func TestCheckPermission_EmptyUserRejectedBeforeDB(t *testing.T) {
	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("user_id", "")
		return c.Next()
	})
	app.Get("/admin", middleware.CheckPermission("admin.manage"), func(c *fiber.Ctx) error {
		return c.SendStatus(fiber.StatusOK)
	})

	req := httptest.NewRequest("GET", "/admin", nil)
	resp, err := app.Test(req, 2000)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusUnauthorized {
		t.Errorf("request with empty user_id should be 401, got %d", resp.StatusCode)
	}
}
