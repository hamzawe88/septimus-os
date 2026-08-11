package handlers

import (
	"bytes"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/events"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
	"github.com/septimus-os/backend-core/services/crypto"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type CreateWebhookInput struct {
	TargetURL string   `json:"target_url"`
	Events    []string `json:"events"`
	Secret    string   `json:"secret"`
}

// getWebhookWorkspaceID resolves the tenant for the webhook routes, all of which
// are JWT-protected. The URL is /workspaces/:workspace_id/webhooks, but that
// segment is decoration: the id used is the session's.
//
// The query, path-param and "oldest workspace" fallbacks are gone. They were
// unreachable while the session carried a tenant, and the moment it did not they
// would have pointed webhook creation — outbound delivery of tenant events to an
// arbitrary URL — at a workspace the caller never proved they own.
func getWebhookWorkspaceID(c *fiber.Ctx) uuid.UUID {
	return CurrentWorkspaceID(c)
}

func CreateWebhook(c *fiber.Ctx) error {
	workspaceID := getWebhookWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}

	var input CreateWebhookInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request input"})
	}
	if err := services.ValidateOutboundURL(input.TargetURL); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid webhook target", "details": err.Error()})
	}
	if len(input.Events) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "at least one event is required"})
	}

	plainSecret := input.Secret
	if plainSecret == "" {
		generated, err := generateWebhookSecret()
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "could not generate webhook secret"})
		}
		plainSecret = generated
	}
	if len(plainSecret) < 16 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "webhook secret must be at least 16 characters"})
	}
	storedSecret, err := crypto.Encrypt(plainSecret)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "could not encrypt webhook secret"})
	}

	eventsJSON, _ := json.Marshal(input.Events)

	webhook := models.WebhookSubscription{
		ID:          uuid.New(),
		WorkspaceID: workspaceID,
		TargetURL:   input.TargetURL,
		Events:      datatypes.JSON(eventsJSON),
		Secret:      storedSecret,
		IsActive:    true,
	}

	if err := database.GetDB(c).Create(&webhook).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create webhook"})
	}

	// Return the secret only at creation time. List/read responses deliberately
	// omit it so ordinary workspace members cannot harvest signing credentials.
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"id":         webhook.ID,
		"target_url": webhook.TargetURL,
		"events":     input.Events,
		"is_active":  webhook.IsActive,
		"created_at": webhook.CreatedAt,
		"secret":     plainSecret,
	})
}

func generateWebhookSecret() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(bytes), nil
}

func decryptWebhookSecret(stored string) (string, error) {
	if stored == "" {
		return "", nil
	}
	return crypto.Decrypt(stored)
}

func GetWebhooks(c *fiber.Ctx) error {
	workspaceID := getWebhookWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}

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

	workspaceID := getWebhookWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", id, workspaceID).Delete(&models.WebhookSubscription{}).Error; err != nil {
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

// HandleZendeskWebhook authenticates and idempotently projects Zendesk tickets
// into the canonical CRM ticket/message contracts. It deliberately shares the
// same RecordService audit and outbox path as browser and workflow commands.
func HandleZendeskWebhook(c *fiber.Ctx) error {
	var input ZendeskPayload
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid Zendesk payload"})
	}
	workspaceID := getWebhookWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	input.TicketID = strings.TrimSpace(input.TicketID)
	input.Subject = strings.TrimSpace(input.Subject)
	input.Description = strings.TrimSpace(input.Description)
	input.RequesterEmail = strings.TrimSpace(input.RequesterEmail)
	if input.TicketID == "" || len(input.TicketID) > 200 || input.Subject == "" || len(input.Subject) > 500 || len(input.Description) > 20_000 || len(input.RequesterEmail) > 320 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ticket_id and subject are required and the Zendesk payload exceeds supported limits"})
	}
	if !verifyInboundWebhookSignature(c, workspaceID) {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid or replayed webhook signature"})
	}
	deliveryID := strings.TrimSpace(c.Get("X-Septimus-Delivery-ID"))
	ticket, created, err := upsertZendeskCRMTicket(database.GetDB(c), workspaceID, input, deliveryID)
	if err != nil {
		releaseInboundWebhookDelivery(database.GetDB(c), workspaceID, deliveryID)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to ingest Zendesk ticket into CRM"})
	}
	status := fiber.StatusOK
	if created {
		status = fiber.StatusCreated
	}
	return c.Status(status).JSON(fiber.Map{
		"status": "success", "ticket_id": ticket.ID,
		"external_ticket_id": input.TicketID, "created": created,
	})
}

