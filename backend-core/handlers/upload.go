package handlers

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// allowedExtensions defines safe file types for upload
var allowedExtensions = map[string]bool{
	".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".webp": true,
	".pdf": true, ".doc": true, ".docx": true, ".xls": true, ".xlsx": true,
	".txt": true, ".csv": true, ".zip": true,
}

// HandleUpload processes file uploads securely
func HandleUpload(c *fiber.Ctx) error {
	file, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "No file uploaded"})
	}

	// Validate extension
	ext := strings.ToLower(filepath.Ext(file.Filename))
	if !allowedExtensions[ext] {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "File type not allowed"})
	}

	// Limit file size (e.g. 10MB)
	if file.Size > 10*1024*1024 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "File size exceeds 10MB limit"})
	}

	// Generate unique filename
	newFilename := uuid.New().String() + ext
	saveDir := filepath.Join(".", "uploads")
	os.MkdirAll(saveDir, 0755)
	savePath := filepath.Join(saveDir, newFilename)

	if err := c.SaveFile(file, savePath); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save file"})
	}

	// Determine type based on extension
	attachmentType := "file"
	if ext == ".jpg" || ext == ".jpeg" || ext == ".png" || ext == ".gif" || ext == ".webp" {
		attachmentType = "image"
	}

	appURL := os.Getenv("APP_URL")
	if appURL == "" {
		appURL = "http://localhost:4000"
	}
	fileUrl := appURL + "/uploads/" + newFilename

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"url":  fileUrl,
		"type": attachmentType,
	})
}
