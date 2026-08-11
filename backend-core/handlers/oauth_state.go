package handlers

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

// OAuth `state` used to be the raw workspace id, unsigned. Google echoes state
// back verbatim, and the callback trusted it, so the tenant that received the
// resulting credentials was whatever the URL said.
//
// That is not a theoretical flaw. An attacker could open the consent flow naming
// a victim's workspace, approve with their OWN Google account, and the callback
// would write the attacker's tokens into the victim's integration row. From then
// on the victim's project folders are created in the attacker's Drive
// (CreateProject → GetActiveIntegration → CreateDriveFolder), and their exported
// task sheets land there too. The victim sees a connected, working integration.
//
// State is now a signed, expiring, single-purpose token: the callback derives
// the tenant from the signature, never from a parameter.

const oauthStateTTL = 10 * time.Minute

// oauthStateKey derives the signing key. It reuses JWT_SECRET, which main.go
// already refuses to boot without, so there is no silent unsigned mode.
func oauthStateKey() ([]byte, error) {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		return nil, fmt.Errorf("JWT_SECRET is not set; refusing to issue an unsigned OAuth state")
	}
	sum := sha256.Sum256([]byte("septimus-oauth-state|" + secret))
	return sum[:], nil
}

func signOAuthState(payload string) (string, error) {
	key, err := oauthStateKey()
	if err != nil {
		return "", err
	}
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(payload))
	return hex.EncodeToString(mac.Sum(nil)), nil
}

// newOAuthState mints the state parameter for an authenticated user starting a
// provider connect flow.
func newOAuthState(workspaceID uuid.UUID, userID string) (string, error) {
	if workspaceID == uuid.Nil {
		return "", fmt.Errorf("workspace id is required")
	}

	nonceRaw := make([]byte, 16)
	if _, err := rand.Read(nonceRaw); err != nil {
		return "", fmt.Errorf("generate nonce: %w", err)
	}

	payload := strings.Join([]string{
		workspaceID.String(),
		userID,
		strconv.FormatInt(time.Now().Add(oauthStateTTL).Unix(), 10),
		hex.EncodeToString(nonceRaw),
	}, "|")

	sig, err := signOAuthState(payload)
	if err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString([]byte(payload + "|" + sig)), nil
}

// parseOAuthState validates the signature and expiry and returns the tenant the
// flow was started for. Every failure mode returns an error — there is no path
// that falls back to reading a workspace id out of the request.
func parseOAuthState(state string) (workspaceID uuid.UUID, userID string, err error) {
	raw, err := base64.RawURLEncoding.DecodeString(state)
	if err != nil {
		return uuid.Nil, "", fmt.Errorf("malformed state")
	}
	if base64.RawURLEncoding.EncodeToString(raw) != state {
		return uuid.Nil, "", fmt.Errorf("malformed state")
	}

	parts := strings.Split(string(raw), "|")
	if len(parts) != 5 {
		return uuid.Nil, "", fmt.Errorf("malformed state")
	}
	payload := strings.Join(parts[:4], "|")

	expected, err := signOAuthState(payload)
	if err != nil {
		return uuid.Nil, "", err
	}
	// Constant time: the signature is the only thing standing between a caller
	// and naming an arbitrary tenant.
	if !hmac.Equal([]byte(expected), []byte(parts[4])) {
		return uuid.Nil, "", fmt.Errorf("state signature mismatch")
	}

	exp, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil || time.Now().Unix() > exp {
		return uuid.Nil, "", fmt.Errorf("state expired")
	}

	wsID, err := uuid.Parse(parts[0])
	if err != nil || wsID == uuid.Nil {
		return uuid.Nil, "", fmt.Errorf("malformed state")
	}
	return wsID, parts[1], nil
}
