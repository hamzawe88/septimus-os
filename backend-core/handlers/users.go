package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
)

func SearchUsers(c *fiber.Ctx) error {
	workspaceID, _ := c.Locals("workspace_id").(string)
	query := c.Query("q")

	var users []models.User
	db := database.GetDB(c).Where("workspace_id = ?", workspaceID)

	if query != "" {
		// Basic ILIKE search for email since we don't have a name field yet.
		// If we had a Name field, we would search on that.
		db = db.Where("email ILIKE ?", "%"+query+"%")
	}

	if err := db.Limit(20).Find(&users).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch users"})
	}

	// We don't want to return password hashes
	var results []fiber.Map
	for _, u := range users {
		results = append(results, fiber.Map{
			"id":    u.ID,
			"email": u.Email,
			"role":  u.Role,
		})
	}

	return c.JSON(results)
}
