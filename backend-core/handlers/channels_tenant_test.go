package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupChannelTenantTestDB(t *testing.T) (*gorm.DB, models.User, models.User) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	for _, statement := range []string{
		`CREATE TABLE users (
			id TEXT PRIMARY KEY, workspace_id TEXT, email TEXT, password_hash TEXT,
			role TEXT, role_id TEXT, department_id TEXT, job_title TEXT,
			employee_id TEXT, avatar TEXT, data TEXT, created_at DATETIME, updated_at DATETIME
		)`,
		`CREATE TABLE channels (
			id TEXT PRIMARY KEY, workspace_id TEXT, project_id TEXT, name TEXT,
			description TEXT, type TEXT, created_by_id TEXT, is_archived BOOLEAN,
			is_system BOOLEAN, created_at DATETIME, updated_at DATETIME
		)`,
		`CREATE TABLE channel_members (
			id TEXT PRIMARY KEY, channel_id TEXT, user_id TEXT, role TEXT,
			is_muted BOOLEAN, joined_at DATETIME
		)`,
	} {
		if err := db.Exec(statement).Error; err != nil {
			t.Fatalf("create channel test table: %v", err)
		}
	}

	workspaceA, workspaceB := uuid.New(), uuid.New()
	admin := models.User{ID: uuid.New(), WorkspaceID: workspaceA, Email: "admin-a@example.test", PasswordHash: "x", Role: "Admin"}
	outsider := models.User{ID: uuid.New(), WorkspaceID: workspaceB, Email: "member-b@example.test", PasswordHash: "x", Role: "Member"}
	if err := db.Exec(
		`INSERT INTO users (id, workspace_id, email, password_hash, role) VALUES (?, ?, ?, ?, ?)`,
		admin.ID.String(), admin.WorkspaceID.String(), admin.Email, admin.PasswordHash, admin.Role,
	).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(
		`INSERT INTO users (id, workspace_id, email, password_hash, role) VALUES (?, ?, ?, ?, ?)`,
		outsider.ID.String(), outsider.WorkspaceID.String(), outsider.Email, outsider.PasswordHash, outsider.Role,
	).Error; err != nil {
		t.Fatal(err)
	}
	database.DB = db
	database.AppDB = nil
	return db, admin, outsider
}

func channelContext(user models.User, handler fiber.Handler) fiber.Handler {
	return func(c *fiber.Ctx) error {
		c.Locals("workspace_id", user.WorkspaceID.String())
		c.Locals("user_id", user.ID.String())
		c.Locals("workspace", &models.Workspace{ID: user.WorkspaceID, Name: "Test Workspace", Tier: "starter", Status: "active"})
		return handler(c)
	}
}

func TestCreateChannelRejectsCrossTenantInvite(t *testing.T) {
	db, admin, outsider := setupChannelTenantTestDB(t)
	app := fiber.New()
	app.Post("/channels", channelContext(admin, CreateChannel))

	body, _ := json.Marshal(CreateChannelRequest{Name: "private", IsPrivate: true, UserIDs: []string{outsider.ID.String()}})
	req := httptest.NewRequest(http.MethodPost, "/channels", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", resp.StatusCode)
	}
	var count int64
	db.Model(&models.Channel{}).Count(&count)
	if count != 0 {
		t.Fatalf("created %d channel(s) despite cross-tenant invite", count)
	}
}

func TestAddChannelMemberRejectsCrossTenantEmail(t *testing.T) {
	db, admin, outsider := setupChannelTenantTestDB(t)
	channel := models.Channel{ID: uuid.New(), WorkspaceID: admin.WorkspaceID, Name: "private", Type: "PRIVATE"}
	if err := db.Exec(
		`INSERT INTO channels (id, workspace_id, name, type) VALUES (?, ?, ?, ?)`,
		channel.ID.String(), channel.WorkspaceID.String(), channel.Name, channel.Type,
	).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(
		`INSERT INTO channel_members (id, channel_id, user_id, role, is_muted) VALUES (?, ?, ?, ?, ?)`,
		uuid.New().String(), channel.ID.String(), admin.ID.String(), "OWNER", false,
	).Error; err != nil {
		t.Fatal(err)
	}

	app := fiber.New()
	app.Post("/channels/:id/members", channelContext(admin, AddChannelMember))
	body, _ := json.Marshal(AddChannelMemberRequest{Email: outsider.Email})
	req := httptest.NewRequest(http.MethodPost, "/channels/"+channel.ID.String()+"/members", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", resp.StatusCode)
	}
	var count int64
	db.Model(&models.ChannelMember{}).Where("channel_id = ? AND user_id = ?", channel.ID, outsider.ID).Count(&count)
	if count != 0 {
		t.Fatal("cross-tenant user was added to the channel")
	}
}
