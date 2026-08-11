package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/minio/minio-go/v7"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const driveBucketName = "septimus-drive"

var driveAllowedMIMEs = map[string]map[string]bool{
	".jpg":  {"image/jpeg": true},
	".jpeg": {"image/jpeg": true},
	".png":  {"image/png": true},
	".gif":  {"image/gif": true},
	".webp": {"image/webp": true},
	".pdf":  {"application/pdf": true},
	".txt":  {"text/plain; charset=utf-8": true, "application/octet-stream": true},
	".md":   {"text/plain; charset=utf-8": true, "application/octet-stream": true},
	".csv":  {"text/plain; charset=utf-8": true, "application/octet-stream": true},
	".docx": {"application/zip": true, "application/octet-stream": true},
	".xlsx": {"application/zip": true, "application/octet-stream": true},
	".doc":  {"application/octet-stream": true},
	".xls":  {"application/octet-stream": true},
}

func driveMaxFileBytes() int64 {
	const defaultLimit = int64(25 * 1024 * 1024)
	raw := strings.TrimSpace(os.Getenv("DRIVE_MAX_FILE_BYTES"))
	if raw == "" {
		return defaultLimit
	}
	limit, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || limit <= 0 || limit > 25*1024*1024 {
		return defaultLimit
	}
	return limit
}

func inspectDriveUpload(filename string, src io.Reader) (string, io.Reader, error) {
	allowed, ok := driveAllowedMIMEs[strings.ToLower(filepath.Ext(filename))]
	if !ok {
		return "", nil, fmt.Errorf("file extension is not allowed")
	}
	header := make([]byte, 512)
	n, err := io.ReadFull(src, header)
	if err != nil && err != io.EOF && err != io.ErrUnexpectedEOF {
		return "", nil, fmt.Errorf("could not inspect file")
	}
	if n == 0 {
		return "", nil, fmt.Errorf("empty files are not allowed")
	}
	detected := http.DetectContentType(header[:n])
	if !allowed[detected] {
		return "", nil, fmt.Errorf("file content does not match its extension")
	}
	return detected, io.MultiReader(bytes.NewReader(header[:n]), src), nil
}

func backendURL() string {
	url := strings.TrimRight(os.Getenv("BACKEND_URL"), "/")
	if url == "" {
		return "http://backend-core:4000"
	}
	return url
}

func backendRequest(ctx context.Context, method, path string, body io.Reader, workspaceID string) (*http.Response, error) {
	token := os.Getenv("INTERNAL_API_TOKEN")
	if token == "" {
		return nil, fmt.Errorf("INTERNAL_API_TOKEN is not configured")
	}
	req, err := http.NewRequestWithContext(ctx, method, backendURL()+path, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Internal-Token", token)
	if workspaceID != "" {
		req.Header.Set("X-Workspace-ID", workspaceID)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return (&http.Client{Timeout: 10 * time.Second}).Do(req)
}

func backendError(response *http.Response) string {
	if response == nil {
		return "backend request failed"
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
	return string(body)
}

// UploadHandler handles streaming the file directly to MinIO and firing NATS event
func UploadHandler(c *fiber.Ctx) error {
	workspaceID := c.Locals("workspace_id").(string)
	userID := c.Locals("user_id").(string)

	file, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Failed to get file from form"})
	}
	if file.Size <= 0 || file.Size > driveMaxFileBytes() {
		return c.Status(fiber.StatusRequestEntityTooLarge).JSON(fiber.Map{"error": "File exceeds the Drive upload limit"})
	}

	src, err := file.Open()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to open file stream"})
	}
	defer src.Close()
	if err := scanUpload(src); err != nil {
		if errors.Is(err, errMalwareDetected) {
			return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": "File was rejected by malware scanning"})
		}
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "File security scanning is unavailable"})
	}

	fileID := uuid.New().String()
	objectName := fmt.Sprintf("%s/%s", workspaceID, fileID)
	fileName := filepath.Base(strings.TrimSpace(file.Filename))
	if fileName == "." || fileName == "" || len(fileName) > 255 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid file name"})
	}
	detectedMIME, uploadReader, err := inspectDriveUpload(fileName, src)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	// Upload directly to MinIO using the stream
	_, err = minioClient.PutObject(context.Background(), driveBucketName, objectName, uploadReader, file.Size, minio.PutObjectOptions{
		ContentType: detectedMIME,
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to upload file to storage"})
	}

	metadata, _ := json.Marshal(map[string]interface{}{
		"id":           fileID,
		"workspace_id": workspaceID,
		"user_id":      userID,
		"name":         fileName,
		"object_name":  objectName,
		"size":         file.Size,
		"mime_type":    detectedMIME,
		"scan_status":  "clean",
	})
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	metadataResponse, err := backendRequest(ctx, http.MethodPost, "/internal/drive/files", bytes.NewReader(metadata), workspaceID)
	if err != nil || metadataResponse.StatusCode != http.StatusCreated {
		if metadataResponse != nil {
			fmt.Printf("Failed to save drive metadata: %s\n", backendError(metadataResponse))
		}
		_ = minioClient.RemoveObject(context.Background(), driveBucketName, objectName, minio.RemoveObjectOptions{})
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "Failed to register uploaded file"})
	}
	metadataResponse.Body.Close()

	// Publish event to NATS JetStream
	eventPayload := map[string]interface{}{
		"file_id":      fileID,
		"workspace_id": workspaceID,
		"user_id":      userID,
		"file_name":    fileName,
		"size":         file.Size,
		"mime_type":    detectedMIME,
		"object_name":  objectName,
	}
	payloadBytes, _ := json.Marshal(eventPayload)

	_, err = js.Publish(context.Background(), "events.drive.file.created", payloadBytes)
	if err != nil {
		fmt.Printf("Failed to publish NATS event: %v\n", err)
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message":         "File uploaded successfully",
		"file_id":         fileID,
		"id":              fileID,
		"name":            fileName,
		"size":            file.Size,
		"url":             fmt.Sprintf("/api/v1/drive/files/%s/download", fileID),
		"status":          "ready",
		"security_policy": "malware_scan_passed",
	})
}

