package handlers

import (
	"encoding/json"
	"fmt"
	"path"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/datatypes"
)

type driveFileCreateRequest struct {
	ID          string `json:"id"`
	WorkspaceID string `json:"workspace_id"`
	UserID      string `json:"user_id"`
	Name        string `json:"name"`
	ObjectName  string `json:"object_name"`
	Size        int64  `json:"size"`
	MIMEType    string `json:"mime_type"`
	ScanStatus  string `json:"scan_status"`
}

type driveFileResponse struct {
	ID        uuid.UUID              `json:"id"`
	Name      string                 `json:"name"`
	CreatedAt string                 `json:"created_at"`
	UpdatedAt string                 `json:"updated_at"`
	Data      map[string]interface{} `json:"data"`
}

func parseDriveWorkspace(c *fiber.Ctx) (uuid.UUID, error) {
	workspaceID, err := uuid.Parse(c.Get("X-Workspace-ID"))
	if err != nil || workspaceID == uuid.Nil {
		return uuid.Nil, fmt.Errorf("workspace context is required")
	}
	return workspaceID, nil
}

func driveFileData(file models.DriveFile) map[string]interface{} {
	data := map[string]interface{}{}
	_ = json.Unmarshal(file.Data, &data)
	return data
}

func publicDriveFileData(file models.DriveFile) map[string]interface{} {
	data := driveFileData(file)
	// The object key is an implementation detail used only by septimus-drive
	// after it has performed its own JWT and tenant check. Browsers receive the
	// opaque, authenticated download route instead.
	delete(data, "object_name")
	return data
}

// CreateDriveFileInternal records a successful MinIO upload before any
// asynchronous processing starts. The storage service supplies all immutable
// object metadata; the object path is constrained to its tenant and file ID.
func CreateDriveFileInternal(c *fiber.Ctx) error {
	var req driveFileCreateRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	fileID, err := uuid.Parse(req.ID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid file id"})
	}
	workspaceID, err := uuid.Parse(req.WorkspaceID)
	if err != nil || workspaceID == uuid.Nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid workspace id"})
	}
	if CurrentWorkspaceID(c) != workspaceID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace metadata does not match request context"})
	}
	userID, err := uuid.Parse(req.UserID)
	if err != nil || userID == uuid.Nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid user id"})
	}
	name := strings.TrimSpace(req.Name)
	if name == "" || len(name) > 255 || req.Size < 0 || strings.TrimSpace(req.MIMEType) == "" || req.ScanStatus != "clean" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid drive file metadata"})
	}
	if req.ObjectName != path.Join(workspaceID.String(), fileID.String()) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid object name"})
	}

	var user models.User
	if err := database.DB.Select("id").Where("id = ? AND workspace_id = ?", userID, workspaceID).First(&user).Error; err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "user is not a workspace member"})
	}
	metadata, _ := json.Marshal(map[string]interface{}{
		"object_name":     req.ObjectName,
		"size":            req.Size,
		"mime_type":       req.MIMEType,
		"status":          "ready",
		"security_policy": "malware_scan_passed",
		"url":             fmt.Sprintf("/api/v1/drive/files/%s/download", fileID),
	})
	file := models.DriveFile{
		ID:          fileID,
		WorkspaceID: workspaceID,
		Name:        name,
		Data:        datatypes.JSON(metadata),
	}
	if err := database.DB.Create(&file).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to save drive file metadata"})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"id": fileID, "data": driveFileData(file)})
}

// GetDriveFileInternal is used only by the Drive service after it has
// authenticated the caller's JWT. It is explicitly scoped to the claimed
// workspace before returning an object name for MinIO retrieval.
func GetDriveFileInternal(c *fiber.Ctx) error {
	workspaceID, err := parseDriveWorkspace(c)
	if err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	}
	fileID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid file id"})
	}
	var file models.DriveFile
	if err := database.DB.Where("id = ? AND workspace_id = ?", fileID, workspaceID).First(&file).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "drive file not found"})
	}
	return c.JSON(driveFileResponse{ID: file.ID, Name: file.Name, CreatedAt: file.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"), UpdatedAt: file.UpdatedAt.UTC().Format("2006-01-02T15:04:05Z"), Data: driveFileData(file)})
}

// UpdateDriveFileInternal merges the measured analysis state. Only the
// documented analysis keys may change, keeping immutable MinIO location and
// tenant metadata out of sidecar control.
func UpdateDriveFileInternal(c *fiber.Ctx) error {
	workspaceID, err := parseDriveWorkspace(c)
	if err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	}
	fileID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid file id"})
	}
	var updates map[string]interface{}
	if err := c.BodyParser(&updates); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	allowed := map[string]bool{"status": true, "security_policy": true, "ai_tags": true, "ai_summary": true}
	for key := range updates {
		if !allowed[key] {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "unsupported drive metadata field"})
		}
	}
	var file models.DriveFile
	if err := database.DB.Where("id = ? AND workspace_id = ?", fileID, workspaceID).First(&file).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "drive file not found"})
	}
	data := driveFileData(file)
	for key, value := range updates {
		data[key] = value
	}
	serialized, err := json.Marshal(data)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid metadata"})
	}
	if err := database.DB.Model(&file).Update("data", datatypes.JSON(serialized)).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to update drive file"})
	}
	return c.JSON(fiber.Map{"id": file.ID, "data": data})
}

// ListDriveFiles is the authenticated UI read model. No storage object name is
// exposed to browsers: downloads always go through the JWT-gated Drive route.
func ListDriveFiles(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	var files []models.DriveFile
	if err := database.GetDB(c).Where("workspace_id = ?", workspaceID).Order("created_at DESC").Limit(100).Find(&files).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to list drive files"})
	}
	response := make([]driveFileResponse, 0, len(files))
	for _, file := range files {
		response = append(response, driveFileResponse{ID: file.ID, Name: file.Name, CreatedAt: file.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"), UpdatedAt: file.UpdatedAt.UTC().Format("2006-01-02T15:04:05Z"), Data: publicDriveFileData(file)})
	}
	return c.JSON(response)
}
