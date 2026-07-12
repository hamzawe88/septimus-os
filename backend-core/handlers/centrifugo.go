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
)

func getCentrifugoAPIURL() string {
	url := os.Getenv("CENTRIFUGO_API_URL")
	if url == "" {
		return "http://centrifugo:8000/api"
	}
	return url
}

func getCentrifugoAPIKey() string {
	key := os.Getenv("CENTRIFUGO_API_KEY")
	if key == "" {
		return "supersecretapikey"
	}
	return key
}

func getCentrifugoHMAC() []byte {
	secret := os.Getenv("CENTRIFUGO_SECRET")
	if secret == "" {
		return []byte("supersecretcentrifugokey")
	}
	return []byte(secret)
}

// GenerateCentrifugoToken generates a connection JWT for Centrifugo
func GenerateCentrifugoToken(userID string) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": userID,
		"exp": time.Now().Add(5 * time.Minute).Unix(),
	})
	return token.SignedString(getCentrifugoHMAC())
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
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-Key", getCentrifugoAPIKey())

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
	_ = PublishToCentrifugo("channel_"+req.ChannelID, payload)
	return c.JSON(fiber.Map{"status": "ok"})
}

