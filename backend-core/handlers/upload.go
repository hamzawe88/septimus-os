package handlers

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
	"gorm.io/gorm"
)

// allowedExtensions defines safe file types for upload
var allowedExtensions = map[string]bool{
	".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".webp": true,
	".pdf": true, ".doc": true, ".docx": true, ".xls": true, ".xlsx": true,
	".txt": true, ".csv": true,
}

// HandleUpload processes file uploads securely and tracks storage quotas
func HandleUpload(c *fiber.Ctx) error {
	workspaceIDStr, _ := c.Locals("workspace_id").(string)
	userIDStr, _ := c.Locals("user_id").(string)

	if workspaceIDStr == "" || userIDStr == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized"})
	}

	departmentIDStr := c.FormValue("department_id") // Optional

	file, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "No file uploaded"})
	}

	// Validate extension
	ext := strings.ToLower(filepath.Ext(file.Filename))
	if !allowedExtensions[ext] {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "File type not allowed"})
	}
	src, err := file.Open()
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Could not inspect uploaded file"})
	}
	detectedMIME, signatureErr := services.ValidateFileSignature(file.Filename, src)
	_ = src.Close()
	if signatureErr != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": signatureErr.Error()})
	}

	db := database.GetDB(c)

	// Fetch Workspace to check quota
	var workspace models.Workspace
	if err := db.First(&workspace, "id = ?", workspaceIDStr).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch workspace"})
	}

	// Check Workspace Quota (if StorageQuotaBytes > 0)
	if workspace.StorageQuotaBytes > 0 && workspace.StorageUsedBytes+file.Size > workspace.StorageQuotaBytes {
		return c.Status(fiber.StatusRequestEntityTooLarge).JSON(fiber.Map{"error": "Workspace storage quota exceeded"})
	}

	var department *models.Department
	maxFileSize := int64(10 * 1024 * 1024) // 10MB default

	if departmentIDStr != "" {
		var dept models.Department
		if err := db.Where("id = ? AND workspace_id = ?", departmentIDStr, workspaceIDStr).First(&dept).Error; err == nil {
			department = &dept
			// Department File Size Limit
			if dept.MaxFileSize > 0 {
				maxFileSize = dept.MaxFileSize
			}
			// Department Storage Limit
			if dept.StorageQuotaBytes > 0 && dept.StorageUsedBytes+file.Size > dept.StorageQuotaBytes {
				return c.Status(fiber.StatusRequestEntityTooLarge).JSON(fiber.Map{"error": "Department storage quota exceeded"})
			}
		} else {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Department not found in workspace"})
		}
	}

	// Limit file size
	if file.Size > maxFileSize {
		return c.Status(fiber.StatusRequestEntityTooLarge).JSON(fiber.Map{"error": "File size exceeds the maximum allowed size"})
	}

	// Generate unique filename and setup directories
	newFilename := uuid.New().String() + ext

	dirPath := filepath.Join(UploadsRoot(), workspaceIDStr)
	if departmentIDStr != "" {
		dirPath = filepath.Join(dirPath, departmentIDStr)
	} else {
		dirPath = filepath.Join(dirPath, "global")
	}

	os.MkdirAll(dirPath, 0755)
	savePath := filepath.Join(dirPath, newFilename)

	if err := c.SaveFile(file, savePath); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save file"})
	}
	if err := services.ScanFile(savePath); err != nil {
		_ = os.Remove(savePath)
		if errors.Is(err, services.ErrMalwareDetected) {
			return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": "File was rejected by malware scanning"})
		}
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "File security scanning is unavailable"})
	}

	// TenantEnforcer already owns the request transaction. A savepoint keeps
	// the quota reservation and metadata insert atomic without opening a broken
	// nested transaction.
	tx := db
	savepoint := "generic_file_upload"
	if err := tx.SavePoint(savepoint).Error; err != nil {
		_ = os.Remove(savePath)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to start upload transaction"})
	}
	rollback := func() {
		_ = tx.RollbackTo(savepoint).Error
		_ = os.Remove(savePath)
	}

	var deptIDPtr *uuid.UUID
	if departmentIDStr != "" {
		parsedDeptID, err := uuid.Parse(departmentIDStr)
		if err == nil {
			deptIDPtr = &parsedDeptID
		}
	}

	parsedWorkspaceID, _ := uuid.Parse(workspaceIDStr)
	parsedUserID, _ := uuid.Parse(userIDStr)

	fileRecord := models.FileRecord{
		WorkspaceID:  parsedWorkspaceID,
		DepartmentID: deptIDPtr,
		UploadedBy:   parsedUserID,
		FileName:     newFilename,
		OriginalName: file.Filename,
		MimeType:     detectedMIME,
		SizeBytes:    file.Size,
		FilePath:     savePath,
	}

	// Reserve quota with one conditional UPDATE. Two concurrent uploads cannot
	// both pass this predicate against the same workspace row.
	if err := services.ReserveWorkspaceStorage(tx, parsedWorkspaceID, file.Size); err != nil {
		rollback()
		if errors.Is(err, services.ErrStorageQuotaExceeded) {
			return c.Status(fiber.StatusRequestEntityTooLarge).JSON(fiber.Map{"error": "Workspace storage quota exceeded"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update workspace storage"})
	}

	// Update Department usage
	if department != nil {
		departmentReservation := tx.Model(&models.Department{}).
			Where("id = ? AND workspace_id = ? AND (storage_quota_bytes <= 0 OR storage_used_bytes + ? <= storage_quota_bytes)", department.ID, parsedWorkspaceID, file.Size).
			Update("storage_used_bytes", gorm.Expr("storage_used_bytes + ?", file.Size))
		if departmentReservation.Error != nil {
			rollback()
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update department storage"})
		}
		if departmentReservation.RowsAffected != 1 {
			rollback()
			return c.Status(fiber.StatusRequestEntityTooLarge).JSON(fiber.Map{"error": "Department storage quota exceeded"})
		}
	}

	if err := tx.Create(&fileRecord).Error; err != nil {
		rollback()
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save file record"})
	}

	// Determine type based on extension
	attachmentType := "file"
	if ext == ".jpg" || ext == ".jpeg" || ext == ".png" || ext == ".gif" || ext == ".webp" {
		attachmentType = "image"
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		// Files are never served from the public uploads directory. The download
		// route rechecks the caller's workspace before it opens this path.
		"url":  fmt.Sprintf("/api/v1/files/%s/download", fileRecord.ID),
		"type": attachmentType,
		"id":   fileRecord.ID.String(),
	})
}

// DownloadFile serves a generic attachment after resolving it through the
// workspace-scoped FileRecord, rather than exposing the uploads volume as a
// public static directory.
func DownloadFile(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}

	fileID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid file id"})
	}
	var file models.FileRecord
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", fileID, workspaceID).First(&file).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "file not found"})
	}
	if file.FilePath == "" || !strings.HasPrefix(filepath.Clean(file.FilePath), filepath.Clean(UploadsRoot())+string(os.PathSeparator)) {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "invalid stored file path"})
	}
	if _, err := os.Stat(file.FilePath); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "stored file is unavailable"})
	}
	c.Attachment(file.OriginalName)
	return c.SendFile(file.FilePath)
}

