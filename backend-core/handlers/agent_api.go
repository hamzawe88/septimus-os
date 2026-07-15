package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/events"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services/crypto"
)

// ConfigAI saves the AI provider settings into the unified ai_providers workspace setting
func ConfigAI(c *fiber.Ctx) error {
	var input struct {
		Provider string `json:"provider"`
		Model    string `json:"model"`
		APIKey   string `json:"api_key"`
	}

	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid input"})
	}

	wsIDStr := c.Get("X-Workspace-ID")
	if wsIDStr == "" {
		wsIDStr = c.Query("workspace_id")
	}
	if wsIDStr == "" || wsIDStr == "nil" {
		var ws models.Workspace
		if err := database.DB.First(&ws).Error; err == nil {
			wsIDStr = ws.ID.String()
		}
	}

	encKey := input.APIKey
	if input.APIKey != "" {
		if enc, err := crypto.Encrypt(input.APIKey); err != nil {
			log.Printf("ConfigAI: could not encrypt api key: %v", err)
		} else {
			encKey = enc
		}
	}

	wsUUID := database.ParseUUID(wsIDStr)
	var setting models.WorkspaceSetting
	var providers []map[string]interface{}

	if err := database.DB.Where("workspace_id = ? AND key = ?", wsUUID, "ai_providers").First(&setting).Error; err == nil {
		_ = json.Unmarshal(setting.Value, &providers)
	}

	found := false
	for i := range providers {
		if providers[i]["provider"] == input.Provider {
			found = true
			providers[i]["isActive"] = true
			if input.Model != "" {
				providers[i]["selectedModel"] = input.Model
			}
			if input.APIKey != "" {
				providers[i]["apiKey"] = encKey
			}
		} else {
			providers[i]["isActive"] = false
		}
	}

	if !found {
		newEntry := map[string]interface{}{
			"provider":      input.Provider,
			"isActive":      true,
			"selectedModel": input.Model,
		}
		if input.APIKey != "" {
			newEntry["apiKey"] = encKey
		}
		providers = append(providers, newEntry)
	}

	bytes, _ := json.Marshal(providers)
	if setting.ID == uuid.Nil {
		setting = models.WorkspaceSetting{
			WorkspaceID: wsUUID,
			Key:         "ai_providers",
			Value:       bytes,
		}
		database.DB.Create(&setting)
	} else {
		setting.Value = bytes
		database.DB.Save(&setting)
	}

	return c.JSON(fiber.Map{"status": "saved"})
}


