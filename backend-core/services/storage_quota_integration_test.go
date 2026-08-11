package services

import (
	"errors"
	"os"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestConcurrentWorkspaceQuotaReservation(t *testing.T) {
	dsn := os.Getenv("STORAGE_QUOTA_TEST_DSN")
	if dsn == "" {
		t.Skip("set STORAGE_QUOTA_TEST_DSN to run the PostgreSQL concurrency test")
	}

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("connect to PostgreSQL: %v", err)
	}

	const (
		workers        = 100
		reservation    = int64(1024)
		allowedWorkers = int64(10)
	)
	workspace := models.Workspace{
		ID:                uuid.New(),
		Slug:              "quota-test-" + uuid.NewString(),
		Name:              "quota-concurrency-test",
		StorageQuotaBytes: allowedWorkers * reservation,
		StorageUsedBytes:  0,
	}
	if err := db.Create(&workspace).Error; err != nil {
		t.Fatalf("create isolated workspace: %v", err)
	}
	t.Cleanup(func() {
		if err := db.Unscoped().Delete(&models.Workspace{}, "id = ?", workspace.ID).Error; err != nil {
			t.Errorf("clean isolated workspace: %v", err)
		}
	})

	var successful atomic.Int64
	var unexpected atomic.Int64
	var wait sync.WaitGroup
	start := make(chan struct{})
	for range workers {
		wait.Add(1)
		go func() {
			defer wait.Done()
			<-start
			err := ReserveWorkspaceStorage(db, workspace.ID, reservation)
			switch {
			case err == nil:
				successful.Add(1)
			case errors.Is(err, ErrStorageQuotaExceeded):
			default:
				unexpected.Add(1)
			}
		}()
	}
	close(start)
	wait.Wait()

	if unexpected.Load() != 0 {
		t.Fatalf("unexpected reservation errors: %d", unexpected.Load())
	}
	if successful.Load() != allowedWorkers {
		t.Fatalf("successful reservations = %d, want %d", successful.Load(), allowedWorkers)
	}

	var stored models.Workspace
	if err := db.First(&stored, "id = ?", workspace.ID).Error; err != nil {
		t.Fatalf("reload workspace: %v", err)
	}
	if stored.StorageUsedBytes != stored.StorageQuotaBytes {
		t.Fatalf(
			"stored usage = %d, quota = %d; concurrent reservations over- or under-counted",
			stored.StorageUsedBytes,
			stored.StorageQuotaBytes,
		)
	}
}
