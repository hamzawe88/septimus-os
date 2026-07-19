package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
)

// Admin: GetPaymentGateways returns all payment gateways
func GetPaymentGateways(c *fiber.Ctx) error {
	var gateways []models.PaymentGatewaySettings
	if err := database.GetDB(c).Order("sort_order ASC").Find(&gateways).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch gateways"})
	}
	return c.JSON(gateways)
}

// Admin: UpdatePaymentGateway updates the credentials or status of a gateway
func UpdatePaymentGateway(c *fiber.Ctx) error {
	id := c.Params("id")
	var gateway models.PaymentGatewaySettings
	if err := database.GetDB(c).First(&gateway, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Gateway not found"})
	}

	var updateData models.PaymentGatewaySettings
	if err := c.BodyParser(&updateData); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	// Update specific fields
	gateway.IsActive = updateData.IsActive
	gateway.IsTestMode = updateData.IsTestMode
	gateway.Currency = updateData.Currency
	
	// Only update credentials if provided
	if len(updateData.Credentials) > 0 && string(updateData.Credentials) != "{}" && string(updateData.Credentials) != "null" {
		gateway.Credentials = updateData.Credentials
	}

	if err := database.GetDB(c).Save(&gateway).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update gateway"})
	}

	return c.JSON(gateway)
}

// Public: GetActivePaymentGateways returns active payment gateways for checkout
func GetActivePaymentGateways(c *fiber.Ctx) error {
	var gateways []models.PaymentGatewaySettings
	// Omit credentials for public endpoint!
	if err := database.GetDB(c).Select("id", "gateway_name", "is_test_mode", "currency", "sort_order").Where("is_active = ?", true).Order("sort_order ASC").Find(&gateways).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch active gateways"})
	}
	return c.JSON(gateways)
}
