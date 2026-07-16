package handlers

import (
	"encoding/json"
	"log"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/events"
	"github.com/septimus-os/backend-core/models"
)

type DeployAgentPayload struct {
	Name   string                 `json:"name"`
	Role   string                 `json:"role"`
	Config map[string]interface{} `json:"config"`
}

// ── Live agent stream ────────────────────────────────────────────────────────
// The AI Center used to poll /agents/status every 3s. Instead, every place that
// changes agent state pushes the changed row to a workspace-scoped Centrifugo
// channel, exactly like chat does with `channel_<id>`.
//
// `agents_<workspaceID>` sits in Centrifugo's default namespace (no "<ns>:"
// prefix), so it inherits the same permissions as the `channel_<id>` /
// `ai_<streamId>` channels the app already subscribes to — no new transport and
// no config change.

// AgentsChannel names the live stream for a workspace. Callers on both sides
// (publishers here, the channel the client is told to subscribe to in
// GetAgentStatus) must derive the name from this one function.
func AgentsChannel(workspaceID uuid.UUID) string {
	return "agents_" + workspaceID.String()
}

// publishAgentEvent pushes one event to the workspace's agent stream. Failures
// are logged, never fatal: the client keeps a low-frequency snapshot refetch, so
// a dropped publish degrades to slightly stale UI rather than a broken request.
//
// Kept synchronous (like the chat publishes in channels.go) so a log's
// "running" event can never overtake its own "completed" event.
func publishAgentEvent(workspaceID uuid.UUID, event map[string]interface{}) {
	if workspaceID == uuid.Nil {
		return // no workspace scope → nobody to publish to
	}
	if err := PublishToCentrifugo(AgentsChannel(workspaceID), event); err != nil {
		log.Printf("agents: centrifugo publish failed for workspace %s: %v", workspaceID, err)
	}
}

// PublishAgentLog streams a collaboration-log row (create or status change).
func PublishAgentLog(workspaceID uuid.UUID, entry *models.AgentCollaborationLog) {
	publishAgentEvent(workspaceID, map[string]interface{}{"type": "agent_log", "log": entry})
}

// PublishAgentState streams an agent's running state (deploy, kill switch, loop count).
func PublishAgentState(workspaceID uuid.UUID, state *models.AgentState) {
	publishAgentEvent(workspaceID, map[string]interface{}{"type": "agent_state", "state": state})
}

// PublishAgentApproval streams a human-in-the-loop approval. `resolved` marks it
// as leaving the queue (approved/rejected) rather than entering it.
func PublishAgentApproval(workspaceID uuid.UUID, pending *models.PendingApproval, resolved bool) {
	eventType := "agent_approval"
	if resolved {
		eventType = "agent_approval_resolved"
	}
	publishAgentEvent(workspaceID, map[string]interface{}{"type": eventType, "pending": pending})
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

	PublishAgentState(getWorkspaceID(c), &agent)

	return c.Status(201).JSON(fiber.Map{
		"message": "Agent deployed successfully",
		"agent":   agent,
	})
}

// DispatchAgentTask hands a task to one of the specialized agents (crm | task |
// comm) by publishing to `agents.<type>`. This is the real entry point that
// drives the agent runners (which read live workspace data), replacing the
// removed dead LLM router. Returns the session id for tracking in the logs.
func DispatchAgentTask(c *fiber.Ctx) error {
	var input struct {
		AgentType string `json:"agent_type"` // "crm" | "task" | "comm"
		Task      string `json:"task"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid JSON payload"})
	}

	switch input.AgentType {
	case "crm", "task", "comm":
		// ok
	default:
		return c.Status(400).JSON(fiber.Map{"error": "agent_type must be one of: crm, task, comm"})
	}

	workspaceID, _ := c.Locals("workspace_id").(string)
	sessionID := uuid.New()

	payload, _ := json.Marshal(map[string]string{
		"session_id":   sessionID.String(),
		"task":         input.Task,
		"workspace_id": workspaceID,
	})

	if err := events.NatsConn.Publish("agents."+input.AgentType, payload); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to dispatch agent task"})
	}

	return c.JSON(fiber.Map{
		"message":    "Agent task dispatched",
		"session_id": sessionID,
		"agent_type": input.AgentType,
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

	PublishAgentState(getWorkspaceID(c), &agent)

	return c.JSON(fiber.Map{"message": "Agent status updated", "agent": agent})
}
