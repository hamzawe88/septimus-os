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
	"github.com/septimus-os/backend-core/services"
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

	// Resolve the tenant from the session first. Falling back to "the first
	// workspace in the database" (the old behaviour) wrote one tenant's provider
	// key into another tenant's settings.
	wsIDStr := ""
	if val := c.Locals("workspace_id"); val != nil {
		if s, ok := val.(string); ok && s != "" && s != "nil" {
			wsIDStr = s
		}
	}
	if wsIDStr == "" {
		// Set by the Go AI proxy from the caller's JWT before forwarding; the
		// Authorization header is stripped at that boundary, so this is the only
		// tenant signal an internal call carries.
		wsIDStr = c.Get("X-Workspace-ID")
	}
	// No ?workspace_id= fallback: ConfigAI writes provider API keys, this route
	// is JWT-protected only, and the session always names a tenant here — the
	// parameter could only ever have been someone naming a tenant that is not
	// theirs.
	if wsIDStr == "" || wsIDStr == "nil" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "missing workspace context"})
	}

	// Fail closed: a provider key that cannot be encrypted must never be
	// persisted. The previous behaviour logged the failure and stored the key in
	// cleartext, silently downgrading encryption-at-rest to none.
	encKey := input.APIKey
	if input.APIKey != "" {
		enc, err := crypto.Encrypt(input.APIKey)
		if err != nil {
			log.Printf("ConfigAI: refusing to store api key — encryption failed: %v", err)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "could not encrypt the API key; check SETTINGS_ENC_KEY. Nothing was saved.",
			})
		}
		encKey = enc
	}

	wsUUID := database.ParseUUID(wsIDStr)
	var setting models.WorkspaceSetting
	var providers []map[string]interface{}

	if err := database.GetDB(c).Where("workspace_id = ? AND key = ?", wsUUID, "ai_providers").First(&setting).Error; err == nil {
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
		database.GetDB(c).Create(&setting)
	} else {
		setting.Value = bytes
		database.GetDB(c).Save(&setting)
	}

	return c.JSON(fiber.Map{"status": "saved"})
}

// GetAgentStatus retrieves the running state, logs, and pending approvals for all agents
func GetAgentStatus(c *fiber.Ctx) error {
	// Everything here is tenant data: agent names repeat across workspaces and
	// collaboration logs quote real content, so all three reads are scoped to the
	// caller's workspace (they used to return every tenant's rows).
	wsID := getWorkspaceID(c)
	wsIDStr := ""
	if val := c.Locals("workspace_id"); val != nil {
		wsIDStr = fmt.Sprintf("%v", val)
		if wsIDStr == "nil" {
			wsIDStr = ""
		}
	}

	var states []models.AgentState
	database.GetDB(c).Where("workspace_id = ?", wsID).Find(&states)

	var logs []models.AgentCollaborationLog
	database.GetDB(c).Where("workspace_id = ?", wsID).Order("created_at desc").Limit(50).Find(&logs)

	var pending []models.PendingApproval
	database.GetDB(c).Where("status = ? AND workspace_id = ?", "pending", wsID).Find(&pending)

	// Also get config without API Key, checking unified settings first
	provider := "openai"
	model := "gpt-4o"

	if wsIDStr != "" && wsIDStr != "nil" {
		var setting models.WorkspaceSetting
		if err := database.GetDB(c).Where("workspace_id = ? AND key = ?", database.ParseUUID(wsIDStr), "ai_providers").First(&setting).Error; err == nil {
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
		// The Centrifugo channel carrying live updates for this snapshot. Handing
		// it to the client (instead of letting it guess from localStorage) is what
		// guarantees the subscriber and the publishers agree on the workspace.
		"channel": AgentsChannel(getWorkspaceID(c)),
	})
}