func upsertZendeskCRMTicket(db *gorm.DB, workspaceID uuid.UUID, input ZendeskPayload, deliveryID string) (models.Entity, bool, error) {
	principal := services.PrincipalForSystem("crm_ticket_command")
	var ticket models.Entity
	created := false
	err := db.Transaction(func(tx *gorm.DB) error {
		result, err := services.QueryDynamicRecordsAs(tx, workspaceID, principal, "crm_ticket", services.RecordQueryRequest{
			Limit: 1,
			Filter: &services.RecordFilter{And: []services.RecordFilter{
				{Field: "external_provider", Op: "eq", Value: "zendesk"},
				{Field: "external_ticket_id", Op: "eq", Value: input.TicketID},
			}},
		})
		if err != nil {
			return err
		}
		contactID, accountID, customerName := resolveZendeskCRMContact(tx, workspaceID, principal, input.RequesterEmail)
		if len(result.Data) == 0 {
			priority := normalizeTicketPriorityValue(input.Priority)
			data := cleanCRMData(map[string]interface{}{
				"subject": input.Subject, "description": input.Description,
				"status": "open", "priority": priority, "channel": "zendesk",
				"external_provider": "zendesk", "external_ticket_id": input.TicketID,
				"contact": contactID, "account": accountID, "customer_name": customerName,
				"sla_due_at": time.Now().UTC().Add(crmSLADuration(priority)).Format(time.RFC3339),
				"sla_status": "on_track", "escalation_level": 0,
			})
			ticket, err = services.CreateDynamicRecordAs(tx, workspaceID, principal, "crm_ticket", data)
			created = true
		} else {
			ticket = result.Data[0]
			updates := map[string]interface{}{
				"subject": input.Subject, "description": input.Description,
			}
			// A comment-only Zendesk delivery must not silently reset priority or
			// extend the original SLA clock. Recalculate only when Zendesk sent an
			// explicit priority that actually changed.
			if strings.TrimSpace(input.Priority) != "" {
				priority := normalizeTicketPriorityValue(input.Priority)
				if current := strings.TrimSpace(fmt.Sprint(entityData(ticket)["priority"])); current != priority {
					updates["priority"] = priority
					updates["sla_due_at"] = time.Now().UTC().Add(crmSLADuration(priority)).Format(time.RFC3339)
					updates["sla_status"] = "on_track"
				}
			}
			if contactID != "" {
				updates["contact"] = contactID
			}
			if accountID != "" {
				updates["account"] = accountID
			}
			if customerName != "" {
				updates["customer_name"] = customerName
			}
			ticket, err = services.UpdateDynamicRecordAs(tx, workspaceID, principal, "crm_ticket", ticket.ID, ticket.RecordVersion, updates)
		}
		if err != nil {
			return err
		}
		if input.Description == "" {
			return nil
		}
		_, err = services.CreateDynamicRecordAs(tx, workspaceID, services.PrincipalForSystem("crm_ticket_message_command"), "crm_ticket_message", map[string]interface{}{
			"ticket": ticket.ID.String(), "body": input.Description, "channel": "zendesk",
			"sent_at": time.Now().UTC().Format(time.RFC3339), "external_message_id": "zendesk:" + deliveryID,
			"delivery_status": "received",
		})
		return err
	})
	return ticket, created, err
}

func resolveZendeskCRMContact(db *gorm.DB, workspaceID uuid.UUID, principal services.RecordPrincipal, email string) (string, string, string) {
	if email == "" {
		return "", "", ""
	}
	result, err := services.QueryDynamicRecordsAs(db, workspaceID, principal, "crm_contact", services.RecordQueryRequest{
		Limit: 1, Filter: &services.RecordFilter{Field: "email", Op: "eq", Value: email},
	})
	if err != nil || len(result.Data) == 0 {
		return "", "", ""
	}
	contact := result.Data[0]
	data := entityData(contact)
	return contact.ID.String(), strings.TrimSpace(fmt.Sprint(data["account"])), strings.TrimSpace(fmt.Sprint(data["full_name"]))
}

