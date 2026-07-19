package database

import (
	"log"
	"os"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

// GetDB returns a request-scoped GORM transaction if available, otherwise returns the global DB pool
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
		Logger: logger.Default.LogMode(logger.Info),
	})

	if err != nil {
		log.Fatal("Failed to connect to database. \n", err)
	}

	log.Println("Connected to PostgreSQL successfully")

	// Enable LTREE extension for hierarchical data structures
	db.Exec(`CREATE EXTENSION IF NOT EXISTS ltree;`)
	
	// Enable pgvector extension for AI RAG embeddings
	db.Exec(`CREATE EXTENSION IF NOT EXISTS vector;`)

	// Pre-clean duplicate workspace slugs before creating unique index
	db.Exec(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS slug VARCHAR(63) NOT NULL DEFAULT 'default';`)
	db.Exec(`UPDATE workspaces SET slug = 'ws-' || SUBSTRING(id::text, 1, 8) WHERE ctid NOT IN (SELECT min(ctid) FROM workspaces GROUP BY slug);`)

	// Auto-migrate the schemas
	err = db.AutoMigrate(
		&models.Workspace{},
		&models.WorkspaceSetting{},
		&models.WorkspaceIntegration{},
		&models.Department{}, // Added Department
		&models.Role{},       // Added Role
		&models.Permission{}, // Added Permission
		&models.RolePermission{}, // Added RolePermission
		&models.User{},
		&models.OfficeLocation{}, // Added OfficeLocation
		&models.AttendanceLog{},  // Added AttendanceLog
		&models.Project{},
		&models.Sprint{},         // Added Sprint
		&models.Entity{},
		&models.Channel{},
		&models.ChannelMember{},
		&models.Message{},
		&models.Task{},
		&models.TaskHistory{},
		&models.Workflow{},
		&models.WorkflowRun{},
		&models.WebhookSubscription{}, // Added WebhookSubscription
		&models.AuditLog{},
		&models.APIKey{},
		&models.WorkDoc{},
		&models.AgentState{},
		&models.AgentCollaborationLog{},
		&models.PendingApproval{},
		&models.DocumentEmbedding{}, // Added DocumentEmbedding for RAG
		&models.CorrespondenceTemplate{}, // Added CorrespondenceTemplate
		&models.Correspondence{},         // Added Correspondence
		&models.CorrespondenceForwardLog{}, // Added CorrespondenceForwardLog
		&models.Subscription{},
		&models.Invoice{},
		&models.SaaSPlan{}, // Added SaaSPlan
		&models.PaymentGatewaySettings{}, // Added PaymentGatewaySettings
		&models.AITokenUsage{},           // AI token usage / cost dashboard
	)
	if err != nil {
		log.Fatalf("Failed to auto-migrate: %v", err)
	}

	// Enforce PostgreSQL Row-Level Security (RLS) for multi-tenant isolation
	rlsTables := []string{"entities", "messages", "tasks", "correspondences", "attendance_logs"}
	for _, tbl := range rlsTables {
		db.Exec(`ALTER TABLE ` + tbl + ` ENABLE ROW LEVEL SECURITY;`)
		// Create or replace policy
		db.Exec(`DROP POLICY IF EXISTS tenant_isolation_policy ON ` + tbl + `;`)
		db.Exec(`CREATE POLICY tenant_isolation_policy ON ` + tbl + `
			USING (
				workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
				OR current_setting('app.current_workspace_id', true) IS NULL
				OR current_setting('app.current_workspace_id', true) = ''
			);`)
	}
	log.Println("PostgreSQL Row-Level Security (RLS) policies configured on tenant tables.")

	// Normalize legacy empty-string employee ids to NULL so the unique index
	// does not block new registrations that omit employee_id
	db.Exec(`UPDATE users SET employee_id = NULL WHERE employee_id = '';`)

	// Setup Full Text Search
	db.Exec(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS tsv tsvector;`)
	db.Exec(`UPDATE messages SET tsv = to_tsvector('english', content) WHERE tsv IS NULL;`)
	db.Exec(`CREATE INDEX IF NOT EXISTS idx_messages_tsv ON messages USING GIN(tsv);`)
	db.Exec(`
		CREATE OR REPLACE FUNCTION messages_tsvector_trigger() RETURNS trigger AS $$
		begin
		  new.tsv := to_tsvector('english', new.content);
		  return new;
		end
		$$ LANGUAGE plpgsql;
	`)
	db.Exec(`
		DROP TRIGGER IF EXISTS tsvectorupdate ON messages;
		CREATE TRIGGER tsvectorupdate BEFORE INSERT OR UPDATE ON messages
		FOR EACH ROW EXECUTE PROCEDURE messages_tsvector_trigger();
	`)

	// Setup Full Text Search & ltree indexes for Correspondences
	db.Exec(`ALTER TABLE correspondences ADD COLUMN IF NOT EXISTS tsv tsvector;`)
	db.Exec(`UPDATE correspondences SET tsv = to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, '') || ' ' || coalesce(serial_number, '')) WHERE tsv IS NULL;`)
	db.Exec(`CREATE INDEX IF NOT EXISTS idx_correspondences_tsv ON correspondences USING GIN(tsv);`)
	db.Exec(`CREATE INDEX IF NOT EXISTS idx_correspondences_path_gist ON correspondences USING GIST (path);`)
	db.Exec(`
		CREATE OR REPLACE FUNCTION correspondences_tsvector_trigger() RETURNS trigger AS $$
		begin
		  new.tsv := to_tsvector('simple', coalesce(new.title, '') || ' ' || coalesce(new.content, '') || ' ' || coalesce(new.serial_number, ''));
		  return new;
		end
		$$ LANGUAGE plpgsql;
	`)
	db.Exec(`
		DROP TRIGGER IF EXISTS tsvectorupdate_correspondences ON correspondences;
		CREATE TRIGGER tsvectorupdate_correspondences BEFORE INSERT OR UPDATE ON correspondences
		FOR EACH ROW EXECUTE PROCEDURE correspondences_tsvector_trigger();
	`)

	// Setup GIN index on entities.data for ultra-fast JSONB queries
	db.Exec(`CREATE INDEX IF NOT EXISTS idx_entities_data_gin ON entities USING GIN (data);`)
	// Setup expression index for high-velocity CRM stages
	db.Exec(`CREATE INDEX IF NOT EXISTS idx_entities_crm_stage ON entities ((data->>'stage')) WHERE entity_type = 'crm_deal';`)
	// Setup BRIN indexes on time-series heavy tables to prepare for range partitioning & archiving
	db.Exec(`CREATE INDEX IF NOT EXISTS idx_messages_created_at_brin ON messages USING BRIN (created_at);`)
	db.Exec(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at_brin ON audit_logs USING BRIN (created_at);`)

	SeedRBAC(db)
	SeedPaymentGateways(db)

	DB = db
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
	var count int64
	db.Model(&models.Role{}).Count(&count)
	if count == 0 {
		adminRole := models.Role{Name: "Admin", Description: "System Administrator with full access", IsSystemRole: true}
		managerRole := models.Role{Name: "Manager", Description: "Department Manager", IsSystemRole: true}
		memberRole := models.Role{Name: "Member", Description: "Standard Employee", IsSystemRole: true}
		db.Create(&adminRole)
		db.Create(&managerRole)
		db.Create(&memberRole)
	}

	// Always ensure permissions exist (idempotent seed)
	perms := []models.Permission{
		{Name: "admin.manage", Module: "Admin"},
		{Name: "tasks.manage", Module: "Agile"},
		{Name: "attendance.manage", Module: "HR"},
		{Name: "finance.manage", Module: "Finance"},
		{Name: "correspondence.create", Module: "Correspondence"},
		{Name: "correspondence.sign", Module: "Correspondence"},
		{Name: "correspondence.forward", Module: "Correspondence"},
		{Name: "correspondence.archive", Module: "Correspondence"},
		{Name: "correspondence.view_all", Module: "Correspondence"},
	}
	for _, p := range perms {
		var existing models.Permission
		if err := db.Where("name = ?", p.Name).First(&existing).Error; err != nil {
			db.Create(&p)
		}
	}
	log.Println("Seeded/verified RBAC permissions including Correspondence module")
}

func ParseUUID(s string) uuid.UUID {
	id, _ := uuid.Parse(s)
	return id
}

