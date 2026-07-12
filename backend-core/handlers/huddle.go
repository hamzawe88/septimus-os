package handlers

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/events"
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

	workspaceID, ok := c.Locals("workspace_id").(string)
	if !ok || workspaceID == "" {
		workspaceID = c.FormValue("workspace_id")
	}
	imageBase64 := c.FormValue("image_base64", "")

	// Ensure upload directory exists
	uploadDir := "./uploads/huddle"
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to create upload directory"})
	}

	// Generate unique filename
	filename := uuid.New().String() + filepath.Ext(file.Filename)
	if filepath.Ext(file.Filename) == "" {
		filename += ".webm"
	}
	savePath := filepath.Join(uploadDir, filename)

	if err := c.SaveFile(file, savePath); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to save audio file"})
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

	// Return the base64 audio and text to the frontend
	return c.JSON(fiber.Map{
		"text":         reply.Text,
		"audio_base64": reply.AudioBase64,
	})
}

