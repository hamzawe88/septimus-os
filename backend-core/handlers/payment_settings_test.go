package handlers

import (
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/models"
)

func TestPaymentCredentialsEncryptedAndRedacted(t *testing.T) {
	t.Setenv("SETTINGS_ENC_KEY", "payment-settings-test-key")
	secret := "sk_live_never_return_this"
	encoded, err := encodePaymentCredentials(map[string]string{
		"publishable_key": "pk_live_public",
		"secret_key":      secret,
	})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(encoded), secret) {
		t.Fatal("stored payment credential contains plaintext secret")
	}

	decoded, err := decodePaymentCredentials(encoded)
	if err != nil {
		t.Fatal(err)
	}
	if decoded["secret_key"] != secret {
		t.Fatal("encrypted payment credential did not round-trip")
	}

	view, err := paymentGatewayView(models.PaymentGatewaySettings{
		ID:          uuid.New(),
		GatewayName: "stripe",
		Credentials: encoded,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !view.HasCredentials {
		t.Fatal("redacted view should report that credentials exist")
	}
	for key, value := range view.Credentials {
		if value != "" {
			t.Fatalf("redacted credential %s exposed a value", key)
		}
	}
}
