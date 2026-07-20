package handlers

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
)

// MCP server — exposes Septimus capabilities as tools any external agent
// (Claude, another OS) can call over the Model Context Protocol (JSON-RPC 2.0).
// Mounted under the JWT-protected API, so a caller acts as a real user/workspace.

type mcpRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      interface{}     `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
}

func mcpOK(c *fiber.Ctx, id interface{}, result interface{}) error {
	return c.JSON(fiber.Map{"jsonrpc": "2.0", "id": id, "result": result})
}

func mcpErr(c *fiber.Ctx, id interface{}, code int, msg string) error {
	return c.JSON(fiber.Map{"jsonrpc": "2.0", "id": id, "error": fiber.Map{"code": code, "message": msg}})
}

// textContent wraps a string as an MCP tool result.
func textContent(text string) fiber.Map {
	return fiber.Map{"content": []fiber.Map{{"type": "text", "text": text}}}
}

func mcpToolSchemas() []fiber.Map {
	return []fiber.Map{
		{
			"name":        "search_knowledge",
			"description": "Semantic search over the workspace knowledge base (documents and entities).",
			"inputSchema": fiber.Map{
				"type":       "object",
				"properties": fiber.Map{"query": fiber.Map{"type": "string", "description": "Search query"}},
				"required":   []string{"query"},
			},
		},
		{
			"name":        "list_stuck_tasks",
			"description": "List tasks stuck in an active status (in_progress/review/blocked) beyond the staleness threshold.",
			"inputSchema": fiber.Map{"type": "object", "properties": fiber.Map{}},
		},
		{
			"name":        "list_tasks",
			"description": "List tasks in the workspace, optionally filtered by status.",
			"inputSchema": fiber.Map{
				"type":       "object",
				"properties": fiber.Map{"status": fiber.Map{"type": "string", "description": "Optional status filter (todo/in_progress/review/done)"}},
			},
		},
		{
			"name":        "create_task",
			"description": "Propose creating a task. It is queued for human approval before execution (human-in-the-loop).",
			"inputSchema": fiber.Map{
				"type": "object",
				"properties": fiber.Map{
					"title":       fiber.Map{"type": "string"},
					"description": fiber.Map{"type": "string"},
				},
				"required": []string{"title"},
			},
		},
	}
}

// HandleMCP is the single JSON-RPC endpoint for the MCP server.
func HandleMCP(c *fiber.Ctx) error {
	var req mcpRequest
	if err := c.BodyParser(&req); err != nil {
		return mcpErr(c, nil, -32700, "parse error")
	}

	workspaceID := database.ParseUUID(fmt.Sprintf("%v", c.Locals("workspace_id")))

	// A JSON-RPC notification carries no id and must not be answered with a
	// result or an error. Real clients send `notifications/initialized` right
	// after the handshake; replying "method not found" to it made the handshake
	// look like it failed. Acknowledge with 202 and no body.
	if req.ID == nil && strings.HasPrefix(req.Method, "notifications/") {
		return c.SendStatus(fiber.StatusAccepted)
	}

	switch req.Method {
	case "initialize":
		return mcpOK(c, req.ID, fiber.Map{
			"protocolVersion": "2024-11-05",
			"serverInfo":      fiber.Map{"name": "septimus-os", "version": "1.0.0"},
			"capabilities":    fiber.Map{"tools": fiber.Map{}},
		})

	case "ping":
		// Liveness check in the MCP spec; an empty result is the expected answer.
		return mcpOK(c, req.ID, fiber.Map{})

	case "tools/list":
		return mcpOK(c, req.ID, fiber.Map{"tools": mcpToolSchemas()})

	case "tools/call":
		var p struct {
			Name      string                 `json:"name"`
			Arguments map[string]interface{} `json:"arguments"`
		}
		_ = json.Unmarshal(req.Params, &p)
		text, err := runMCPTool(workspaceID, p.Name, p.Arguments)
		if err != nil {
			return mcpOK(c, req.ID, fiber.Map{
				"content": []fiber.Map{{"type": "text", "text": err.Error()}},
				"isError": true,
			})
		}
		return mcpOK(c, req.ID, textContent(text))

	default:
		return mcpErr(c, req.ID, -32601, "method not found: "+req.Method)
	}
}

func runMCPTool(workspaceID uuid.UUID, name string, args map[string]interface{}) (string, error) {
	if workspaceID == uuid.Nil {
		return "", fmt.Errorf("no workspace scope")
	}
	argStr := func(k string) string {
		if v, ok := args[k].(string); ok {
			return v
		}
		return ""
	}

	switch name {
	case "search_knowledge":
		query := argStr("query")
		if query == "" {
			return "", fmt.Errorf("query is required")
		}
		results, err := services.SearchSimilar(workspaceID, query, 5)
		if err != nil || len(results) == 0 {
			return "No relevant knowledge found.", nil
		}
		var b strings.Builder
		for _, r := range results {
			snippet := r.Content
			if len(snippet) > 200 {
				snippet = snippet[:200] + "…"
			}
			b.WriteString(fmt.Sprintf("- [%s] %s\n", r.EntityType, snippet))
		}
		return b.String(), nil

	case "list_stuck_tasks":
		threshold := time.Now().AddDate(0, 0, -stuckTaskDays())
		var tasks []models.Task
		database.DB.
			Joins("JOIN projects ON projects.id = tasks.project_id").
			Where("projects.workspace_id = ? AND tasks.status IN ? AND tasks.updated_at < ?", workspaceID, stuckStatuses, threshold).
			Limit(50).Find(&tasks)
		if len(tasks) == 0 {
			return "No stuck tasks. 🎉", nil
		}
		var b strings.Builder
		b.WriteString(fmt.Sprintf("%d stuck task(s):\n", len(tasks)))
		for _, t := range tasks {
			b.WriteString(fmt.Sprintf("- %s (%s, since %s)\n", t.Title, t.Status, t.UpdatedAt.Format("2006-01-02")))
		}
		return b.String(), nil

	case "list_tasks":
		var tasks []models.Task
		q := database.DB.
			Joins("JOIN projects ON projects.id = tasks.project_id").
			Where("projects.workspace_id = ?", workspaceID)
		if status := argStr("status"); status != "" {
			q = q.Where("tasks.status = ?", status)
		}
		q.Order("tasks.updated_at desc").Limit(50).Find(&tasks)
		if len(tasks) == 0 {
			return "No tasks found.", nil
		}
		var b strings.Builder
		for _, t := range tasks {
			b.WriteString(fmt.Sprintf("- %s [%s]\n", t.Title, t.Status))
		}
		return b.String(), nil

	case "create_task":
		title := argStr("title")
		if title == "" {
			return "", fmt.Errorf("title is required")
		}
		payloadBytes, _ := json.Marshal(approvalPayload{
			Action:      "create_entity",
			WorkspaceID: workspaceID.String(),
			EntityType:  "task",
			Data:        map[string]interface{}{"title": title, "description": argStr("description"), "status": "Todo", "priority": 1, "points": 0},
		})
		pending := models.PendingApproval{
			WorkspaceID: workspaceID,
			AgentName:   "mcp",
			ActionType:  "Create Task",
			Payload:     string(payloadBytes),
			Reason:      "External agent (MCP) proposed creating a task; awaiting human approval.",
			Status:      "pending",
		}
		if err := database.DB.Create(&pending).Error; err != nil {
			return "", fmt.Errorf("failed to queue task for approval")
		}
		// Surface the proposal in the AI Center's live approvals queue immediately —
		// a human is the one gating this, so they should not wait for a poll.
		PublishAgentApproval(workspaceID, &pending, false)
		return fmt.Sprintf("Task '%s' queued for human approval (id %s).", title, pending.ID), nil

	default:
		return "", fmt.Errorf("unknown tool: %s", name)
	}
}
