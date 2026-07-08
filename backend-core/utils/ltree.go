package utils

import (
	"strings"

	"github.com/google/uuid"
)

// FormatUUIDForLtree replaces hyphens with underscores, making a UUID compatible with PostgreSQL's ltree type.
func FormatUUIDForLtree(id uuid.UUID) string {
	return strings.ReplaceAll(id.String(), "-", "_")
}

// ParseLtreeToUUID replaces underscores with hyphens to reconstruct a valid UUID string.
func ParseLtreeToUUID(ltreeStr string) (uuid.UUID, error) {
	uuidStr := strings.ReplaceAll(ltreeStr, "_", "-")
	return uuid.Parse(uuidStr)
}
