package handlers

import (
	"encoding/json"
	"log"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/events"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
)

// WorkflowPayload is the request payload from the React Flow frontend
type WorkflowPayload struct {
	Name     string                 `json:"name"`
	IsActive bool                   `json:"isActive"`
	Nodes    map[string]interface{} `json:"nodes"`
	Edges    map[string]interface{} `json:"edges"`
}

func decryptWorkflowView(workflow *models.Workflow) error {
	nodes, err := services.DecodeWorkflowNodes(workflow.Nodes)
	if err != nil {
		return err
	}
	workflow.Nodes, err = services.RedactWorkflowSecrets(nodes)
	if err != nil {
		return err
	}
	return nil
}

// SaveWorkflow handles creating or updating a workflow
func SaveWorkflow(c *fiber.Ctx) error {
	// Tenant comes from the JWT. This handler used to take it from
	// ?workspace_id= and never look at the session at all, so any authorised
	// member could write a workflow into another tenant by editing the URL.
	// Explicit scoping remains mandatory even though PostgreSQL RLS now provides
	// a second tenant boundary.
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(403).JSON(fiber.Map{"error": "workspace context is required"})
	}

	// We simply expect nodes and edges as JSON arrays
	var payload struct {
		ID       string        `json:"id,omitempty"`
		Name     string        `json:"name"`
		IsActive bool          `json:"isActive"`
		Nodes    []interface{} `json:"nodes"`
		Edges    []interface{} `json:"edges"`
	}

	if err := c.BodyParser(&payload); err != nil {
		log.Printf("Error parsing workflow payload: %v", err)
		return c.Status(400).JSON(fiber.Map{"error": "invalid JSON"})
	}
	payload.Name = strings.TrimSpace(payload.Name)
	if payload.Name == "" || len(payload.Name) > 255 {
		return c.Status(400).JSON(fiber.Map{"error": "workflow name must be between 1 and 255 characters"})
	}
	if len(payload.Nodes) > 500 || len(payload.Edges) > 2000 {
		return c.Status(400).JSON(fiber.Map{"error": "workflow graph exceeds the supported size"})
	}

	var workflow models.Workflow
	isUpdate := payload.ID != "" && payload.ID != "00000000-0000-0000-0000-000000000000"
	if isUpdate {
		wfID, err := uuid.Parse(payload.ID)
		if err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "invalid workflow id"})
		}
		if err := database.GetDB(c).Where("workspace_id = ?", workspaceID).First(&workflow, "id = ?", wfID).Error; err != nil {
			return c.Status(404).JSON(fiber.Map{"error": "workflow not found for update"})
		}
	}

	nodesBytes, err := json.Marshal(payload.Nodes)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to encode nodes"})
	}
	if isUpdate {
		existingNodes, err := services.DecodeWorkflowNodes(workflow.Nodes)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "failed to decode stored workflow configuration"})
		}
		nodesBytes, err = services.MergeWorkflowSecretPlaceholders(nodesBytes, existingNodes)
		if err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "failed to merge protected workflow fields"})
		}
	}
	encryptedNodes, err := services.EncodeWorkflowNodes(nodesBytes)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to protect workflow node configuration"})
	}

	edgesBytes, err := json.Marshal(payload.Edges)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to encode edges"})
	}

	// Cycle Detection (DAG Validation)
	var edgesData []struct {
		Source string `json:"source"`
		Target string `json:"target"`
	}
	if err := json.Unmarshal(edgesBytes, &edgesData); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "failed to parse edges for validation"})
	}

	adj := make(map[string][]string)
	for _, e := range edgesData {
		adj[e.Source] = append(adj[e.Source], e.Target)
	}

	visited := make(map[string]int) // 0: unvisited, 1: visiting, 2: visited
	var hasCycle func(node string) bool
	hasCycle = func(node string) bool {
		if visited[node] == 1 {
			return true // cycle detected
		}
		if visited[node] == 2 {
			return false
		}
		visited[node] = 1 // mark as visiting
		for _, neighbor := range adj[node] {
			if hasCycle(neighbor) {
				return true
			}
		}
		visited[node] = 2 // mark as visited
		return false
	}

	for node := range adj {
		if visited[node] == 0 {
			if hasCycle(node) {
				return c.Status(400).JSON(fiber.Map{
					"error": "Workflow contains a circular dependency (infinite loop) which is not allowed.",
				})
			}
		}
	}

	if isUpdate {
		workflow.Name = payload.Name
		workflow.IsActive = payload.IsActive
		workflow.Nodes = encryptedNodes
		workflow.Edges = edgesBytes
		if err := database.GetDB(c).Save(&workflow).Error; err != nil {
			log.Printf("Failed to update workflow: %v", err)
			return c.Status(500).JSON(fiber.Map{"error": "failed to update workflow"})
		}
	} else {
		workflow = models.Workflow{
			WorkspaceID: workspaceID,
			Name:        payload.Name,
			IsActive:    payload.IsActive,
			Nodes:       encryptedNodes,
			Edges:       edgesBytes,
		}
		if err := database.GetDB(c).Create(&workflow).Error; err != nil {
			log.Printf("Failed to save workflow: %v", err)
			return c.Status(500).JSON(fiber.Map{"error": "failed to save workflow"})
		}
	}

	logWorkflowEvent(c, "workflow.save", workflow.ID.String(), map[string]interface{}{"name": workflow.Name, "is_active": workflow.IsActive, "is_update": isUpdate})

	// Reload cron schedules so any new/updated cron triggers take effect immediately
	ReloadCronManager()

	workflowView := workflow
	if err := decryptWorkflowView(&workflowView); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to render workflow"})
	}
	return c.Status(201).JSON(fiber.Map{
		"message":  "Workflow saved successfully",
		"workflow": workflowView,
	})
}

