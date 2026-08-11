package utils

import (
	"bytes"
	"encoding/json"
	"github.com/septimus-os/backend-core/services"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

// WebhookPayload represents the generic structure of an event sent to n8n
type WebhookPayload struct {
	Event     string      `json:"event"`
	Timestamp time.Time   `json:"timestamp"`
	Data      interface{} `json:"data"`
}

// DispatchN8NWebhook sends an optional event to the n8n overlay. The base URL
// is deliberately empty by default: core product behavior must not attempt a
// hard-coded localhost call when n8n is not running.
func DispatchN8NWebhook(endpoint, eventName string, data interface{}) {
	baseURL := strings.TrimRight(strings.TrimSpace(os.Getenv("N8N_WEBHOOK_BASE_URL")), "/")
	if baseURL == "" {
		return
	}
	DispatchWebhook(baseURL+"/"+strings.TrimLeft(endpoint, "/"), eventName, data)
}

// DispatchWebhook sends an asynchronous POST request to the specified URL
func DispatchWebhook(url string, eventName string, data interface{}) {
	// Send in a goroutine to avoid blocking the main thread
	go func() {
		if err := services.ValidateOutboundURL(url); err != nil {
			log.Printf("Refusing unsafe webhook destination: %v", err)
			return
		}
		payload := WebhookPayload{
			Event:     eventName,
			Timestamp: time.Now(),
			Data:      data,
		}

		jsonData, err := json.Marshal(payload)
		if err != nil {
			log.Printf("Error marshaling webhook payload: %v", err)
			return
		}

		// Typically, this URL comes from n8n webhooks
		req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
		if err != nil {
			log.Printf("Error creating webhook request: %v", err)
			return
		}
		req.Header.Set("Content-Type", "application/json")

		client := services.NewSafeHTTPClient(10 * time.Second)
		resp, err := client.Do(req)
		if err != nil {
			log.Printf("Error dispatching webhook: %v", err)
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode >= 400 {
			log.Printf("Webhook failed with status: %d", resp.StatusCode)
		} else {
			log.Printf("Webhook successfully dispatched (Event: %s)", eventName)
		}
	}()
}
