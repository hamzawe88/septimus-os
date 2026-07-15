package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/robfig/cron/v3"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/events"
	"github.com/septimus-os/backend-core/middleware"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/datatypes"
)

// ─── Node & Edge Data Structures ─────────────────────────────────────────────

// WFNodeData holds configuration for each node type
type WFNodeData struct {
	Label       string `json:"label"`
	Description string `json:"description,omitempty"`

	// Trigger node config
	TriggerEvent    string `json:"triggerEvent,omitempty"`    // "task.done", "document.uploaded", "message.created", "cron"
	IntervalMinutes int    `json:"intervalMinutes,omitempty"` // for "cron" trigger, interval in minutes (legacy/fallback)
	CronExpression  string `json:"cronExpression,omitempty"`  // Standard cron expression

	// Condition node config
	Field    string `json:"field,omitempty"`    // "status", "priority", "content"
	Operator string `json:"operator,omitempty"` // "eq", "neq", "gt", "lt", "contains"
	Value    string `json:"value,omitempty"`    // expected value

	// Action node config
	ActionType    string            `json:"actionType,omitempty"`    // "http", "nats", "notify", "trigger_ai_agent", "send_chat", "update_task_status", "send_email"
	ActionURL     string            `json:"actionUrl,omitempty"`     // for "http" type
	ActionMethod  string            `json:"actionMethod,omitempty"`  // "POST", "GET", "PUT", "DELETE"
	ActionHeaders map[string]string `json:"actionHeaders,omitempty"` // custom headers
	ActionBody    string            `json:"actionBody,omitempty"`    // template body with {{field}} substitution
	NATSTopic     string            `json:"natsTopic,omitempty"`     // for "nats" type

	// AI Agent node config
	AgentType   string `json:"agentType,omitempty"`   // "general", "code", "support"
	AgentPrompt string `json:"agentPrompt,omitempty"` // prompt template with {{field}}

	// Send Chat / Notify config
	ChannelID   string `json:"channelId,omitempty"`
	MessageText string `json:"messageText,omitempty"`

	// Update Task Status config
	NewStatus string `json:"newStatus,omitempty"`

	// Send Email / Slack config
	EmailAddress    string `json:"emailAddress,omitempty"`
	EmailSubject    string `json:"emailSubject,omitempty"`
	SlackWebhookURL string `json:"slackWebhookUrl,omitempty"`
}

// WFNode represents a single node in the React Flow visual graph
type WFNode struct {
	ID       string                 `json:"id"`
	Type     string                 `json:"type"` // "trigger" | "condition" | "action"
	Data     WFNodeData             `json:"data"`
	Position map[string]interface{} `json:"position"`
}

// WFEdge represents a connection between two nodes
type WFEdge struct {
	ID     string `json:"id"`
	Source string `json:"source"`
	Target string `json:"target"`
}

// ─── Graph Utilities ──────────────────────────────────────────────────────────

// buildAdjacency creates a source→[]target map from workflow edges
func buildAdjacency(edges []WFEdge) map[string][]string {
	graph := make(map[string][]string)
	for _, edge := range edges {
		graph[edge.Source] = append(graph[edge.Source], edge.Target)
	}
	return graph
}

// findTriggerNodes returns all nodes of type "trigger"
func findTriggerNodes(nodes []WFNode) []WFNode {
	var triggers []WFNode
	for _, n := range nodes {
		if n.Type == "trigger" {
			triggers = append(triggers, n)
		}
	}
	return triggers
}

// nodeByID returns a node by its ID
func nodeByID(nodes []WFNode, id string) (WFNode, bool) {
	for _, n := range nodes {
		if n.ID == id {
			return n, true
		}
	}
	return WFNode{}, false
}

// ─── Node Executors ───────────────────────────────────────────────────────────

// evaluateCondition checks if the event context satisfies the condition node
func evaluateCondition(node WFNode, ctx map[string]interface{}) bool {
	field := node.Data.Field
	op := node.Data.Operator
	expected := node.Data.Value

	actual, ok := ctx[field]
	if !ok {
		return false
	}
	actualStr := fmt.Sprintf("%v", actual)

	switch op {
	case "eq":
		return actualStr == expected
	case "neq":
		return actualStr != expected
	case "contains":
		return strings.Contains(strings.ToLower(actualStr), strings.ToLower(expected))
	case "gt":
		return actualStr > expected
	case "lt":
		return actualStr < expected
	default:
		log.Printf("[WF] Unknown operator '%s' in condition node '%s'", op, node.Data.Label)
		return false
	}
}

