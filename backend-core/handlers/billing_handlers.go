package handlers

import (
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
)

type CheckoutRequest struct {
	Tier      string `json:"tier"`
	ReturnURL string `json:"return_url"`
	Simulated bool   `json:"simulated"`
	Gateway   string `json:"gateway"`
}

type PortalRequest struct {
	ReturnURL string `json:"return_url"`
}

// CreateCheckoutSession handles POST /api/v1/billing/checkout
func CreateCheckoutSession(c *fiber.Ctx) error {
	wsVal := c.Locals("workspace")
	if wsVal == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized workspace context"})
	}
	ws := wsVal.(*models.Workspace)

	var req CheckoutRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	if req.ReturnURL == "" {
		req.ReturnURL = "http://localhost:3000/admin/billing"
	}

	targetTier := strings.ToLower(req.Tier)
	
	// Fetch plan from database instead of hardcoded validation
	var plan models.SaaSPlan
	if err := database.GetDB(c).Where("tier_id = ? AND is_active = ?", targetTier, true).First(&plan).Error; err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid or inactive tier"})
	}

	gateway := strings.ToLower(req.Gateway)
	if gateway == "" {
		gateway = "stripe" // default
	}

	result, err := services.CreateCheckoutSession(ws, &plan, gateway, req.ReturnURL, req.Simulated)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(result)
}

// CreatePortalSession handles POST /api/v1/billing/portal
func CreatePortalSession(c *fiber.Ctx) error {
	wsVal := c.Locals("workspace")
	if wsVal == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized workspace context"})
	}
	ws := wsVal.(*models.Workspace)

	var req PortalRequest
	c.BodyParser(&req)
	if req.ReturnURL == "" {
		req.ReturnURL = "http://localhost:3000/admin/billing"
	}

	result, err := services.CreatePortalSession(ws, req.ReturnURL)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(result)
}

// GetBillingStatus handles GET /api/v1/billing/status
func GetBillingStatus(c *fiber.Ctx) error {
	wsVal := c.Locals("workspace")
	if wsVal == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized workspace context"})
	}
	ws := wsVal.(*models.Workspace)

	// Fetch or initialize Subscription record
	var sub models.Subscription
	var invoices []models.Invoice
	var userCount int64 = 1
	var channelCount int64 = 0
	var estimatedStorageGB float64 = 0.01

	if database.GetDB(c) != nil {
		err := database.GetDB(c).Where("workspace_id = ?", ws.ID).First(&sub).Error
		if err != nil {
			cusID := "cus_default_" + ws.ID.String()[:8]
			sub = models.Subscription{
				WorkspaceID:          ws.ID,
				StripeCustomerID:     &cusID,
				Tier:                 ws.Tier,
				Status:               ws.Status,
				CurrentPeriodStart:   time.Now(),
				CurrentPeriodEnd:     services.GetNextPeriodEnd(),
			}
			database.GetDB(c).Create(&sub)
		}

		// Fetch Invoices for this workspace
		database.GetDB(c).Where("workspace_id = ?", ws.ID).Order("paid_at DESC").Limit(10).Find(&invoices)

		// Calculate live quota usage
		database.GetDB(c).Model(&models.User{}).Where("workspace_id = ?", ws.ID).Count(&userCount)
		database.GetDB(c).Model(&models.Channel{}).Where("workspace_id = ?", ws.ID).Count(&channelCount)
		// Calculate dynamic storage usage based on activities
		estimatedStorageGB = float64(userCount)*0.01 + float64(channelCount)*0.05
		if estimatedStorageGB < 0.01 {
			estimatedStorageGB = 0.01
		}

	} else {
		cusID := "cus_mock_" + ws.ID.String()[:8]
		sub = models.Subscription{
			WorkspaceID:          ws.ID,
			StripeCustomerID:     &cusID,
			Tier:                 ws.Tier,
			Status:               ws.Status,
			CurrentPeriodStart:   time.Now(),
			CurrentPeriodEnd:     services.GetNextPeriodEnd(),
		}
	}

	// Limits come from the data-driven entitlements (plan → matrix), never
	// hardcoded here. -1 means unlimited.
	maxUsers := services.GetLimit(ws, services.LimUsers)
	maxStorageGB := services.GetLimit(ws, services.LimStorageGB)
	maxProjects := services.GetLimit(ws, services.LimProjects)
	maxAITokens := services.GetLimit(ws, services.LimAITokensMonth)

	// Real usage counters.
	var projectCount int64
	database.GetDB(c).Model(&models.Project{}).Where("workspace_id = ?", ws.ID).Count(&projectCount)

	var aiTokensMonth int64
	now := time.Now().UTC()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	database.GetDB(c).Model(&models.AITokenUsage{}).
		Where("workspace_id = ? AND created_at >= ?", ws.ID, monthStart).
		Select("COALESCE(SUM(total_tokens),0)").Scan(&aiTokensMonth)

	return c.JSON(fiber.Map{
		"workspace":    ws,
		"subscription": sub,
		"invoices":     invoices,
		"usage": fiber.Map{
			"users":      fiber.Map{"current": userCount, "max": maxUsers},
			"projects":   fiber.Map{"current": projectCount, "max": maxProjects},
			"storage_gb": fiber.Map{"current": estimatedStorageGB, "max": maxStorageGB},
			"ai_tokens":  fiber.Map{"current": aiTokensMonth, "max": maxAITokens},
		},
	})
}
