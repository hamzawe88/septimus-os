package services

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/models"
)

type CheckoutSessionResult struct {
	SessionID string `json:"session_id"`
	URL       string `json:"url"`
	Amount    int64  `json:"amount"` // cents or lowest denomination
	Currency  string `json:"currency"`
	Tier      string `json:"tier"`
	Gateway   string `json:"gateway"`
}

type PortalSessionResult struct {
	URL string `json:"url"`
}

func getStripeSecret() string {
	return os.Getenv("STRIPE_SECRET_KEY")
}

func GetStripeWebhookSecret() string {
	return os.Getenv("STRIPE_WEBHOOK_SECRET")
}

// GetTierPrice is deprecated: pricing is now dynamic via SaaSPlan in the DB
func GetTierPrice(tier string) int64 {
	switch tier {
	case "starter":
		return 4900
	case "business":
		return 19900
	case "enterprise":
		return 99900
	default:
		return 0
	}
}

// CreateCheckoutSession initializes a checkout session for tier upgrade using the specified gateway
func CreateCheckoutSession(ws *models.Workspace, plan *models.SaaSPlan, gateway string, returnURL string, simulated bool) (*CheckoutSessionResult, error) {
	amount := int64(plan.Price * 100) // Assuming float64 price is converted to subunits

	sessionID := fmt.Sprintf("cs_%s_%s_%s", gateway, uuid.New().String()[:8], plan.TierID)

	// In a real implementation, we would call the respective gateway's API here.
	// (Stripe, Moamalat, OnePay). For now, we simulate the URL.

	// If live keys are missing or simulated mode is true, return simulated local URL
	if getStripeSecret() == "" || simulated || gateway != "stripe" {
		simURL := fmt.Sprintf("%s?session_id=%s&tier=%s&gateway=%s&simulated=true&workspace_id=%s", returnURL, sessionID, plan.TierID, gateway, ws.ID.String())
		return &CheckoutSessionResult{
			SessionID: sessionID,
			URL:       simURL,
			Amount:    amount,
			Currency:  plan.Currency,
			Tier:      plan.TierID,
			Gateway:   gateway,
		}, nil
	}

	// Example: Live Stripe API call would go here
	return &CheckoutSessionResult{
		SessionID: sessionID,
		URL:       fmt.Sprintf("%s?session_id=%s&tier=%s&gateway=%s", returnURL, sessionID, plan.TierID, gateway),
		Amount:    amount,
		Currency:  plan.Currency,
		Tier:      plan.TierID,
		Gateway:   gateway,
	}, nil
}

// CreatePortalSession generates customer portal URL for invoice & billing management
func CreatePortalSession(ws *models.Workspace, returnURL string) (*PortalSessionResult, error) {
	if getStripeSecret() == "" {
		return &PortalSessionResult{
			URL: fmt.Sprintf("%s?portal_simulated=true&workspace_id=%s", returnURL, ws.ID.String()),
		}, nil
	}
	return &PortalSessionResult{
		URL: fmt.Sprintf("%s?portal_session=bps_%s", returnURL, uuid.New().String()[:8]),
	}, nil
}

// VerifyWebhookSignature verifies HMAC-SHA256 signature against STRIPE_WEBHOOK_SECRET
func VerifyWebhookSignature(payload []byte, headerSig string, secret string) bool {
	if secret == "" {
		// Local billing simulation must be explicitly enabled and can never run
		// in production. Missing production secrets fail closed.
		return !strings.EqualFold(os.Getenv("APP_ENV"), "production") &&
			strings.EqualFold(os.Getenv("ENABLE_DEV_BILLING_SIMULATION"), "true") &&
			headerSig == "simulated_signature"
	}

	// Stripe signature header format: t=timestamp,v1=signature
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	expectedSig := hex.EncodeToString(mac.Sum(nil))

	// In production, split headerSig by ',' and compare timestamp + signature
	// For exact timing and standard signature match:
	return hmac.Equal([]byte(headerSig), []byte(expectedSig))
}

// GetNextPeriodEnd calculates 30 days subscription period
func GetNextPeriodEnd() time.Time {
	return time.Now().AddDate(0, 1, 0)
}
