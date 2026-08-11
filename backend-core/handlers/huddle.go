package handlers

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/events"
	"github.com/septimus-os/backend-core/services"
)

type HuddleRequestPayload struct {
	FilePath    string `json:"file_path"`
	WorkspaceID string `json:"workspace_id"`
	ImageBase64 string `json:"image_base64,omitempty"`
}

type HuddleResponsePayload struct {
	Text        string `json:"text"`
	AudioBase64 string `json:"audio_base64"`
	Error       string `json:"error,omitempty"`
}

// HandleHuddleSpeak receives the audio file from the frontend and sends it to the AI sidecar via NATS.
func HandleHuddleSpeak(c *fiber.Ctx) error {
	file, err := c.FormFile("audio")
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "No audio file provided"})
	}
	if file.Size > 25*1024*1024 {
		return c.Status(fiber.StatusRequestEntityTooLarge).JSON(fiber.Map{"error": "audio file exceeds 25MB"})
	}
	src, err := file.Open()
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Could not inspect audio file"})
	}
	_, signatureErr := services.ValidateFileSignature(file.Filename, src)
	_ = src.Close()
	if signatureErr != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": signatureErr.Error()})
	}

	workspaceID, ok := c.Locals("workspace_id").(string)
	if !ok || workspaceID == "" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	imageBase64 := c.FormValue("image_base64", "")
	if len(imageBase64) > 8*1024*1024 {
		return c.Status(fiber.StatusRequestEntityTooLarge).JSON(fiber.Map{"error": "image payload exceeds 8MB"})
	}

	// Ensure upload directory exists
	uploadDir := filepath.Join(UploadsRoot(), "huddle")
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to create upload directory"})
	}

	// Generate unique filename
	filename := uuid.New().String() + strings.ToLower(filepath.Ext(file.Filename))
	savePath := filepath.Join(uploadDir, filename)

	if err := c.SaveFile(file, savePath); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to save audio file"})
	}
	if err := services.ScanFile(savePath); err != nil {
		_ = os.Remove(savePath)
		if errors.Is(err, services.ErrMalwareDetected) {
			return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": "Audio file was rejected by malware scanning"})
		}
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "Audio security scanning is unavailable"})
	}

	// Prepare NATS payload
	reqData := HuddleRequestPayload{
		FilePath:    savePath,
		WorkspaceID: workspaceID,
		ImageBase64: imageBase64,
	}
	reqBytes, _ := json.Marshal(reqData)

	// Send to NATS and wait for reply (timeout 30s as TTS might take a few seconds)
	replyBytes, err := events.RequestEvent("huddle.speak", reqBytes, 30*time.Second)
	if err != nil {
		// Clean up
		os.Remove(savePath)
		return c.Status(500).JSON(fiber.Map{"error": "AI Sidecar timed out or failed"})
	}

	var reply HuddleResponsePayload
	if err := json.Unmarshal(replyBytes, &reply); err != nil {
		os.Remove(savePath)
		return c.Status(500).JSON(fiber.Map{"error": "Invalid response from AI Sidecar"})
	}

	if reply.Error != "" {
		os.Remove(savePath)
		return c.Status(500).JSON(fiber.Map{"error": reply.Error})
	}
	os.Remove(savePath)

	// Return the base64 audio and text to the frontend
	return c.JSON(fiber.Map{
		"text":         reply.Text,
		"audio_base64": reply.AudioBase64,
	})
}

// HandleHuddleSummarize asks the AI sidecar to generate a summary for a latecomer
func HandleHuddleSummarize(c *fiber.Ctx) error {
	type SummarizeReq struct {
		LatecomerID string `json:"latecomer_id"`
		Lang        string `json:"lang"`
	}
	var req SummarizeReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	workspaceID, ok := c.Locals("workspace_id").(string)
	if !ok || workspaceID == "" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}

	payload := map[string]interface{}{
		"workspace_id": workspaceID,
		"latecomer_id": req.LatecomerID,
		"lang":         req.Lang,
	}
	data, _ := json.Marshal(payload)

	// Publish to Core NATS (best effort)
	if err := events.NatsConn.Publish("huddle.summarize", data); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to send to AI Sidecar"})
	}

	return c.JSON(fiber.Map{"status": "ok"})
}
