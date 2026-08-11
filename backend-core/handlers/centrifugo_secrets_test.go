package handlers

import (
	"os"
	"testing"
)

// The published example values ("supersecretapikey" / "supersecretcentrifugokey")
// must never be reachable as defaults: with them, anyone can mint a connection
// token for any user or publish into any channel.
func TestCentrifugoSecretsAreRequired(t *testing.T) {
	for _, v := range []string{"CENTRIFUGO_API_KEY", "CENTRIFUGO_SECRET"} {
		prev, had := os.LookupEnv(v)
		os.Unsetenv(v)
		t.Cleanup(func() {
			if had {
				os.Setenv(v, prev)
			}
		})
	}

	if _, err := getCentrifugoAPIKey(); err == nil {
		t.Error("getCentrifugoAPIKey returned a key with CENTRIFUGO_API_KEY unset")
	}
	if _, err := getCentrifugoHMAC(); err == nil {
		t.Error("getCentrifugoHMAC returned a secret with CENTRIFUGO_SECRET unset")
	}
	if _, err := GenerateCentrifugoToken("user-1"); err == nil {
		t.Error("minted a Centrifugo token with no signing secret configured")
	}
}
