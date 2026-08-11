package models

import (
	"testing"

	"github.com/google/uuid"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestTenantDerivationHooks(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{
		"CREATE TABLE channels (id text primary key, workspace_id text)",
		"CREATE TABLE projects (id text primary key, workspace_id text)",
		"CREATE TABLE users (id text primary key, workspace_id text)",
	} {
		if err := db.Exec(statement).Error; err != nil {
			t.Fatal(err)
		}
	}

	workspaceID := uuid.New()
	channelID, projectID, userID := uuid.New(), uuid.New(), uuid.New()
	if err := db.Exec("INSERT INTO channels (id, workspace_id) VALUES (?, ?)", channelID.String(), workspaceID.String()).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec("INSERT INTO projects (id, workspace_id) VALUES (?, ?)", projectID.String(), workspaceID.String()).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec("INSERT INTO users (id, workspace_id) VALUES (?, ?)", userID.String(), workspaceID.String()).Error; err != nil {
		t.Fatal(err)
	}

	message := Message{ChannelID: channelID}
	if err := message.BeforeCreate(db); err != nil || message.WorkspaceID != workspaceID {
		t.Fatalf("message workspace = %s, err = %v", message.WorkspaceID, err)
	}
	task := Task{ProjectID: projectID}
	if err := task.BeforeCreate(db); err != nil || task.WorkspaceID != workspaceID {
		t.Fatalf("task workspace = %s, err = %v", task.WorkspaceID, err)
	}
	attendance := AttendanceLog{UserID: userID}
	if err := attendance.BeforeCreate(db); err != nil || attendance.WorkspaceID != workspaceID {
		t.Fatalf("attendance workspace = %s, err = %v", attendance.WorkspaceID, err)
	}
}
