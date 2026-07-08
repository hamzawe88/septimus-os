package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// SendWhatsAppMessage sends a free-form text message via the Meta Graph API
// using the workspace's connected WhatsApp Business credentials.
func SendWhatsAppMessage(accessToken, phoneNumberID, to, message string) error {
	if accessToken == "" || phoneNumberID == "" {
		return fmt.Errorf("WhatsApp integration is not fully configured (missing access token or phone number id)")
	}
	if to == "" || message == "" {
		return fmt.Errorf("recipient and message are required")
	}

	url := fmt.Sprintf("https://graph.facebook.com/v19.0/%s/messages", phoneNumberID)
	payload := map[string]interface{}{
		"messaging_product": "whatsapp",
		"to":                to,
		"type":              "text",
		"text":              map[string]string{"body": message},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to encode message payload: %w", err)
	}

	req, err := http.NewRequest("POST", url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("failed to build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+accessToken)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to reach Meta Graph API: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return fmt.Errorf("WhatsApp access token is invalid or expired")
	}
	if resp.StatusCode >= 300 {
		var parsed struct {
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if json.Unmarshal(respBody, &parsed) == nil && parsed.Error.Message != "" {
			return fmt.Errorf("Meta API rejected the message: %s", parsed.Error.Message)
		}
		return fmt.Errorf("Meta API returned status %d", resp.StatusCode)
	}

	return nil
}
