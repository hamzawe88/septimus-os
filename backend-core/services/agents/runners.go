package agents

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"sync"
	"time"

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
			ar.db.Create(&models.AgentState{Name: agentName, Status: "running", LoopCount: 0})
			return false
		}
		return false
	}
	return state.Status == "killed"
}

func (ar *AgentRunners) incrementLoopCount(agentName string) {
	ar.db.Model(&models.AgentState{}).Where("name = ?", agentName).UpdateColumn("loop_count", gorm.Expr("loop_count + ?", 1))
}

// -----------------------------------------------------------------------------
// CRM Agent
// -----------------------------------------------------------------------------

func (ar *AgentRunners) runCRMAgent() {
	agentName := "crm"
	
	_, err := ar.nc.Subscribe("agents.crm", func(msg *nats.Msg) {
		// 1. Check Kill Switch at the start of loop iteration
		if ar.checkKillSwitch(agentName) {
			log.Printf("[%s] Agent killed, ignoring message", agentName)
			return
		}
		
		ar.incrementLoopCount(agentName)
		
		var payload map[string]interface{}
		if err := json.Unmarshal(msg.Data, &payload); err != nil {
			log.Printf("[%s] failed to unmarshal: %v", agentName, err)
			return
		}
		
		sessionID, _ := uuid.Parse(payload["session_id"].(string))
		taskDesc := payload["task"].(string)
		
		// Log start
		logEntry := models.AgentCollaborationLog{
			SessionID: sessionID,
			AgentName: agentName,
			Action:    "Processing Task",
			InputData: taskDesc,
			Status:    "running",
		}
		ar.db.Create(&logEntry)
		
		// Check kill switch again before heavy work (simulated)
		if ar.checkKillSwitch(agentName) {
			ar.db.Model(&logEntry).Updates(map[string]interface{}{"status": "killed", "output_data": "Terminated by kill switch"})
			return
		}
		
		// Simulate Read-Only CRM DB work
		time.Sleep(2 * time.Second)
		
		// Finalize
		ar.db.Model(&logEntry).Updates(map[string]interface{}{"status": "completed", "output_data": "CRM data fetched successfully"})
	})
	
	if err != nil {
		log.Fatalf("Failed to subscribe CRM agent: %v", err)
	}
}

// -----------------------------------------------------------------------------
// Task Agent
// -----------------------------------------------------------------------------

func (ar *AgentRunners) runTaskAgent() {
	agentName := "task"
	
	_, err := ar.nc.Subscribe("agents.task", func(msg *nats.Msg) {
		if ar.checkKillSwitch(agentName) {
			log.Printf("[%s] Agent killed, ignoring message", agentName)
			return
		}
		
		ar.incrementLoopCount(agentName)
		
		var payload map[string]interface{}
		json.Unmarshal(msg.Data, &payload)
		
		sessionID, _ := uuid.Parse(payload["session_id"].(string))
		taskDesc := payload["task"].(string)
		
		logEntry := models.AgentCollaborationLog{
			SessionID: sessionID,
			AgentName: agentName,
			Action:    "Manage Workflow",
			InputData: taskDesc,
			Status:    "running",
		}
		ar.db.Create(&logEntry)
		
		time.Sleep(2 * time.Second)
		
		if ar.checkKillSwitch(agentName) {
			ar.db.Model(&logEntry).Updates(map[string]interface{}{"status": "killed", "output_data": "Terminated by kill switch"})
			return
		}
		
		ar.db.Model(&logEntry).Updates(map[string]interface{}{"status": "completed", "output_data": "Task automated successfully"})
	})
	
	if err != nil {
		log.Fatalf("Failed to subscribe Task agent: %v", err)
	}
}

// -----------------------------------------------------------------------------
// Comm Agent (With Human in the loop)
// -----------------------------------------------------------------------------

func (ar *AgentRunners) runCommAgent() {
	agentName := "comm"
	
	_, err := ar.nc.Subscribe("agents.comm", func(msg *nats.Msg) {
		if ar.checkKillSwitch(agentName) {
			log.Printf("[%s] Agent killed, ignoring message", agentName)
			return
		}
		
		ar.incrementLoopCount(agentName)
		
		var payload map[string]interface{}
		json.Unmarshal(msg.Data, &payload)
		
		sessionID, _ := uuid.Parse(payload["session_id"].(string))
		taskDesc := payload["task"].(string)
		
		logEntry := models.AgentCollaborationLog{
			SessionID: sessionID,
			AgentName: agentName,
			Action:    "Dispatch Communication",
			InputData: taskDesc,
			Status:    "running",
		}
		ar.db.Create(&logEntry)
		
		time.Sleep(1 * time.Second)
		
		// 1. Human-in-the-loop logic: Check if message is sensitive
		isSensitive := strings.Contains(strings.ToLower(taskDesc), "apologize") || strings.Contains(strings.ToLower(taskDesc), "refund")
		
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
			
			// Broadcast websocket event for frontend
			ar.nc.Publish("system.notifications", []byte(`{"type": "agent_approval_required", "agent": "comm"}`))
			return
		}
		
		// Normal execution if not sensitive
		if ar.checkKillSwitch(agentName) {
			ar.db.Model(&logEntry).Updates(map[string]interface{}{"status": "killed", "output_data": "Terminated by kill switch"})
			return
		}
		
		ar.db.Model(&logEntry).Updates(map[string]interface{}{"status": "completed", "output_data": "Communication dispatched successfully"})
	})
	
	if err != nil {
		log.Fatalf("Failed to subscribe Comm agent: %v", err)
	}
}
