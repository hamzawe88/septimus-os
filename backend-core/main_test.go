package main

import (
	"strings"
	"testing"
)

func TestCorsOriginAllowed_DevModeLoopbackOnly(t *testing.T) {
	empty := map[string]bool{}

	for _, origin := range []string{
		"http://localhost:3000",
		"http://localhost:8080",
		"https://127.0.0.1:3000",
	} {
		if !corsOriginAllowed(empty, origin) {
			t.Errorf("dev mode should allow loopback origin %q", origin)
		}
	}

	for _, origin := range []string{
		"https://evil.example.com",
		"http://localhost.evil.com",    // suffix trick
		"http://127.0.0.1.evil.com",    // suffix trick
		"https://app.septimus.example", // real-looking but not listed
		"null",                         // sandboxed iframe origin
	} {
		if corsOriginAllowed(empty, origin) {
			t.Errorf("dev mode must reject non-loopback origin %q", origin)
		}
	}
}

func TestCorsOriginAllowed_ExplicitAllowlistIsStrict(t *testing.T) {
	list := map[string]bool{"https://app.septimus.ly": true}

	if !corsOriginAllowed(list, "https://app.septimus.ly") {
		t.Error("listed origin should be allowed")
	}
	if !corsOriginAllowed(list, "https://app.septimus.ly/") {
		t.Error("trailing slash on a listed origin should still match")
	}
	// Once an allowlist exists, even loopback is no longer implicitly open.
	if corsOriginAllowed(list, "http://localhost:3000") {
		t.Error("unlisted localhost must be rejected when an allowlist is set")
	}
	if corsOriginAllowed(list, "https://evil.example.com") {
		t.Error("unlisted origin must be rejected")
	}
}

func TestCSRFRequestAllowed(t *testing.T) {
	list := map[string]bool{"https://app.septimus.ly": true}
	tests := []struct {
		name    string
		method  string
		cookie  string
		origin  string
		allowed bool
	}{
		{name: "safe request", method: "GET", cookie: "session", allowed: true},
		{name: "non-cookie API client", method: "POST", allowed: true},
		{name: "same origin mutation", method: "POST", cookie: "session", origin: "https://app.septimus.ly", allowed: true},
		{name: "cross site mutation", method: "DELETE", cookie: "session", origin: "https://evil.example", allowed: false},
		{name: "missing origin", method: "PATCH", cookie: "session", allowed: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := csrfRequestAllowed(tt.method, tt.cookie, tt.origin, list); got != tt.allowed {
				t.Fatalf("csrfRequestAllowed() = %v, want %v", got, tt.allowed)
			}
		})
	}
}

func TestAuthRateLimitKeyIsAccountScopedAndDoesNotLeakEmail(t *testing.T) {
	first := authRateLimitKey("10.0.0.1", []byte(`{"email":" Admin@Example.COM "}`))
	same := authRateLimitKey("10.0.0.1", []byte(`{"email":"admin@example.com"}`))
	other := authRateLimitKey("10.0.0.1", []byte(`{"email":"other@example.com"}`))
	if first != same {
		t.Fatal("normalized email should produce a stable key")
	}
	if first == other {
		t.Fatal("different accounts must not share a limiter key")
	}
	if strings.Contains(first, "example.com") {
		t.Fatal("limiter key leaked the account email")
	}
}
