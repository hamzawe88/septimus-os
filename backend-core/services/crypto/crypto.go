// Package crypto provides authenticated symmetric encryption for secrets at
// rest (e.g. provider API keys). Ciphertext is stored with an "enc:v1:" prefix
// so that Decrypt can transparently pass through legacy plaintext values that
// were written before encryption was introduced.
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"io"
	"os"
	"strings"
)

const cipherPrefix = "enc:v1:"

// ErrNoKey is returned when encryption is requested but no key is configured.
var ErrNoKey = errors.New("crypto: SETTINGS_ENC_KEY is not set")

// deriveKey turns the configured secret (any length) into a 32-byte AES key.
func deriveKey() ([]byte, bool) {
	secret := os.Getenv("SETTINGS_ENC_KEY")
	if secret == "" {
		// Fall back to the JWT secret so a single deployment secret still yields
		// encryption-at-rest; only truly unconfigured deployments stay plaintext.
		secret = os.Getenv("JWT_SECRET")
	}
	if secret == "" {
		return nil, false
	}
	sum := sha256.Sum256([]byte(secret))
	return sum[:], true
}

// Encrypt returns an "enc:v1:"-prefixed, base64 AES-GCM ciphertext. If no key is
// configured it returns ErrNoKey so callers can decide whether to store
// plaintext (dev) or fail closed.
func Encrypt(plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}
	if IsEncrypted(plaintext) {
		return plaintext, nil // already encrypted, don't double-wrap
	}
	key, ok := deriveKey()
	if !ok {
		return "", ErrNoKey
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return cipherPrefix + base64.StdEncoding.EncodeToString(sealed), nil
}

// Decrypt reverses Encrypt. Values without the "enc:v1:" prefix are assumed to
// be legacy plaintext and returned unchanged.
func Decrypt(value string) (string, error) {
	if !IsEncrypted(value) {
		return value, nil
	}
	key, ok := deriveKey()
	if !ok {
		return "", ErrNoKey
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(value, cipherPrefix))
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(raw) < gcm.NonceSize() {
		return "", errors.New("crypto: ciphertext too short")
	}
	nonce, ct := raw[:gcm.NonceSize()], raw[gcm.NonceSize():]
	plain, err := gcm.Open(nil, nonce, ct, nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

// IsEncrypted reports whether a stored value is an "enc:v1:" ciphertext.
func IsEncrypted(value string) bool {
	return strings.HasPrefix(value, cipherPrefix)
}

// Mask returns a safe, non-reversible hint for display in the UI. It never
// reveals more than the last 4 characters of the underlying secret.
func Mask(plaintext string) string {
	if plaintext == "" {
		return ""
	}
	if len(plaintext) <= 4 {
		return "••••"
	}
	return "••••••••" + plaintext[len(plaintext)-4:]
}