// executeAction dispatches to the appropriate action handler
func executeAction(node WFNode, ctx map[string]interface{}) error {
	switch node.Data.ActionType {
	case "http":
		return executeHTTPAction(node, ctx)
	case "nats":
		return executeNATSAction(node, ctx)
	case "notify":
		return executeNotifyAction(node, ctx)
	case "trigger_ai_agent", "ai_agent":
		return executeAIAgentAction(node, ctx)
	case "send_chat":
		return executeSendChatAction(node, ctx)
	case "update_task_status":
		return executeUpdateTaskStatusAction(node, ctx)
	case "send_email":
		return executeSendEmailAction(node, ctx)
	case "send_slack", "slack":
		return executeSlackAction(node, ctx)
	case "n8n", "webhook":
		return executeN8NWebhookAction(node, ctx)
	default:
		log.Printf("[WF] Unknown action type '%s' on node '%s' — skipping", node.Data.ActionType, node.Data.Label)
		return nil
	}
}

// executeHTTPAction sends an HTTP request with template substitution and custom headers
func executeHTTPAction(node WFNode, ctx map[string]interface{}) error {
	if node.Data.ActionURL == "" {
		return fmt.Errorf("HTTP action missing actionUrl on node '%s'", node.Data.Label)
	}
	body := node.Data.ActionBody
	// Simple template substitution: {{field}} → value
	for k, v := range ctx {
		body = strings.ReplaceAll(body, fmt.Sprintf("{{%s}}", k), fmt.Sprintf("%v", v))
	}
	method := strings.ToUpper(node.Data.ActionMethod)
	if method == "" {
		method = "POST"
	}
	req, err := http.NewRequest(method, node.Data.ActionURL, strings.NewReader(body))
	if err != nil {
		return fmt.Errorf("HTTP action request creation failed: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	for k, v := range node.Data.ActionHeaders {
		req.Header.Set(k, v)
	}
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("HTTP action %s failed: %w", method, err)
	}
	defer resp.Body.Close()
	log.Printf("[WF] HTTP action (%s) → %s → status %d", method, node.Data.ActionURL, resp.StatusCode)
	return nil
}

