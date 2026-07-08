package engine

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"strconv"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/septimus-os/backend-core/events"
	"github.com/septimus-os/backend-core/models"
)

var ErrConditionFalse = errors.New("condition evaluated to false")

// ReactFlowNode represents a single node from ReactFlow
type ReactFlowNode struct {
	ID   string                 `json:"id"`
	Type string                 `json:"type"` // trigger, action, condition
	Data map[string]interface{} `json:"data"`
}

// ReactFlowEdge represents a single edge from ReactFlow
type ReactFlowEdge struct {
	Source string `json:"source"`
	Target string `json:"target"`
}

// ExecuteEvent triggers workflows that match the event
func ExecuteEvent(db *gorm.DB, workspaceID uuid.UUID, eventName string, eventData map[string]interface{}) {
	var workflows []models.Workflow
	if err := db.Where("workspace_id = ? AND is_active = ?", workspaceID, true).Find(&workflows).Error; err != nil {
		log.Printf("Error fetching workflows: %v", err)
		return
	}

	for _, wf := range workflows {
		go runWorkflowIfMatched(db, wf, eventName, eventData)
	}
}

func runWorkflowIfMatched(db *gorm.DB, wf models.Workflow, eventName string, eventData map[string]interface{}) {
	var nodes []ReactFlowNode
	var edges []ReactFlowEdge

	if err := json.Unmarshal(wf.Nodes, &nodes); err != nil {
		log.Printf("Error parsing nodes for workflow %s: %v", wf.ID, err)
		return
	}
	if err := json.Unmarshal(wf.Edges, &edges); err != nil {
		log.Printf("Error parsing edges for workflow %s: %v", wf.ID, err)
		return
	}

	// Build graph: sourceNodeID -> []targetNodeID
	graph := make(map[string][]string)
	for _, e := range edges {
		graph[e.Source] = append(graph[e.Source], e.Target)
	}

	// Find the trigger node that matches the eventName
	var startNode *ReactFlowNode
	for i, n := range nodes {
		if n.Type == "trigger" && n.Data["triggerEvent"] == eventName {
			startNode = &nodes[i]
			break
		}
	}

	if startNode == nil {
		return // Not triggered by this event
	}

	log.Printf("Triggering Workflow '%s' for event '%s'", wf.Name, eventName)

	// Create a workflow run record
	contextJSON, _ := json.Marshal(eventData)
	run := models.WorkflowRun{
		WorkflowID:  wf.ID,
		TriggerName: eventName,
		Status:      "running",
		Context:     contextJSON,
	}
	db.Create(&run)

	// Simple BFS execution
	queue := []string{startNode.ID}
	nodeMap := make(map[string]ReactFlowNode)
	for _, n := range nodes {
		nodeMap[n.ID] = n
	}

	success := true
	for len(queue) > 0 {
		currID := queue[0]
		queue = queue[1:]

		currNode := nodeMap[currID]

		// Execute the node
		err := executeNode(db, currNode, eventData)
		if err != nil {
			if err == ErrConditionFalse {
				log.Printf("Condition evaluated to false for node %s. Stopping branch.", currID)
				continue
			}
			log.Printf("Error executing node %s: %v", currID, err)
			success = false
			break
		}

		// Enqueue children
		children := graph[currID]
		for _, childID := range children {
			queue = append(queue, childID)
		}
	}

	if success {
		run.Status = "success"
	} else {
		run.Status = "failed"
	}
	db.Save(&run)
}

func executeNode(db *gorm.DB, node ReactFlowNode, context map[string]interface{}) error {
	switch node.Type {
	case "trigger":
		// Trigger just starts it, nothing to do
		return nil
	case "condition":
		field, _ := node.Data["field"].(string)
		operator, _ := node.Data["operator"].(string)
		valueStr, _ := node.Data["value"].(string)

		if field == "" || operator == "" {
			return fmt.Errorf("condition node missing field or operator")
		}

		ctxVal, exists := context[field]
		if !exists {
			log.Printf("Condition field '%s' not found in context. Failing condition.", field)
			return ErrConditionFalse
		}

		ctxStr := fmt.Sprintf("%v", ctxVal)

		switch operator {
		case "eq":
			if ctxStr != valueStr {
				return ErrConditionFalse
			}
		case "neq":
			if ctxStr == valueStr {
				return ErrConditionFalse
			}
		case "contains":
			if !strings.Contains(ctxStr, valueStr) {
				return ErrConditionFalse
			}
		case "gt", "lt":
			ctxFloat, err1 := strconv.ParseFloat(ctxStr, 64)
			valFloat, err2 := strconv.ParseFloat(valueStr, 64)
			if err1 != nil || err2 != nil {
				// cannot compare as numbers
				return ErrConditionFalse
			}
			if operator == "gt" && ctxFloat <= valFloat {
				return ErrConditionFalse
			}
			if operator == "lt" && ctxFloat >= valFloat {
				return ErrConditionFalse
			}
		default:
			log.Printf("Unknown operator %s", operator)
			return ErrConditionFalse
		}

		return nil
	case "action":
		actionType, ok := node.Data["actionType"].(string)
		if !ok {
			return fmt.Errorf("action node missing actionType")
		}

		switch actionType {
		case "send_chat":
			log.Printf("Executing ACTION: send_chat. Context: %v", context)
			channelIdStr, _ := node.Data["channelId"].(string)
			messageText, _ := node.Data["messageText"].(string)

			if channelIdStr != "" && messageText != "" {
				channelID, err := uuid.Parse(channelIdStr)
				if err == nil {
					// Get a system user or the first user to act as sender
					var sender models.User
					if err := db.First(&sender).Error; err == nil {
						msg := models.Message{
							ID:            uuid.New(),
							ChannelID:     channelID,
							SenderID:      sender.ID,
							Content:       messageText + "\n*(Sent via Workflow Automation)*",
							IsAIGenerated: true,
							AIAgentRole:   "Workflow Bot",
						}
						db.Create(&msg)
						log.Printf("Message sent to channel %s", channelIdStr)
					}
				}
			}

		case "update_task_status":
			log.Printf("Executing ACTION: update_task_status. Context: %v", context)
			newStatus, _ := node.Data["newStatus"].(string)
			taskIdStr, ok := context["task_id"].(string)
			if ok && newStatus != "" {
				taskID, err := uuid.Parse(taskIdStr)
				if err == nil {
					db.Model(&models.Task{}).Where("id = ?", taskID).Update("status", newStatus)
					log.Printf("Task %s status updated to %s", taskIdStr, newStatus)
				}
			}
		case "send_email":
			log.Printf("Executing ACTION: send_email. Context: %v", context)
		case "trigger_ai_agent":
			log.Printf("Executing ACTION: trigger_ai_agent. Context: %v", context)
			agentType, _ := node.Data["agentType"].(string)
			agentPrompt, _ := node.Data["agentPrompt"].(string)
			
			payload := map[string]interface{}{
				"agent_type": agentType,
				"prompt":     agentPrompt,
				"context":    context,
			}
			
			payloadBytes, _ := json.Marshal(payload)
			
			// Publish to NATS for the AI sidecar to pick up
			err := events.PublishEvent("events.workflow.trigger", payloadBytes)
			if err != nil {
				log.Printf("Failed to trigger AI agent over NATS: %v", err)
			} else {
				log.Printf("Triggered AI agent '%s' over NATS", agentType)
			}
		default:
			log.Printf("Unknown action type: %s", actionType)
		}
	}
	return nil
}
