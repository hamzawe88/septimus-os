package utils

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"time"
)

// WebhookPayload represents the generic structure of an event sent to n8n
type WebhookPayload struct {
	Event     string      `json:"event"`
	Timestamp time.Time   `json:"timestamp"`
	Data      interface{} `json:"data"`
}

// DispatchWebhook sends an asynchronous POST request to the specified URL
func DispatchWebhook(url string, eventName string, data interface{}) {
	// Send in a goroutine to avoid blocking the main thread
	go func() {
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

		client := &http.Client{Timeout: 10 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			log.Printf("Error dispatching webhook to %s: %v", url, err)
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode >= 400 {
			log.Printf("Webhook to %s failed with status: %d", url, resp.StatusCode)
		} else {
			log.Printf("Webhook successfully dispatched to %s (Event: %s)", url, eventName)
		}
	}()
}
