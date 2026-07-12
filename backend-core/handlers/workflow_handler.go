package handlers

import (
	"encoding/json"
	"log"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
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

// SaveWorkflow handles creating or updating a workflow
func SaveWorkflow(c *fiber.Ctx) error {
	workspaceIDStr := c.Query("workspace_id")
	if workspaceIDStr == "" {
		return c.Status(400).JSON(fiber.Map{"error": "workspace_id query param is required"})
	}

	workspaceID := database.ParseUUID(workspaceIDStr)
	if workspaceID == uuid.Nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid workspace_id"})
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

	nodesBytes, err := json.Marshal(payload.Nodes)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to encode nodes"})
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

	var workflow models.Workflow
	isUpdate := payload.ID != "" && payload.ID != "00000000-0000-0000-0000-000000000000"

	if isUpdate {
		wfID := database.ParseUUID(payload.ID)
		if err := database.DB.First(&workflow, "id = ?", wfID).Error; err != nil {
			return c.Status(404).JSON(fiber.Map{"error": "workflow not found for update"})
		}
		workflow.Name = payload.Name
		workflow.IsActive = payload.IsActive
		workflow.Nodes = nodesBytes
		workflow.Edges = edgesBytes
		if err := database.DB.Save(&workflow).Error; err != nil {
			log.Printf("Failed to update workflow: %v", err)
			return c.Status(500).JSON(fiber.Map{"error": "failed to update workflow"})
		}
	} else {
		workflow = models.Workflow{
			WorkspaceID: workspaceID,
			Name:        payload.Name,
			IsActive:    payload.IsActive,
			Nodes:       nodesBytes,
			Edges:       edgesBytes,
		}
		if err := database.DB.Create(&workflow).Error; err != nil {
			log.Printf("Failed to save workflow: %v", err)
			return c.Status(500).JSON(fiber.Map{"error": "failed to save workflow"})
		}
	}

	logWorkflowEvent(c, "workflow.save", workflow.ID.String(), map[string]interface{}{"name": workflow.Name, "is_active": workflow.IsActive, "is_update": isUpdate})

	// Reload cron schedules so any new/updated cron triggers take effect immediately
	ReloadCronManager()

	return c.Status(201).JSON(fiber.Map{
		"message": "Workflow saved successfully",
		"workflow": workflow,
	})
}

// GetWorkflows lists workflows for a given workspace
func GetWorkflows(c *fiber.Ctx) error {
	workspaceIDStr := c.Query("workspace_id")
	if workspaceIDStr == "" {
		return c.Status(400).JSON(fiber.Map{"error": "workspace_id query param is required"})
	}

	var workflows []models.Workflow
	if err := database.DB.Where("workspace_id = ?", workspaceIDStr).Find(&workflows).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to fetch workflows"})
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

	// Parse optional context body
	ctx := make(map[string]interface{})
	_ = c.BodyParser(&ctx)

	// Fetch workflow
	var wf models.Workflow
	if err := database.DB.First(&wf, "id = ?", workflowID).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "workflow not found"})
	}

	// Parse nodes
	var nodes []WFNode
	if err := json.Unmarshal(wf.Nodes, &nodes); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to parse workflow nodes"})
	}
	var edges []WFEdge
	if err := json.Unmarshal(wf.Edges, &edges); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to parse workflow edges"})
	}

	// Run in background goroutine
	go func() {
		triggers := findTriggerNodes(nodes)
		adjacency := buildAdjacency(edges)
		for _, trigger := range triggers {
			traverseAndExecute(trigger.ID, nodes, adjacency, ctx)
		}
		StoreWorkflowRun(workflowID, "manual", "success", ctx)
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
	if err := database.DB.First(&wf, "id = ?", workflowID).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "workflow not found"})
	}

	if req.Name != nil {
		wf.Name = *req.Name
	}
	if req.IsActive != nil {
		wf.IsActive = *req.IsActive
	}

	if err := database.DB.Save(&wf).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to update workflow"})
	}

	logWorkflowEvent(c, "workflow.patch", workflowIDStr, req)

	// Reload cron schedules in case active state changed
	ReloadCronManager()

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

	var runs []models.WorkflowRun
	if err := database.DB.Where("workflow_id = ?", workflowIDStr).Order("created_at desc").Limit(50).Find(&runs).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to fetch workflow runs"})
	}

	return c.JSON(runs)
}
