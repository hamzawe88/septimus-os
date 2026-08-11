package database

import (
	"strings"
	"testing"
)

func TestSchemaMigrationsAreStrictlyOrderedAndNonEmpty(t *testing.T) {
	var previous int64
	seen := map[int64]bool{}
	for _, migration := range schemaMigrations {
		if migration.Version <= previous || seen[migration.Version] {
			t.Fatalf("migration versions must be unique and strictly increasing: %d", migration.Version)
		}
		if migration.Name == "" || len(migration.Statements) == 0 {
			t.Fatalf("migration %d has no name or statements", migration.Version)
		}
		for index, statement := range migration.Statements {
			if statement == "" {
				t.Fatalf("migration %d statement %d is empty", migration.Version, index+1)
			}
		}
		previous = migration.Version
		seen[migration.Version] = true
	}
}

func TestPublishedSchemaFieldCatalogMigrationCarriesVersionChecksumAndBackfill(t *testing.T) {
	var catalog *schemaMigration
	for index := range schemaMigrations {
		if schemaMigrations[index].Version == 2026072801 {
			catalog = &schemaMigrations[index]
			break
		}
	}
	if catalog == nil {
		t.Fatal("published schema field catalog migration is missing")
	}
	combined := strings.Join(catalog.Statements, "\n")
	for _, required := range []string{
		"CREATE TABLE IF NOT EXISTS entity_schema_fields",
		"schema_checksum CHAR(64) NOT NULL",
		"versions.checksum",
		"jsonb_array_elements",
		"entity_schema_fields_definition_workspace_fk",
		"entity_schema_fields_definition_version_fk",
	} {
		if !strings.Contains(combined, required) {
			t.Fatalf("catalog migration is missing %q", required)
		}
	}
}

func TestSchemaChangeJobMigrationIsTenantScopedAndResumable(t *testing.T) {
	var jobs *schemaMigration
	for index := range schemaMigrations {
		if schemaMigrations[index].Version == 2026072901 {
			jobs = &schemaMigrations[index]
			break
		}
	}
	if jobs == nil {
		t.Fatal("schema change job migration is missing")
	}
	combined := strings.Join(jobs.Statements, "\n")
	for _, required := range []string{
		"CREATE TABLE IF NOT EXISTS entity_schema_change_jobs",
		"idempotency_key CHAR(64) NOT NULL UNIQUE",
		"status IN ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled')",
		"entity_schema_change_jobs_definition_workspace_fk",
		"idx_schema_change_jobs_worker",
	} {
		if !strings.Contains(combined, required) {
			t.Fatalf("schema change job migration is missing %q", required)
		}
	}
}

func TestSchemaFormsAndViewsMigrationIsTenantScopedAndRevisioned(t *testing.T) {
	var resources *schemaMigration
	for index := range schemaMigrations {
		if schemaMigrations[index].Version == 2026073001 {
			resources = &schemaMigrations[index]
			break
		}
	}
	if resources == nil {
		t.Fatal("schema forms and views migration is missing")
	}
	combined := strings.Join(resources.Statements, "\n")
	for _, required := range []string{
		"CREATE TABLE IF NOT EXISTS entity_forms",
		"CREATE TABLE IF NOT EXISTS entity_views",
		"entity_forms_definition_workspace_fk",
		"entity_views_definition_workspace_fk",
		"revision INTEGER NOT NULL DEFAULT 1",
		"idx_entity_forms_one_default",
		"idx_entity_views_one_default",
	} {
		if !strings.Contains(combined, required) {
			t.Fatalf("forms/views migration is missing %q", required)
		}
	}
}
