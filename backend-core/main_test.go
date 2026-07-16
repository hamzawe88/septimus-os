package main

import "testing"

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
		"http://localhost.evil.com",     // suffix trick
		"http://127.0.0.1.evil.com",     // suffix trick
		"https://app.septimus.example",  // real-looking but not listed
		"null",                          // sandboxed iframe origin
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
