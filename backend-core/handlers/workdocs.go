package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
)

// CreateWorkDoc creates a new collaborative document for a project
func CreateWorkDoc(c *fiber.Ctx) error {
	projectID := c.Params("projectId")
	if projectID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Project ID is required"})
	}

	pUUID, err := uuid.Parse(projectID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid Project ID"})
	}

	var req struct {
		Title        string `json:"title"`
		TemplateType string `json:"templateType"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if req.Title == "" {
		req.Title = "Untitled Document"
	}

	userID := c.Locals("user_id")
	userUUID, _ := uuid.Parse(userID.(string))

	if req.TemplateType == "" {
		req.TemplateType = "empty"
	}

	doc := models.WorkDoc{
		ID:           uuid.New(),
		ProjectID:    pUUID,
		Title:        req.Title,
		TemplateType: req.TemplateType,
		Content:      "", // Managed via YJS/Hocuspocus, but we keep a metadata record
		CreatedBy:    userUUID,
	}

	if err := database.DB.Create(&doc).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create document"})
	}

	return c.Status(fiber.StatusCreated).JSON(doc)
}

// GetWorkDocs returns all documents for a project
func GetWorkDocs(c *fiber.Ctx) error {
	projectID := c.Params("projectId")
	if projectID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Project ID is required"})
	}

	pUUID, err := uuid.Parse(projectID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid Project ID"})
	}

	var docs []models.WorkDoc
	if err := database.DB.Where("project_id = ?", pUUID).Order("created_at desc").Find(&docs).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch documents"})
	}

	return c.JSON(docs)
}

// GetWorkDoc returns a specific document
func GetWorkDoc(c *fiber.Ctx) error {
	docID := c.Params("docId")
	if docID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Document ID is required"})
	}

	var doc models.WorkDoc
	if err := database.DB.Where("id = ?", docID).First(&doc).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Document not found"})
	}

	return c.JSON(doc)
}

// DeleteWorkDoc deletes a document
func DeleteWorkDoc(c *fiber.Ctx) error {
	docID := c.Params("docId")
	if docID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Document ID is required"})
	}

	var doc models.WorkDoc
	if err := database.DB.Where("id = ?", docID).First(&doc).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Document not found"})
	}

	userID, _ := c.Locals("user_id").(string)
	role := c.Locals("role")
	if doc.CreatedBy.String() != userID && role != "ADMIN" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Forbidden: You do not have permission to delete this document"})
	}

	if err := database.DB.Where("id = ?", docID).Delete(&models.WorkDoc{}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete document"})
	}

	return c.JSON(fiber.Map{"message": "Document deleted successfully"})
}

// UpdateWorkDoc renames a document
func UpdateWorkDoc(c *fiber.Ctx) error {
	docID := c.Params("docId")
	if docID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Document ID is required"})
	}

	var req struct {
		Title string `json:"title"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid input"})
	}

	var doc models.WorkDoc
	if err := database.DB.Where("id = ?", docID).First(&doc).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Document not found"})
	}

	userID, _ := c.Locals("user_id").(string)
	role := c.Locals("role")
	if doc.CreatedBy.String() != userID && role != "ADMIN" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Forbidden: You do not have permission to edit this document"})
	}

	if req.Title != "" {
		doc.Title = req.Title
	}

	if err := database.DB.Save(&doc).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update document"})
	}

	return c.JSON(doc)
}
