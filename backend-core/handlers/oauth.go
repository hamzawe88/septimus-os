package handlers

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"

	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services/crypto"
)

var googleOAuthConfig *oauth2.Config

func initGoogleOAuthConfig() (*oauth2.Config, error) {
	if googleOAuthConfig != nil {
		return googleOAuthConfig, nil
	}

	clientID := strings.TrimSpace(os.Getenv("GOOGLE_CLIENT_ID"))
	clientSecret := strings.TrimSpace(os.Getenv("GOOGLE_CLIENT_SECRET"))
	redirectURL := strings.TrimSpace(os.Getenv("GOOGLE_REDIRECT_URI"))
	if clientID == "" || clientSecret == "" || redirectURL == "" {
		return nil, errors.New("google oauth is not configured")
	}

	googleOAuthConfig = &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		RedirectURL:  redirectURL,
		Scopes: []string{
			"https://www.googleapis.com/auth/drive.file",
			"https://www.googleapis.com/auth/calendar.events",
			"https://www.googleapis.com/auth/spreadsheets",
		},
		Endpoint: google.Endpoint,
	}

	return googleOAuthConfig, nil
}

// GoogleAuthURL returns the Google consent URL for the CALLER's workspace.
//
// This replaces the old unauthenticated GET /auth/google/login, which took the
// tenant from ?workspace_id= and used it as the OAuth state verbatim. It has to
// be a JSON endpoint rather than a redirect: a top-level browser navigation
// carries no Authorization header, so the only way to know who is connecting is
// to have the frontend fetch this with its token and then navigate to the URL.
func GoogleAuthURL(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	userID, _ := c.Locals("user_id").(string)

	state, err := newOAuthState(workspaceID, userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Could not start the Google connect flow"})
	}

	conf, err := initGoogleOAuthConfig()
	if err != nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "google_integration_not_configured"})
	}
	// access_type=offline to get a refresh token
	return c.JSON(fiber.Map{
		"url": conf.AuthCodeURL(state, oauth2.AccessTypeOffline, oauth2.ApprovalForce),
	})
}

// GoogleCallback handles the OAuth callback from Google.
func GoogleCallback(c *fiber.Ctx) error {
	state := c.Query("state")
	code := c.Query("code")

	if state == "" || code == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid callback parameters"})
	}

	// The tenant comes out of the signature, not out of the parameter. A state
	// that does not verify means the flow was not started by this server for
	// this workspace, and the credentials must not be stored anywhere.
	workspaceID, _, err := parseOAuthState(state)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid or expired authorization state"})
	}

	conf, err := initGoogleOAuthConfig()
	if err != nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "google_integration_not_configured"})
	}

	// Exchange code for token
	token, err := conf.Exchange(context.Background(), code)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": fmt.Sprintf("Failed to exchange token: %v", err)})
	}

	// Save or update the token in the database
	accessToken, err := crypto.Encrypt(token.AccessToken)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to encrypt OAuth credentials"})
	}
	refreshToken, err := crypto.Encrypt(token.RefreshToken)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to encrypt OAuth credentials"})
	}
	var integration models.WorkspaceIntegration
	res := database.GetDB(c).Where("workspace_id = ? AND provider = ?", workspaceID, "google").First(&integration)

	if res.Error != nil {
		// Create new integration
		integration = models.WorkspaceIntegration{
			ID:           uuid.New(),
			WorkspaceID:  workspaceID,
			Provider:     "google",
			AccessToken:  accessToken,
			RefreshToken: refreshToken,
			Expiry:       token.Expiry,
		}
		if err := database.GetDB(c).Create(&integration).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save integration"})
		}
	} else {
		// Update existing
		integration.AccessToken = accessToken
		if token.RefreshToken != "" {
			integration.RefreshToken = refreshToken
		}
		integration.Expiry = token.Expiry
		integration.UpdatedAt = time.Now()
		if err := database.GetDB(c).Save(&integration).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update integration"})
		}
	}

	// Redirect only to the configured frontend origin.
	redirectURL, err := safeFrontendURL("/?view=settings&tab=integrations", "/")
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Frontend redirect is not configured"})
	}
	return c.Redirect(redirectURL, fiber.StatusTemporaryRedirect)
}
