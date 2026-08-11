package middleware

import (
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
)

const SessionIssuer = "septimus-os"
const SessionAudience = "septimus-web"

func getJWTSecret() string {
	// main() refuses to start when JWT_SECRET is unset; no fallback here.
	return os.Getenv("JWT_SECRET")
}

func JWTMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		tokenString := ""
		authHeader := c.Get("Authorization")
		if authHeader != "" {
			parts := strings.Split(authHeader, " ")
			if len(parts) != 2 || parts[0] != "Bearer" {
				return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid Authorization header format"})
			}
			tokenString = parts[1]
		} else {
			tokenString = c.Cookies("septimus_session")
			if tokenString == "" {
				return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Missing authentication"})
			}
		}
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if token.Method.Alg() != jwt.SigningMethodHS256.Alg() {
				return nil, fiber.ErrUnauthorized
			}
			return []byte(getJWTSecret()), nil
		},
			jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
			jwt.WithIssuer(SessionIssuer),
			jwt.WithAudience(SessionAudience),
		)

		if err != nil || !token.Valid {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid or expired token"})
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid token claims"})
		}
		if sub, ok := claims["sub"].(string); !ok || strings.TrimSpace(sub) == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Token subject is required"})
		}
		workspaceID, workspaceOK := claims["workspace_id"].(string)
		sessionID, sessionOK := claims["jti"].(string)
		if !workspaceOK || strings.TrimSpace(workspaceID) == "" || !sessionOK || strings.TrimSpace(sessionID) == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Session claims are required"})
		}
		if database.DB == nil {
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "Session validation is unavailable"})
		}
		var session models.AuthSession
		if err := database.DB.Where(
			"id = ? AND user_id = ? AND workspace_id = ? AND revoked_at IS NULL AND expires_at > ?",
			sessionID, claims["sub"], workspaceID, time.Now().UTC(),
		).First(&session).Error; err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Session is expired or revoked"})
		}

		// Set claims to local context
		c.Locals("user_id", claims["sub"])
		c.Locals("workspace_id", claims["workspace_id"])
		c.Locals("role", claims["role"])
		c.Locals("role_id", claims["role_id"])
		c.Locals("department_id", claims["department_id"])
		c.Locals("is_impersonated", claims["is_impersonated"])
		c.Locals("original_admin_id", claims["original_admin_id"])
		c.Locals("session_id", sessionID)

		return c.Next()
	}
}
