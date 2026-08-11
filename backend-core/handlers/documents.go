package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/events"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
	"gorm.io/datatypes"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// UploadDocument handles file uploads, saves them, and emits a NATS event for AI processing
func UploadDocument(c *fiber.Ctx) error {
	// 1. Get file from the multipart form
	file, err := c.FormFile("document")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "No document uploaded"})
	}

	// 2. Validate file type (allow PDF, DOCX, TXT, MD)
	ext := strings.ToLower(filepath.Ext(file.Filename))
	if ext != ".pdf" && ext != ".docx" && ext != ".txt" && ext != ".md" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Unsupported file format. Please upload PDF, DOCX, TXT, or MD."})
	}
	src, err := file.Open()
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Could not inspect uploaded document"})
	}
	detectedMIME, signatureErr := services.ValidateFileSignature(file.Filename, src)
	_ = src.Close()
	if signatureErr != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": signatureErr.Error()})
	}

	// 3. Quota Checks
	db := database.GetDB(c)
	// Must be THIS caller's workspace: a bare First() charged the upload against
	// an arbitrary tenant's quota and let it through on someone else's headroom.
	ws, ok := CurrentWorkspace(c)
	if !ok {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Workspace not found"})
	}
	workspace := *ws

	if workspace.StorageQuotaBytes > 0 &&
		workspace.StorageUsedBytes+file.Size > workspace.StorageQuotaBytes {
		return c.Status(fiber.StatusPaymentRequired).JSON(fiber.Map{"error": "Workspace storage quota exceeded. Please upgrade your plan."})
	}

	folderID := c.FormValue("folder_id")
	var folder models.Entity
	var folderData map[string]interface{}

	if folderID != "" {
		if err := db.Where("id = ? AND workspace_id = ? AND entity_type = ?", folderID, workspace.ID, "folder").First(&folder).Error; err == nil {
			if err := json.Unmarshal(folder.Data, &folderData); err == nil {
				quotaBytes, quotaOK := jsonNumber(folderData["quota_bytes"])
				usedBytes, usedOK := jsonNumber(folderData["used_bytes"])
				maxFileSize, maxOK := jsonNumber(folderData["max_file_size_bytes"])
				if !quotaOK || !usedOK || !maxOK || quotaBytes < 0 || usedBytes < 0 || maxFileSize <= 0 {
					return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid folder quota metadata"})
				}

				if file.Size > maxFileSize {
					return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": fmt.Sprintf("File size %d bytes exceeds the folder limit of %d bytes", file.Size, maxFileSize)})
				}

				if usedBytes+file.Size > quotaBytes {
					return c.Status(fiber.StatusInsufficientStorage).JSON(fiber.Map{"error": "Folder storage quota exceeded."})
				}
			}
		} else {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid folder ID"})
		}
	}

	// 4. Generate unique filename and save to local uploads directory
	docUUID := uuid.New()
	docID := docUUID.String()
	filename := fmt.Sprintf("%s%s", docID, ext)
	savePath := filepath.Join(UploadsRoot(), "documents", filename)
	if err := os.MkdirAll(filepath.Dir(savePath), 0750); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to prepare document storage"})
	}

	if err := c.SaveFile(file, savePath); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save document"})
	}
	if err := services.ScanFile(savePath); err != nil {
		_ = os.Remove(savePath)
		if errors.Is(err, services.ErrMalwareDetected) {
			return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": "Document was rejected by malware scanning"})
		}
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "Document security scanning is unavailable"})
	}

	// 5. Reserve quota and save metadata atomically. TenantEnforcer already
	// owns the request transaction, so use a savepoint instead of nesting one.
	tx := db
	savepoint := "document_upload"
	if err := tx.SavePoint(savepoint).Error; err != nil {
		_ = os.Remove(savePath)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to start document transaction"})
	}
	rollback := func() {
		_ = tx.RollbackTo(savepoint).Error
		_ = os.Remove(savePath)
	}

	var lockedWorkspace models.Workspace
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("id = ?", workspace.ID).First(&lockedWorkspace).Error; err != nil {
		rollback()
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to lock workspace quota"})
	}
	if lockedWorkspace.StorageQuotaBytes > 0 &&
		lockedWorkspace.StorageUsedBytes+file.Size > lockedWorkspace.StorageQuotaBytes {
		rollback()
		return c.Status(fiber.StatusPaymentRequired).JSON(fiber.Map{"error": "Workspace storage quota exceeded. Please upgrade your plan."})
	}

	var lockedFolderUsed int64
	if folderID != "" {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ? AND workspace_id = ? AND entity_type = ?", folderID, workspace.ID, "folder").
			First(&folder).Error; err != nil {
			rollback()
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid folder ID"})
		}
		if err := json.Unmarshal(folder.Data, &folderData); err != nil {
			rollback()
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid folder quota metadata"})
		}
		quotaBytes, quotaOK := jsonNumber(folderData["quota_bytes"])
		usedBytes, usedOK := jsonNumber(folderData["used_bytes"])
		maxFileSize, maxOK := jsonNumber(folderData["max_file_size_bytes"])
		if !quotaOK || !usedOK || !maxOK || quotaBytes < 0 || usedBytes < 0 || maxFileSize <= 0 {
			rollback()
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid folder quota metadata"})
		}
		if file.Size > maxFileSize {
			rollback()
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": fmt.Sprintf("File size %d bytes exceeds the folder limit of %d bytes", file.Size, maxFileSize)})
		}
		if usedBytes+file.Size > quotaBytes {
			rollback()
			return c.Status(fiber.StatusInsufficientStorage).JSON(fiber.Map{"error": "Folder storage quota exceeded."})
		}
		lockedFolderUsed = usedBytes
	}

	userID := c.Locals("user_id")
	if userID == nil {
		userID = ""
	}
	channelID := c.FormValue("channel_id")

	// Attach to a project owned by this workspace, or to none. A bare First()
	// here filed the document under another tenant's project.
	var project models.Project
	var projectIDPtr *uuid.UUID
	if err := tx.Where("workspace_id = ?", workspace.ID).Order("created_at ASC").First(&project).Error; err == nil {
		projectIDPtr = &project.ID
	}

	docData := map[string]interface{}{
		"name":        file.Filename,
		"url":         fmt.Sprintf("/api/v1/documents/%s/download", docID),
		"size":        file.Size,
		"mime_type":   detectedMIME,
		"uploader_id": userID,
		"channel_id":  channelID,
		"status":      "processing",
	}
	if folderID != "" {
		docData["folder_id"] = folderID
	}
	docDataBytes, _ := json.Marshal(docData)

	docEntity := models.Entity{
		ID:          docUUID,
		WorkspaceID: workspace.ID,
		ProjectID:   projectIDPtr,
		EntityType:  "document",
		Data:        datatypes.JSON(docDataBytes),
	}

	if err := tx.Create(&docEntity).Error; err != nil {
		rollback()
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save document metadata"})
	}

	if err := tx.Model(&models.Workspace{}).Where("id = ?", workspace.ID).
		Update("storage_used_bytes", gorm.Expr("storage_used_bytes + ?", file.Size)).Error; err != nil {
		rollback()
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update workspace storage"})
	}

	if folderID != "" && folderData != nil {
		folderData["used_bytes"] = lockedFolderUsed + file.Size
		newFolderData, _ := json.Marshal(folderData)
		if err := tx.Model(&folder).Update("data", datatypes.JSON(newFolderData)).Error; err != nil {
			rollback()
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update folder storage"})
		}
	}

	// 6. Emit NATS event for the Python AI sidecar to process (extract text, chunk, embed)
	eventPayload := map[string]interface{}{
		"document_id":  docID,
		"filename":     file.Filename,
		"file_path":    savePath,
		"uploader_id":  userID,
		"channel_id":   channelID,
		"workspace_id": workspace.ID.String(),
	}

	if events.NatsConn != nil {
		err = events.PublishTenantEvent("events.document.uploaded", workspace.ID, eventPayload)
	}
	if err != nil {
		// Log error but don't fail the request
		fmt.Printf("Warning: Failed to publish document.uploaded event: %v\n", err)
	}

	go ExecuteWorkflowsByTrigger(CurrentWorkspaceID(c), "document.uploaded", eventPayload)

	return c.JSON(fiber.Map{
		"message":     "Document uploaded successfully and queued for AI processing",
		"document_id": docID,
		"file_url":    fmt.Sprintf("/api/v1/documents/%s/download", docID),
		"name":        file.Filename,
		"size":        file.Size,
	})
}

