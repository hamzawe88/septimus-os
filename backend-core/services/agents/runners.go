package agents

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sort"
	"strconv"
	"strings"
	"sync"

	"github.com/google/uuid"
	"github.com/nats-io/nats.go"
	"gorm.io/gorm"

	"github.com/septimus-os/backend-core/models"
)

type AgentRunners struct {
	db *gorm.DB
	nc *nats.Conn
	mu sync.Mutex

	// Map to keep track of cancel functions for active loops if we want to forcefully kill them
	activeLoops map[string]context.CancelFunc
}

func NewAgentRunners(db *gorm.DB, nc *nats.Conn) *AgentRunners {
	return &AgentRunners{
		db:          db,
		nc:          nc,
		activeLoops: make(map[string]context.CancelFunc),
	}
}

func (ar *AgentRunners) StartAll() {
	go ar.runCRMAgent()
	go ar.runTaskAgent()
	go ar.runCommAgent()
}

// checkKillSwitch reads from the database to see if the agent should be stopped
func (ar *AgentRunners) checkKillSwitch(agentName string) bool {
	var state models.AgentState
	if err := ar.db.Where("name = ?", agentName).First(&state).Error; err != nil {
		// If not found, assume running and create it
		if err == gorm.ErrRecordNotFound {
			// Config is a jsonb column — an empty string is invalid JSON and the
			// insert would fail silently, leaving the agent invisible. Seed "{}".
			ar.db.Create(&models.AgentState{Name: agentName, Status: "running", LoopCount: 0, Config: "{}"})
			return false
		}
		return false
	}
	return state.Status == "killed"
}

func (ar *AgentRunners) incrementLoopCount(agentName string) {
	ar.db.Model(&models.AgentState{}).Where("name = ?", agentName).UpdateColumn("loop_count", gorm.Expr("loop_count + ?", 1))
}

// agentTask is the payload dispatched to an agent over `agents.<type>`.
type agentTask struct {
	SessionID   string `json:"session_id"`
	Task        string `json:"task"`
	WorkspaceID string `json:"workspace_id"`
}

// parseAgentTask decodes the NATS payload defensively. A missing/invalid
// session id yields a fresh one rather than panicking (the old code did
// unchecked type assertions that crashed the subscriber goroutine).
func parseAgentTask(data []byte) (sessionID uuid.UUID, workspaceID uuid.UUID, task string) {
	var p agentTask
	_ = json.Unmarshal(data, &p)

	if id, err := uuid.Parse(p.SessionID); err == nil {
		sessionID = id
	} else {
		sessionID = uuid.New()
	}
	if id, err := uuid.Parse(p.WorkspaceID); err == nil {
		workspaceID = id
	}
	return sessionID, workspaceID, p.Task
}

// -----------------------------------------------------------------------------
// CRM Agent — reads real CRM deal entities for the workspace and reports on them.
// -----------------------------------------------------------------------------

func (ar *AgentRunners) runCRMAgent() {
	agentName := "crm"

	_, err := ar.nc.Subscribe("agents.crm", func(msg *nats.Msg) {
		if ar.checkKillSwitch(agentName) {
			log.Printf("[%s] Agent killed, ignoring message", agentName)
			return
		}
		ar.incrementLoopCount(agentName)

		sessionID, workspaceID, taskDesc := parseAgentTask(msg.Data)

		logEntry := models.AgentCollaborationLog{
			SessionID: sessionID,
			AgentName: agentName,
			Action:    "Analyze CRM pipeline",
			InputData: taskDesc,
			Status:    "running",
		}
		ar.db.Create(&logEntry)

		// Kill switch re-check before the real (DB) work.
		if ar.checkKillSwitch(agentName) {
			ar.db.Model(&logEntry).Updates(map[string]interface{}{"status": "killed", "output_data": "Terminated by kill switch"})
			return
		}

		summary := ar.crmSummary(workspaceID)
		ar.db.Model(&logEntry).Updates(map[string]interface{}{"status": "completed", "output_data": summary})
	})

	if err != nil {
		log.Fatalf("Failed to subscribe CRM agent: %v", err)
	}
}

// crmSummary aggregates deal entities into a concise, real pipeline report.
func (ar *AgentRunners) crmSummary(workspaceID uuid.UUID) string {
	if workspaceID == uuid.Nil {
		return "No workspace scope provided; skipped CRM read."
	}

	var entities []models.Entity
	ar.db.Where("workspace_id = ? AND entity_type IN ?", workspaceID, []string{"crm_deal", "deal"}).Find(&entities)
	if len(entities) == 0 {
		return "No CRM deals found for this workspace."
	}

	var totalValue float64
	stages := map[string]int{}
	for _, e := range entities {
		var d map[string]interface{}
		if err := json.Unmarshal(e.Data, &d); err != nil {
			continue
		}
		if v, ok := toFloat(d["value"]); ok {
			totalValue += v
		}
		stage, _ := d["stage"].(string)
		if stage == "" {
			stage = "unknown"
		}
		stages[stage]++
	}

	return fmt.Sprintf("Deals: %d | Total value: %.2f | Stages: %s",
		len(entities), totalValue, formatCounts(stages))
}

