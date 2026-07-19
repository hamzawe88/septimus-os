package handlers

import (
	"fmt"

	"github.com/gofiber/fiber/v2"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
)

// GetSaaSPlans returns all active plans for public/customer view
func GetSaaSPlans(c *fiber.Ctx) error {
	var plans []models.SaaSPlan
	// Fetch plans ordered by price
	if err := database.GetDB(c).Where("is_active = ?", true).Order("price ASC").Find(&plans).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch plans"})
	}
	return c.JSON(plans)
}

// Admin: GetAllSaaSPlans returns all plans (active and inactive)
func GetAllSaaSPlans(c *fiber.Ctx) error {
	var plans []models.SaaSPlan
	if err := database.GetDB(c).Order("price ASC").Find(&plans).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch plans"})
	}
	return c.JSON(plans)
}

// Admin: CreateSaaSPlan
func CreateSaaSPlan(c *fiber.Ctx) error {
	var plan models.SaaSPlan
	if err := c.BodyParser(&plan); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if err := database.GetDB(c).Create(&plan).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create plan"})
	}
	services.InvalidateEntitlementsCache()
	return c.Status(fiber.StatusCreated).JSON(plan)
}

// Admin: UpdateSaaSPlan
func UpdateSaaSPlan(c *fiber.Ctx) error {
	id := c.Params("id")
	var plan models.SaaSPlan
	if err := database.GetDB(c).First(&plan, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Plan not found"})
	}

	var updateData models.SaaSPlan
	if err := c.BodyParser(&updateData); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	// Update fields safely
	plan.NameEn = updateData.NameEn
	plan.NameAr = updateData.NameAr
	plan.Price = updateData.Price
	plan.Currency = updateData.Currency
	plan.DescriptionEn = updateData.DescriptionEn
	plan.DescriptionAr = updateData.DescriptionAr
	plan.FeaturesEn = updateData.FeaturesEn
	plan.FeaturesAr = updateData.FeaturesAr
	plan.Recommended = updateData.Recommended
	plan.Color = updateData.Color
	plan.IsActive = updateData.IsActive

	// Entitlements: only overwrite when the client actually sent them, so an
	// older client that omits these fields can't silently wipe a plan's gating.
	if len(updateData.Features) > 0 {
		plan.Features = updateData.Features
	}
	if len(updateData.Limits) > 0 {
		plan.Limits = updateData.Limits
	}

	if err := database.GetDB(c).Save(&plan).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update plan"})
	}
	services.InvalidateEntitlementsCache()
	return c.JSON(plan)
}

// Admin: DeleteSaaSPlan
func DeleteSaaSPlan(c *fiber.Ctx) error {
	id := c.Params("id")
	if err := database.GetDB(c).Delete(&models.SaaSPlan{}, "id = ?", id).Error; err != nil {
		fmt.Printf("Failed to delete SaaS Plan %s: %v\n", id, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete plan", "details": err.Error()})
	}
	services.InvalidateEntitlementsCache()
	return c.SendStatus(fiber.StatusNoContent)
}