// executeN8NWebhookAction dispatches structured/signed HTTP POST requests to external n8n or generic webhook endpoints
func executeN8NWebhookAction(node WFNode, ctx map[string]interface{}) error {
	if node.Data.ActionURL == "" {
		return fmt.Errorf("n8n/webhook action missing actionUrl on node '%s'", node.Data.Label)
	}
	bodyStr := node.Data.ActionBody
	if bodyStr == "" {
		ctxBytes, _ := json.Marshal(ctx)
		bodyStr = string(ctxBytes)
	} else {
		for k, v := range ctx {
			bodyStr = strings.ReplaceAll(bodyStr, fmt.Sprintf("{{%s}}", k), fmt.Sprintf("%v", v))
		}
	}
	method := strings.ToUpper(node.Data.ActionMethod)
	if method == "" {
		method = "POST"
	}
	req, err := http.NewRequest(method, node.Data.ActionURL, strings.NewReader(bodyStr))
	if err != nil {
		return fmt.Errorf("n8n/webhook action request creation failed: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Septimus-Source", "workflow_engine")
	if ev, ok := ctx["event"].(string); ok && ev != "" {
		req.Header.Set("X-Septimus-Event", ev)
	}

	secret := ""
	for k, v := range node.Data.ActionHeaders {
		if strings.ToLower(k) == "x-septimus-secret" || strings.ToLower(k) == "secret" {
			secret = v
			continue
		}
		req.Header.Set(k, v)
	}
	if secret != "" {
		mac := hmac.New(sha256.New, []byte(secret))
		mac.Write([]byte(bodyStr))
		sig := hex.EncodeToString(mac.Sum(nil))
		req.Header.Set("X-Septimus-Signature", sig)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("n8n/webhook action %s failed: %w", method, err)
	}
	defer resp.Body.Close()
	log.Printf("[WF] n8n/webhook action (%s) -> %s -> status %d", method, node.Data.ActionURL, resp.StatusCode)
	return nil
}

// executeNATSAction publishes a NATS event with the current context
func executeNATSAction(node WFNode, ctx map[string]interface{}) error {
	if node.Data.NATSTopic == "" {
		return fmt.Errorf("NATS action missing natsTopic on node '%s'", node.Data.Label)
	}
	payload, _ := json.Marshal(ctx)
	if err := events.PublishEvent(node.Data.NATSTopic, payload); err != nil {
		return fmt.Errorf("NATS publish to '%s' failed: %w", node.Data.NATSTopic, err)
	}
	log.Printf("[WF] NATS action → topic: %s", node.Data.NATSTopic)
	return nil
}

// executeNotifyAction sends an in-app notification to a channel
func executeNotifyAction(node WFNode, ctx map[string]interface{}) error {
	channelID, _ := ctx["channel_id"].(string)
	if channelID == "" {
		channelID = "00000000-0000-0000-0000-000000000000"
	}
	msg := fmt.Sprintf("⚡️ **Workflow: %s**\n%s", node.Data.Label, node.Data.Description)
	payload, _ := json.Marshal(map[string]interface{}{
		"channel_id":      channelID,
		"content":         msg,
		"is_ai_generated": true,
		"ai_agent_role":   "Workflow Engine",
	})
	resp, err := http.Post("http://localhost:4000/api/v1/system/messages", "application/json", strings.NewReader(string(payload)))
	if err != nil {
		return fmt.Errorf("notify action HTTP failed: %w", err)
	}
	defer resp.Body.Close()
	log.Printf("[WF] Notify sent to channel %s", channelID)
	return nil
}

// executeAIAgentAction invokes the internal AI Sidecar to process data or make automated decisions
func executeAIAgentAction(node WFNode, ctx map[string]interface{}) error {
	agentType := node.Data.AgentType
	if agentType == "" {
		agentType = "general"
	}
	prompt := node.Data.AgentPrompt
	for k, v := range ctx {
		prompt = strings.ReplaceAll(prompt, fmt.Sprintf("{{%s}}", k), fmt.Sprintf("%v", v))
	}
	if prompt == "" {
		prompt = fmt.Sprintf("Analyze workflow event context: %v", ctx)
	}

	workspaceID, _ := ctx["workspace_id"].(string)
	if workspaceID == "" {
		var ws models.Workspace
		if err := database.DB.First(&ws).Error; err == nil {
			workspaceID = ws.ID.String()
		}
	}

	sidecarURL := os.Getenv("AI_SIDECAR_URL")
	if sidecarURL == "" {
		sidecarURL = "http://ai-sidecar:8000"
	}
	targetURL := strings.TrimRight(sidecarURL, "/") + "/api/v1/ai/chat"

	reqBody, err := json.Marshal(map[string]interface{}{
		"agent_type": agentType,
		"message":    prompt,
		"context":    ctx,
		"thread_id":  fmt.Sprintf("workflow-%s", uuid.New().String()),
	})
	if err != nil {
		return fmt.Errorf("failed to marshal AI agent request: %w", err)
	}

	req, err := http.NewRequest("POST", targetURL, strings.NewReader(string(reqBody)))
	if err != nil {
		return fmt.Errorf("failed to create request for AI sidecar: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if token := os.Getenv("INTERNAL_API_TOKEN"); token != "" {
		req.Header.Set(middleware.InternalTokenName, token)
	}
	req.Header.Set("X-Workspace-Id", workspaceID)

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("request to AI sidecar failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("AI sidecar returned status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var resData struct {
		Reply string `json:"reply"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&resData); err != nil {
		return fmt.Errorf("failed to decode AI reply: %w", err)
	}

	log.Printf("[WF] AI Agent (%s) replied: %s", agentType, resData.Reply)
	ctx["ai_reply"] = resData.Reply
	ctx["last_ai_agent_reply"] = resData.Reply

	// Send to channel if configured
	channelID := node.Data.ChannelID
	if channelID == "" {
		if cid, ok := ctx["channel_id"].(string); ok {
			channelID = cid
		}
	}
	if channelID != "" && channelID != "00000000-0000-0000-0000-000000000000" {
		msg := fmt.Sprintf("🤖 **Workflow AI (%s):**\n%s", agentType, resData.Reply)
		payload, _ := json.Marshal(map[string]interface{}{
			"channel_id":      channelID,
			"content":         msg,
			"is_ai_generated": true,
			"ai_agent_role":   "Workflow AI Node",
		})
		port := os.Getenv("PORT")
		if port == "" {
			port = "4000"
		}
		http.Post(fmt.Sprintf("http://localhost:%s/api/v1/system/messages", port), "application/json", strings.NewReader(string(payload)))
	}

	// Publish to NATS for observability
	eventPayload, _ := json.Marshal(map[string]interface{}{
		"node_label": node.Data.Label,
		"agent_type": agentType,
		"prompt":     prompt,
		"reply":      resData.Reply,
		"timestamp":  time.Now().Format(time.RFC3339),
	})
	events.PublishEvent("workflow.ai.completed", eventPayload)

	return nil
}

// executeSendChatAction posts a message to a channel
func executeSendChatAction(node WFNode, ctx map[string]interface{}) error {
	channelID := node.Data.ChannelID
	if channelID == "" {
		if cid, ok := ctx["channel_id"].(string); ok {
			channelID = cid
		} else {
			return fmt.Errorf("send_chat action missing channelId on node '%s'", node.Data.Label)
		}
	}
	body := node.Data.MessageText
	for k, v := range ctx {
		body = strings.ReplaceAll(body, fmt.Sprintf("{{%s}}", k), fmt.Sprintf("%v", v))
	}
	payload, _ := json.Marshal(map[string]interface{}{
		"channel_id":      channelID,
		"content":         body,
		"is_ai_generated": true,
		"ai_agent_role":   "Workflow Engine",
	})
	port := os.Getenv("PORT")
	if port == "" {
		port = "4000"
	}
	resp, err := http.Post(fmt.Sprintf("http://localhost:%s/api/v1/system/messages", port), "application/json", strings.NewReader(string(payload)))
	if err != nil {
		return fmt.Errorf("send_chat action failed: %w", err)
	}
	defer resp.Body.Close()
	log.Printf("[WF] send_chat action sent to channel %s", channelID)
	return nil
}

// executeUpdateTaskStatusAction modifies a task status directly
func executeUpdateTaskStatusAction(node WFNode, ctx map[string]interface{}) error {
	newStatus := node.Data.NewStatus
	if newStatus == "" {
		return fmt.Errorf("update_task_status missing newStatus on node '%s'", node.Data.Label)
	}
	var taskIDStr string
	if tid, ok := ctx["task_id"].(string); ok {
		taskIDStr = tid
	} else if id, ok := ctx["id"].(string); ok {
		taskIDStr = id
	}
	if taskIDStr == "" {
		return fmt.Errorf("update_task_status: no task_id or id in context")
	}
	taskUUID, err := uuid.Parse(taskIDStr)
	if err != nil {
		return fmt.Errorf("update_task_status: invalid task uuid %s: %w", taskIDStr, err)
	}
	if err := database.DB.Model(&models.Task{}).Where("id = ?", taskUUID).Update("status", newStatus).Error; err != nil {
		return fmt.Errorf("update_task_status DB error: %w", err)
	}
	log.Printf("[WF] update_task_status: task %s -> %s", taskIDStr, newStatus)
	return nil
}

// executeSendEmailAction sends an email/notification payload via NATS or external SMTP
func executeSendEmailAction(node WFNode, ctx map[string]interface{}) error {
	to := node.Data.EmailAddress
	subj := node.Data.EmailSubject
	body := node.Data.ActionBody
	for k, v := range ctx {
		body = strings.ReplaceAll(body, fmt.Sprintf("{{%s}}", k), fmt.Sprintf("%v", v))
		subj = strings.ReplaceAll(subj, fmt.Sprintf("{{%s}}", k), fmt.Sprintf("%v", v))
	}
	payload, _ := json.Marshal(map[string]interface{}{
		"to":        to,
		"subject":   subj,
		"body":      body,
		"timestamp": time.Now().Format(time.RFC3339),
	})
	events.PublishEvent("workflow.action.send_email", payload)
	log.Printf("[WF] send_email action dispatched: to=%s subject='%s'", to, subj)
	return nil
}

// executeSlackAction posts a formatted message to an incoming Slack Webhook URL
func executeSlackAction(node WFNode, ctx map[string]interface{}) error {
	webhookURL := node.Data.SlackWebhookURL
	if webhookURL == "" {
		webhookURL = node.Data.ActionURL
	}
	if webhookURL == "" {
		return fmt.Errorf("slack action missing webhook url on node '%s'", node.Data.Label)
	}
	text := node.Data.MessageText
	if text == "" {
		text = node.Data.ActionBody
	}
	for k, v := range ctx {
		text = strings.ReplaceAll(text, fmt.Sprintf("{{%s}}", k), fmt.Sprintf("%v", v))
	}
	if text == "" {
		text = fmt.Sprintf("⚡️ **Workflow Alert (%s):** %s", node.Data.Label, node.Data.Description)
	}

	payload, _ := json.Marshal(map[string]string{
		"text": text,
	})

	req, err := http.NewRequest("POST", webhookURL, strings.NewReader(string(payload)))
	if err != nil {
		return fmt.Errorf("failed creating slack request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("slack webhook post failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("slack webhook returned status %d", resp.StatusCode)
	}

	log.Printf("[WF] slack action sent to %s successfully", webhookURL)
	return nil
}

// ─── DFS Traversal Engine ─────────────────────────────────────────────────────

// traverseAndExecute performs depth-first traversal from startNodeID,
// executing each node and respecting condition gates.
func traverseAndExecute(startID string, nodes []WFNode, adjacency map[string][]string, ctx map[string]interface{}) {
	visited := make(map[string]bool)

	var dfs func(nodeID string)
	dfs = func(nodeID string) {
		if visited[nodeID] {
			return
		}
		visited[nodeID] = true

		node, ok := nodeByID(nodes, nodeID)
		if !ok {
			log.Printf("[WF] Node '%s' not found in graph", nodeID)
			return
		}

		log.Printf("[WF] Executing node: '%s' (type=%s)", node.Data.Label, node.Type)

		switch node.Type {
		case "trigger":
			// Trigger nodes are entry points — just pass through to children
			for _, nextID := range adjacency[nodeID] {
				dfs(nextID)
			}

		case "condition":
			passed := evaluateCondition(node, ctx)
			log.Printf("[WF] Condition '%s' → %v", node.Data.Label, passed)
			if passed {
				for _, nextID := range adjacency[nodeID] {
					dfs(nextID)
				}
			}

		case "action":
			if err := executeAction(node, ctx); err != nil {
				log.Printf("[WF] Action '%s' failed: %v", node.Data.Label, err)
				// Don't stop traversal on action failure
			}
			for _, nextID := range adjacency[nodeID] {
				dfs(nextID)
			}
		}
	}

	dfs(startID)
}

// ─── Public Execution API ─────────────────────────────────────────────────────

// ExecuteWorkflowsByTrigger finds all active workflows matching a trigger event
// and executes them concurrently with the provided context data.
// Call this from NATS event handlers or HTTP handlers.
func ExecuteWorkflowsByTrigger(triggerEvent string, ctx map[string]interface{}) {
	var workflows []models.Workflow
	if err := database.DB.Where("is_active = ?", true).Find(&workflows).Error; err != nil {
		log.Printf("[WF] Failed to fetch active workflows: %v", err)
		return
	}

	if len(workflows) == 0 {
		return
	}

	log.Printf("[WF] Checking %d active workflows for trigger '%s'", len(workflows), triggerEvent)

	for _, wf := range workflows {
		go runWorkflow(wf, triggerEvent, ctx)
	}
}

// runWorkflow parses and executes a single workflow in a goroutine
func runWorkflow(wf models.Workflow, triggerEvent string, ctx map[string]interface{}) {
	var nodes []WFNode
	if err := json.Unmarshal(wf.Nodes, &nodes); err != nil {
		log.Printf("[WF] Workflow '%s': failed to parse nodes: %v", wf.Name, err)
		return
	}

	var edges []WFEdge
	if err := json.Unmarshal(wf.Edges, &edges); err != nil {
		log.Printf("[WF] Workflow '%s': failed to parse edges: %v", wf.Name, err)
		return
	}

	triggers := findTriggerNodes(nodes)
	adjacency := buildAdjacency(edges)

	matched := false
	status := "success"

	for _, trigger := range triggers {
		triggerEventConfig := trigger.Data.TriggerEvent
		if triggerEventConfig == "" || triggerEventConfig == triggerEvent || triggerEventConfig == "*" || triggerEventConfig == "all" {
			log.Printf("[WF] 🚀 Workflow '%s' triggered by '%s'", wf.Name, triggerEvent)
			matched = true

			defer func() {
				if r := recover(); r != nil {
					status = "failed"
					log.Printf("[WF] Workflow '%s' panicked: %v", wf.Name, r)
				}
			}()

			traverseAndExecute(trigger.ID, nodes, adjacency, ctx)
		}
	}

	if matched {
		StoreWorkflowRun(wf.ID, triggerEvent, status, ctx)
	}
}

// ─── Workflow Run Logger ──────────────────────────────────────────────────────

// StoreWorkflowRun persists a workflow execution record to the database
func StoreWorkflowRun(workflowID uuid.UUID, trigger, status string, ctx map[string]interface{}) {
	ctxBytes, _ := json.Marshal(ctx)
	run := models.WorkflowRun{
		WorkflowID:  workflowID,
		TriggerName: trigger,
		Status:      status,
		Context:     datatypes.JSON(ctxBytes),
	}
	if err := database.DB.Create(&run).Error; err != nil {
		log.Printf("[WF] Failed to store workflow run: %v", err)
	}
}

// ─── Cron & Scheduled Workflows Manager ───────────────────────────────────────

var cronManager *cron.Cron

// StartCronManager starts the robfig/cron manager
func StartCronManager() {
	log.Println("[WF] Starting Cron/Interval Workflow Manager...")
	if cronManager != nil {
		cronManager.Stop()
	}
	cronManager = cron.New()
	cronManager.Start()
	ReloadCronManager()
}

// ReloadCronManager clears existing scheduled jobs and re-registers them from active workflows
func ReloadCronManager() {
	if cronManager == nil {
		return
	}
	
	// Remove all existing jobs
	for _, entry := range cronManager.Entries() {
		cronManager.Remove(entry.ID)
	}

	var workflows []models.Workflow
	if err := database.DB.Where("is_active = ?", true).Find(&workflows).Error; err != nil {
		log.Printf("[WF] ReloadCronManager error fetching workflows: %v", err)
		return
	}

	jobCount := 0
	for _, wf := range workflows {
		var nodes []WFNode
		if err := json.Unmarshal(wf.Nodes, &nodes); err != nil {
			continue
		}
		triggers := findTriggerNodes(nodes)
		for _, trigger := range triggers {
			if trigger.Data.TriggerEvent == "cron" || trigger.Data.TriggerEvent == "interval" {
				var expr string
				if trigger.Data.CronExpression != "" {
					expr = trigger.Data.CronExpression
				} else {
					// Fallback to interval minutes
					interval := trigger.Data.IntervalMinutes
					if interval <= 0 {
						interval = 60 // default 1 hour if unspecified
					}
					// Convert minutes to standard cron expression if possible
					if interval < 60 {
						expr = fmt.Sprintf("*/%d * * * *", interval)
					} else {
						// e.g., 60 mins -> 0 * * * *
						expr = fmt.Sprintf("0 */%d * * *", interval/60)
					}
				}
				
				w := wf
				_, err := cronManager.AddFunc(expr, func() {
					log.Printf("[WF] ⏰ Scheduled execution for workflow '%s' (cron: %s)", w.Name, expr)
					runWorkflow(w, "cron", map[string]interface{}{
						"timestamp": time.Now().Format(time.RFC3339),
						"trigger":   "cron",
					})
				})
				
				if err != nil {
					log.Printf("[WF] Failed to schedule cron for workflow '%s' with expr '%s': %v", w.Name, expr, err)
				} else {
					jobCount++
				}
			}
		}
	}
	log.Printf("[WF] Scheduled %d cron jobs successfully", jobCount)
}