func releaseInboundWebhookDelivery(db *gorm.DB, workspaceID uuid.UUID, deliveryID string) {
	if db == nil || workspaceID == uuid.Nil || deliveryID == "" {
		return
	}
	_ = db.Where("workspace_id = ? AND delivery_id = ?", workspaceID, deliveryID).Delete(&models.WebhookDelivery{}).Error
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

		go func(targetURL, storedSecret string) {
			if err := services.ValidateOutboundURL(targetURL); err != nil {
				return
			}
			secret, err := decryptWebhookSecret(storedSecret)
			if err != nil {
				log.Printf("webhook: could not decrypt subscription secret: %v", err)
				return
			}
			client := services.NewSafeHTTPClient(5 * time.Second)
			data, _ := json.Marshal(payload)
			req, err := http.NewRequest("POST", targetURL, bytes.NewBuffer(data))
			if err != nil {
				return
			}
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("X-Septimus-Event", eventType)
			if secret != "" {
				timestamp, deliveryID, sig := services.SignWebhookDelivery(secret, data)
				req.Header.Set("X-Septimus-Signature", sig)
				req.Header.Set("X-Septimus-Timestamp", timestamp)
				req.Header.Set("X-Septimus-Delivery-ID", deliveryID)
			}
			resp, err := client.Do(req)
			if err == nil {
				resp.Body.Close()
			}
		}(wh.TargetURL, wh.Secret)
	}
}

