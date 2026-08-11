package main

import (
	"strings"
	"testing"
)

func TestInspectDriveUploadRejectsSpoofedPDF(t *testing.T) {
	if _, _, err := inspectDriveUpload("report.pdf", strings.NewReader("<html>not a pdf</html>")); err == nil {
		t.Fatal("spoofed PDF was accepted")
	}
}

func TestDriveMaxFileBytesFallsBackForInvalidConfiguration(t *testing.T) {
	t.Setenv("DRIVE_MAX_FILE_BYTES", "-1")
	if got := driveMaxFileBytes(); got != 25*1024*1024 {
		t.Fatalf("invalid limit fallback = %d", got)
	}
}
