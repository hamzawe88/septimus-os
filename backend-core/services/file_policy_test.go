package services

import (
	"strings"
	"testing"
)

func TestValidateFileSignatureRejectsExtensionSpoofing(t *testing.T) {
	if _, err := ValidateFileSignature("invoice.pdf", strings.NewReader("<script>alert(1)</script>")); err == nil {
		t.Fatal("HTML content disguised as PDF was accepted")
	}
}

func TestValidateFileSignatureAcceptsPDFMagic(t *testing.T) {
	mime, err := ValidateFileSignature("invoice.pdf", strings.NewReader("%PDF-1.7\n"))
	if err != nil {
		t.Fatal(err)
	}
	if mime != "application/pdf" {
		t.Fatalf("mime = %q, want application/pdf", mime)
	}
}
