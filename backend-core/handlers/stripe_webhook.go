package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/events"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
)

type WebhookPayload struct {
	Type string `json:"type"`
	Data struct {
		Object struct {
			ID                 string `json:"id"`
			Customer           string `json:"customer"`
			Subscription       string `json:"subscription"`
			ClientReferenceID  string `json:"client_reference_id"`
			Metadata           map[string]string `json:"metadata"`
			AmountTotal        int64  `json:"amount_total"`
			Status             string `json:"status"`
			HostedInvoiceUrl   string `json:"hosted_invoice_url"`
		} `json:"object"`
	} `json:"data"`
	// For simulation shortcuts
	SimulatedWorkspaceID string `json:"workspace_id"`
	SimulatedTier        string `json:"tier"`
}

// StripeWebhook handles POST /api/v1/webhooks/stripe
func StripeWebhook(c *fiber.Ctx) error {
	payloadBytes := c.Body()
	signatureHeader := c.Get("Stripe-Signature")
	secret := services.GetStripeWebhookSecret()

	if !services.VerifyWebhookSignature(payloadBytes, signatureHeader, secret) {
		log.Println("Stripe Webhook signature verification failed")
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid webhook signature"})
	}

	var payload WebhookPayload
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid json payload"})
	}

	log.Printf("Received Stripe/Billing Webhook event: %s", payload.Type)

	switch payload.Type {
	case "checkout.session.completed", "simulated.tier.upgrade":
		wsIDStr := payload.Data.Object.ClientReferenceID
		if wsIDStr == "" && payload.Data.Object.Metadata != nil {
			wsIDStr = payload.Data.Object.Metadata["workspace_id"]
		}
		if wsIDStr == "" {
			wsIDStr = payload.SimulatedWorkspaceID
		}
		if wsIDStr == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "missing workspace_id in webhook payload"})
		}

		targetTier := "business"
		if payload.Data.Object.Metadata != nil && payload.Data.Object.Metadata["tier"] != "" {
			targetTier = payload.Data.Object.Metadata["tier"]
		}
		if payload.SimulatedTier != "" {
			targetTier = payload.SimulatedTier
		}

		wsID := database.ParseUUID(wsIDStr)
		var ws models.Workspace
		if database.GetDB(c) != nil {
			if err := database.GetDB(c).Where("id = ?", wsID).First(&ws).Error; err != nil {
				log.Printf("Webhook error: workspace %s not found", wsIDStr)
				return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "workspace not found"})
			}
			ws.Tier = targetTier
			ws.Status = "active"
			database.GetDB(c).Save(&ws)

			// Update or Create Subscription
			var sub models.Subscription
			if err := database.GetDB(c).Where("workspace_id = ?", ws.ID).First(&sub).Error; err != nil {
				sub = models.Subscription{
					WorkspaceID: ws.ID,
				}
			}
			sub.Tier = targetTier
			sub.Status = "active"
			cusID := payload.Data.Object.Customer
			if cusID == "" {
				cusID = "cus_" + wsIDStr[:8]
			}
			sub.StripeCustomerID = &cusID
			
			subID := payload.Data.Object.Subscription
			if subID == "" {
				subID = "sub_" + wsIDStr[:8]
			}
			sub.StripeSubscriptionID = &subID
			sub.CurrentPeriodStart = time.Now()
			sub.CurrentPeriodEnd = services.GetNextPeriodEnd()
			database.GetDB(c).Save(&sub)

			// Create paid Invoice log
			amount := payload.Data.Object.AmountTotal
			if amount == 0 {
				amount = services.GetTierPrice(targetTier)
			}
			invID := fmt.Sprintf("inv_%d_%s", time.Now().Unix(), wsIDStr[:6])
			inv := models.Invoice{
				WorkspaceID:     ws.ID,
				StripeInvoiceID: &invID,
				AmountPaid:      amount,
				Currency:        "usd",
				Status:          "paid",
				InvoicePDFURL:   payload.Data.Object.HostedInvoiceUrl,
				PaidAt:          time.Now(),
			}
			database.GetDB(c).Create(&inv)
		} else {
			ws = models.Workspace{ID: wsID, Tier: targetTier, Status: "active"}
		}

		// Broadcast NATS event for real-time frontend/sidecar updates
		evtData, _ := json.Marshal(map[string]interface{}{
			"event":        "events.billing.upgraded",
			"workspace_id": ws.ID.String(),
			"new_tier":     targetTier,
			"timestamp":    time.Now().Format(time.RFC3339),
		})
		if events.JetStream != nil {
			events.PublishEvent("events.billing.upgraded", evtData)
		}

		log.Printf("Successfully upgraded workspace %s to tier %s", wsIDStr, targetTier)

	case "invoice.payment_failed":
		wsIDStr := payload.Data.Object.Metadata["workspace_id"]
		if wsIDStr != "" {
			database.GetDB(c).Model(&models.Workspace{}).Where("id = ?", database.ParseUUID(wsIDStr)).Update("status", "past_due")
			database.GetDB(c).Model(&models.Subscription{}).Where("workspace_id = ?", database.ParseUUID(wsIDStr)).Update("status", "past_due")
		}
	}

	return c.JSON(fiber.Map{"status": "processed"})
}