// verifyInboundWebhookSignature authenticates a public webhook against a
// subscription owned by the workspace named by the API key/body. The body
// field named Secret is never trusted. The signature is
// HMAC(secret, timestamp + "." + delivery_id + "." + raw_body). Timestamp is
// short-lived and the delivery id is persisted with a unique tenant key.
func verifyInboundWebhookSignature(c *fiber.Ctx, workspaceID uuid.UUID) bool {
	if workspaceID == uuid.Nil {
		return false
	}
	header := c.Get("X-Septimus-Signature")
	if header == "" {
		header = c.Get("X-Septimus-Webhook-Signature")
	}
	header = strings.TrimPrefix(strings.TrimSpace(header), "sha256=")
	if header == "" {
		return false
	}
	timestamp := strings.TrimSpace(c.Get("X-Septimus-Timestamp"))
	deliveryID := strings.TrimSpace(c.Get("X-Septimus-Delivery-ID"))
	if timestamp == "" || deliveryID == "" || len(deliveryID) > 128 {
		return false
	}
	unix, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil || time.Since(time.Unix(unix, 0)) > 5*time.Minute || time.Until(time.Unix(unix, 0)) > 5*time.Minute {
		return false
	}

	var subscriptions []models.WebhookSubscription
	if err := database.DB.Where("workspace_id = ? AND is_active = true AND secret <> ''", workspaceID).Find(&subscriptions).Error; err != nil {
		return false
	}
	for _, subscription := range subscriptions {
		secret, err := decryptWebhookSecret(subscription.Secret)
		if err != nil || secret == "" {
			continue
		}
		expected := services.ComputeWebhookSignature(secret, c.Body(), timestamp, deliveryID)
		if subtle.ConstantTimeCompare([]byte(strings.ToLower(header)), []byte(expected)) == 1 {
			delivery := models.WebhookDelivery{
				ID:          uuid.New(),
				WorkspaceID: workspaceID,
				DeliveryID:  deliveryID,
				ReceivedAt:  time.Now().UTC(),
			}
			// A duplicate insert is a replay, including across backend replicas.
			return database.DB.Create(&delivery).Error == nil
		}
	}
	return false
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

	// The authenticated tenant wins. This used to be the other way round: the
	// body's workspace_id overwrote it unconditionally, so a caller holding a
	// valid API key for tenant A could post {"workspace_id": "<B>"} and file the
	// payload into tenant B. That is the client-supplied-tenant pattern this
	// codebase already banned elsewhere, on a route that ingests external data.
	//
	// The body is honoured only where there is genuinely no authenticated
	// tenant: the internal, token-gated route the AI sidecar calls, which has no
	// JWT and no API key and must name the workspace it is acting for.
	workspaceID := getWebhookWorkspaceID(c)
	if workspaceID == uuid.Nil && input.WorkspaceID != "" {
		if id, err := uuid.Parse(input.WorkspaceID); err == nil {
			workspaceID = id
		}
	}
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "workspace context is required"})
	}
	// Internal callers are already authenticated by RequireInternalToken. All
	// public ingress must additionally prove possession of a workspace webhook
	// secret; otherwise anyone could name a tenant and trigger its workflows.
	if !strings.HasPrefix(c.Path(), "/internal/") && !verifyInboundWebhookSignature(c, workspaceID) {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid webhook signature"})
	}
	// A HITL resolution names an approval record, and that record carries its own
	// tenant — so it is handled before the tenant requirement below and does not
	// fall through to the ingestion path, which does need one. When the request
	// IS authenticated, the workspace is passed down and the lookup is scoped to
	// it: otherwise a valid key for one tenant could approve another tenant's
	// queued action just by knowing its id.
	if input.Event == "hitl.approval_resolved" || input.Event == "hitl.resolve" ||
		input.Event == "hitl.approve" || input.Event == "hitl.reject" {
		resolveHITLFromWebhook(workspaceID, input.Event, input.Data)
		return c.Status(fiber.StatusAccepted).JSON(fiber.Map{
			"status": "accepted",
			"event":  input.Event,
		})
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
	if err := database.GetDB(c).Create(&entity).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to ingest webhook"})
	}

	ctxData := make(map[string]interface{})
	for k, v := range input.Data {
		ctxData[k] = v
	}
	ctxData["workspace_id"] = workspaceID.String()
	ctxData["event"] = input.Event
	ctxData["source"] = input.Source
	ctxData["entity_id"] = entity.ID.String()

	// Trigger any matching internal DAG workflows
	go ExecuteWorkflowsByTrigger(workspaceID, input.Event, ctxData)

	// 3. Publish to NATS JetStream for AI Sidecar / reactive listeners
	if events.NatsConn != nil {
		natsPayload := map[string]interface{}{
			"event":        input.Event,
			"workspace_id": workspaceID.String(),
			"source":       input.Source,
			"data":         input.Data,
			"entity_id":    entity.ID.String(),
		}
		if err := events.PublishTenantEvent("events.webhooks.external", workspaceID, natsPayload); err != nil {
			return c.Status(fiber.StatusAccepted).JSON(fiber.Map{"status": "accepted", "warning": "event queued with delivery warning"})
		}
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
	if workspaceID == uuid.Nil {
		return
	}
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
	q := database.DB.Where("id = ? AND workspace_id = ?", pendingID, workspaceID)
	if err := q.First(&pending).Error; err != nil {
		return
	}

	now := time.Now()
	pending.ResolvedAt = &now
	if action == "approve" || action == "approved" {
		pending.Status = "approved"
		outcome := "Action approved via external webhook"
		status := "completed"

		var payload approvalPayload
		if err := json.Unmarshal([]byte(pending.Payload), &payload); err == nil &&
			(payload.Action == "create_entity" || payload.Action == "create_pm_task") {
			if executed, err := executeApprovalPayload(database.DB, payload); err != nil {
				outcome = "Approved via webhook but execution failed: " + err.Error()
				status = "failed"
			} else {
				outcome = executed + " from webhook approval"
			}
		}

		database.DB.Create(&models.AgentCollaborationLog{
			WorkspaceID: pending.WorkspaceID,
			AgentName:   pending.AgentName,
			Action:      "Webhook Approved Action",
			InputData:   pending.ActionType,
			OutputData:  outcome,
			Status:      status,
		})
	} else {
		pending.Status = "rejected"
		database.DB.Create(&models.AgentCollaborationLog{
			WorkspaceID: pending.WorkspaceID,
			AgentName:   pending.AgentName,
			Action:      "Webhook Rejected Action",
			InputData:   pending.Reason,
			OutputData:  "Action cancelled via external webhook",
			Status:      "failed",
		})
	}

	database.DB.Save(&pending)

	go DispatchWebhookEvent(workspaceID, "hitl.approval_resolved", pending)
	// Tenant off the approval record — this path has no request context.
	go ExecuteWorkflowsByTrigger(pending.WorkspaceID, "hitl.approval_resolved", map[string]interface{}{
		"pending_id": pending.ID.String(),
		"status":     pending.Status,
		"agent_name": pending.AgentName,
	})
}
