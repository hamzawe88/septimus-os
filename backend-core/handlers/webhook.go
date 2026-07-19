package handlers

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
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
		workspaceID = resolveDefaultWorkspaceID()
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

	if err := database.GetDB(c).Create(&webhook).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create webhook"})
	}

	return c.Status(fiber.StatusCreated).JSON(webhook)
}

func GetWebhooks(c *fiber.Ctx) error {
	workspaceID := getWebhookWorkspaceID(c)

	var webhooks []models.WebhookSubscription
	if err := database.GetDB(c).Where("workspace_id = ?", workspaceID).Find(&webhooks).Error; err != nil {
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

	if err := database.GetDB(c).Delete(&models.WebhookSubscription{}, "id = ?", id).Error; err != nil {
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

	if err := database.GetDB(c).Create(&entity).Error; err != nil {
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

// ExternalWebhookPayload represents incoming generalized events from n8n, WhatsApp, or external agents
type ExternalWebhookPayload struct {
	Event       string                 `json:"event"`
	WorkspaceID string                 `json:"workspace_id"`
	Source      string                 `json:"source"`
	Data        map[string]interface{} `json:"data"`
	Secret      string                 `json:"secret,omitempty"`
}

// HandleExternalWebhook processes general inbound webhooks from n8n, WhatsApp API, or external services
func HandleExternalWebhook(c *fiber.Ctx) error {
	var input ExternalWebhookPayload
	if err := c.BodyParser(&input); err != nil {
		var generic map[string]interface{}
		if err := c.BodyParser(&generic); err == nil {
			if ev, ok := generic["event"].(string); ok {
				input.Event = ev
			}
			if ws, ok := generic["workspace_id"].(string); ok {
				input.WorkspaceID = ws
			}
			if src, ok := generic["source"].(string); ok {
				input.Source = src
			}
			if data, ok := generic["data"].(map[string]interface{}); ok {
				input.Data = data
			} else {
				input.Data = generic
			}
		}
	}
	if input.Event == "" {
		input.Event = c.Get("X-Septimus-Event", "external.webhook")
	}
	if input.Source == "" {
		input.Source = c.Get("X-Septimus-Source", "n8n")
	}

	workspaceID := getWebhookWorkspaceID(c)
	if input.WorkspaceID != "" {
		if id, err := uuid.Parse(input.WorkspaceID); err == nil {
			workspaceID = id
		}
	}

	sigHeader := c.Get("X-Septimus-Signature")
	if sigHeader != "" && input.Secret == "" {
		input.Secret = sigHeader
	}

	entityData, _ := json.Marshal(map[string]interface{}{
		"event":       input.Event,
		"source":      input.Source,
		"data":        input.Data,
		"received_at": time.Now().Format(time.RFC3339),
	})

	entity := models.Entity{
		ID:          uuid.New(),
		WorkspaceID: workspaceID,
		EntityType:  "webhook_payload",
		Data:        datatypes.JSON(entityData),
	}
	database.GetDB(c).Create(&entity)

	ctxData := make(map[string]interface{})
	for k, v := range input.Data {
		ctxData[k] = v
	}
	ctxData["workspace_id"] = workspaceID.String()
	ctxData["event"] = input.Event
	ctxData["source"] = input.Source
	ctxData["entity_id"] = entity.ID.String()

	// 1. Check if this webhook resolves a Human-in-the-Loop (HITL) approval action
	if input.Event == "hitl.approval_resolved" || input.Event == "hitl.resolve" || input.Event == "hitl.approve" || input.Event == "hitl.reject" {
		resolveHITLFromWebhook(workspaceID, input.Event, input.Data)
	}

	// 2. Trigger any matching internal DAG workflows
	go ExecuteWorkflowsByTrigger(input.Event, ctxData)

	// 3. Publish to NATS JetStream for AI Sidecar / reactive listeners
	if events.NatsConn != nil {
		natsPayload, _ := json.Marshal(map[string]interface{}{
			"event":        input.Event,
			"workspace_id": workspaceID.String(),
			"source":       input.Source,
			"data":         input.Data,
			"entity_id":    entity.ID.String(),
		})
		events.NatsConn.Publish("events.webhooks.external", natsPayload)
	}

	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{
		"status":       "accepted",
		"event":        input.Event,
		"workspace_id": workspaceID,
		"entity_id":    entity.ID,
		"message":      "External webhook ingested and triggered across Septimus OS workflows and AI sidecar",
	})
}

func resolveHITLFromWebhook(workspaceID uuid.UUID, event string, data map[string]interface{}) {
	var pendingIDStr string
	if pid, ok := data["pending_id"].(string); ok {
		pendingIDStr = pid
	} else if pid, ok := data["id"].(string); ok {
		pendingIDStr = pid
	}
	if pendingIDStr == "" {
		return
	}
	pendingID, err := uuid.Parse(pendingIDStr)
	if err != nil {
		return
	}

	action := "approve"
	if event == "hitl.reject" {
		action = "reject"
	} else if act, ok := data["action"].(string); ok {
		action = act
	}

	var pending models.PendingApproval
	if err := database.DB.Where("id = ?", pendingID).First(&pending).Error; err != nil {
		return
	}

	now := time.Now()
	pending.ResolvedAt = &now
	if action == "approve" || action == "approved" {
		pending.Status = "approved"
		outcome := "Action approved via external webhook"
		status := "completed"

		var payload approvalPayload
		if err := json.Unmarshal([]byte(pending.Payload), &payload); err == nil && payload.Action == "create_entity" {
			wsID, err := uuid.Parse(payload.WorkspaceID)
			if err != nil {
				outcome = "Approved via webhook but workspace id invalid"
				status = "failed"
			} else if entity, err := createEntityRecord(wsID, payload.EntityType, payload.Data); err != nil {
				outcome = "Approved via webhook but execution failed: " + err.Error()
				status = "failed"
			} else {
				outcome = fmt.Sprintf("Created %s entity %s from webhook approval", payload.EntityType, entity.ID)
			}
		}

		database.DB.Create(&models.AgentCollaborationLog{
			AgentName:  pending.AgentName,
			Action:     "Webhook Approved Action",
			InputData:  pending.ActionType,
			OutputData: outcome,
			Status:     status,
		})
	} else {
		pending.Status = "rejected"
		database.DB.Create(&models.AgentCollaborationLog{
			AgentName:  pending.AgentName,
			Action:     "Webhook Rejected Action",
			InputData:  pending.Reason,
			OutputData: "Action cancelled via external webhook",
			Status:     "failed",
		})
	}

	database.DB.Save(&pending)

	go DispatchWebhookEvent(workspaceID, "hitl.approval_resolved", pending)
	go ExecuteWorkflowsByTrigger("hitl.approval_resolved", map[string]interface{}{
		"pending_id": pending.ID.String(),
		"status":     pending.Status,
		"agent_name": pending.AgentName,
	})
}