// GetWorkflows lists workflows for a given workspace
func GetWorkflows(c *fiber.Ctx) error {
	// JWT-derived only — see SaveWorkflow. Reading by ?workspace_id= let any
	// member list another tenant's automations.
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(403).JSON(fiber.Map{"error": "workspace context is required"})
	}

	var workflows []models.Workflow
	if err := database.GetDB(c).Where("workspace_id = ?", workspaceID).Find(&workflows).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to fetch workflows"})
	}
	for i := range workflows {
		if err := decryptWorkflowView(&workflows[i]); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "failed to decode workflow configuration"})
		}
	}

	return c.JSON(workflows)
}

// TriggerWorkflowManually executes a saved workflow with a test context payload
func TriggerWorkflowManually(c *fiber.Ctx) error {
	workflowIDStr := c.Params("id")
	workflowID, err := uuid.Parse(workflowIDStr)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid workflow id"})
	}

	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(403).JSON(fiber.Map{"error": "workspace context is required"})
	}

	// Parse optional context body. It is event data only: tenant identity is
	// always stamped from the authenticated workflow owner below.
	ctx := make(map[string]interface{})
	_ = c.BodyParser(&ctx)

	// Fetch workflow — tenant-scoped, see SaveWorkflow.
	var wf models.Workflow
	if err := database.GetDB(c).Where("workspace_id = ?", workspaceID).First(&wf, "id = ?", workflowID).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "workflow not found"})
	}

	// Parse nodes
	var nodes []WFNode
	decryptedNodes, err := services.DecodeWorkflowNodes(wf.Nodes)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to decrypt workflow nodes"})
	}
	if err := json.Unmarshal(decryptedNodes, &nodes); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to parse workflow nodes"})
	}
	var edges []WFEdge
	if err := json.Unmarshal(wf.Edges, &edges); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to parse workflow edges"})
	}

	// Run in background goroutine
	go func() {
		runCtx := cloneWorkflowContext(ctx, workspaceID)
		triggers := findTriggerNodes(nodes)
		adjacency := buildAdjacency(edges)
		status := "success"
		for _, trigger := range triggers {
			if err := traverseAndExecute(trigger.ID, nodes, adjacency, runCtx); err != nil {
				status = "failed"
			}
		}
		StoreWorkflowRun(workflowID, "manual", status, runCtx)
	}()

	logWorkflowEvent(c, "workflow.trigger", workflowIDStr, ctx)

	return c.JSON(fiber.Map{
		"message":     "Workflow execution started",
		"workflow_id": workflowIDStr,
	})
}

