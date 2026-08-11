package handlers

import "testing"

func resetGoogleOAuthConfig(t *testing.T) {
	t.Helper()
	previous := googleOAuthConfig
	googleOAuthConfig = nil
	t.Cleanup(func() { googleOAuthConfig = previous })
}

func TestGoogleOAuthConfigFailsClosedWhenIncomplete(t *testing.T) {
	resetGoogleOAuthConfig(t)
	t.Setenv("GOOGLE_CLIENT_ID", "")
	t.Setenv("GOOGLE_CLIENT_SECRET", "secret")
	t.Setenv("GOOGLE_REDIRECT_URI", "https://app.example/api/v1/auth/google/callback")

	if _, err := initGoogleOAuthConfig(); err == nil {
		t.Fatal("incomplete Google OAuth configuration was accepted")
	}
}

func TestGoogleOAuthConfigAcceptsCompleteEnvironment(t *testing.T) {
	resetGoogleOAuthConfig(t)
	t.Setenv("GOOGLE_CLIENT_ID", "client-id")
	t.Setenv("GOOGLE_CLIENT_SECRET", "client-secret")
	t.Setenv("GOOGLE_REDIRECT_URI", "https://app.example/api/v1/auth/google/callback")

	config, err := initGoogleOAuthConfig()
	if err != nil {
		t.Fatalf("complete Google OAuth configuration rejected: %v", err)
	}
	if config.ClientID != "client-id" || config.ClientSecret != "client-secret" {
		t.Fatal("Google OAuth configuration did not preserve credentials")
	}
	if config.RedirectURL != "https://app.example/api/v1/auth/google/callback" {
		t.Fatalf("redirect URL = %q", config.RedirectURL)
	}
}