// KillAgent flips the kill switch for an agent
func KillAgent(c *fiber.Ctx) error {
	agentName := c.Params("name")
	wsID := getWorkspaceID(c)

	// Find or create state — scoped to the caller's workspace, otherwise killing
	// "crm" would flip whichever tenant's row happened to be found first.
	var state models.AgentState
	if err := database.GetDB(c).Where("name = ? AND workspace_id = ?", agentName, wsID).First(&state).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			state = models.AgentState{WorkspaceID: wsID, Name: agentName, Status: "killed", LoopCount: 0}
			database.GetDB(c).Create(&state)
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
		database.GetDB(c).Save(&state)
	}

	PublishAgentState(getWorkspaceID(c), &state)

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
	ProjectID   string                 `json:"project_id"`
	UseInbox    bool                   `json:"use_inbox"`
	Reason      string                 `json:"reason"`
}

// approvalPayload is the structured action stored on a PendingApproval so the
// approver can execute exactly what the agent proposed.
type approvalPayload struct {
	Action      string                 `json:"action"` // create_entity | create_pm_task
	WorkspaceID string                 `json:"workspace_id"`
	EntityType  string                 `json:"entity_type"`
	Data        map[string]interface{} `json:"data"`
	ProjectID   string                 `json:"project_id,omitempty"`
	UseInbox    bool                   `json:"use_inbox,omitempty"`
}

func approvalText(data map[string]interface{}, key string) string {
	if data == nil || data[key] == nil {
		return ""
	}
	return fmt.Sprint(data[key])
}

func approvalInt(data map[string]interface{}, keys ...string) int {
	for _, key := range keys {
		switch value := data[key].(type) {
		case float64:
			return int(value)
		case int:
			return value
		}
	}
	return 0
}

// executeApprovalPayload keeps UI and webhook approvals on the same command
// boundary. Legacy queued task proposals are transparently routed to PM Inbox
// instead of reopening the retired generic-entity write path.
func executeApprovalPayload(db *gorm.DB, payload approvalPayload) (string, error) {
	workspaceID, err := uuid.Parse(payload.WorkspaceID)
	if err != nil {
		return "", err
	}
	if payload.Action == "create_pm_task" || (payload.Action == "create_entity" && isRetiredPMEntityType(payload.EntityType)) {
		projectID, parseErr := uuid.Parse(payload.ProjectID)
		if parseErr != nil {
			project, ensureErr := services.EnsurePMInboxProject(db, workspaceID, nil)
			if ensureErr != nil {
				return "", ensureErr
			}
			projectID = project.ID
		}
		task, createErr := services.CreatePMTask(db, workspaceID, services.CreatePMTaskInput{
			ProjectID: projectID, Title: approvalText(payload.Data, "title"),
			Description: approvalText(payload.Data, "description"),
			Priority:    approvalInt(payload.Data, "priority"),
			StoryPoints: approvalInt(payload.Data, "story_points", "points"), Source: "approved_ai",
		})
		if createErr != nil {
			return "", createErr
		}
		go ExecuteWorkflowsByTrigger(workspaceID, "task.created", map[string]interface{}{
			"task_id": task.ID.String(), "project_id": task.ProjectID.String(),
			"title": task.Title, "status": task.Status, "source": "approved_ai",
		})
		return fmt.Sprintf("Created PM task %s", task.ID), nil
	}
	entity, err := createEntityRecordWithDB(db, workspaceID, nil, nil, payload.EntityType, payload.Data)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("Created %s entity %s", payload.EntityType, entity.ID), nil
}

