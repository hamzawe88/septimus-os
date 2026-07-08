package handlers

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/events"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/datatypes"
)

type CreateWebhookInput struct {
	TargetURL string   `json:"target_url"`
	Events    []string `json:"events"`
	Secret    string   `json:"secret"`
}

func getWebhookWorkspaceID(c *fiber.Ctx) uuid.UUID {
	var workspaceID uuid.UUID
	if val := c.Locals("workspace_id"); val != nil {
		if str, ok := val.(string); ok {
			if id, err := uuid.Parse(str); err == nil {
				workspaceID = id
			}
		}
	}
	if workspaceID == uuid.Nil {
		if queryId := c.Query("workspace_id"); queryId != "" {
			if id, err := uuid.Parse(queryId); err == nil {
				workspaceID = id
			}
		}
	}
	if workspaceID == uuid.Nil {
		if paramId := c.Params("workspace_id"); paramId != "" && paramId != "me" {
			if id, err := uuid.Parse(paramId); err == nil {
				workspaceID = id
			}
		}
	}
	if workspaceID == uuid.Nil {
		workspaceID = uuid.MustParse("797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e")
	}
	return workspaceID
}

func CreateWebhook(c *fiber.Ctx) error {
	workspaceID := getWebhookWorkspaceID(c)

	var input CreateWebhookInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request input"})
	}

	eventsJSON, _ := json.Marshal(input.Events)

	webhook := models.WebhookSubscription{
		ID:          uuid.New(),
		WorkspaceID: workspaceID,
		TargetURL:   input.TargetURL,
		Events:      datatypes.JSON(eventsJSON),
		Secret:      input.Secret,
		IsActive:    true,
	}

	if err := database.DB.Create(&webhook).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create webhook"})
	}

	return c.Status(fiber.StatusCreated).JSON(webhook)
}

func GetWebhooks(c *fiber.Ctx) error {
	workspaceID := getWebhookWorkspaceID(c)

	var webhooks []models.WebhookSubscription
	if err := database.DB.Where("workspace_id = ?", workspaceID).Find(&webhooks).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch webhooks"})
	}

	return c.JSON(webhooks)
}

func DeleteWebhook(c *fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid webhook ID"})
	}

	if err := database.DB.Delete(&models.WebhookSubscription{}, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete webhook"})
	}

	return c.SendStatus(fiber.StatusNoContent)
}

// ZendeskPayload represents incoming ticket creation/update events from Zendesk
type ZendeskPayload struct {
	TicketID       string `json:"ticket_id"`
	Subject        string `json:"subject"`
	Description    string `json:"description"`
	Priority       string `json:"priority"`
	RequesterEmail string `json:"requester_email"`
}

// HandleZendeskWebhook ingests Zendesk tickets into Septimus OS CRM as entities
func HandleZendeskWebhook(c *fiber.Ctx) error {
	var input ZendeskPayload
	if err := c.BodyParser(&input); err != nil {
		// Try fallback generic map
		var generic map[string]interface{}
		c.BodyParser(&generic)
		if sub, ok := generic["subject"].(string); ok {
			input.Subject = sub
		} else {
			input.Subject = "New Support Ticket from Zendesk"
		}
		if desc, ok := generic["description"].(string); ok {
			input.Description = desc
		} else {
			input.Description = "Automated support ticket creation"
		}
	}
	if input.Subject == "" {
		input.Subject = "POS Machine Hardware Issue / Crash"
	}
	if input.Description == "" {
		input.Description = "Automated ticket generated from Zendesk integration."
	}

	workspaceID := getWebhookWorkspaceID(c)

	// Create CRM Entity / Ticket
	ticketData, _ := json.Marshal(map[string]interface{}{
		"title":           input.Subject,
		"description":     input.Description,
		"source":          "zendesk",
		"ticket_id":       input.TicketID,
		"priority":        input.Priority,
		"requester_email": input.RequesterEmail,
		"status":          "open",
	})

	entity := models.Entity{
		ID:          uuid.New(),
		WorkspaceID: workspaceID,
		EntityType:  "support_ticket",
		Data:        datatypes.JSON(ticketData),
	}

	if err := database.DB.Create(&entity).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create CRM ticket"})
	}

	// Publish NATS event for AI processing / notification
	if events.NatsConn != nil {
		eventData, _ := json.Marshal(map[string]string{
			"event":     "events.entities.created",
			"entity_id": entity.ID.String(),
			"source":    "zendesk_webhook",
		})
		events.NatsConn.Publish("events.entities.created", eventData)
	}

	// Also trigger outbound webhook dispatch if subscribed
	go DispatchWebhookEvent(workspaceID, "ticket.created", entity)

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"status":    "success",
		"ticket_id": entity.ID,
		"message":   "Zendesk ticket ingested into Septimus CRM successfully",
	})
}

// DispatchWebhookEvent sends HMAC signed POST requests to all active subscribers for a workspace
func DispatchWebhookEvent(workspaceID uuid.UUID, eventType string, payload interface{}) {
	var webhooks []models.WebhookSubscription
	if err := database.DB.Where("workspace_id = ? AND is_active = true", workspaceID).Find(&webhooks).Error; err != nil {
		return
	}

	for _, wh := range webhooks {
		// Check if eventType matches
		var evts []string
		if err := json.Unmarshal(wh.Events, &evts); err == nil {
			matched := false
			for _, e := range evts {
				if e == eventType || e == "*" || e == "all" {
					matched = true
					break
				}
			}
			if !matched && len(evts) > 0 {
				continue
			}
		}

		go func(targetURL, secret string) {
			client := &http.Client{Timeout: 5 * time.Second}
			data, _ := json.Marshal(payload)
			req, err := http.NewRequest("POST", targetURL, bytes.NewBuffer(data))
			if err != nil {
				return
			}
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("X-Septimus-Event", eventType)
			if secret != "" {
				mac := hmac.New(sha256.New, []byte(secret))
				mac.Write(data)
				sig := hex.EncodeToString(mac.Sum(nil))
				req.Header.Set("X-Septimus-Signature", sig)
			}
			resp, err := client.Do(req)
			if err == nil {
				resp.Body.Close()
			}
		}(wh.TargetURL, wh.Secret)
	}
}
