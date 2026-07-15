package handlers

import (
	"os"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/proxy"

	"github.com/septimus-os/backend-core/middleware"
)

// aiSidecarURL is the internal address of the Python AI sidecar. It is only
// reachable from within the Docker network — browsers reach it exclusively
// through this JWT-protected proxy.
func aiSidecarURL() string {
	if v := os.Getenv("AI_SIDECAR_URL"); v != "" {
		return strings.TrimRight(v, "/")
	}
	return "http://ai-sidecar:8000"
}

// ProxyToAISidecar forwards a JWT-authenticated /api/v1/ai/* request to the AI
// sidecar. Because it lives under the `protected` group, the caller has already
// passed JWTMiddleware, so we can trust the workspace_id claim and stamp it onto
// the outgoing request instead of relying on client-supplied values. The shared
// internal token proves to the sidecar that the request originated here.
func ProxyToAISidecar(c *fiber.Ctx) error {
	target := aiSidecarURL() + c.OriginalURL()

	if token := os.Getenv("INTERNAL_API_TOKEN"); token != "" {
		c.Request().Header.Set(middleware.InternalTokenName, token)
	}
	if ws, ok := c.Locals("workspace_id").(string); ok && ws != "" {
		c.Request().Header.Set("X-Workspace-Id", ws)
	}
	if uid, ok := c.Locals("user_id").(string); ok && uid != "" {
		c.Request().Header.Set("X-User-Id", uid)
	}
	if role, ok := c.Locals("role").(string); ok && role != "" {
		c.Request().Header.Set("X-User-Role", role)
	}

	// Strip the browser Authorization header before crossing into the internal
	// network; the sidecar authenticates on the internal token, not the JWT.
	c.Request().Header.Del("Authorization")

	return proxy.Do(c, target)
}
