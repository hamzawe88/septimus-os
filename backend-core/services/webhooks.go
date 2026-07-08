package services

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
)

type WebhookPayload struct {
	Event     string      `json:"event"`
	Timestamp time.Time   `json:"timestamp"`
	Data      interface{} `json:"data"`
}

func DispatchWebhook(workspaceID uuid.UUID, eventName string, data interface{}) {
	// Fetch all active subscriptions for the workspace
	var subscriptions []models.WebhookSubscription
	err := database.DB.Where("workspace_id = ? AND is_active = ?", workspaceID, true).Find(&subscriptions).Error
	if err != nil {
		log.Printf("Failed to fetch webhook subscriptions for workspace %s: %v", workspaceID, err)
		return
	}

	payload := WebhookPayload{
		Event:     eventName,
		Timestamp: time.Now(),
		Data:      data,
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		log.Printf("Failed to marshal webhook payload: %v", err)
		return
	}

	for _, sub := range subscriptions {
		// Check if the subscription is listening to this event
		var events []string
		if err := json.Unmarshal(sub.Events, &events); err == nil {
			isListening := false
			for _, ev := range events {
				if ev == eventName || ev == "*" {
					isListening = true
					break
				}
			}
			if !isListening {
				continue
			}
		}

		go sendWebhook(sub, payloadBytes)
	}
}

func sendWebhook(sub models.WebhookSubscription, payload []byte) {
	req, err := http.NewRequest("POST", sub.TargetURL, bytes.NewBuffer(payload))
	if err != nil {
		log.Printf("Failed to create webhook request to %s: %v", sub.TargetURL, err)
		return
	}

	req.Header.Set("Content-Type", "application/json")
	
	// Add signature if secret is provided
	if sub.Secret != "" {
		h := hmac.New(sha256.New, []byte(sub.Secret))
		h.Write(payload)
		signature := hex.EncodeToString(h.Sum(nil))
		req.Header.Set("X-Septimus-Signature", "sha256="+signature)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Failed to send webhook to %s: %v", sub.TargetURL, err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		log.Printf("Webhook to %s failed with status %d", sub.TargetURL, resp.StatusCode)
	} else {
		log.Printf("Webhook to %s sent successfully", sub.TargetURL)
	}
}
