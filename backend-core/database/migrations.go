package database

import (
	"fmt"

	"gorm.io/gorm"
)

type schemaMigration struct {
	Version    int64
	Name       string
	Statements []string
}

var schemaMigrations = []schemaMigration{
	{
		Version: 2026072601,
		Name:    "tenant_backfills_and_search_indexes",
		Statements: []string{
			`UPDATE users SET employee_id = NULL WHERE employee_id = ''`,
			`UPDATE work_docs SET workspace_id = projects.workspace_id
			 FROM projects
			 WHERE work_docs.project_id = projects.id
			   AND (work_docs.workspace_id IS NULL OR work_docs.workspace_id = '00000000-0000-0000-0000-000000000000')`,
			`UPDATE sprints SET workspace_id = projects.workspace_id
			 FROM projects
			 WHERE sprints.project_id = projects.id
			   AND (sprints.workspace_id IS NULL OR sprints.workspace_id = '00000000-0000-0000-0000-000000000000')`,
			`ALTER TABLE messages ADD COLUMN IF NOT EXISTS tsv tsvector`,
			`UPDATE messages SET tsv = to_tsvector('english', content) WHERE tsv IS NULL`,
			`CREATE INDEX IF NOT EXISTS idx_messages_tsv ON messages USING GIN(tsv)`,
			`CREATE OR REPLACE FUNCTION messages_tsvector_trigger() RETURNS trigger AS $$
			 BEGIN
			   NEW.tsv := to_tsvector('english', NEW.content);
			   RETURN NEW;
			 END
			 $$ LANGUAGE plpgsql`,
			`DROP TRIGGER IF EXISTS tsvectorupdate ON messages`,
			`CREATE TRIGGER tsvectorupdate BEFORE INSERT OR UPDATE ON messages
			 FOR EACH ROW EXECUTE PROCEDURE messages_tsvector_trigger()`,
			`ALTER TABLE correspondences ADD COLUMN IF NOT EXISTS tsv tsvector`,
			`UPDATE correspondences
			 SET tsv = to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, '') || ' ' || coalesce(serial_number, ''))
			 WHERE tsv IS NULL`,
			`CREATE INDEX IF NOT EXISTS idx_correspondences_tsv ON correspondences USING GIN(tsv)`,
			`CREATE OR REPLACE FUNCTION correspondences_tsvector_trigger() RETURNS trigger AS $$
			 BEGIN
			   NEW.tsv := to_tsvector('simple', coalesce(NEW.title, '') || ' ' || coalesce(NEW.content, '') || ' ' || coalesce(NEW.serial_number, ''));
			   RETURN NEW;
			 END
			 $$ LANGUAGE plpgsql`,
			`DROP TRIGGER IF EXISTS tsvectorupdate_correspondences ON correspondences`,
			`CREATE TRIGGER tsvectorupdate_correspondences BEFORE INSERT OR UPDATE ON correspondences
			 FOR EACH ROW EXECUTE PROCEDURE correspondences_tsvector_trigger()`,
			`CREATE INDEX IF NOT EXISTS idx_drive_folders_path_gist ON drive_folders USING GIST (path)`,
			`CREATE INDEX IF NOT EXISTS idx_drive_files_data_path_gin ON drive_files USING GIN (data jsonb_path_ops)`,
			`CREATE INDEX IF NOT EXISTS idx_correspondences_path_gist ON correspondences USING GIST (path)`,
			`CREATE INDEX IF NOT EXISTS idx_entities_data_gin ON entities USING GIN (data)`,
			`CREATE INDEX IF NOT EXISTS idx_entities_crm_stage ON entities ((data->>'stage')) WHERE entity_type = 'crm_deal'`,
			`CREATE INDEX IF NOT EXISTS idx_messages_created_at_brin ON messages USING BRIN (created_at)`,
			`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at_brin ON audit_logs USING BRIN (created_at)`,
		},
	},
	{
		Version: 2026072602,
		Name:    "hot_path_composite_indexes",
		Statements: []string{
			`CREATE INDEX IF NOT EXISTS idx_messages_workspace_channel_created
			 ON messages (workspace_id, channel_id, created_at DESC)`,
			`CREATE INDEX IF NOT EXISTS idx_tasks_workspace_project_status
			 ON tasks (workspace_id, project_id, status)`,
			`CREATE INDEX IF NOT EXISTS idx_drive_files_workspace_folder_updated
			 ON drive_files (workspace_id, folder_id, updated_at DESC)`,
			`CREATE INDEX IF NOT EXISTS idx_workflows_workspace_active
			 ON workflows (workspace_id, is_active)`,
			`CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_created
			 ON workflow_runs (workflow_id, created_at DESC)`,
			`CREATE INDEX IF NOT EXISTS idx_auth_sessions_active_lookup
			 ON auth_sessions (id, workspace_id, user_id) WHERE revoked_at IS NULL`,
			`CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_workspace_received
			 ON webhook_deliveries (workspace_id, received_at DESC)`,
			`CREATE INDEX IF NOT EXISTS idx_file_records_workspace_created
			 ON file_records (workspace_id, created_at DESC)`,
		},
	},
	{
		Version: 2026072603,
		Name:    "schema_builder_registry_and_record_versions",
		Statements: []string{
			`CREATE TABLE IF NOT EXISTS entity_definitions (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
				key VARCHAR(63) NOT NULL,
				label_ar VARCHAR(120) NOT NULL,
				label_en VARCHAR(120) NOT NULL,
				description_ar TEXT NOT NULL DEFAULT '',
				description_en TEXT NOT NULL DEFAULT '',
				status VARCHAR(20) NOT NULL DEFAULT 'draft'
					CHECK (status IN ('draft', 'published', 'archived')),
				current_version INTEGER NOT NULL DEFAULT 0 CHECK (current_version >= 0),
				draft_revision INTEGER NOT NULL DEFAULT 1 CHECK (draft_revision > 0),
				title_field_key VARCHAR(63) NOT NULL DEFAULT '',
				draft_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
				draft_ui_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
				settings JSONB NOT NULL DEFAULT '{}'::jsonb,
				created_by UUID REFERENCES users(id) ON DELETE SET NULL,
				updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
				updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
				deleted_at TIMESTAMPTZ,
				CONSTRAINT entity_definitions_key_format
					CHECK (key ~ '^[a-z][a-z0-9_]{1,62}$')
			)`,
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_definition_workspace_key
			 ON entity_definitions (workspace_id, key)
			 WHERE deleted_at IS NULL`,
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_definition_id_workspace
			 ON entity_definitions (id, workspace_id)`,
			`CREATE INDEX IF NOT EXISTS idx_entity_definitions_workspace_status_updated
			 ON entity_definitions (workspace_id, status, updated_at DESC)
			 WHERE deleted_at IS NULL`,
			`CREATE TABLE IF NOT EXISTS entity_schema_versions (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
				definition_id UUID NOT NULL,
				version INTEGER NOT NULL CHECK (version > 0),
				json_schema JSONB NOT NULL,
				ui_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
				change_set JSONB NOT NULL DEFAULT '{}'::jsonb,
				checksum CHAR(64) NOT NULL,
				published_by UUID REFERENCES users(id) ON DELETE SET NULL,
				published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
				CONSTRAINT entity_schema_versions_definition_workspace_fk
					FOREIGN KEY (definition_id, workspace_id)
					REFERENCES entity_definitions(id, workspace_id)
					ON DELETE CASCADE,
				CONSTRAINT entity_schema_versions_definition_version_unique
					UNIQUE (definition_id, version)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_entity_schema_versions_workspace_published
			 ON entity_schema_versions (workspace_id, published_at DESC)`,
			`ALTER TABLE entities
			 ADD COLUMN IF NOT EXISTS definition_id UUID`,
			`ALTER TABLE entities
			 ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 0`,
			`ALTER TABLE entities
			 ADD COLUMN IF NOT EXISTS record_version INTEGER NOT NULL DEFAULT 1`,
			`ALTER TABLE entities
			 ADD COLUMN IF NOT EXISTS display_value VARCHAR(500) NOT NULL DEFAULT ''`,
			`ALTER TABLE entities
			 ADD COLUMN IF NOT EXISTS created_by UUID`,
			`ALTER TABLE entities
			 ADD COLUMN IF NOT EXISTS updated_by UUID`,
			`CREATE INDEX IF NOT EXISTS idx_entities_definition_created
			 ON entities (workspace_id, definition_id, created_at DESC)
			 WHERE definition_id IS NOT NULL AND deleted_at IS NULL`,
			`CREATE INDEX IF NOT EXISTS idx_entities_definition_display
			 ON entities (workspace_id, definition_id, display_value)
			 WHERE definition_id IS NOT NULL AND deleted_at IS NULL`,
			`DO $$ BEGIN
				IF NOT EXISTS (
					SELECT 1 FROM pg_constraint
					WHERE conname = 'entities_definition_workspace_fk'
				) THEN
					ALTER TABLE entities
						ADD CONSTRAINT entities_definition_workspace_fk
						FOREIGN KEY (definition_id, workspace_id)
						REFERENCES entity_definitions(id, workspace_id)
						ON DELETE RESTRICT;
				END IF;
			END $$`,
			`DO $$ BEGIN
				IF NOT EXISTS (
					SELECT 1 FROM pg_constraint
					WHERE conname = 'entities_created_by_fk'
				) THEN
					ALTER TABLE entities
						ADD CONSTRAINT entities_created_by_fk
						FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
				END IF;
			END $$`,
			`DO $$ BEGIN
				IF NOT EXISTS (
					SELECT 1 FROM pg_constraint
					WHERE conname = 'entities_updated_by_fk'
				) THEN
					ALTER TABLE entities
						ADD CONSTRAINT entities_updated_by_fk
						FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
				END IF;
			END $$`,
		},
	},
	{
		Version: 2026072604,
		Name:    "record_relations_and_transactional_outbox",
		Statements: []string{
			`CREATE TABLE IF NOT EXISTS entity_relations (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
				source_definition_id UUID NOT NULL,
				source_field_key VARCHAR(63) NOT NULL,
				target_definition_id UUID NOT NULL,
				cardinality VARCHAR(12) NOT NULL CHECK (cardinality IN ('one', 'many')),
				on_delete VARCHAR(12) NOT NULL DEFAULT 'restrict'
					CHECK (on_delete IN ('restrict', 'nullify', 'cascade')),
				label_ar VARCHAR(120) NOT NULL DEFAULT '',
				label_en VARCHAR(120) NOT NULL DEFAULT '',
				required BOOLEAN NOT NULL DEFAULT false,
				created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
				updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
				CONSTRAINT entity_relations_source_workspace_fk
					FOREIGN KEY (source_definition_id, workspace_id)
					REFERENCES entity_definitions(id, workspace_id) ON DELETE CASCADE,
				CONSTRAINT entity_relations_target_workspace_fk
					FOREIGN KEY (target_definition_id, workspace_id)
					REFERENCES entity_definitions(id, workspace_id) ON DELETE RESTRICT,
				CONSTRAINT entity_relations_source_field_unique
					UNIQUE (source_definition_id, source_field_key)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_entity_relations_target
			 ON entity_relations (workspace_id, target_definition_id)`,
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_entities_id_workspace
			 ON entities (id, workspace_id)`,
			`CREATE TABLE IF NOT EXISTS entity_record_relations (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
				relation_id UUID NOT NULL REFERENCES entity_relations(id) ON DELETE CASCADE,
				source_record_id UUID NOT NULL,
				target_record_id UUID NOT NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
				CONSTRAINT entity_record_relations_source_workspace_fk
					FOREIGN KEY (source_record_id, workspace_id)
					REFERENCES entities(id, workspace_id) ON DELETE CASCADE,
				CONSTRAINT entity_record_relations_target_workspace_fk
					FOREIGN KEY (target_record_id, workspace_id)
					REFERENCES entities(id, workspace_id) ON DELETE RESTRICT,
				CONSTRAINT entity_record_relations_edge_unique
					UNIQUE (relation_id, source_record_id, target_record_id)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_entity_record_relations_reverse
			 ON entity_record_relations (workspace_id, target_record_id, relation_id)`,
			`CREATE TABLE IF NOT EXISTS outbox_events (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
				subject VARCHAR(180) NOT NULL,
				event_type VARCHAR(180) NOT NULL,
				aggregate_type VARCHAR(80) NOT NULL,
				aggregate_id UUID NOT NULL,
				payload JSONB NOT NULL,
				status VARCHAR(16) NOT NULL DEFAULT 'pending'
					CHECK (status IN ('pending', 'published', 'failed')),
				attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
				available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
				published_at TIMESTAMPTZ,
				last_error TEXT NOT NULL DEFAULT '',
				created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
				updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
			)`,
			`CREATE INDEX IF NOT EXISTS idx_outbox_pending
			 ON outbox_events (available_at, created_at)
			 WHERE status IN ('pending', 'failed')`,
			`CREATE INDEX IF NOT EXISTS idx_outbox_workspace_created
			 ON outbox_events (workspace_id, created_at DESC)`,
		},
	},
	{
		Version: 2026072801,
		Name:    "published_schema_field_catalog",
		Statements: []string{
			`CREATE TABLE IF NOT EXISTS entity_schema_fields (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
				definition_id UUID NOT NULL,
				schema_version INTEGER NOT NULL CHECK (schema_version > 0),
				schema_checksum CHAR(64) NOT NULL,
				field_key VARCHAR(63) NOT NULL,
				field_type VARCHAR(32) NOT NULL,
				position INTEGER NOT NULL CHECK (position >= 0),
				required BOOLEAN NOT NULL DEFAULT false,
				searchable BOOLEAN NOT NULL DEFAULT false,
				indexed BOOLEAN NOT NULL DEFAULT false,
				classification VARCHAR(20) NOT NULL DEFAULT 'internal'
					CHECK (classification IN ('public', 'internal', 'confidential', 'pii')),
				read_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
				write_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
				config JSONB NOT NULL DEFAULT '{}'::jsonb,
				created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
				CONSTRAINT entity_schema_fields_definition_workspace_fk
					FOREIGN KEY (definition_id, workspace_id)
					REFERENCES entity_definitions(id, workspace_id)
					ON DELETE CASCADE,
				CONSTRAINT entity_schema_fields_definition_version_fk
					FOREIGN KEY (definition_id, schema_version)
					REFERENCES entity_schema_versions(definition_id, version)
					ON DELETE CASCADE,
				CONSTRAINT entity_schema_fields_version_key_unique
					UNIQUE (definition_id, schema_version, field_key)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_entity_schema_fields_workspace_definition
			 ON entity_schema_fields (workspace_id, definition_id, schema_version, position)`,
			`CREATE INDEX IF NOT EXISTS idx_entity_schema_fields_searchable
			 ON entity_schema_fields (workspace_id, definition_id, schema_version)
			 WHERE searchable = true`,
			`INSERT INTO entity_schema_fields (
				id, workspace_id, definition_id, schema_version, schema_checksum, field_key,
				field_type, position, required, searchable, indexed,
				classification, read_roles, write_roles, config
			 )
			 SELECT
				gen_random_uuid(), versions.workspace_id, versions.definition_id,
				versions.version, versions.checksum, field.value->>'key', field.value->>'type',
				(field.ordinality - 1)::integer,
				COALESCE((field.value->>'required')::boolean, false),
				COALESCE((field.value->>'searchable')::boolean, false),
				COALESCE((field.value->>'indexed')::boolean, false),
				COALESCE(NULLIF(field.value->>'classification', ''), 'internal'),
				COALESCE(field.value->'read_roles', '[]'::jsonb),
				COALESCE(field.value->'write_roles', '[]'::jsonb),
				field.value
			 FROM entity_schema_versions AS versions
			 CROSS JOIN LATERAL jsonb_array_elements(
				COALESCE(versions.ui_schema->'fields', '[]'::jsonb)
			 ) WITH ORDINALITY AS field(value, ordinality)
			 WHERE field.value ? 'key' AND field.value ? 'type'
			 ON CONFLICT (definition_id, schema_version, field_key) DO NOTHING`,
		},
	},
	{
		Version: 2026072901,
		Name:    "schema_change_impact_and_migration_jobs",
		Statements: []string{
			`CREATE TABLE IF NOT EXISTS entity_schema_change_jobs (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
				definition_id UUID NOT NULL,
				source_version INTEGER NOT NULL DEFAULT 0 CHECK (source_version >= 0),
				target_version INTEGER NOT NULL DEFAULT 0 CHECK (target_version >= 0),
				draft_revision INTEGER NOT NULL CHECK (draft_revision > 0),
				target_checksum CHAR(64) NOT NULL,
				job_type VARCHAR(20) NOT NULL
					CHECK (job_type IN ('impact', 'migration')),
				status VARCHAR(16) NOT NULL DEFAULT 'pending'
					CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled')),
				severity VARCHAR(16) NOT NULL DEFAULT 'safe'
					CHECK (severity IN ('safe', 'conditional', 'breaking')),
				idempotency_key CHAR(64) NOT NULL UNIQUE,
				report JSONB NOT NULL DEFAULT '{}'::jsonb,
				plan JSONB NOT NULL DEFAULT '[]'::jsonb,
				progress_total BIGINT NOT NULL DEFAULT 0 CHECK (progress_total >= 0),
				progress_processed BIGINT NOT NULL DEFAULT 0 CHECK (progress_processed >= 0),
				progress_failed BIGINT NOT NULL DEFAULT 0 CHECK (progress_failed >= 0),
				cursor VARCHAR(100) NOT NULL DEFAULT '',
				requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
				approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
				approved_at TIMESTAMPTZ,
				started_at TIMESTAMPTZ,
				completed_at TIMESTAMPTZ,
				last_error TEXT NOT NULL DEFAULT '',
				created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
				updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
				CONSTRAINT entity_schema_change_jobs_definition_workspace_fk
					FOREIGN KEY (definition_id, workspace_id)
					REFERENCES entity_definitions(id, workspace_id)
					ON DELETE CASCADE
			)`,
			`CREATE INDEX IF NOT EXISTS idx_schema_change_jobs_definition_created
			 ON entity_schema_change_jobs (workspace_id, definition_id, created_at DESC)`,
			`CREATE INDEX IF NOT EXISTS idx_schema_change_jobs_worker
			 ON entity_schema_change_jobs (status, created_at)
			 WHERE job_type = 'migration' AND target_version > 0
			   AND status IN ('pending', 'running')`,
		},
	},
	{
		Version: 2026073001,
		Name:    "schema_forms_and_saved_views",
		Statements: []string{
			`CREATE TABLE IF NOT EXISTS entity_forms (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
				definition_id UUID NOT NULL,
				name_ar VARCHAR(120) NOT NULL,
				name_en VARCHAR(120) NOT NULL,
				mode VARCHAR(16) NOT NULL DEFAULT 'create'
					CHECK (mode IN ('create', 'edit', 'readonly')),
				status VARCHAR(16) NOT NULL DEFAULT 'active'
					CHECK (status IN ('active', 'archived')),
				layout JSONB NOT NULL DEFAULT '{}'::jsonb,
				visibility_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
				revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
				is_default BOOLEAN NOT NULL DEFAULT false,
				created_by UUID REFERENCES users(id) ON DELETE SET NULL,
				updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
				updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
				deleted_at TIMESTAMPTZ,
				CONSTRAINT entity_forms_definition_workspace_fk
					FOREIGN KEY (definition_id, workspace_id)
					REFERENCES entity_definitions(id, workspace_id) ON DELETE CASCADE
			)`,
			`CREATE INDEX IF NOT EXISTS idx_entity_forms_definition_updated
			 ON entity_forms (workspace_id, definition_id, updated_at DESC)
			 WHERE deleted_at IS NULL`,
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_forms_one_default
			 ON entity_forms (definition_id, mode)
			 WHERE is_default = true AND deleted_at IS NULL`,
			`CREATE TABLE IF NOT EXISTS entity_views (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
				definition_id UUID NOT NULL,
				name_ar VARCHAR(120) NOT NULL,
				name_en VARCHAR(120) NOT NULL,
				view_type VARCHAR(16) NOT NULL DEFAULT 'table'
					CHECK (view_type IN ('table', 'kanban', 'calendar', 'gallery')),
				sharing VARCHAR(16) NOT NULL DEFAULT 'workspace'
					CHECK (sharing IN ('private', 'workspace')),
				query JSONB NOT NULL DEFAULT '{}'::jsonb,
				config JSONB NOT NULL DEFAULT '{}'::jsonb,
				revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
				is_default BOOLEAN NOT NULL DEFAULT false,
				owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
				created_by UUID REFERENCES users(id) ON DELETE SET NULL,
				updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
				updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
				deleted_at TIMESTAMPTZ,
				CONSTRAINT entity_views_definition_workspace_fk
					FOREIGN KEY (definition_id, workspace_id)
					REFERENCES entity_definitions(id, workspace_id) ON DELETE CASCADE
			)`,
			`CREATE INDEX IF NOT EXISTS idx_entity_views_definition_updated
			 ON entity_views (workspace_id, definition_id, updated_at DESC)
			 WHERE deleted_at IS NULL`,
			`CREATE INDEX IF NOT EXISTS idx_entity_views_owner
			 ON entity_views (workspace_id, owner_id, updated_at DESC)
			 WHERE sharing = 'private' AND deleted_at IS NULL`,
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_views_one_default
			 ON entity_views (definition_id)
			 WHERE is_default = true AND deleted_at IS NULL`,
		},
	},
	{
		Version: 2026073002,
		Name:    "hr_employees_relational_foundation",
		// The employees table itself is created by AutoMigrate (it runs before
		// this ledger). Here we add the constraints/indexes AutoMigrate cannot
		// express, then backfill from the legacy hr_employee JSONB entities so
		// the relational anchor is populated on first boot without data loss.
		Statements: []string{
			// Stable business key: unique staff number per workspace, ignoring
			// blanks and soft-deleted rows.
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_workspace_number
			 ON employees (workspace_id, employee_number)
			 WHERE employee_number <> '' AND deleted_at IS NULL`,
			// Hot filter for dashboards/directory: active headcount per tenant.
			`CREATE INDEX IF NOT EXISTS idx_employees_workspace_status
			 ON employees (workspace_id, status)
			 WHERE deleted_at IS NULL`,
			// Powers the Gulf-compliance expiry alerts (Iqama / insurance).
			`CREATE INDEX IF NOT EXISTS idx_employees_iqama_expiry
			 ON employees (workspace_id, iqama_expiry)
			 WHERE iqama_expiry IS NOT NULL AND deleted_at IS NULL`,
			`CREATE INDEX IF NOT EXISTS idx_employees_insurance_expiry
			 ON employees (workspace_id, insurance_expiry)
			 WHERE insurance_expiry IS NOT NULL AND deleted_at IS NULL`,
			// Read-compat backfill from hr_employee entities. Idempotent via the
			// legacy_entity_id guard, so re-runs (or a second replica) never
			// duplicate. Numeric/uuid extractions are regex-guarded because JSONB
			// values are untyped text and a bad cast would abort the migration.
			`INSERT INTO employees (
				id, workspace_id, user_id, employee_number, full_name, full_name_ar,
				email, phone, department, position, employment_type, status,
				base_salary, housing_allowance, transport_allowance, iban,
				nationality, legacy_entity_id, attributes, created_at, updated_at
			)
			SELECT
				gen_random_uuid(),
				e.workspace_id,
				CASE WHEN e.data->>'user_id' ~ '^[0-9a-fA-F-]{36}$'
					THEN (e.data->>'user_id')::uuid ELSE NULL END,
				COALESCE(NULLIF(e.data->>'employee_number',''), NULLIF(e.data->>'staff_no','')),
				COALESCE(NULLIF(e.data->>'full_name',''), NULLIF(e.data->>'name',''),
				         NULLIF(e.display_value,''), 'Unknown'),
				NULLIF(e.data->>'full_name_ar',''),
				NULLIF(e.data->>'email',''),
				NULLIF(e.data->>'phone',''),
				NULLIF(e.data->>'department',''),
				COALESCE(NULLIF(e.data->>'position',''), NULLIF(e.data->>'job_title','')),
				COALESCE(NULLIF(e.data->>'employment_type',''), 'full_time'),
				COALESCE(NULLIF(e.data->>'status',''), 'active'),
				CASE WHEN e.data->>'base_salary' ~ '^[0-9]+(\.[0-9]+)?$'
				     THEN (e.data->>'base_salary')::numeric
				     WHEN e.data->>'salary' ~ '^[0-9]+(\.[0-9]+)?$'
				     THEN (e.data->>'salary')::numeric ELSE 0 END,
				CASE WHEN e.data->>'housing_allowance' ~ '^[0-9]+(\.[0-9]+)?$'
				     THEN (e.data->>'housing_allowance')::numeric ELSE 0 END,
				CASE WHEN e.data->>'transport_allowance' ~ '^[0-9]+(\.[0-9]+)?$'
				     THEN (e.data->>'transport_allowance')::numeric ELSE 0 END,
				NULLIF(e.data->>'iban',''),
				NULLIF(e.data->>'nationality',''),
				e.id,
				e.data,
				e.created_at,
				e.updated_at
			FROM entities e
			WHERE e.entity_type = 'hr_employee'
			  AND e.deleted_at IS NULL
			  AND NOT EXISTS (
				SELECT 1 FROM employees em WHERE em.legacy_entity_id = e.id
			  )`,
		},
	},
	{
		Version: 2026073003,
		Name:    "hr_leave_balances_engine",
		// leave_balances is created by AutoMigrate; here we add the one-per
		// employee/type/year uniqueness the ledger depends on plus the lookup
		// index the balance API hits on every read.
		Statements: []string{
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_leave_balances_unique
			 ON leave_balances (workspace_id, employee_id, leave_type, year)
			 WHERE deleted_at IS NULL`,
			`CREATE INDEX IF NOT EXISTS idx_leave_balances_lookup
			 ON leave_balances (workspace_id, employee_id, year)
			 WHERE deleted_at IS NULL`,
		},
	},
	{
		Version: 2026073004,
		Name:    "hr_leave_requests_relational",
		Statements: []string{
			`CREATE INDEX IF NOT EXISTS idx_leave_requests_lookup
			 ON leave_requests (workspace_id, employee_id, status)
			 WHERE deleted_at IS NULL`,
			`CREATE INDEX IF NOT EXISTS idx_leave_requests_dates
			 ON leave_requests (workspace_id, start_date, end_date)
			 WHERE deleted_at IS NULL`,
		},
	},
	{
		Version: 2026073005,
		Name:    "hr_payroll_runs_and_payslips",
		Statements: []string{
			// One payroll run per workspace/period (ignoring soft-deleted).
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_runs_period
			 ON payroll_runs (workspace_id, year, month)
			 WHERE deleted_at IS NULL`,
			`CREATE INDEX IF NOT EXISTS idx_payslips_run_lookup
			 ON payslips (workspace_id, payroll_run_id)`,
		},
	},
	{
		Version: 2026080101,
		Name:    "crm_quote_invoice_idempotency_and_indexes",
		Statements: []string{
			`CREATE TABLE IF NOT EXISTS crm_quote_invoice_conversions (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
				idempotency_key VARCHAR(128) NOT NULL,
				lead_id UUID NOT NULL,
				quote_id UUID NOT NULL,
				invoice_id UUID NOT NULL,
				created_by UUID REFERENCES users(id) ON DELETE SET NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
				CONSTRAINT crm_quote_invoice_conversion_key_unique
					UNIQUE (workspace_id, idempotency_key),
				CONSTRAINT crm_quote_invoice_conversion_lead_fk
					FOREIGN KEY (lead_id, workspace_id) REFERENCES entities(id, workspace_id),
				CONSTRAINT crm_quote_invoice_conversion_quote_fk
					FOREIGN KEY (quote_id, workspace_id) REFERENCES entities(id, workspace_id),
				CONSTRAINT crm_quote_invoice_conversion_invoice_fk
					FOREIGN KEY (invoice_id, workspace_id) REFERENCES entities(id, workspace_id)
			)`,
			`DO $$ BEGIN
				IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_quote_invoice_conversion_workspace_fk') THEN
					ALTER TABLE crm_quote_invoice_conversions
						ADD CONSTRAINT crm_quote_invoice_conversion_workspace_fk
						FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
				END IF;
			END $$`,
			`DO $$ BEGIN
				IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_quote_invoice_conversion_lead_fk') THEN
					ALTER TABLE crm_quote_invoice_conversions
						ADD CONSTRAINT crm_quote_invoice_conversion_lead_fk
						FOREIGN KEY (lead_id, workspace_id) REFERENCES entities(id, workspace_id);
				END IF;
			END $$`,
			`DO $$ BEGIN
				IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_quote_invoice_conversion_quote_fk') THEN
					ALTER TABLE crm_quote_invoice_conversions
						ADD CONSTRAINT crm_quote_invoice_conversion_quote_fk
						FOREIGN KEY (quote_id, workspace_id) REFERENCES entities(id, workspace_id);
				END IF;
			END $$`,
			`DO $$ BEGIN
				IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_quote_invoice_conversion_invoice_fk') THEN
					ALTER TABLE crm_quote_invoice_conversions
						ADD CONSTRAINT crm_quote_invoice_conversion_invoice_fk
						FOREIGN KEY (invoice_id, workspace_id) REFERENCES entities(id, workspace_id);
				END IF;
			END $$`,
			`DO $$ BEGIN
				IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_quote_invoice_conversion_created_by_fk') THEN
					ALTER TABLE crm_quote_invoice_conversions
						ADD CONSTRAINT crm_quote_invoice_conversion_created_by_fk
						FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
				END IF;
			END $$`,
			`CREATE INDEX IF NOT EXISTS idx_crm_conversion_lead
				 ON crm_quote_invoice_conversions (workspace_id, lead_id)`,
			`CREATE INDEX IF NOT EXISTS idx_entities_crm_pipeline_stage
				 ON entities (workspace_id, ((COALESCE(data->>'stage', data->>'status'))), created_at DESC)
				 WHERE entity_type IN ('lead', 'crm_deal') AND deleted_at IS NULL`,
			`CREATE INDEX IF NOT EXISTS idx_entities_crm_owner
				 ON entities (workspace_id, ((data->>'owner_id')), created_at DESC)
				 WHERE entity_type IN ('lead', 'crm_deal') AND deleted_at IS NULL`,
		},
	},
	{
		Version: 2026080102,
		Name:    "crm_legacy_record_migration_ledger",
		Statements: []string{
			`CREATE TABLE IF NOT EXISTS crm_legacy_record_links (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
				legacy_entity_id UUID NOT NULL,
				target_definition_key VARCHAR(100) NOT NULL,
				target_record_id UUID NOT NULL,
				migration_version INTEGER NOT NULL DEFAULT 1,
				created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
				CONSTRAINT crm_legacy_record_link_unique UNIQUE
					(workspace_id, legacy_entity_id, target_definition_key),
				CONSTRAINT crm_legacy_record_link_source_fk FOREIGN KEY
					(legacy_entity_id, workspace_id) REFERENCES entities(id, workspace_id),
				CONSTRAINT crm_legacy_record_link_target_fk FOREIGN KEY
					(target_record_id, workspace_id) REFERENCES entities(id, workspace_id)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_crm_legacy_record_target
				 ON crm_legacy_record_links (workspace_id, target_record_id)`,
			`CREATE INDEX IF NOT EXISTS idx_entities_crm_dynamic_stage
				 ON entities (workspace_id, ((data->>'stage')), updated_at DESC)
				 WHERE entity_type = 'crm_opportunity' AND definition_id IS NOT NULL AND deleted_at IS NULL`,
			`CREATE INDEX IF NOT EXISTS idx_entities_crm_ticket_sla
				 ON entities (workspace_id, ((data->>'sla_status')), ((data->>'sla_due_at')))
				 WHERE entity_type = 'crm_ticket' AND definition_id IS NOT NULL AND deleted_at IS NULL`,
		},
	},
	{
		Version: 2026080103,
		Name:    "crm_conversion_opportunity_naming",
		Statements: []string{
			`DO $$ BEGIN
				IF EXISTS (
					SELECT 1 FROM information_schema.columns
					WHERE table_name = 'crm_quote_invoice_conversions' AND column_name = 'lead_id'
				) AND NOT EXISTS (
					SELECT 1 FROM information_schema.columns
					WHERE table_name = 'crm_quote_invoice_conversions' AND column_name = 'opportunity_id'
				) THEN
					ALTER TABLE crm_quote_invoice_conversions DROP CONSTRAINT IF EXISTS crm_quote_invoice_conversion_lead_fk;
					ALTER TABLE crm_quote_invoice_conversions RENAME COLUMN lead_id TO opportunity_id;
				END IF;
			END $$`,
			`DO $$ BEGIN
				IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_quote_invoice_conversion_opportunity_fk') THEN
					ALTER TABLE crm_quote_invoice_conversions
						ADD CONSTRAINT crm_quote_invoice_conversion_opportunity_fk
						FOREIGN KEY (opportunity_id, workspace_id) REFERENCES entities(id, workspace_id);
				END IF;
			END $$`,
			`DROP INDEX IF EXISTS idx_crm_conversion_lead`,
			`CREATE INDEX IF NOT EXISTS idx_crm_conversion_opportunity
				 ON crm_quote_invoice_conversions (workspace_id, opportunity_id)`,
		},
	},
	{
		Version: 2026080201,
		Name:    "hr_performance_goals",
		Statements: []string{
			`CREATE INDEX IF NOT EXISTS idx_goals_lookup
			 ON performance_goals (workspace_id, employee_id, status)
			 WHERE deleted_at IS NULL`,
		},
	},
	{
		Version: 2026080202,
		Name:    "hr_performance_reviews",
		Statements: []string{
			`CREATE INDEX IF NOT EXISTS idx_reviews_lookup
			 ON performance_reviews (workspace_id, employee_id, status)
			 WHERE deleted_at IS NULL`,
		},
	},
	{
		Version: 2026080203,
		Name:    "pm_phase_zero_contract",
		Statements: []string{
			`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS record_version INTEGER NOT NULL DEFAULT 1`,
			`ALTER TABLE sprints ADD COLUMN IF NOT EXISTS record_version INTEGER NOT NULL DEFAULT 1`,
			`WITH ranked AS (
				SELECT id, row_number() OVER (
					PARTITION BY workspace_id, project_id ORDER BY updated_at DESC, created_at DESC, id
				) AS position
				FROM sprints WHERE status = 'active'
			)
			UPDATE sprints SET status = 'planning', record_version = record_version + 1
			FROM ranked WHERE sprints.id = ranked.id AND ranked.position > 1`,
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_sprints_one_active_per_project
			 ON sprints (workspace_id, project_id) WHERE status = 'active'`,
			`CREATE INDEX IF NOT EXISTS idx_tasks_project_due_open
			 ON tasks (workspace_id, project_id, due_date) WHERE status <> 'done'`,
			`CREATE INDEX IF NOT EXISTS idx_tasks_assignee_open
			 ON tasks (workspace_id, assignee_id, updated_at DESC) WHERE status <> 'done'`,
		},
	},
	{
		Version: 2026080204,
		Name:    "pm_legacy_task_migration_ledger",
		Statements: []string{
			`ALTER TABLE projects ADD COLUMN IF NOT EXISTS system_key VARCHAR(63)`,
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_workspace_system_key
				 ON projects (workspace_id, system_key) WHERE system_key IS NOT NULL`,
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_id_workspace
				 ON tasks (id, workspace_id)`,
			`CREATE TABLE IF NOT EXISTS pm_legacy_record_links (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
				legacy_entity_id UUID NOT NULL,
				legacy_entity_type VARCHAR(20) NOT NULL
					CHECK (legacy_entity_type IN ('task', 'sub_task')),
				target_task_id UUID NOT NULL,
				migration_version INTEGER NOT NULL DEFAULT 1,
				created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
				CONSTRAINT pm_legacy_record_link_unique UNIQUE
					(workspace_id, legacy_entity_id),
				CONSTRAINT pm_legacy_record_link_source_fk FOREIGN KEY
					(legacy_entity_id, workspace_id) REFERENCES entities(id, workspace_id),
				CONSTRAINT pm_legacy_record_link_target_fk FOREIGN KEY
					(target_task_id, workspace_id) REFERENCES tasks(id, workspace_id)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_pm_legacy_record_target
				 ON pm_legacy_record_links (workspace_id, target_task_id)`,
			`CREATE INDEX IF NOT EXISTS idx_tasks_workspace_parent
				 ON tasks (workspace_id, parent_id, created_at ASC)`,
		},
	},
	{
		Version: 2026080205,
		Name:    "hr_candidates_ats",
		Statements: []string{
			`CREATE INDEX IF NOT EXISTS idx_candidates_lookup
			 ON candidates (workspace_id, stage)
			 WHERE deleted_at IS NULL`,
		},
	},
	{
		Version: 2026080206,
		Name:    "crm_external_ticket_identity",
		Statements: []string{
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_ticket_external_identity
			 ON entities (workspace_id, ((data->>'external_provider')), ((data->>'external_ticket_id')))
			 WHERE entity_type = 'crm_ticket'
			   AND definition_id IS NOT NULL
			   AND deleted_at IS NULL
			   AND COALESCE(data->>'external_provider', '') <> ''
			   AND COALESCE(data->>'external_ticket_id', '') <> ''`,
		},
	},
	{
		Version: 2026080207,
		Name:    "crm_quote_conversion_integrity",
		Statements: []string{
			`ALTER TABLE crm_quote_invoice_conversions
			 ADD COLUMN IF NOT EXISTS request_hash CHAR(64)`,
			`UPDATE crm_quote_invoice_conversions
			 SET request_hash = '' WHERE request_hash IS NULL`,
			`ALTER TABLE crm_quote_invoice_conversions
			 ALTER COLUMN request_hash SET DEFAULT '',
			 ALTER COLUMN request_hash SET NOT NULL`,
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_quote_number_unique
			 ON entities (workspace_id, ((data->>'quote_number')))
			 WHERE entity_type = 'crm_quote'
			   AND definition_id IS NOT NULL
			   AND deleted_at IS NULL
			   AND COALESCE(data->>'quote_number', '') <> ''`,
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_invoice_number_unique
			 ON entities (workspace_id, ((COALESCE(data->>'invoice_number', data->>'invoiceNumber'))))
			 WHERE entity_type = 'finance_invoice'
			   AND deleted_at IS NULL
			   AND COALESCE(data->>'invoice_number', data->>'invoiceNumber', '') <> ''`,
		},
	},
}

// runSchemaMigrations serializes migrations across replicas, runs each version
// transactionally, and records it only after every statement succeeds. This
// replaces untracked best-effort DDL at startup with an auditable migration
// ledger while AutoMigrate remains temporarily for model compatibility.
func runSchemaMigrations(db *gorm.DB) error {
	if err := db.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
		version BIGINT PRIMARY KEY,
		name TEXT NOT NULL,
		applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
	)`).Error; err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	const advisoryLockID int64 = 7_397_042_601
	return db.Transaction(func(tx *gorm.DB) error {
		// Transaction-scoped advisory locks are released automatically even if
		// the process crashes; session locks are unsafe with a connection pool.
		if err := tx.Exec(`SELECT pg_advisory_xact_lock(?)`, advisoryLockID).Error; err != nil {
			return fmt.Errorf("acquire migration lock: %w", err)
		}
		for _, migration := range schemaMigrations {
			var applied int64
			if err := tx.Raw(`SELECT count(*) FROM schema_migrations WHERE version = ?`, migration.Version).Scan(&applied).Error; err != nil {
				return fmt.Errorf("check migration %d: %w", migration.Version, err)
			}
			if applied > 0 {
				continue
			}
			for index, statement := range migration.Statements {
				if err := tx.Exec(statement).Error; err != nil {
					return fmt.Errorf("migration %d (%s), statement %d: %w", migration.Version, migration.Name, index+1, err)
				}
			}
			if err := tx.Exec(
				`INSERT INTO schema_migrations (version, name) VALUES (?, ?)`,
				migration.Version,
				migration.Name,
			).Error; err != nil {
				return fmt.Errorf("record migration %d (%s): %w", migration.Version, migration.Name, err)
			}
		}
		return nil
	})
}
