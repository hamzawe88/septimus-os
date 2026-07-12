package crypto

import (
	"errors"
	"strings"
	"testing"
)

func TestEncryptDecryptRoundtrip(t *testing.T) {
	t.Setenv("SETTINGS_ENC_KEY", "unit-test-settings-key")
	t.Setenv("JWT_SECRET", "")

	plaintext := "sk-very-secret-provider-key"
	ct, err := Encrypt(plaintext)
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}
	if !IsEncrypted(ct) {
		t.Fatalf("ciphertext missing %q prefix: %q", cipherPrefix, ct)
	}
	if strings.Contains(ct, plaintext) {
		t.Fatal("ciphertext leaks the plaintext")
	}

	got, err := Decrypt(ct)
	if err != nil {
		t.Fatalf("Decrypt failed: %v", err)
	}
	if got != plaintext {
		t.Errorf("roundtrip mismatch: got %q, want %q", got, plaintext)
	}
}

func TestEncryptFallsBackToJWTSecret(t *testing.T) {
	t.Setenv("SETTINGS_ENC_KEY", "")
	t.Setenv("JWT_SECRET", "jwt-only-secret")

	ct, err := Encrypt("value")
	if err != nil {
		t.Fatalf("Encrypt with JWT_SECRET fallback failed: %v", err)
	}
	got, err := Decrypt(ct)
	if err != nil || got != "value" {
		t.Errorf("fallback roundtrip failed: got %q, err %v", got, err)
	}
}

func TestEncryptNoKeyFailsClosed(t *testing.T) {
	t.Setenv("SETTINGS_ENC_KEY", "")
	t.Setenv("JWT_SECRET", "")

	if _, err := Encrypt("value"); !errors.Is(err, ErrNoKey) {
		t.Errorf("expected ErrNoKey without any key, got %v", err)
	}
}

func TestDecryptLegacyPlaintextPassthrough(t *testing.T) {
	t.Setenv("SETTINGS_ENC_KEY", "unit-test-settings-key")

	got, err := Decrypt("legacy-plaintext-key")
	if err != nil || got != "legacy-plaintext-key" {
		t.Errorf("legacy passthrough failed: got %q, err %v", got, err)
	}
}

func TestEncryptDoesNotDoubleWrap(t *testing.T) {
	t.Setenv("SETTINGS_ENC_KEY", "unit-test-settings-key")

	ct, err := Encrypt("value")
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}
	again, err := Encrypt(ct)
	if err != nil {
		t.Fatalf("re-Encrypt failed: %v", err)
	}
	if again != ct {
		t.Error("Encrypt double-wrapped an existing ciphertext")
	}
}

func TestDecryptRejectsTamperedCiphertext(t *testing.T) {
	t.Setenv("SETTINGS_ENC_KEY", "unit-test-settings-key")

	ct, err := Encrypt("value")
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}
	// Flip one character in the base64 payload.
	payload := []byte(ct)
	last := len(payload) - 1
	if payload[last] == 'A' {
		payload[last] = 'B'
	} else {
		payload[last] = 'A'
	}
	if _, err := Decrypt(string(payload)); err == nil {
		t.Error("Decrypt accepted a tampered ciphertext")
	}
}

func TestDecryptRejectsWrongKey(t *testing.T) {
	t.Setenv("SETTINGS_ENC_KEY", "key-one")
	ct, err := Encrypt("value")
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}

	t.Setenv("SETTINGS_ENC_KEY", "key-two")
	if _, err := Decrypt(ct); err == nil {
		t.Error("Decrypt succeeded with the wrong key")
	}
}

func TestMaskNeverRevealsMoreThanFourChars(t *testing.T) {
	if got := Mask(""); got != "" {
		t.Errorf("Mask(\"\") = %q, want \"\"", got)
	}
	if got := Mask("abc"); got != "••••" {
		t.Errorf("Mask short secret = %q, want full mask", got)
	}
	got := Mask("sk-abcdef123456")
	if !strings.HasSuffix(got, "3456") || strings.Contains(got, "sk-") {
		t.Errorf("Mask = %q, want only last 4 visible", got)
	}
}
