package handlers

import (
	"os"
	"path/filepath"
)

// UploadsRoot is shared by the backend and AI sidecar through a Docker volume.
// Keeping the path configurable prevents the sidecar from receiving a path it
// cannot read after containerisation.
func UploadsRoot() string {
	if configured := os.Getenv("UPLOADS_DIR"); configured != "" {
		return filepath.Clean(configured)
	}
	return "./uploads"
}
