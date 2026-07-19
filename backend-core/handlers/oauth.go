package handlers

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"

	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
)

var googleOAuthConfig *oauth2.Config

func initGoogleOAuthConfig() *oauth2.Config {
	if googleOAuthConfig != nil {
		return googleOAuthConfig
	}

	clientID := os.Getenv("GOOGLE_CLIENT_ID")
	clientSecret := os.Getenv("GOOGLE_CLIENT_SECRET")
	redirectURL := os.Getenv("GOOGLE_REDIRECT_URI")

	if clientID == "" {
		clientID = "placeholder_client_id"
	}
	if clientSecret == "" {
		clientSecret = "placeholder_client_secret"
	}
	if redirectURL == "" {
		redirectURL = "http://localhost:4000/api/v1/auth/google/callback"
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

	return googleOAuthConfig
}

// GoogleLogin redirects the user to the Google consent screen.
func GoogleLogin(c *fiber.Ctx) error {
	// The state token can encode the workspace ID and the user ID to know where to save the credentials
	workspaceID := c.Query("workspace_id")
	if workspaceID == "" {
		// If no workspace ID provided, try to get it from auth middleware if this route is protected
		if val := c.Locals("workspace_id"); val != nil {
			workspaceID = val.(string)
		}
	}

	if workspaceID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "workspace_id is required"})
	}

	conf := initGoogleOAuthConfig()
	
	// Pass access_type=offline to get a refresh token
	url := conf.AuthCodeURL(workspaceID, oauth2.AccessTypeOffline, oauth2.ApprovalForce)
	
	return c.Redirect(url, fiber.StatusTemporaryRedirect)
}

// GoogleCallback handles the OAuth callback from Google.
func GoogleCallback(c *fiber.Ctx) error {
	state := c.Query("state")
	code := c.Query("code")

	if state == "" || code == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid callback parameters"})
	}

	workspaceID, err := uuid.Parse(state)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid state/workspace_id format"})
	}

	conf := initGoogleOAuthConfig()
	
	// Exchange code for token
	token, err := conf.Exchange(context.Background(), code)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": fmt.Sprintf("Failed to exchange token: %v", err)})
	}

	// Save or update the token in the database
	var integration models.WorkspaceIntegration
	res := database.GetDB(c).Where("workspace_id = ? AND provider = ?", workspaceID, "google").First(&integration)
	
	if res.Error != nil {
		// Create new integration
		integration = models.WorkspaceIntegration{
			ID:           uuid.New(),
			WorkspaceID:  workspaceID,
			Provider:     "google",
			AccessToken:  token.AccessToken,
			RefreshToken: token.RefreshToken,
			Expiry:       token.Expiry,
		}
		if err := database.GetDB(c).Create(&integration).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save integration"})
		}
	} else {
		// Update existing
		integration.AccessToken = token.AccessToken
		if token.RefreshToken != "" {
			integration.RefreshToken = token.RefreshToken
		}
		integration.Expiry = token.Expiry
		integration.UpdatedAt = time.Now()
		if err := database.GetDB(c).Save(&integration).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update integration"})
		}
	}

	// Redirect back to frontend settings page
	return c.Redirect("http://localhost:3000?view=settings&tab=integrations", fiber.StatusTemporaryRedirect)
}