// InternalUpdateHandler relays the sidecar's bounded scan result to backend-core,
// which owns the tenant-scoped DriveFile persistence.
func InternalUpdateHandler(c *fiber.Ctx) error {
	fileID := c.Params("id")
	var updateData map[string]interface{}
	if err := c.BodyParser(&updateData); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	workspaceID, _ := updateData["workspace_id"].(string)
	if workspaceID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "workspace_id is required"})
	}
	delete(updateData, "workspace_id")
	body, _ := json.Marshal(updateData)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	response, err := backendRequest(ctx, http.MethodPatch, "/internal/drive/files/"+url.PathEscape(fileID), bytes.NewReader(body), workspaceID)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "Failed to update drive metadata"})
	}
	if response.StatusCode != http.StatusOK {
		message := backendError(response)
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "Failed to update drive metadata", "details": message})
	}
	defer response.Body.Close()
	var result map[string]interface{}
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "Invalid backend response"})
	}
	return c.JSON(result)
}

func streamDriveObject(c *fiber.Ctx, workspaceID string) error {
	fileID := c.Params("id")
	if _, err := uuid.Parse(fileID); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid file ID"})
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	response, err := backendRequest(ctx, http.MethodGet, "/internal/drive/files/"+url.PathEscape(fileID), nil, workspaceID)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "Failed to load drive metadata"})
	}
	if response.StatusCode != http.StatusOK {
		backendError(response)
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Drive file not found"})
	}
	defer response.Body.Close()
	var file struct {
		Name string                 `json:"name"`
		Data map[string]interface{} `json:"data"`
	}
	if err := json.NewDecoder(response.Body).Decode(&file); err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "Invalid backend response"})
	}
	objectName, _ := file.Data["object_name"].(string)
	if objectName != workspaceID+"/"+fileID {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Invalid stored object metadata"})
	}
	if status, _ := file.Data["status"].(string); status != "ready" {
		return c.Status(fiber.StatusLocked).JSON(fiber.Map{"error": "Drive file is not cleared for download"})
	}
	object, err := minioClient.GetObject(context.Background(), driveBucketName, objectName, minio.GetObjectOptions{})
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Stored file is unavailable"})
	}
	info, err := object.Stat()
	if err != nil {
		object.Close()
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Stored file is unavailable"})
	}
	c.Type(info.ContentType)
	c.Attachment(file.Name)
	// Fiber/fasthttp owns the stream after SendStream and closes io.Closer once
	// the response has been written. Closing the MinIO object in this handler
	// would terminate the body before the client (including the RAG worker) can
	// consume it.
	return c.SendStream(object, int(info.Size))
}

// DownloadHandler validates the caller's signed tenant claim, asks backend-core
// for metadata scoped to that tenant, then streams the private MinIO object.
func DownloadHandler(c *fiber.Ctx) error {
	workspaceID, _ := c.Locals("workspace_id").(string)
	if workspaceID == "" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	return streamDriveObject(c, workspaceID)
}

// InternalDownloadHandler is the only machine-to-machine content export. It is
// used by the AI sidecar while indexing a user-selected Drive file. The shared
// internal token authenticates the caller and the explicit workspace header is
// still checked against backend-owned metadata before MinIO is read.
func InternalDownloadHandler(c *fiber.Ctx) error {
	workspaceID := strings.TrimSpace(c.Get("X-Workspace-ID"))
	if _, err := uuid.Parse(workspaceID); err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "valid workspace context is required"})
	}
	return streamDriveObject(c, workspaceID)
}
