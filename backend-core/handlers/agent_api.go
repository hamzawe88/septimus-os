package handlers

import (
	"encoding/json"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"

	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
)

// ConfigAI saves the AI provider settings
func ConfigAI(c *fiber.Ctx) error {
	var input struct {
		Provider string `json:"provider"`
		Model    string `json:"model"`
		APIKey   string `json:"api_key"`
	}
	
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid input"})
	}
	
	var config models.AIConfig
	if err := database.DB.First(&config).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			config = models.AIConfig{
				Provider: input.Provider,
				Model:    input.Model,
				APIKey:   input.APIKey,
			}
			database.DB.Create(&config)
			return c.JSON(fiber.Map{"message": "AI config created", "config": config})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	
	config.Provider = input.Provider
	config.Model = input.Model
	if input.APIKey != "" {
		config.APIKey = input.APIKey
	}
	
	database.DB.Save(&config)
	return c.JSON(fiber.Map{"message": "AI config updated", "config": config})
}

// GetAgentStatus retrieves the running state, logs, and pending approvals for all agents
func GetAgentStatus(c *fiber.Ctx) error {
	var states []models.AgentState
	database.DB.Find(&states)
	
	var logs []models.AgentCollaborationLog
	database.DB.Order("created_at desc").Limit(50).Find(&logs)
	
	var pending []models.PendingApproval
	database.DB.Where("status = ?", "pending").Find(&pending)
	
	// Also get config without API Key
	var config models.AIConfig
	database.DB.First(&config)
	
	return c.JSON(fiber.Map{
		"config": fiber.Map{
			"provider": config.Provider,
			"model":    config.Model,
		},
		"states": states,
		"logs": logs,
		"pending": pending,
	})
}

// KillAgent flips the kill switch for an agent
func KillAgent(c *fiber.Ctx) error {
	agentName := c.Params("name")
	
	// Find or create state
	var state models.AgentState
	if err := database.DB.Where("name = ?", agentName).First(&state).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			state = models.AgentState{Name: agentName, Status: "killed", LoopCount: 0}
			database.DB.Create(&state)
		} else {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
	} else {
		// Toggle logic: if killed, resume. If running, kill.
		if state.Status == "running" {
			state.Status = "killed"
		} else {
			state.Status = "running"
		}
		database.DB.Save(&state)
	}
	
	return c.JSON(fiber.Map{"message": "Agent status updated", "agent": state})
}

// ApprovePendingAction resolves a human-in-the-loop task
func ApprovePendingAction(c *fiber.Ctx) error {
	id := c.Params("id")
	var input struct {
		Action string `json:"action"` // "approve" or "reject"
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid input"})
	}
	
	var pending models.PendingApproval
	if err := database.DB.Where("id = ?", id).First(&pending).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Pending action not found"})
	}
	
	if input.Action == "approve" {
		pending.Status = "approved"
		// Logic to proceed with the action goes here...
		// e.g. Extract payload and actually send the message
		var payloadData map[string]string
		json.Unmarshal([]byte(pending.Payload), &payloadData)
		
		logEntry := models.AgentCollaborationLog{
			AgentName: pending.AgentName,
			Action: "Admin Approved Action",
			InputData: payloadData["message"],
			OutputData: "Message sent after approval",
			Status: "completed",
		}
		database.DB.Create(&logEntry)
		
	} else {
		pending.Status = "rejected"
		
		logEntry := models.AgentCollaborationLog{
			AgentName: pending.AgentName,
			Action: "Admin Rejected Action",
			InputData: pending.Reason,
			OutputData: "Action cancelled",
			Status: "failed",
		}
		database.DB.Create(&logEntry)
	}
	
	database.DB.Save(&pending)
	return c.JSON(fiber.Map{"message": "Pending action resolved", "pending": pending})
}
