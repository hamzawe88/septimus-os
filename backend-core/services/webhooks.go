package services

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services/crypto"
)

type WebhookPayload struct {
	Event     string      `json:"event"`
	Timestamp time.Time   `json:"timestamp"`
	Data      interface{} `json:"data"`
}

// ComputeWebhookSignature binds a payload to both a short validity window and
// a single-use delivery id. Receivers persist the delivery id after validating
// the HMAC, preventing a captured request from being replayed.
func ComputeWebhookSignature(secret string, payload []byte, timestamp, deliveryID string) string {
	h := hmac.New(sha256.New, []byte(secret))
	_, _ = h.Write([]byte(timestamp + "." + deliveryID + "." + string(payload)))
	return hex.EncodeToString(h.Sum(nil))
}

func SignWebhookDelivery(secret string, payload []byte) (timestamp, deliveryID, signature string) {
	timestamp = strconv.FormatInt(time.Now().Unix(), 10)
	deliveryID = uuid.NewString()
	signature = ComputeWebhookSignature(secret, payload, timestamp, deliveryID)
	return
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
	if err := ValidateOutboundURL(sub.TargetURL); err != nil {
		log.Printf("Refusing unsafe webhook destination: %v", err)
		return
	}
	req, err := http.NewRequest("POST", sub.TargetURL, bytes.NewBuffer(payload))
	if err != nil {
		log.Printf("Failed to create webhook request: %v", err)
		return
	}

	req.Header.Set("Content-Type", "application/json")

	secret, err := crypto.Decrypt(sub.Secret)
	if err != nil {
		log.Printf("Failed to decrypt webhook secret: %v", err)
		return
	}
	// Add signature if secret is provided.
	if secret != "" {
		timestamp, deliveryID, signature := SignWebhookDelivery(secret, payload)
		req.Header.Set("X-Septimus-Signature", "sha256="+signature)
		req.Header.Set("X-Septimus-Timestamp", timestamp)
		req.Header.Set("X-Septimus-Delivery-ID", deliveryID)
	}

	client := NewSafeHTTPClient(10 * time.Second)
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Failed to send webhook: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		log.Printf("Webhook failed with status %d", resp.StatusCode)
	} else {
		log.Printf("Webhook sent successfully")
	}
}
