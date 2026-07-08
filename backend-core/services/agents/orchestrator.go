package agents

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/google/uuid"
	"github.com/nats-io/nats.go"
	"gorm.io/gorm"

	"github.com/septimus-os/backend-core/models"
)

type Orchestrator struct {
	db *gorm.DB
	nc *nats.Conn
}

func NewOrchestrator(db *gorm.DB, nc *nats.Conn) *Orchestrator {
	return &Orchestrator{
		db: db,
		nc: nc,
	}
}

// RouterDecision is the structured JSON output expected from the LLM
type RouterDecision struct {
	TargetAgent string `json:"target_agent"` // "crm", "task", "comm"
	Reasoning   string `json:"reasoning"`
	Payload     string `json:"payload"`
}

func (o *Orchestrator) RouteEvent(ctx context.Context, sessionID uuid.UUID, eventSubject string, eventPayload []byte) error {
	// 1. Fetch AI Configuration from DB
	var config models.AIConfig
	if err := o.db.First(&config).Error; err != nil {
		return fmt.Errorf("failed to fetch AI config: %w", err)
	}

	// 2. Initialize the dynamic LLM Provider
	provider, err := GetProvider(ctx, config.Provider, config.APIKey, config.Model)
	if err != nil {
		return fmt.Errorf("failed to initialize LLM provider: %w", err)
	}

	// 3. Define System Prompt for Orchestrator
	systemPrompt := `You are the Septimus OS AI Orchestrator. 
Your job is to analyze incoming system events and route them to one of three specialized agents:
- 'crm': For tasks requiring customer data lookup or history.
- 'task': For tasks related to project management, tickets, or internal workflows.
- 'comm': For dispatching communications (email, WhatsApp) to users or customers.

Output MUST be valid JSON conforming strictly to:
{
  "target_agent": "crm" | "task" | "comm",
  "reasoning": "Brief explanation",
  "payload": "Extracted relevant information from the event to pass to the agent"
}`

	userPrompt := fmt.Sprintf("Event Subject: %s\nEvent Payload: %s", eventSubject, string(eventPayload))

	// 4. Request Structured Output
	var decision RouterDecision
	err = provider.GenerateStructuredOutput(ctx, systemPrompt, userPrompt, &decision)
	if err != nil {
		// Log failure
		o.db.Create(&models.AgentCollaborationLog{
			SessionID:  sessionID,
			AgentName:  "Orchestrator",
			Action:     "RouteEvent",
			InputData:  userPrompt,
			OutputData: err.Error(),
			Status:     "failed",
		})
		return fmt.Errorf("LLM routing failed: %w", err)
	}

	// 5. Log Success
	decisionJSON, _ := json.Marshal(decision)
	o.db.Create(&models.AgentCollaborationLog{
		SessionID:  sessionID,
		AgentName:  "Orchestrator",
		Action:     "RouteEvent",
		InputData:  userPrompt,
		OutputData: string(decisionJSON),
		Status:     "completed",
	})

	// 6. Publish to appropriate NATS topic
	targetSubject := fmt.Sprintf("agents.%s", decision.TargetAgent)
	
	// Create payload specifically for the agent
	agentPayload, _ := json.Marshal(map[string]interface{}{
		"session_id": sessionID.String(),
		"task":       decision.Payload,
	})

	log.Printf("Orchestrator routed event to %s: %s", targetSubject, decision.Reasoning)
	return o.nc.Publish(targetSubject, agentPayload)
}
