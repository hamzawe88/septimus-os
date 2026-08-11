package services

import "testing"

func TestBillingSimulationFailsClosedOutsideExplicitDevelopmentMode(t *testing.T) {
	t.Setenv("STRIPE_WEBHOOK_SECRET", "")
	t.Setenv("APP_ENV", "production")
	t.Setenv("ENABLE_DEV_BILLING_SIMULATION", "true")
	if VerifyWebhookSignature([]byte(`{}`), "simulated_signature", "") {
		t.Fatal("production accepted simulated billing signature")
	}
	t.Setenv("APP_ENV", "development")
	t.Setenv("ENABLE_DEV_BILLING_SIMULATION", "false")
	if VerifyWebhookSignature([]byte(`{}`), "simulated_signature", "") {
		t.Fatal("disabled development simulation accepted")
	}
	t.Setenv("ENABLE_DEV_BILLING_SIMULATION", "true")
	if !VerifyWebhookSignature([]byte(`{}`), "simulated_signature", "") {
		t.Fatal("explicit development simulation was rejected")
	}
}
