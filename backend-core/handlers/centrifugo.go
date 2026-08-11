package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

func getCentrifugoAPIURL() string {
	url := os.Getenv("CENTRIFUGO_API_URL")
	if url == "" {
		return "http://centrifugo:8000/api"
	}
	return url
}

// Both Centrifugo secrets used to fall back to a published default
// ("supersecretapikey" / "supersecretcentrifugokey"). Those values are in the
// example compose file and in this repository's history, so a deployment that
// simply forgot to set them was not weakly secured — it was openly secured:
// anyone could mint a connection JWT for any user id and read that user's
// realtime channels, or publish into any channel via the HTTP API.
//
// They are now required, matching JWT_SECRET (refuses to boot) and
// INTERNAL_API_TOKEN (returns 503). Realtime degrades instead of running on a
// secret everyone knows — a failure the operator can see beats a silent one.
func getCentrifugoAPIKey() (string, error) {
	key := os.Getenv("CENTRIFUGO_API_KEY")
	if key == "" {
		return "", fmt.Errorf("CENTRIFUGO_API_KEY is not set")
	}
	return key, nil
}

func getCentrifugoHMAC() ([]byte, error) {
	secret := os.Getenv("CENTRIFUGO_SECRET")
	if secret == "" {
		return nil, fmt.Errorf("CENTRIFUGO_SECRET is not set")
	}
	return []byte(secret), nil
}

// GenerateCentrifugoToken generates a connection JWT for Centrifugo
func GenerateCentrifugoToken(userID string) (string, error) {
	key, err := getCentrifugoHMAC()
	if err != nil {
		return "", err
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": userID,
		"exp": time.Now().Add(5 * time.Minute).Unix(),
	})
	return token.SignedString(key)
}

// WorkspaceChannel is the only general tenant-wide channel name. It stays in
// Centrifugo's default namespace (no colon) and the subscribe proxy validates
// that the connecting user belongs to this exact workspace.
func WorkspaceChannel(workspaceID uuid.UUID) string {
	return "workspace_" + workspaceID.String()
}

func ChannelChannel(channelID uuid.UUID) string {
	return "channel_" + channelID.String()
}

// UserChannel carries events which are private to one user, such as the
// morning brief. The subscription proxy checks exact user ownership.
func UserChannel(userID uuid.UUID) string {
	return "user_" + userID.String()
}

// HandleGetCentrifugoToken returns a token to the frontend
func HandleGetCentrifugoToken(c *fiber.Ctx) error {
	userID, _ := c.Locals("user_id").(string)
	token, err := GenerateCentrifugoToken(userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Could not generate token"})
	}
	return c.JSON(fiber.Map{"token": token})
}

// PublishToCentrifugo sends a message to a specific channel via Centrifugo API
func PublishToCentrifugo(channel string, payload interface{}) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	reqBody, _ := json.Marshal(map[string]interface{}{
		"channel": channel,
		"data":    json.RawMessage(data),
	})

	req, err := http.NewRequest("POST", getCentrifugoAPIURL()+"/publish", bytes.NewBuffer(reqBody))
	if err != nil {
		return err
	}
	apiKey, err := getCentrifugoAPIKey()
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-Key", apiKey)

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("centrifugo publish failed with status: %d", resp.StatusCode)
	}
	return nil
}

// HandleTypingEvent broadcasts a typing notification to a channel
func HandleTypingEvent(c *fiber.Ctx) error {
	type TypingReq struct {
		ChannelID string `json:"channel_id"`
		UserEmail string `json:"user_email"`
		IsTyping  bool   `json:"is_typing"`
	}
	var req TypingReq
	if err := c.BodyParser(&req); err != nil || req.ChannelID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel_id"})
	}

	userID := ""
	if id, ok := c.Locals("user_id").(string); ok {
		userID = id
	}

	payload := map[string]interface{}{
		"type":       "typing",
		"channel_id": req.ChannelID,
		"user_id":    userID,
		"user":       req.UserEmail,
		"is_typing":  req.IsTyping,
	}

	// Publish to channel_<channel_id>
	channelID, err := uuid.Parse(req.ChannelID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel_id"})
	}
	_ = PublishToCentrifugo(ChannelChannel(channelID), payload)
	return c.JSON(fiber.Map{"status": "ok"})
}