// -----------------------------------------------------------------------------
// Task Agent — reports the real status breakdown of task entities.
// -----------------------------------------------------------------------------

func (ar *AgentRunners) runTaskAgent() {
	agentName := "task"

	_, err := ar.nc.Subscribe("agents.task", func(msg *nats.Msg) {
		if ar.checkKillSwitch(agentName) {
			log.Printf("[%s] Agent killed, ignoring message", agentName)
			return
		}
		ar.incrementLoopCount(agentName)

		sessionID, workspaceID, taskDesc := parseAgentTask(msg.Data)

		logEntry := models.AgentCollaborationLog{
			SessionID: sessionID,
			AgentName: agentName,
			Action:    "Audit task board",
			InputData: taskDesc,
			Status:    "running",
		}
		ar.db.Create(&logEntry)

		if ar.checkKillSwitch(agentName) {
			ar.db.Model(&logEntry).Updates(map[string]interface{}{"status": "killed", "output_data": "Terminated by kill switch"})
			return
		}

		summary := ar.taskSummary(workspaceID)
		ar.db.Model(&logEntry).Updates(map[string]interface{}{"status": "completed", "output_data": summary})
	})

	if err != nil {
		log.Fatalf("Failed to subscribe Task agent: %v", err)
	}
}

// taskSummary aggregates task entities by status into a real board summary.
func (ar *AgentRunners) taskSummary(workspaceID uuid.UUID) string {
	if workspaceID == uuid.Nil {
		return "No workspace scope provided; skipped task read."
	}

	var entities []models.Entity
	ar.db.Where("workspace_id = ? AND entity_type = ?", workspaceID, "task").Find(&entities)
	if len(entities) == 0 {
		return "No tasks found for this workspace."
	}

	statuses := map[string]int{}
	for _, e := range entities {
		var d map[string]interface{}
		if err := json.Unmarshal(e.Data, &d); err != nil {
			continue
		}
		status, _ := d["status"].(string)
		if status == "" {
			status = "Todo"
		}
		statuses[status]++
	}

	return fmt.Sprintf("Tasks: %d | By status: %s", len(entities), formatCounts(statuses))
}

// -----------------------------------------------------------------------------
// Comm Agent (with human-in-the-loop for sensitive messages)
// -----------------------------------------------------------------------------

func (ar *AgentRunners) runCommAgent() {
	agentName := "comm"

	_, err := ar.nc.Subscribe("agents.comm", func(msg *nats.Msg) {
		if ar.checkKillSwitch(agentName) {
			log.Printf("[%s] Agent killed, ignoring message", agentName)
			return
		}
		ar.incrementLoopCount(agentName)

		sessionID, _, taskDesc := parseAgentTask(msg.Data)

		logEntry := models.AgentCollaborationLog{
			SessionID: sessionID,
			AgentName: agentName,
			Action:    "Dispatch Communication",
			InputData: taskDesc,
			Status:    "running",
		}
		ar.db.Create(&logEntry)

		// Human-in-the-loop: sensitive messages need manual review before send.
		lower := strings.ToLower(taskDesc)
		isSensitive := strings.Contains(lower, "apologize") ||
			strings.Contains(lower, "refund") ||
			strings.Contains(lower, "اعتذار") ||
			strings.Contains(lower, "استرداد")

		if isSensitive {
			payloadBytes, _ := json.Marshal(map[string]string{"message": taskDesc})

			pending := models.PendingApproval{
				AgentName:  agentName,
				ActionType: "Send External Message",
				Payload:    string(payloadBytes),
				Reason:     "Sensitive keywords detected (refund/apology). Requires manual review.",
			}
			ar.db.Create(&pending)

			ar.db.Model(&logEntry).Updates(map[string]interface{}{
				"status":      "paused",
				"output_data": "Sent to pending approvals queue due to sensitive content",
			})

			ar.nc.Publish("system.notifications", []byte(`{"type": "agent_approval_required", "agent": "comm"}`))
			return
		}

		if ar.checkKillSwitch(agentName) {
			ar.db.Model(&logEntry).Updates(map[string]interface{}{"status": "killed", "output_data": "Terminated by kill switch"})
			return
		}

		// Non-sensitive: dispatch a real notification event and record it.
		ar.nc.Publish("system.notifications", []byte(`{"type": "agent_message_dispatched", "agent": "comm"}`))
		ar.db.Model(&logEntry).Updates(map[string]interface{}{"status": "completed", "output_data": "Communication dispatched successfully"})
	})

	if err != nil {
		log.Fatalf("Failed to subscribe Comm agent: %v", err)
	}
}

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------

// toFloat coerces a JSON-decoded value (float64, json.Number, or numeric string)
// into a float64.
func toFloat(v interface{}) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case json.Number:
		f, err := n.Float64()
		return f, err == nil
	case string:
		f, err := strconv.ParseFloat(n, 64)
		return f, err == nil
	default:
		return 0, false
	}
}

// formatCounts renders a count map deterministically as "k=v, k=v".
func formatCounts(counts map[string]int) string {
	keys := make([]string, 0, len(counts))
	for k := range counts {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, fmt.Sprintf("%s=%d", k, counts[k]))
	}
	return strings.Join(parts, ", ")
}
