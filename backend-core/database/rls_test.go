package database

import "testing"

func TestRLSTenantTableCoverage(t *testing.T) {
	required := []string{
		"users", "workspace_settings", "workspace_integrations", "file_records",
		"channels", "workflows", "webhook_subscriptions", "api_keys",
		"agent_states", "pending_approvals", "document_embeddings",
		"subscriptions", "invoices", "ai_token_usages", "auth_sessions",
		"entity_definitions", "entity_schema_versions", "entity_schema_fields", "entity_schema_change_jobs",
		"entity_forms", "entity_views",
		"entity_relations", "entity_record_relations", "outbox_events",
	}
	covered := make(map[string]bool, len(rlsTenantTables))
	for _, table := range rlsTenantTables {
		covered[table] = true
	}
	for _, table := range required {
		if !covered[table] {
			t.Errorf("tenant table %q is missing from RLS coverage", table)
		}
	}
}