// UpdateDocumentIndexStatusInternal records the outcome of asynchronous text
// extraction. The sidecar is required to send its trusted workspace header, so
// a document ID alone can never update a different tenant's metadata.
func UpdateDocumentIndexStatusInternal(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	documentID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid document id"})
	}
	var req struct {
		Status        string `json:"status"`
		IndexedChunks int    `json:"indexed_chunks"`
		Error         string `json:"error"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	if req.Status != "ready" && req.Status != "failed" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid document index status"})
	}
	if req.IndexedChunks < 0 || req.IndexedChunks > 100000 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid indexed chunk count"})
	}

	var document models.Entity
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ? AND entity_type = ?", documentID, workspaceID, "document").First(&document).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "document not found"})
	}
	data := map[string]interface{}{}
	if err := json.Unmarshal(document.Data, &data); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "invalid document metadata"})
	}
	data["status"] = req.Status
	data["indexed_chunks"] = req.IndexedChunks
	if req.Status == "failed" {
		data["index_error"] = strings.TrimSpace(req.Error)
	} else {
		delete(data, "index_error")
	}
	serialized, _ := json.Marshal(data)
	if err := database.GetDB(c).Model(&document).Update("data", datatypes.JSON(serialized)).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to update document index status"})
	}
	return c.JSON(fiber.Map{"status": req.Status, "indexed_chunks": req.IndexedChunks})
}

// DownloadDocument authorizes and streams a RAG document. The filename comes
// only from the entity we loaded for this workspace; no user supplied path is
// ever joined onto the uploads root.
func DownloadDocument(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	documentID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid document id"})
	}

	var document models.Entity
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ? AND entity_type = ?", documentID, workspaceID, "document").First(&document).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "document not found"})
	}
	var data map[string]interface{}
	if err := json.Unmarshal(document.Data, &data); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "invalid document metadata"})
	}
	name, _ := data["name"].(string)
	if name == "" {
		name = "document"
	}
	// UploadDocument creates a deterministic UUID filename. Deriving it from
	// the entity id keeps legacy URL fields from becoming a path traversal input.
	ext := filepath.Ext(name)
	if ext != ".pdf" && ext != ".docx" && ext != ".txt" && ext != ".md" {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "invalid document extension"})
	}
	path := filepath.Join(UploadsRoot(), "documents", documentID.String()+ext)
	if _, err := os.Stat(path); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "stored document is unavailable"})
	}
	c.Attachment(name)
	return c.SendFile(path)
}

// GetDocuments returns all documents, optionally filtered by channel
func GetDocuments(c *fiber.Ctx) error {
	channelID := c.Query("channel_id")

	// Filtered in code as well as by the row-level policy. The policy alone is
	// enough only while the request runs on the restricted pool; a super-admin
	// or a fallback to the privileged pool would otherwise list every tenant's
	// documents, and defence that exists in exactly one layer is not defence.
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}

	var entities []models.Entity
	query := database.GetDB(c).Where("workspace_id = ? AND entity_type = ?", workspaceID, "document")

	if channelID != "" {
		// PostgreSQL JSONB query to filter by channel_id
		query = query.Where("data->>'channel_id' = ?", channelID)
	}

	if err := query.Find(&entities).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch documents"})
	}

	return c.JSON(entities)
}

// ImportDocumentFromDrive creates a Knowledge Base document that references a
// private Drive object, then queues the AI sidecar to fetch that object over the
// internal, tenant-scoped Drive endpoint. No public URL or MinIO object key is
// exposed and no second persistent copy of the file is created.
func ImportDocumentFromDrive(c *fiber.Ctx) error {
	type ImportRequest struct {
		FileID string `json:"file_id"`
	}

	var req ImportRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	if strings.TrimSpace(req.FileID) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "file_id is required"})
	}
	driveFileID, err := uuid.Parse(req.FileID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid fileId"})
	}
	var driveFile models.DriveFile
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", driveFileID, workspaceID).First(&driveFile).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "drive file not found in workspace"})
	}
	metadata := map[string]interface{}{}
	if err := json.Unmarshal(driveFile.Data, &metadata); err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": "drive file metadata is invalid"})
	}
	status, _ := metadata["status"].(string)
	securityPolicy, _ := metadata["security_policy"].(string)
	mimeType, _ := metadata["mime_type"].(string)
	size, sizeOK := jsonNumber(metadata["size"])
	ext := strings.ToLower(filepath.Ext(driveFile.Name))
	allowedExtension := ext == ".pdf" || ext == ".docx" || ext == ".txt" || ext == ".md"
	if status != "ready" || securityPolicy != "malware_scan_passed" {
		return c.Status(fiber.StatusLocked).JSON(fiber.Map{"error": "drive file has not passed security scanning"})
	}
	if !allowedExtension || !sizeOK || size <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "drive file is not an indexable PDF, DOCX, TXT, or MD document"})
	}

	db := database.GetDB(c)
	var document models.Entity
	lookup := db.Where(
		"workspace_id = ? AND entity_type = ? AND data->>'source_drive_file_id' = ?",
		workspaceID, "document", driveFileID.String(),
	).First(&document)
	alreadyCreated := lookup.Error == nil
	if lookup.Error != nil && !errors.Is(lookup.Error, gorm.ErrRecordNotFound) {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to inspect knowledge base"})
	}

	documentData := map[string]interface{}{
		"name":                 driveFile.Name,
		"url":                  fmt.Sprintf("/api/v1/drive/files/%s/download", driveFileID),
		"size":                 size,
		"mime_type":            mimeType,
		"status":               "processing",
		"source":               "drive",
		"source_drive_file_id": driveFileID.String(),
	}
	if userID, err := uuid.Parse(fmt.Sprint(c.Locals("user_id"))); err == nil {
		documentData["uploader_id"] = userID.String()
	}
	if alreadyCreated {
		existingData := map[string]interface{}{}
		_ = json.Unmarshal(document.Data, &existingData)
		if existingData["status"] == "ready" {
			return c.JSON(fiber.Map{"document": document, "already_indexed": true})
		}
		for key, value := range documentData {
			existingData[key] = value
		}
		delete(existingData, "index_error")
		serialized, _ := json.Marshal(existingData)
		if err := db.Model(&document).Update("data", datatypes.JSON(serialized)).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to retry drive document import"})
		}
	} else {
		var project models.Project
		var projectID *uuid.UUID
		if err := db.Where("workspace_id = ?", workspaceID).Order("created_at ASC").First(&project).Error; err == nil {
			projectID = &project.ID
		}
		serialized, _ := json.Marshal(documentData)
		document = models.Entity{
			ID:          uuid.New(),
			WorkspaceID: workspaceID,
			ProjectID:   projectID,
			EntityType:  "document",
			Data:        datatypes.JSON(serialized),
		}
		if err := db.Create(&document).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create knowledge document"})
		}
	}

	eventPayload := map[string]interface{}{
		"document_id":   document.ID.String(),
		"drive_file_id": driveFileID.String(),
		"filename":      driveFile.Name,
		"source":        "drive",
		"workspace_id":  workspaceID.String(),
	}
	if uploaderID, ok := documentData["uploader_id"]; ok {
		eventPayload["uploader_id"] = uploaderID
	}

	if events.NatsConn == nil {
		err = errors.New("document indexing queue is unavailable")
	} else {
		err = events.PublishTenantEvent("events.document.uploaded", workspaceID, eventPayload)
	}
	if err != nil {
		failedData := documentData
		failedData["status"] = "failed"
		failedData["index_error"] = "Document indexing queue is unavailable"
		serialized, _ := json.Marshal(failedData)
		_ = db.Model(&document).Update("data", datatypes.JSON(serialized)).Error
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "failed to queue document for AI processing"})
	}

	go ExecuteWorkflowsByTrigger(CurrentWorkspaceID(c), "document.uploaded", eventPayload)

	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{
		"message":     "Document from Drive successfully queued for AI processing",
		"document_id": document.ID,
		"document":    document,
	})
}

func jsonNumber(value interface{}) (int64, bool) {
	switch n := value.(type) {
	case float64:
		return int64(n), n >= 0
	case float32:
		return int64(n), n >= 0
	case int:
		return int64(n), n >= 0
	case int64:
		return n, n >= 0
	case json.Number:
		parsed, err := n.Int64()
		return parsed, err == nil && parsed >= 0
	default:
		return 0, false
	}
}

// GetFolders returns all folders for the workspace, creating defaults if none exist
func GetFolders(c *fiber.Ctx) error {
	db := database.GetDB(c)
	var folders []models.Entity

	// The tenant comes from the request, not from whatever row the workspaces
	// table returns first — the old bare First() made this handler read and
	// create folders inside a foreign workspace.
	workspace, ok := CurrentWorkspace(c)
	if !ok {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Workspace not found"})
	}

	db.Where("entity_type = ? AND workspace_id = ?", "folder", workspace.ID).Find(&folders)

	if len(folders) == 0 {
		// Create default folders
		defaultNames := []string{"Engineering", "Finance", "HR", "Marketing"}
		for _, name := range defaultNames {
			folderID := uuid.New()
			// Default 100MB quota per folder, max 10MB file size
			folder := models.Entity{
				ID:          folderID,
				WorkspaceID: workspace.ID,
				EntityType:  "folder",
				Data:        datatypes.JSON(fmt.Sprintf(`{"name": "%s", "quota_bytes": 104857600, "used_bytes": 0, "max_file_size_bytes": 10485760}`, name)),
			}
			db.Create(&folder)
			folders = append(folders, folder)
		}
	}

	return c.JSON(folders)
}

// UpdateFolder updates a folder's storage quota and max file size limits
func UpdateFolder(c *fiber.Ctx) error {
	folderID := c.Params("id")

	type UpdateFolderRequest struct {
		QuotaBytes       int64 `json:"quota_bytes"`
		MaxFileSizeBytes int64 `json:"max_file_size_bytes"`
	}

	var req UpdateFolderRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	db := database.GetDB(c)
	var folder models.Entity

	if err := db.Where("id = ? AND entity_type = ?", folderID, "folder").First(&folder).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Folder not found"})
	}

	var folderData map[string]interface{}
	if err := json.Unmarshal(folder.Data, &folderData); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to parse folder data"})
	}

	if req.QuotaBytes > 0 {
		folderData["quota_bytes"] = req.QuotaBytes
	}
	if req.MaxFileSizeBytes > 0 {
		folderData["max_file_size_bytes"] = req.MaxFileSizeBytes
	}

	newFolderData, _ := json.Marshal(folderData)
	db.Model(&folder).Update("data", datatypes.JSON(newFolderData))

	return c.JSON(fiber.Map{
		"message": "Folder updated successfully",
		"folder":  folder,
	})
}