// GetPendingApprovals returns pending human-in-the-loop approvals
func GetPendingApprovals(c *fiber.Ctx) error {
	status := c.Query("status", "pending")
	var approvals []models.PendingApproval
	// Workspace-scoped: an approval carries the proposed write of one tenant.
	query := database.GetDB(c).Model(&models.PendingApproval{}).Where("workspace_id = ?", getWorkspaceID(c))
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

	// An approval carries a write that an admin will later execute, so it must
	// name a real tenant. An unparseable id used to become uuid.Nil and land the
	// proposed write in a workspace nobody owns (or reviews).
	wsUUID := database.ParseUUID(req.WorkspaceID)
	if wsUUID == uuid.Nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "valid workspace_id is required"})
	}

	action := "create_entity"
	useInbox := req.UseInbox
	if isRetiredPMEntityType(req.EntityType) {
		action = "create_pm_task"
		if req.ProjectID == "" {
			useInbox = true
		}
	}
	payloadBytes, _ := json.Marshal(approvalPayload{
		Action:      action,
		WorkspaceID: req.WorkspaceID,
		EntityType:  req.EntityType,
		Data:        req.Data,
		ProjectID:   req.ProjectID,
		UseInbox:    useInbox,
	})

	pending := models.PendingApproval{
		WorkspaceID: wsUUID,
		AgentName:   req.AgentName,
		ActionType:  req.ActionType,
		Payload:     string(payloadBytes),
		Reason:      req.Reason,
		Status:      "pending",
	}
	if err := database.GetDB(c).Create(&pending).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to queue approval"})
	}

	// Nudge the UI to refresh its approvals queue.
	events.NatsConn.Publish("system.notifications", []byte(`{"type": "agent_approval_required", "agent": "chat"}`))

	// Push the new approval straight into the AI Center's live queue.
	PublishAgentApproval(wsUUID, &pending, false)
	go DispatchWebhookEvent(wsUUID, "hitl.approval_required", pending)
	go ExecuteWorkflowsByTrigger(getWorkspaceID(c), "hitl.approval_required", map[string]interface{}{
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

	// Scoped: without the workspace filter one tenant's admin could approve (and
	// therefore execute) an action queued in another tenant.
	var pending models.PendingApproval
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", id, getWorkspaceID(c)).First(&pending).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Pending action not found"})
	}

	now := time.Now()
	if idStr, ok := c.Locals("user_id").(string); ok {
		if uid, err := uuid.Parse(idStr); err == nil {
			pending.ResolvedBy = &uid
		}
	}
	pending.ResolvedAt = &now

	// The queued action carries the workspace it was proposed in; that is the
	// stream the resulting log and the resolution belong on.
	var payload approvalPayload
	_ = json.Unmarshal([]byte(pending.Payload), &payload)
	wsUUID := database.ParseUUID(payload.WorkspaceID)

	var logEntry models.AgentCollaborationLog

	if input.Action == "approve" {
		pending.Status = "approved"

		outcome := "Action approved"
		status := "completed"

		if payload.Action == "create_entity" || payload.Action == "create_pm_task" {
			if executed, err := executeApprovalPayload(database.GetDB(c), payload); err != nil {
				outcome = "Approved but execution failed: " + err.Error()
				status = "failed"
			} else {
				outcome = executed
			}
		}

		logEntry = models.AgentCollaborationLog{
			WorkspaceID: wsUUID,
			AgentName:   pending.AgentName,
			Action:      "Admin Approved Action",
			InputData:   pending.ActionType,
			OutputData:  outcome,
			Status:      status,
		}
	} else {
		pending.Status = "rejected"
		logEntry = models.AgentCollaborationLog{
			WorkspaceID: wsUUID,
			AgentName:   pending.AgentName,
			Action:      "Admin Rejected Action",
			InputData:   pending.Reason,
			OutputData:  "Action cancelled",
			Status:      "failed",
		}
	}

	database.GetDB(c).Create(&logEntry)
	database.GetDB(c).Save(&pending)

	// Live push: the resolved approval leaves the queue and the audit line lands
	// in the collaboration stream without the client asking for either.
	PublishAgentApproval(wsUUID, &pending, true)
	PublishAgentLog(wsUUID, &logEntry)

	if wsUUID != uuid.Nil {
		go DispatchWebhookEvent(wsUUID, "hitl.approval_resolved", pending)
	}
	go ExecuteWorkflowsByTrigger(getWorkspaceID(c), "hitl.approval_resolved", map[string]interface{}{
		"pending_id":  pending.ID.String(),
		"status":      pending.Status,
		"agent_name":  pending.AgentName,
		"action_type": pending.ActionType,
	})

	return c.JSON(fiber.Map{"message": "Pending action resolved", "pending": pending})
}
