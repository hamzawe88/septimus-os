package services

import (
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"
)

var allowedUploadMIMEs = map[string]map[string]bool{
	".jpg":  {"image/jpeg": true},
	".jpeg": {"image/jpeg": true},
	".png":  {"image/png": true},
	".gif":  {"image/gif": true},
	".webp": {"image/webp": true},
	".pdf":  {"application/pdf": true},
	".txt":  {"text/plain; charset=utf-8": true, "application/octet-stream": true},
	".md":   {"text/plain; charset=utf-8": true, "application/octet-stream": true},
	".csv":  {"text/plain; charset=utf-8": true, "application/octet-stream": true},
	// OOXML files are ZIP containers. Legacy Office formats are commonly
	// detected as generic binary by net/http's bounded sniffer.
	".docx": {"application/zip": true, "application/octet-stream": true},
	".xlsx": {"application/zip": true, "application/octet-stream": true},
	".doc":  {"application/octet-stream": true},
	".xls":  {"application/octet-stream": true},
	".webm": {"video/webm": true, "audio/webm": true, "application/octet-stream": true},
	".wav":  {"audio/wave": true, "audio/wav": true, "audio/x-wav": true},
	".mp3":  {"audio/mpeg": true, "application/octet-stream": true},
	".m4a":  {"audio/mp4": true, "video/mp4": true, "application/octet-stream": true},
	".ogg":  {"application/ogg": true, "audio/ogg": true},
}

// ValidateFileSignature checks the first bytes against the extension allowlist.
// It never trusts a multipart Content-Type supplied by the browser.
func ValidateFileSignature(filename string, reader io.Reader) (string, error) {
	ext := strings.ToLower(filepath.Ext(filename))
	allowed, ok := allowedUploadMIMEs[ext]
	if !ok {
		return "", fmt.Errorf("file extension is not allowed")
	}
	header := make([]byte, 512)
	n, err := io.ReadFull(reader, header)
	if err != nil && err != io.EOF && err != io.ErrUnexpectedEOF {
		return "", fmt.Errorf("could not inspect file")
	}
	if n == 0 {
		return "", fmt.Errorf("empty files are not allowed")
	}
	detected := http.DetectContentType(header[:n])
	if !allowed[detected] {
		return "", fmt.Errorf("file content does not match its extension")
	}
	return detected, nil
}
