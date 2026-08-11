package database

import (
	"testing"

	"gorm.io/gorm/logger"
)

func TestConfiguredDatabaseLogLevelDefaultsToWarn(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("DB_LOG_LEVEL", "")

	if got := configuredDatabaseLogLevel(); got != logger.Warn {
		t.Fatalf("expected Warn by default, got %v", got)
	}
}

func TestConfiguredDatabaseLogLevelAllowsExplicitDevelopmentInfo(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("DB_LOG_LEVEL", "info")

	if got := configuredDatabaseLogLevel(); got != logger.Info {
		t.Fatalf("expected Info in development when explicitly requested, got %v", got)
	}
}

func TestConfiguredDatabaseLogLevelCapsProductionAtWarn(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("DB_LOG_LEVEL", "info")

	if got := configuredDatabaseLogLevel(); got != logger.Warn {
		t.Fatalf("expected production Info request to be capped at Warn, got %v", got)
	}
}
