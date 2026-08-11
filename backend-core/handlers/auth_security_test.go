package handlers

import (
	"os"
	"testing"
)

func TestSignupTierIgnoresClientPlan(t *testing.T) {
	for _, supplied := range []string{"", "free", "business", "enterprise", " ENTERPRISE "} {
		if got := signupTier(supplied); got != defaultOnboardingTier {
			t.Fatalf("signupTier(%q) = %q, want %q", supplied, got, defaultOnboardingTier)
		}
	}
}

func TestDevRegistrationDisabledByDefaultInProduction(t *testing.T) {
	oldEnv := os.Getenv("APP_ENV")
	oldFlag := os.Getenv("ENABLE_DEV_REGISTRATION")
	t.Cleanup(func() {
		_ = os.Setenv("APP_ENV", oldEnv)
		_ = os.Setenv("ENABLE_DEV_REGISTRATION", oldFlag)
	})

	_ = os.Setenv("APP_ENV", "production")
	_ = os.Unsetenv("ENABLE_DEV_REGISTRATION")
	if devRegistrationEnabled() {
		t.Fatal("development registration must be disabled by default in production")
	}

	_ = os.Setenv("ENABLE_DEV_REGISTRATION", "true")
	if !devRegistrationEnabled() {
		t.Fatal("explicit production opt-in should enable development registration")
	}
}