// DeleteFile deletes a file and updates storage quotas
func DeleteFile(c *fiber.Ctx) error {
	fileID := c.Params("id")
	workspaceIDStr, _ := c.Locals("workspace_id").(string)
	userIDStr, _ := c.Locals("user_id").(string)
	role, _ := c.Locals("role").(string)

	db := database.GetDB(c)

	var fileRecord models.FileRecord
	if err := db.Where("id = ? AND workspace_id = ?", fileID, workspaceIDStr).First(&fileRecord).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "File not found"})
	}
	if fileRecord.UploadedBy.String() != userIDStr &&
		!strings.EqualFold(role, "admin") &&
		!strings.EqualFold(role, "owner") &&
		!strings.EqualFold(role, "super_admin") {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "You do not have permission to delete this file"})
	}
	cleanPath := filepath.Clean(fileRecord.FilePath)
	cleanRoot := filepath.Clean(UploadsRoot()) + string(os.PathSeparator)
	if !strings.HasPrefix(cleanPath, cleanRoot) {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Invalid stored file path"})
	}

	tx := db.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// Delete from DB
	if err := tx.Delete(&fileRecord).Error; err != nil {
		tx.Rollback()
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete file record"})
	}

	// Update Workspace usage
	if err := tx.Model(&models.Workspace{}).Where("id = ?", workspaceIDStr).Update("storage_used_bytes", gorm.Expr("GREATEST(0, storage_used_bytes - ?)", fileRecord.SizeBytes)).Error; err != nil {
		tx.Rollback()
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update workspace storage"})
	}

	// Update Department usage
	if fileRecord.DepartmentID != nil {
		if err := tx.Model(&models.Department{}).Where("id = ?", *fileRecord.DepartmentID).Update("storage_used_bytes", gorm.Expr("GREATEST(0, storage_used_bytes - ?)", fileRecord.SizeBytes)).Error; err != nil {
			tx.Rollback()
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update department storage"})
		}
	}

	if err := tx.Commit().Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Transaction failed"})
	}

	// Delete from disk
	_ = os.Remove(cleanPath)

	return c.Status(fiber.StatusOK).JSON(fiber.Map{"message": "File deleted successfully"})
}