// PatchWorkflow updates workflow name or active state
func PatchWorkflow(c *fiber.Ctx) error {
	workflowIDStr := c.Params("id")
	workflowID, err := uuid.Parse(workflowIDStr)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid workflow id"})
	}

	var req struct {
		Name     *string `json:"name"`
		IsActive *bool   `json:"isActive"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}

	var wf models.Workflow
	// Tenant-scoped, see SaveWorkflow.
	if err := database.GetDB(c).Where("workspace_id = ?", CurrentWorkspaceID(c)).First(&wf, "id = ?", workflowID).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "workflow not found"})
	}

	if req.Name != nil {
		wf.Name = *req.Name
	}
	if req.IsActive != nil {
		wf.IsActive = *req.IsActive
	}

	if err := database.GetDB(c).Save(&wf).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to update workflow"})
	}

	logWorkflowEvent(c, "workflow.patch", workflowIDStr, req)

	// Reload cron schedules in case active state changed
	ReloadCronManager()

	if err := decryptWorkflowView(&wf); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to decode workflow configuration"})
	}
	return c.JSON(wf)
}

func logWorkflowEvent(c *fiber.Ctx, action, workflowID string, details interface{}) {
	var uid *uuid.UUID
	if idStr, ok := c.Locals("user_id").(string); ok && idStr != "" {
		if parsed := database.ParseUUID(idStr); parsed != uuid.Nil {
			uid = &parsed
		}
	}
	services.LogEvent(uid, action, "Workflow", workflowID, details, c.IP())
}

// GetWorkflowRuns lists execution history for a given workflow
func GetWorkflowRuns(c *fiber.Ctx) error {
	workflowIDStr := c.Params("id")
	if workflowIDStr == "" {
		return c.Status(400).JSON(fiber.Map{"error": "workflow id is required"})
	}

	// Run history is only readable through a workflow the caller's tenant owns —
	// workflow_runs carries no workspace_id of its own, so the ownership check
	// has to happen on the parent.
	var parent models.Workflow
	if err := database.GetDB(c).Where("workspace_id = ?", CurrentWorkspaceID(c)).
		First(&parent, "id = ?", database.ParseUUID(workflowIDStr)).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "workflow not found"})
	}

	var runs []models.WorkflowRun
	if err := database.GetDB(c).Where("workflow_id = ?", workflowIDStr).Order("created_at desc").Limit(50).Find(&runs).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to fetch workflow runs"})
	}

	return c.JSON(runs)
}

// GenerateWorkflow handles Text-to-Workflow requests via AI
func GenerateWorkflow(c *fiber.Ctx) error {
	// JWT-derived only — see SaveWorkflow.
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(403).JSON(fiber.Map{"error": "workspace context is required"})
	}

	var payload struct {
		Prompt string `json:"prompt"`
	}
	if err := c.BodyParser(&payload); err != nil {
		log.Printf("Error parsing workflow generate payload: %v", err)
		return c.Status(400).JSON(fiber.Map{"error": "invalid JSON"})
	}

	userID := ""
	if idStr, ok := c.Locals("user_id").(string); ok {
		userID = idStr
	}

	// 2. Publish to NATS JetStream for AI Sidecar
	eventData := map[string]interface{}{
		"workspace_id": workspaceID.String(),
		"user_id":      userID,
		"prompt":       payload.Prompt,
	}
	dataBytes, err := json.Marshal(eventData)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to encode event data"})
	}

	// Publish to the durable stream (Text-to-Workflow)
	if err := events.PublishEvent("events.workflow.generate", dataBytes); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to publish to AI sidecar"})
	}

	return c.Status(202).JSON(fiber.Map{
		"status":  "accepted",
		"message": "Workflow generation started via AI sidecar",
	})
}
