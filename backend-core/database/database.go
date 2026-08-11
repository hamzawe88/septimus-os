package database

import (
	"log"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// DB is the privileged pool: schema migrations, RLS setup, and the background
// workers that are cross-tenant by design (the proactive auditor scans every
// workspace, webhook dispatch resolves rows it was handed an id for, and so on).
// It connects as the owning superuser and therefore BYPASSES row-level security.
//
// AppDB is the least-privilege pool used for request-scoped work. It logs in as
// a role that is neither superuser, table owner, nor BYPASSRLS, so PostgreSQL
// applies the tenant policies to every statement it runs. TenantEnforcerMiddleware
// opens its per-request transaction here, which is what makes RLS a real backstop
// for handler code that forgets an explicit workspace_id filter.
//
// The split exists because binding RLS to a per-request setting is incompatible
// with background jobs that legitimately have no single tenant: enforcing one
// pool for both would silently return zero rows to the auditor.
var (
	DB    *gorm.DB
	AppDB *gorm.DB
)

// GetDB returns the request-scoped transaction when one exists (RLS-enforced via
// AppDB), otherwise the privileged pool. Routes without a workspace — and the
// super-admin global-access path — intentionally land on the latter.
func GetDB(c *fiber.Ctx) *gorm.DB {
	if c == nil {
		return DB
	}
	if tx, ok := c.Locals("db_tx").(*gorm.DB); ok && tx != nil {
		return tx
	}
	return DB
}

func ConnectDB() {
	dsn := os.Getenv("DB_DSN")
	if dsn == "" {
		dsn = "host=localhost user=septimus_user password=septimus_password dbname=septimus_db port=5432 sslmode=disable"
	}

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: newDatabaseLogger(configuredDatabaseLogLevel()),
	})

	if err != nil {
		log.Fatal("Failed to connect to database. \n", err)
	}

	log.Println("Connected to PostgreSQL successfully")

	// Enable LTREE extension for hierarchical data structures
	if err := db.Exec(`CREATE EXTENSION IF NOT EXISTS ltree;`).Error; err != nil {
		log.Fatalf("Failed to enable ltree extension: %v", err)
	}

	// Enable pgvector extension for AI RAG embeddings
	if err := db.Exec(`CREATE EXTENSION IF NOT EXISTS vector;`).Error; err != nil {
		log.Fatalf("Failed to enable vector extension: %v", err)
	}

	// Existing installations may predate workspace slugs. Clean duplicates
	// before AutoMigrate creates the unique index; first installs have no table
	// yet and need no backfill.
	if db.Migrator().HasTable(&models.Workspace{}) {
		if err := db.Exec(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS slug VARCHAR(63) NOT NULL DEFAULT 'default';`).Error; err != nil {
			log.Fatalf("Failed to add workspace slug column: %v", err)
		}
		if err := db.Exec(`UPDATE workspaces SET slug = 'ws-' || SUBSTRING(id::text, 1, 8) WHERE ctid NOT IN (SELECT min(ctid) FROM workspaces GROUP BY slug);`).Error; err != nil {
			log.Fatalf("Failed to normalize duplicate workspace slugs: %v", err)
		}
	}
	// Legacy installs used an empty string for missing employee IDs. Normalize
	// before AutoMigrate creates the unique index; otherwise multiple empty
	// values make the index migration fail before versioned backfills can run.
	if db.Migrator().HasTable(&models.User{}) {
		if err := db.Exec(`UPDATE users SET employee_id = NULL WHERE employee_id = '';`).Error; err != nil {
			log.Fatalf("Failed to normalize legacy employee IDs: %v", err)
		}
	}

	// Auto-migrate the schemas
	err = db.AutoMigrate(
		&models.Workspace{},
		&models.WorkspaceSetting{},
		&models.WorkspaceIntegration{},
		&models.Department{},     // Added Department
		&models.FileRecord{},     // Added FileRecord for SaaS Storage Quotas
		&models.Role{},           // Added Role
		&models.Permission{},     // Added Permission
		&models.RolePermission{}, // Added RolePermission
		&models.User{},
		&models.AuthSession{},
		&models.OfficeLocation{},    // Added OfficeLocation
		&models.AttendanceLog{},     // Added AttendanceLog
		&models.Employee{},          // Relational HR anchor (links attendance ↔ person ↔ payroll)
		&models.LeaveBalance{},      // Per-employee leave ledger (accrual engine G2)
		&models.LeaveRequest{},      // Relational leave requests (approval deducts balance)
		&models.PayrollRun{},        // Monthly payroll run (M1)
		&models.Payslip{},           // Per-employee payslip with GOSI split
		&models.PerformanceGoal{},   // Employee OKR / goals (M3)
		&models.PerformanceReview{}, // Periodic performance reviews (M3)
		&models.Candidate{},         // Recruitment pipeline / ATS (M3)
		&models.Project{},
		&models.Sprint{}, // Added Sprint
		&models.Entity{},
		&models.Channel{},
		&models.ChannelMember{},
		&models.Message{},
		&models.Notification{}, // Added Notification
		&models.Task{},
		&models.TaskHistory{},
		&models.TaskDependency{},
		&models.Workflow{},
		&models.WorkflowRun{},
		&models.WebhookSubscription{}, // Added WebhookSubscription
		&models.WebhookDelivery{},     // Replay protection for inbound webhooks
		&models.AuditLog{},
		&models.APIKey{},
		&models.WorkDoc{},
		&models.AgentState{},
		&models.AgentCollaborationLog{},
		&models.PendingApproval{},
		&models.DocumentEmbedding{},        // Added DocumentEmbedding for RAG
		&models.CorrespondenceTemplate{},   // Added CorrespondenceTemplate
		&models.Correspondence{},           // Added Correspondence
		&models.CorrespondenceForwardLog{}, // Added CorrespondenceForwardLog
		&models.Subscription{},
		&models.Invoice{},
		&models.SaaSPlan{},               // Added SaaSPlan
		&models.PaymentGatewaySettings{}, // Added PaymentGatewaySettings
		&models.AITokenUsage{},           // AI token usage / cost dashboard
		&models.DriveFolder{},            // Septimus Drive Folders
		&models.DrivePermission{},        // Septimus Drive Permissions
		&models.DriveFile{},              // Septimus Drive Files
	)
	if err != nil {
		log.Fatalf("Failed to auto-migrate: %v", err)
	}
	if err := runSchemaMigrations(db); err != nil {
		log.Fatalf("Failed to run versioned schema migrations: %v", err)
	}

	setupRowLevelSecurity(db)
	connectAppRole(db, dsn)

	setupRetrievalIndexes(db)

	SeedRBAC(db)
	SeedPaymentGateways(db)

	DB = db
}

// appRoleName is the least-privilege login used for request-scoped queries.
// It must never be granted SUPERUSER or BYPASSRLS, and must never own the
// tenant tables — any of those would silently switch RLS back off.
const appRoleName = "septimus_app"

// connectAppRole provisions the least-privilege role and opens AppDB against it.
//
// Provisioning failure leaves AppDB nil. TenantEnforcerMiddleware treats that
// state as service unavailable and fails tenant requests closed; it never
// downgrades a normal request to the privileged pool.
func connectAppRole(db *gorm.DB, adminDSN string) {
	password := os.Getenv("APP_DB_PASSWORD")
	if password == "" {
		if strings.EqualFold(os.Getenv("APP_ENV"), "production") {
			log.Fatal("APP_DB_PASSWORD is required in production for the least-privilege RLS database role")
		}
		password = "septimus_app_dev"
	}

	// Idempotent: create the role, then re-assert its attributes and password so
	// a rotated APP_DB_PASSWORD takes effect on the next boot.
	if err := db.Exec(`DO $$ BEGIN
		IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '` + appRoleName + `') THEN
			CREATE ROLE ` + appRoleName + ` LOGIN;
		END IF;
	END $$;`).Error; err != nil {
		log.Printf("RLS: could not create %s role (%v) — request queries stay on the privileged pool", appRoleName, err)
		return
	}
	// ALTER ROLE is a utility statement: PostgreSQL rejects bind parameters in it,
	// so the password has to be a literal. Double any single quote — the standard
	// SQL literal escape — rather than passing the value through unchanged.
	escaped := strings.ReplaceAll(password, "'", "''")
	if err := db.Exec(`ALTER ROLE ` + appRoleName +
		` WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '` + escaped + `'`).Error; err != nil {
		log.Printf("RLS: could not configure %s role: %v", appRoleName, err)
		return
	}

	// DML only — no DDL. Schema changes stay on the privileged connection.
	// DEFAULT PRIVILEGES covers tables AutoMigrate creates on later boots.
	for _, stmt := range []string{
		`GRANT USAGE ON SCHEMA public TO ` + appRoleName,
		`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ` + appRoleName,
		`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ` + appRoleName,
		`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ` + appRoleName,
		`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ` + appRoleName,
	} {
		if err := db.Exec(stmt).Error; err != nil {
			log.Printf("RLS: grant failed (%s): %v", stmt, err)
		}
	}

	appDSN, err := swapDSNCredentials(adminDSN, appRoleName, password)
	if err != nil {
		log.Printf("RLS: could not derive app DSN (%v) — request queries stay on the privileged pool", err)
		return
	}

	conn, err := gorm.Open(postgres.Open(appDSN), &gorm.Config{
		Logger: newDatabaseLogger(logger.Warn),
	})
	if err != nil {
		log.Printf("RLS: could not connect as %s (%v) — request queries stay on the privileged pool", appRoleName, err)
		return
	}

	AppDB = conn
	log.Printf("RLS: request pool connected as %s (row-level tenant policies enforced)", appRoleName)
}

// configuredDatabaseLogLevel is deliberately conservative. SQL loggers can
// otherwise serialize bind values such as email addresses, password hashes,
// tokens, and record payloads into container logs. Info logging must be opted
// into explicitly and is capped at Warn in production.
func configuredDatabaseLogLevel() logger.LogLevel {
	var level logger.LogLevel
	switch strings.ToLower(strings.TrimSpace(os.Getenv("DB_LOG_LEVEL"))) {
	case "silent":
		level = logger.Silent
	case "error":
		level = logger.Error
	case "info":
		level = logger.Info
	default:
		level = logger.Warn
	}

	if strings.EqualFold(strings.TrimSpace(os.Getenv("APP_ENV")), "production") &&
		level == logger.Info {
		return logger.Warn
	}
	return level
}

func newDatabaseLogger(level logger.LogLevel) logger.Interface {
	return logger.New(
		log.New(os.Stdout, "\r\n", log.LstdFlags),
		logger.Config{
			SlowThreshold:             500 * time.Millisecond,
			LogLevel:                  level,
			IgnoreRecordNotFoundError: true,
			Colorful:                  false,
			ParameterizedQueries:      true,
		},
	)
}

// swapDSNCredentials rewrites the connection string to use a different login.
// Supports both URL DSNs (postgres://user:pass@host/db) and key=value DSNs.
func swapDSNCredentials(dsn, user, password string) (string, error) {
	if strings.HasPrefix(dsn, "postgres://") || strings.HasPrefix(dsn, "postgresql://") {
		u, err := url.Parse(dsn)
		if err != nil {
			return "", err
		}
		u.User = url.UserPassword(user, password)
		return u.String(), nil
	}

	// key=value form: replace the user/password fields, keep everything else.
	parts := strings.Fields(dsn)
	out := make([]string, 0, len(parts)+2)
	var sawUser, sawPass bool
	for _, p := range parts {
		switch {
		case strings.HasPrefix(p, "user="):
			out = append(out, "user="+user)
			sawUser = true
		case strings.HasPrefix(p, "password="):
			out = append(out, "password="+password)
			sawPass = true
		default:
			out = append(out, p)
		}
	}
	if !sawUser {
		out = append(out, "user="+user)
	}
	if !sawPass {
		out = append(out, "password="+password)
	}
	return strings.Join(out, " "), nil
}

// setupRowLevelSecurity configures PostgreSQL RLS on tenant tables.
//
// Tenant requests run through AppDB, a non-owner/non-BYPASSRLS role, and every
// policy requires the transaction-local workspace key for both reads and
// writes. Cross-tenant background jobs deliberately use the privileged DB pool.
// Tables without a direct workspace_id remain protected by scoped parent joins
// and handler checks; they are logged as skipped instead of being left in a
// silent deny-all state.
var rlsTenantTables = []string{
	"workspace_settings",
	"workspace_integrations",
	"departments",
	"file_records",
	"users",
	"office_locations",
	"attendance_logs",
	"employees",
	"leave_balances",
	"leave_requests",
	"payroll_runs",
	"payslips",
	"performance_goals",
	"performance_reviews",
	"candidates",
	"projects",
	"sprints",
	"entities",
	"crm_quote_invoice_conversions",
	"crm_legacy_record_links",
	"pm_legacy_record_links",
	"entity_definitions",
	"entity_schema_versions",
	"entity_schema_fields",
	"entity_schema_change_jobs",
	"entity_forms",
	"entity_views",
	"entity_relations",
	"entity_record_relations",
	"outbox_events",
	"channels",
	"messages",
	"tasks",
	"task_dependencies",
	"workflows",
	"webhook_subscriptions",
	"webhook_deliveries",
	"audit_logs",
	"api_keys",
	"work_docs",
	"agent_states",
	"agent_collaboration_logs",
	"pending_approvals",
	"document_embeddings",
	"correspondence_templates",
	"correspondences",
	"subscriptions",
	"invoices",
	"ai_token_usages",
	"drive_folders",
	"drive_files",
	"auth_sessions",
}

func setupRowLevelSecurity(db *gorm.DB) {

	var protected, skipped []string
	for _, tbl := range rlsTenantTables {
		var hasCol bool
		if err := db.Raw(`SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = ? AND column_name = 'workspace_id'
		)`, tbl).Scan(&hasCol).Error; err != nil {
			log.Printf("RLS: could not inspect %s: %v", tbl, err)
			continue
		}
		if !hasCol {
			// Leave RLS OFF rather than enabling it with no policy.
			db.Exec(`ALTER TABLE ` + tbl + ` DISABLE ROW LEVEL SECURITY;`)
			skipped = append(skipped, tbl)
			continue
		}

		if err := db.Exec(`ALTER TABLE ` + tbl + ` ENABLE ROW LEVEL SECURITY;`).Error; err != nil {
			log.Printf("RLS: enable failed on %s: %v", tbl, err)
			continue
		}
		db.Exec(`DROP POLICY IF EXISTS tenant_isolation_policy ON ` + tbl + `;`)
		// Strict: a row is visible only to the tenant whose key is set on the
		// current transaction. There is deliberately no "unset means everything"
		// branch — that escape hatch made the policy a no-op for any caller that
		// forgot to set the key, which is precisely the mistake it must catch.
		//
		// Callers that legitimately span tenants do not rely on this policy at
		// all: they run on the privileged pool (superuser) and bypass RLS. Only
		// the least-privilege request pool is subject to it, and
		// TenantEnforcerMiddleware always sets the key before handing that
		// transaction to a handler.
		if err := db.Exec(`CREATE POLICY tenant_isolation_policy ON ` + tbl + `
				USING (
					workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
				)
				WITH CHECK (
					workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
				);`).Error; err != nil {
			// Never leave a table with RLS on and no policy.
			log.Printf("RLS: policy failed on %s (%v) — disabling RLS to avoid a deny-all table", tbl, err)
			db.Exec(`ALTER TABLE ` + tbl + ` DISABLE ROW LEVEL SECURITY;`)
			continue
		}
		protected = append(protected, tbl)
	}

	log.Printf("RLS: policies applied to %v", protected)
	if len(skipped) > 0 {
		log.Printf("RLS: NOT applied to %v — these tables have no workspace_id column, so they carry no "+
			"row-level tenant policy. Their isolation depends entirely on query-level workspace filtering.", skipped)
	}
}

// setupRetrievalIndexes backs the two arms of SearchHybrid.
//
// Both arms ran as sequential scans until now: AutoMigrate creates the
// document_embeddings table but no index on the vector column, so every
// `embedding <=> $1` compared the query against every row in the workspace —
// and SearchHybrid pulls a candidate pool from each arm on every single RAG
// call, which is the hot path for chat, the orchestrator, correspondence, and
// voice. This is the largest performance lever in the AI layer.
func setupRetrievalIndexes(db *gorm.DB) {
	// Dense arm. HNSW gives better recall/latency than IVFFlat and needs no
	// training pass over existing data, so it is safe to create on a live table.
	// vector_cosine_ops matches the `<=>` operator SearchSimilarByType uses.
	// Requires pgvector >= 0.5; on older builds this is a no-op and the planner
	// simply keeps sequential scanning (correct, just slower).
	if err := db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_document_embeddings_hnsw
		ON document_embeddings USING hnsw (embedding vector_cosine_ops);
	`).Error; err != nil {
		log.Printf("retrieval index: HNSW unavailable (%v) — falling back to IVFFlat", err)
		if err := db.Exec(`
			CREATE INDEX IF NOT EXISTS idx_document_embeddings_ivfflat
			ON document_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
		`).Error; err != nil {
			log.Printf("retrieval index: no vector index created (%v) — semantic search will sequential-scan", err)
		}
	}

	// Every query is workspace-scoped and often entity_type-scoped; this lets the
	// planner cut the candidate set before the distance computation.
	db.Exec(`CREATE INDEX IF NOT EXISTS idx_document_embeddings_scope
		ON document_embeddings (workspace_id, entity_type);`)

	// Lexical arm. searchLexical builds the tsvector on the fly with the
	// 'simple' config (the right choice for Arabic — Postgres ships no Arabic
	// stemmer). A functional GIN index on the identical expression is what makes
	// that arm indexable rather than a full scan.
	db.Exec(`CREATE INDEX IF NOT EXISTS idx_document_embeddings_content_fts
		ON document_embeddings USING GIN (to_tsvector('simple', content));`)
}

