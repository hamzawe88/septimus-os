package handlers

import (
	"encoding/base64"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

func withSecret(t *testing.T, secret string) {
	t.Helper()
	prev, had := os.LookupEnv("JWT_SECRET")
	os.Setenv("JWT_SECRET", secret)
	t.Cleanup(func() {
		if had {
			os.Setenv("JWT_SECRET", prev)
		} else {
			os.Unsetenv("JWT_SECRET")
		}
	})
}

func TestOAuthStateRoundTrip(t *testing.T) {
	withSecret(t, "test-secret")
	ws := uuid.New()

	state, err := newOAuthState(ws, "user-1")
	if err != nil {
		t.Fatalf("newOAuthState: %v", err)
	}

	gotWS, gotUser, err := parseOAuthState(state)
	if err != nil {
		t.Fatalf("parseOAuthState: %v", err)
	}
	if gotWS != ws {
		t.Errorf("workspace = %s, want %s", gotWS, ws)
	}
	if gotUser != "user-1" {
		t.Errorf("user = %q, want %q", gotUser, "user-1")
	}
}

// The whole point of signing: the tenant may not be nameable by the caller.
func TestOAuthStateRejectsRawWorkspaceID(t *testing.T) {
	withSecret(t, "test-secret")

	// This is exactly what the old implementation accepted as state.
	if _, _, err := parseOAuthState(uuid.New().String()); err == nil {
		t.Fatal("a bare workspace id was accepted as state")
	}
}

func TestOAuthStateRejectsForgedSignature(t *testing.T) {
	withSecret(t, "test-secret")
	victim := uuid.New()

	state, err := newOAuthState(victim, "user-1")
	if err != nil {
		t.Fatalf("newOAuthState: %v", err)
	}

	// Flip the last character of the signature.
	forged := []byte(state)
	if forged[len(forged)-1] == 'A' {
		forged[len(forged)-1] = 'B'
	} else {
		forged[len(forged)-1] = 'A'
	}
	if _, _, err := parseOAuthState(string(forged)); err == nil {
		t.Fatal("a tampered state verified")
	}
}

// A state minted under one secret must not verify under another — otherwise
// rotating JWT_SECRET would silently keep old states alive.
func TestOAuthStateIsBoundToSecret(t *testing.T) {
	withSecret(t, "secret-a")
	state, err := newOAuthState(uuid.New(), "user-1")
	if err != nil {
		t.Fatalf("newOAuthState: %v", err)
	}

	withSecret(t, "secret-b")
	if _, _, err := parseOAuthState(state); err == nil {
		t.Fatal("state verified under a different secret")
	}
}

func TestOAuthStateRequiresSecret(t *testing.T) {
	prev, had := os.LookupEnv("JWT_SECRET")
	os.Unsetenv("JWT_SECRET")
	t.Cleanup(func() {
		if had {
			os.Setenv("JWT_SECRET", prev)
		}
	})

	if _, err := newOAuthState(uuid.New(), "user-1"); err == nil {
		t.Fatal("issued an unsigned state with no JWT_SECRET")
	}
}

func TestOAuthStateRejectsNilWorkspace(t *testing.T) {
	withSecret(t, "test-secret")
	if _, err := newOAuthState(uuid.Nil, "user-1"); err == nil {
		t.Fatal("minted a state for the nil workspace")
	}
}

func TestOAuthStateRejectsMalformed(t *testing.T) {
	withSecret(t, "test-secret")
	for _, bad := range []string{"", "!!!not-base64!!!", "YWJj"} {
		if _, _, err := parseOAuthState(bad); err == nil {
			t.Errorf("malformed state %q was accepted", bad)
		}
	}
}

func TestOAuthStateExpires(t *testing.T) {
	withSecret(t, "test-secret")
	ws := uuid.New()

	// Mint a correctly signed state whose expiry is already in the past, rather
	// than sleeping out the real TTL. A valid signature must not be enough.
	payload := strings.Join([]string{
		ws.String(),
		"user-1",
		strconv.FormatInt(time.Now().Add(-time.Minute).Unix(), 10),
		"deadbeef",
	}, "|")
	sig, err := signOAuthState(payload)
	if err != nil {
		t.Fatalf("signOAuthState: %v", err)
	}
	expired := base64.RawURLEncoding.EncodeToString([]byte(payload + "|" + sig))

	if _, _, err := parseOAuthState(expired); err == nil {
		t.Fatal("an expired but correctly signed state was accepted")
	}

	// Sanity: the same construction with a future expiry does verify, so the
	// rejection above is the expiry and not a malformed payload.
	fresh, err := newOAuthState(ws, "user-1")
	if err != nil {
		t.Fatalf("newOAuthState: %v", err)
	}
	if _, _, err := parseOAuthState(fresh); err != nil {
		t.Fatalf("fresh state rejected: %v", err)
	}
}
