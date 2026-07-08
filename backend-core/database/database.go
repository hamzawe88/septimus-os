package database

import (
	"log"
	"os"

	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

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
		&models.AIConfig{},
		&models.AgentState{},
		&models.AgentCollaborationLog{},
		&models.PendingApproval{},
		&models.DocumentEmbedding{}, // Added DocumentEmbedding for RAG
	)
	if err != nil {
		log.Fatalf("Failed to auto-migrate: %v", err)
	}

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
		CREATE TRIGGER tsvectorupdate BEFORE INSERT OR UPDATE
		ON messages FOR EACH ROW EXECUTE FUNCTION messages_tsvector_trigger();
	`)

	SeedRBAC(db)

	DB = db
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

		perms := []models.Permission{
			{Name: "admin.manage", Module: "Admin"},
			{Name: "tasks.manage", Module: "Agile"},
			{Name: "attendance.manage", Module: "HR"},
			{Name: "finance.manage", Module: "Finance"},
		}
		for _, p := range perms {
			db.Create(&p)
		}
		log.Println("Seeded default RBAC roles and permissions")
	}
}

func ParseUUID(s string) uuid.UUID {
	id, _ := uuid.Parse(s)
	return id
}
