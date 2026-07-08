package handlers

import (
	"log"
	"encoding/json"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
)

type DeployAgentPayload struct {
	Name   string                 `json:"name"`
	Role   string                 `json:"role"`
	Config map[string]interface{} `json:"config"`
}

func GetAgents(c *fiber.Ctx) error {
	var agents []models.AgentState
	if err := database.DB.Find(&agents).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to fetch agents"})
	}
	return c.JSON(agents)
}

func DeployAgent(c *fiber.Ctx) error {
	var payload DeployAgentPayload
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid JSON payload"})
	}

	configBytes, err := json.Marshal(payload.Config)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid config"})
	}

	agent := models.AgentState{
		Name:   payload.Name,
		Role:   payload.Role,
		Status: "running",
		Config: string(configBytes),
	}

	if err := database.DB.Create(&agent).Error; err != nil {
		log.Printf("Failed to deploy agent: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "failed to deploy agent"})
	}

	return c.Status(201).JSON(fiber.Map{
		"message": "Agent deployed successfully",
		"agent":   agent,
	})
}

func UpdateAgentStatus(c *fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid agent id"})
	}

	var payload struct {
		Status string `json:"status"`
	}
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid JSON payload"})
	}

	var agent models.AgentState
	if err := database.DB.First(&agent, "id = ?", id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "agent not found"})
	}

	agent.Status = payload.Status
	if err := database.DB.Save(&agent).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to update agent status"})
	}

	return c.JSON(fiber.Map{"message": "Agent status updated", "agent": agent})
}
