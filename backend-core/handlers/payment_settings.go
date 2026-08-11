package handlers

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services/crypto"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

const encryptedPaymentCredentialsKey = "_encrypted"

type paymentGatewayResponse struct {
	ID             interface{}       `json:"id"`
	GatewayName    string            `json:"gateway_name"`
	IsActive       bool              `json:"is_active"`
	IsTestMode     bool              `json:"is_test_mode"`
	Credentials    map[string]string `json:"credentials"`
	HasCredentials bool              `json:"has_credentials"`
	Currency       string            `json:"currency"`
	SortOrder      int               `json:"sort_order"`
	CreatedAt      interface{}       `json:"created_at"`
	UpdatedAt      interface{}       `json:"updated_at"`
}

func decodePaymentCredentials(raw datatypes.JSON) (map[string]string, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return map[string]string{}, nil
	}
	var wrapper map[string]json.RawMessage
	if err := json.Unmarshal(raw, &wrapper); err != nil {
		return nil, err
	}
	if encryptedRaw, ok := wrapper[encryptedPaymentCredentialsKey]; ok {
		var encrypted string
		if err := json.Unmarshal(encryptedRaw, &encrypted); err != nil {
			return nil, err
		}
		plain, err := crypto.Decrypt(encrypted)
		if err != nil {
			return nil, err
		}
		var credentials map[string]string
		if err := json.Unmarshal([]byte(plain), &credentials); err != nil {
			return nil, err
		}
		return credentials, nil
	}

	// Legacy rows were stored as plaintext JSONB. They are accepted only so the
	// startup migration below can encrypt them immediately.
	var credentials map[string]string
	if err := json.Unmarshal(raw, &credentials); err != nil {
		return nil, err
	}
	return credentials, nil
}

func encodePaymentCredentials(credentials map[string]string) (datatypes.JSON, error) {
	plain, err := json.Marshal(credentials)
	if err != nil {
		return nil, err
	}
	encrypted, err := crypto.Encrypt(string(plain))
	if err != nil {
		return nil, err
	}
	wrapper, err := json.Marshal(map[string]string{encryptedPaymentCredentialsKey: encrypted})
	return datatypes.JSON(wrapper), err
}

func paymentGatewayView(gateway models.PaymentGatewaySettings) (paymentGatewayResponse, error) {
	stored, err := decodePaymentCredentials(gateway.Credentials)
	if err != nil {
		return paymentGatewayResponse{}, err
	}
	template := make(map[string]string, len(stored))
	hasCredentials := false
	for key, value := range stored {
		template[key] = ""
		if strings.TrimSpace(value) != "" {
			hasCredentials = true
		}
	}
	return paymentGatewayResponse{
		ID:             gateway.ID,
		GatewayName:    gateway.GatewayName,
		IsActive:       gateway.IsActive,
		IsTestMode:     gateway.IsTestMode,
		Credentials:    template,
		HasCredentials: hasCredentials,
		Currency:       gateway.Currency,
		SortOrder:      gateway.SortOrder,
		CreatedAt:      gateway.CreatedAt,
		UpdatedAt:      gateway.UpdatedAt,
	}, nil
}

// EnsurePaymentGatewayCredentialsEncrypted upgrades legacy plaintext JSONB
// rows before the HTTP server starts. A failed migration is fatal to startup:
// serving while payment secrets remain readable would silently preserve the
// vulnerability this migration is intended to close.
func EnsurePaymentGatewayCredentialsEncrypted(db *gorm.DB) error {
	var gateways []models.PaymentGatewaySettings
	if err := db.Find(&gateways).Error; err != nil {
		return err
	}
	for _, gateway := range gateways {
		var wrapper map[string]json.RawMessage
		if json.Unmarshal(gateway.Credentials, &wrapper) == nil {
			if _, encrypted := wrapper[encryptedPaymentCredentialsKey]; encrypted {
				continue
			}
		}
		credentials, err := decodePaymentCredentials(gateway.Credentials)
		if err != nil {
			return fmt.Errorf("decode %s credentials: %w", gateway.GatewayName, err)
		}
		encoded, err := encodePaymentCredentials(credentials)
		if err != nil {
			return fmt.Errorf("encrypt %s credentials: %w", gateway.GatewayName, err)
		}
		if err := db.Model(&gateway).Update("credentials", encoded).Error; err != nil {
			return fmt.Errorf("save %s credentials: %w", gateway.GatewayName, err)
		}
	}
	return nil
}

// Admin: GetPaymentGateways returns gateway metadata and empty credential
// fields. Secret values are never returned after their initial submission.
func GetPaymentGateways(c *fiber.Ctx) error {
	var gateways []models.PaymentGatewaySettings
	if err := database.GetDB(c).Order("sort_order ASC").Find(&gateways).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch gateways"})
	}
	response := make([]paymentGatewayResponse, 0, len(gateways))
	for _, gateway := range gateways {
		view, err := paymentGatewayView(gateway)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to decode gateway settings"})
		}
		response = append(response, view)
	}
	return c.JSON(response)
}

// Admin: UpdatePaymentGateway updates metadata and merges only non-empty
// credential fields. Blank fields preserve the existing encrypted value.
func UpdatePaymentGateway(c *fiber.Ctx) error {
	id := c.Params("id")
	var gateway models.PaymentGatewaySettings
	if err := database.GetDB(c).First(&gateway, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Gateway not found"})
	}

	var updateData struct {
		IsActive    bool              `json:"is_active"`
		IsTestMode  bool              `json:"is_test_mode"`
		Currency    string            `json:"currency"`
		Credentials map[string]string `json:"credentials"`
	}
	if err := c.BodyParser(&updateData); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	switch updateData.Currency {
	case "USD", "LYD", "EUR":
	default:
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Unsupported currency"})
	}

	gateway.IsActive = updateData.IsActive
	gateway.IsTestMode = updateData.IsTestMode
	gateway.Currency = updateData.Currency

	if len(updateData.Credentials) > 0 {
		existing, err := decodePaymentCredentials(gateway.Credentials)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Could not decode existing credentials"})
		}
		for key, value := range updateData.Credentials {
			if strings.TrimSpace(value) != "" {
				existing[key] = value
			}
		}
		encoded, err := encodePaymentCredentials(existing)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Could not encrypt gateway credentials"})
		}
		gateway.Credentials = encoded
	}

	if err := database.GetDB(c).Save(&gateway).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update gateway"})
	}
	view, err := paymentGatewayView(gateway)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to render gateway settings"})
	}
	return c.JSON(view)
}

// Public: GetActivePaymentGateways returns active gateways for checkout.
func GetActivePaymentGateways(c *fiber.Ctx) error {
	var gateways []models.PaymentGatewaySettings
	if err := database.GetDB(c).Select("id", "gateway_name", "is_test_mode", "currency", "sort_order").Where("is_active = ?", true).Order("sort_order ASC").Find(&gateways).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch active gateways"})
	}
	return c.JSON(gateways)
}
