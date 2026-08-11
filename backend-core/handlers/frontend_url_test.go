package handlers

import "testing"

func TestSafeFrontendURL(t *testing.T) {
	t.Setenv("FRONTEND_PUBLIC_URL", "https://app.septimus.ly")

	for _, candidate := range []string{
		"https://evil.example/phish",
		"//evil.example/phish",
		"javascript:alert(1)",
		"https://app.septimus.ly.evil.example/phish",
	} {
		if _, err := safeFrontendURL(candidate, "/admin/billing"); err == nil {
			t.Errorf("unsafe return URL %q was accepted", candidate)
		}
	}

	got, err := safeFrontendURL("/admin/billing?success=1", "/admin/billing")
	if err != nil || got != "https://app.septimus.ly/admin/billing?success=1" {
		t.Fatalf("safe relative URL = %q, %v", got, err)
	}
	got, err = safeFrontendURL("", "/admin/billing")
	if err != nil || got != "https://app.septimus.ly/admin/billing" {
		t.Fatalf("default URL = %q, %v", got, err)
	}
}