// GetAgentStatus retrieves the running state, logs, and pending approvals for all agents
func GetAgentStatus(c *fiber.Ctx) error {
	var states []models.AgentState
	database.DB.Find(&states)

	var logs []models.AgentCollaborationLog
	database.DB.Order("created_at desc").Limit(50).Find(&logs)

	var pending []models.PendingApproval
	query := database.DB.Where("status = ?", "pending")
	wsIDStr := ""
	if val := c.Locals("workspace_id"); val != nil {
		wsIDStr = fmt.Sprintf("%v", val)
		if wsIDStr != "" && wsIDStr != "nil" {
			query = query.Where("payload->>'workspace_id' = ?", wsIDStr)
		}
	}
	query.Find(&pending)

	// Also get config without API Key, checking unified settings first
	provider := "openai"
	model := "gpt-4o"

	if wsIDStr != "" && wsIDStr != "nil" {
		var setting models.WorkspaceSetting
		if err := database.DB.Where("workspace_id = ? AND key = ?", database.ParseUUID(wsIDStr), "ai_providers").First(&setting).Error; err == nil {
			var providers []struct {
				Provider      string `json:"provider"`
				IsActive      bool   `json:"isActive"`
				SelectedModel string `json:"selectedModel"`
			}
			if err := json.Unmarshal(setting.Value, &providers); err == nil {
				for _, p := range providers {
					if p.IsActive {
						provider = p.Provider
						if p.SelectedModel != "" {
							model = p.SelectedModel
						}
						break
					}
				}
			}
		}
	}


	return c.JSON(fiber.Map{
		"config": fiber.Map{
			"provider": provider,
			"model":    model,
		},
		"states":  states,
		"logs":    logs,
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

// QueuePendingApprovalRequest is what the AI sidecar sends to defer a write
// action for human review instead of executing it immediately.
type QueuePendingApprovalRequest struct {
	AgentName   string                 `json:"agent_name"`
	ActionType  string                 `json:"action_type"`
	WorkspaceID string                 `json:"workspace_id"`
	EntityType  string                 `json:"entity_type"`
	Data        map[string]interface{} `json:"data"`
	Reason      string                 `json:"reason"`
}

// approvalPayload is the structured action stored on a PendingApproval so the
// approver can execute exactly what the agent proposed.
type approvalPayload struct {
	Action      string                 `json:"action"` // "create_entity"
	WorkspaceID string                 `json:"workspace_id"`
	EntityType  string                 `json:"entity_type"`
	Data        map[string]interface{} `json:"data"`
}

// GetPendingApprovals returns pending human-in-the-loop approvals
func GetPendingApprovals(c *fiber.Ctx) error {
	status := c.Query("status", "pending")
	var approvals []models.PendingApproval
	query := database.DB.Model(&models.PendingApproval{})
	if status != "all" && status != "*" && status != "" {
		query = query.Where("status = ?", status)
	}
	if err := query.Order("requested_at desc").Find(&approvals).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch pending approvals"})
	}
	return c.JSON(approvals)
}

// QueuePendingApproval records an agent-proposed write as a pending approval
// (human-in-the-loop). Called by the sidecar's write tools instead of mutating
// data directly.
func QueuePendingApproval(c *fiber.Ctx) error {
	var req QueuePendingApprovalRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid input"})
	}

	payloadBytes, _ := json.Marshal(approvalPayload{
		Action:      "create_entity",
		WorkspaceID: req.WorkspaceID,
		EntityType:  req.EntityType,
		Data:        req.Data,
	})

	pending := models.PendingApproval{
		AgentName:  req.AgentName,
		ActionType: req.ActionType,
		Payload:    string(payloadBytes),
		Reason:     req.Reason,
		Status:     "pending",
	}
	if err := database.DB.Create(&pending).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to queue approval"})
	}

	// Nudge the UI to refresh its approvals queue.
	events.NatsConn.Publish("system.notifications", []byte(`{"type": "agent_approval_required", "agent": "chat"}`))

	workspaceUUID := database.ParseUUID(req.WorkspaceID)
	if workspaceUUID != uuid.Nil {
		go DispatchWebhookEvent(workspaceUUID, "hitl.approval_required", pending)
	}
	go ExecuteWorkflowsByTrigger("hitl.approval_required", map[string]interface{}{
		"pending_id":   pending.ID.String(),
		"agent_name":   pending.AgentName,
		"action_type":  pending.ActionType,
		"reason":       pending.Reason,
		"workspace_id": req.WorkspaceID,
	})

	return c.Status(201).JSON(fiber.Map{"message": "Action queued for approval", "id": pending.ID})
}

// ApprovePendingAction resolves a human-in-the-loop task. On approval it
// actually executes the queued action (e.g. creating the proposed entity).
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

	now := time.Now()
	if idStr, ok := c.Locals("user_id").(string); ok {
		if uid, err := uuid.Parse(idStr); err == nil {
			pending.ResolvedBy = &uid
		}
	}
	pending.ResolvedAt = &now

	if input.Action == "approve" {
		pending.Status = "approved"

		outcome := "Action approved"
		status := "completed"

		var payload approvalPayload
		if err := json.Unmarshal([]byte(pending.Payload), &payload); err == nil && payload.Action == "create_entity" {
			workspaceID, err := uuid.Parse(payload.WorkspaceID)
			if err != nil {
				outcome = "Approved but workspace id invalid; entity not created"
				status = "failed"
			} else if entity, err := createEntityRecord(workspaceID, payload.EntityType, payload.Data); err != nil {
				outcome = "Approved but execution failed: " + err.Error()
				status = "failed"
			} else {
				outcome = fmt.Sprintf("Created %s entity %s", payload.EntityType, entity.ID)
			}
		}

		database.DB.Create(&models.AgentCollaborationLog{
			AgentName:  pending.AgentName,
			Action:     "Admin Approved Action",
			InputData:  pending.ActionType,
			OutputData: outcome,
			Status:     status,
		})
	} else {
		pending.Status = "rejected"
		database.DB.Create(&models.AgentCollaborationLog{
			AgentName:  pending.AgentName,
			Action:     "Admin Rejected Action",
			InputData:  pending.Reason,
			OutputData: "Action cancelled",
			Status:     "failed",
		})
	}

	database.DB.Save(&pending)

	var payload approvalPayload
	if err := json.Unmarshal([]byte(pending.Payload), &payload); err == nil {
		wsUUID := database.ParseUUID(payload.WorkspaceID)
		if wsUUID != uuid.Nil {
			go DispatchWebhookEvent(wsUUID, "hitl.approval_resolved", pending)
		}
	}
	go ExecuteWorkflowsByTrigger("hitl.approval_resolved", map[string]interface{}{
		"pending_id":  pending.ID.String(),
		"status":      pending.Status,
		"agent_name":  pending.AgentName,
		"action_type": pending.ActionType,
	})

	return c.JSON(fiber.Map{"message": "Pending action resolved", "pending": pending})
}