func SeedPaymentGateways(db *gorm.DB) {
	var count int64
	db.Model(&models.PaymentGatewaySettings{}).Count(&count)
	if count == 0 {
		stripe := models.PaymentGatewaySettings{
			GatewayName: "stripe",
			IsActive:    true,
			IsTestMode:  true,
			Credentials: []byte(`{"publishable_key": "", "secret_key": "", "webhook_secret": ""}`),
			Currency:    "USD",
			SortOrder:   1,
		}
		moamalat := models.PaymentGatewaySettings{
			GatewayName: "moamalat",
			IsActive:    true,
			IsTestMode:  true,
			Credentials: []byte(`{"merchant_id": "", "terminal_id": "", "secret_key": ""}`),
			Currency:    "LYD",
			SortOrder:   2,
		}
		onepay := models.PaymentGatewaySettings{
			GatewayName: "onepay",
			IsActive:    false,
			IsTestMode:  true,
			Credentials: []byte(`{"app_id": "", "secret_key": ""}`),
			Currency:    "LYD",
			SortOrder:   3,
		}
		db.Create(&stripe)
		db.Create(&moamalat)
		db.Create(&onepay)
		log.Println("Seeded default Payment Gateway settings")
	}
}

func SeedRBAC(db *gorm.DB) {
	for _, role := range []models.Role{
		{Name: "Admin", Description: "System Administrator with full access", IsSystemRole: true},
		{Name: "Manager", Description: "Department Manager", IsSystemRole: true},
		{Name: "Member", Description: "Standard Employee", IsSystemRole: true},
		{Name: "Viewer", Description: "Read-only Employee", IsSystemRole: true},
		// Roles the demo/org users actually carry as a role string. Without a
		// matching row here they had no role_id to resolve permissions through,
		// so every gated route denied them (e.g. HR Manager could not open the
		// HR directory). See the role_id backfill at the end of this function.
		{Name: "HR Manager", Description: "Human Resources lead — full HR module access", IsSystemRole: true},
		{Name: "CTO", Description: "Technology leadership — broad records/schema/task access", IsSystemRole: true},
		{Name: "Developer", Description: "Engineer — create and edit records", IsSystemRole: true},
	} {
		db.Where("name = ?", role.Name).FirstOrCreate(&role)
	}

	// Always ensure permissions exist (idempotent seed)
	perms := []models.Permission{
		{Name: "admin.manage", Module: "Admin"},
		{Name: "tasks.manage", Module: "Agile"},
		{Name: string(models.PermCreateProject), Module: "Agile"},
		{Name: string(models.PermUpdateProject), Module: "Agile"},
		{Name: string(models.PermDeleteProject), Module: "Agile"},
		{Name: string(models.PermCreateTask), Module: "Agile"},
		{Name: string(models.PermUpdateTask), Module: "Agile"},
		{Name: string(models.PermDeleteTask), Module: "Agile"},
		{Name: string(models.PermManageSprint), Module: "Agile"},
		{Name: "attendance.manage", Module: "HR"},
		{Name: "finance.manage", Module: "Finance"},
		{Name: "correspondence.create", Module: "Correspondence"},
		{Name: "correspondence.sign", Module: "Correspondence"},
		{Name: "correspondence.forward", Module: "Correspondence"},
		{Name: "correspondence.archive", Module: "Correspondence"},
		{Name: "correspondence.view_all", Module: "Correspondence"},
		{Name: "schemas.view", Module: "Data"},
		{Name: "schemas.manage", Module: "Data"},
		{Name: "schemas.publish", Module: "Data"},
		{Name: "records.read", Module: "Data"},
		{Name: "records.create", Module: "Data"},
		{Name: "records.update", Module: "Data"},
		{Name: "records.delete", Module: "Data"},
	}
	permissionIDs := make(map[string]uuid.UUID, len(perms))
	for _, p := range perms {
		var existing models.Permission
		if err := db.Where("name = ?", p.Name).FirstOrCreate(&existing, p).Error; err == nil {
			permissionIDs[p.Name] = existing.ID
		}
	}

	roleGrants := map[string][]string{
		"Admin": {
			string(models.PermCreateProject), string(models.PermUpdateProject), string(models.PermDeleteProject),
			string(models.PermCreateTask), string(models.PermUpdateTask), string(models.PermDeleteTask), string(models.PermManageSprint),
			"schemas.view", "schemas.manage", "schemas.publish",
			"records.read", "records.create", "records.update", "records.delete",
		},
		"Manager": {
			string(models.PermCreateProject), string(models.PermUpdateProject), string(models.PermDeleteProject),
			string(models.PermCreateTask), string(models.PermUpdateTask), string(models.PermDeleteTask), string(models.PermManageSprint),
			"schemas.view", "schemas.manage",
			"records.read", "records.create", "records.update", "records.delete",
		},
		"Member": {string(models.PermCreateTask), string(models.PermUpdateTask), "schemas.view", "records.read", "records.create", "records.update"},
		"Viewer": {"schemas.view", "records.read"},
		// HR Manager owns the HR module: employees/leave/jobs are records, and
		// attendance.manage covers office/geofence administration.
		"HR Manager": {
			"schemas.view",
			"records.read", "records.create", "records.update", "records.delete",
			"attendance.manage",
		},
		// CTO: broad operational authority short of Admin/finance.
		"CTO": {
			string(models.PermCreateProject), string(models.PermUpdateProject), string(models.PermDeleteProject),
			string(models.PermCreateTask), string(models.PermUpdateTask), string(models.PermDeleteTask), string(models.PermManageSprint),
			"schemas.view", "schemas.manage",
			"records.read", "records.create", "records.update", "records.delete",
			"attendance.manage", "tasks.manage",
		},
		// Developer: create and edit records, no destructive delete.
		"Developer": {string(models.PermCreateTask), string(models.PermUpdateTask), "schemas.view", "records.read", "records.create", "records.update"},
	}
	for roleName, grants := range roleGrants {
		var role models.Role
		if err := db.Where("name = ?", roleName).First(&role).Error; err != nil {
			continue
		}
		for _, permissionName := range grants {
			permissionID := permissionIDs[permissionName]
			if permissionID == uuid.Nil {
				continue
			}
			link := models.RolePermission{RoleID: role.ID, PermissionID: permissionID}
			db.Where(
				"role_id = ? AND permission_id = ?",
				role.ID,
				permissionID,
			).FirstOrCreate(&link)
		}
	}
	// Backfill role_id for users who carry a role STRING but were never linked to
	// the matching role ROW. The demo seeder (seed.go seedUser) wrote only the
	// string, and CheckPermission resolves granular permissions through role_id —
	// so these users (HR Manager, CTO, Developer, Member, …) were denied every
	// gated route despite having a sensible role name. Idempotent: only fills
	// rows still missing the link, matching case-insensitively on the name.
	if err := db.Exec(`
		UPDATE users u
		SET role_id = r.id
		FROM roles r
		WHERE u.role_id IS NULL
		  AND u.role IS NOT NULL
		  AND u.role <> ''
		  AND lower(u.role) = lower(r.name)
	`).Error; err != nil {
		log.Printf("RBAC: user role_id backfill failed: %v", err)
	}

	log.Println("Seeded/verified RBAC permissions including Correspondence and no-code data modules")
}

func ParseUUID(s string) uuid.UUID {
	id, _ := uuid.Parse(s)
	return id
}
