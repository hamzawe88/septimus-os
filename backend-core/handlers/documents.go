package handlers

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/events"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/datatypes"
)

// UploadDocument handles file uploads, saves them, and emits a NATS event for AI processing
func UploadDocument(c *fiber.Ctx) error {
	// 1. Get file from the multipart form
	file, err := c.FormFile("document")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "No document uploaded"})
	}

	// 2. Validate file type (allow PDF, DOCX, TXT)
	ext := strings.ToLower(filepath.Ext(file.Filename))
	if ext != ".pdf" && ext != ".docx" && ext != ".txt" && ext != ".md" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Unsupported file format. Please upload PDF, DOCX, TXT, or MD."})
	}

	// 3. Generate unique filename and save to local uploads directory
	docUUID := uuid.New()
	docID := docUUID.String()
	filename := fmt.Sprintf("%s%s", docID, ext)
	savePath := filepath.Join("./uploads/documents", filename)

	if err := c.SaveFile(file, savePath); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save document"})
	}

	// 4. Save metadata to DB using Entity Model
	userID := c.Locals("user_id")
	if userID == nil {
		userID = ""
	}
	channelID := c.FormValue("channel_id") // Optional: if uploaded inside a channel

	// For simplicity in this step, find the first workspace and project to link the entity to
	var project models.Project
	database.DB.First(&project)
	var workspace models.Workspace
	database.DB.First(&workspace)

	docEntity := models.Entity{
		ID:          docUUID,
		WorkspaceID: workspace.ID,
		ProjectID:   &project.ID,
		EntityType:  "document",
		Data:        datatypes.JSON(fmt.Appendf(nil, `{"name": "%s", "url": "/uploads/documents/%s", "size": %d, "uploader_id": "%s", "channel_id": "%s", "status": "processing"}`, file.Filename, filename, file.Size, userID, channelID)),
	}

	if err := database.DB.Create(&docEntity).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save document metadata"})
	}

	// 5. Emit NATS event for the Python AI sidecar to process (extract text, chunk, embed)
	eventPayload := map[string]interface{}{
		"document_id": docID,
		"filename":    file.Filename,
		"file_path":   savePath,
		"uploader_id": userID,
		"channel_id":  channelID,
	}
	
	eventBytes, _ := json.Marshal(eventPayload)
	err = events.PublishEvent("document.uploaded", eventBytes)
	if err != nil {
		// Log error but don't fail the request
		fmt.Printf("Warning: Failed to publish document.uploaded event: %v\n", err)
	}

	go ExecuteWorkflowsByTrigger("document.uploaded", eventPayload)

	return c.JSON(fiber.Map{
		"message": "Document uploaded successfully and queued for AI processing",
		"document_id": docID,
		"file_url": fmt.Sprintf("/uploads/documents/%s", filename),
	})
}

// GetDocuments returns all documents, optionally filtered by channel
func GetDocuments(c *fiber.Ctx) error {
	channelID := c.Query("channel_id")
	
	var entities []models.Entity
	query := database.DB.Where("entity_type = ?", "document")
	
	if channelID != "" {
		// PostgreSQL JSONB query to filter by channel_id
		query = query.Where("data->>'channel_id' = ?", channelID)
	}

	if err := query.Find(&entities).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch documents"})
	}

	return c.JSON(entities)
}
