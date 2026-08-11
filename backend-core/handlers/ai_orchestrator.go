package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/septimus-os/backend-core/events"
	"github.com/septimus-os/backend-core/middleware"
)

// OrchestratorRequest defines the payload sent to the internal AI Agent Brain.
type OrchestratorRequest struct {
	Query             string                 `json:"query"`
	TargetPersona     string                 `json:"target_persona,omitempty"`
	ContextParameters map[string]interface{} `json:"context_parameters,omitempty"`
	WorkspaceID       string                 `json:"workspace_id,omitempty"`
	UserID            string                 `json:"user_id,omitempty"`
	UserRole          string                 `json:"user_role,omitempty"`
}

// InteractiveModalSpec describes the UI modal triggered when mandatory parameters are missing.
type InteractiveModalSpec struct {
	Title         string `json:"title"`
	Description   string `json:"description"`
	RequiredField string `json:"required_field"`
	FieldLabel    string `json:"field_label"`
	InputType     string `json:"input_type"` // e.g. "text", "number", "uuid"
	TargetPersona string `json:"target_persona"`
	OriginalQuery string `json:"original_query"`
}

// OrchestratorResponse represents the standardized dual payload returned by the AI sidecar.
type OrchestratorResponse struct {
	Status        string                 `json:"status"` // "success", "missing_parameters", "error"
	Message       string                 `json:"message"`
	ActivePersona string                 `json:"active_persona,omitempty"`
	OutputProse   string                 `json:"output_prose,omitempty"`
	RequiredInput *InteractiveModalSpec  `json:"required_input,omitempty"`
	Deliverables  map[string]interface{} `json:"deliverables,omitempty"`
	Timestamp     string                 `json:"timestamp"`
}

// HandleOrchestratorQuery handles public/protected API requests to the sovereign AI orchestrator.
func HandleOrchestratorQuery(c *fiber.Ctx) error {
	var req OrchestratorRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"status":  "error",
			"message": "Invalid JSON payload for orchestrator request",
		})
	}

	if req.Query == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"status":  "error",
			"message": "Query parameter is required",
		})
	}

	// Identity comes from the JWT, never from the request body. These three
	// fields decide which tenant the orchestrator reads and writes and which
	// personas the caller may drive, so a body-supplied value was a
	// cross-tenant access and a privilege escalation. Overwrite unconditionally
	// and clear them when the claim is absent rather than letting the client's
	// value stand.
	req.WorkspaceID, _ = c.Locals("workspace_id").(string)
	req.UserID, _ = c.Locals("user_id").(string)
	req.UserRole, _ = c.Locals("role").(string)

	return executeOrchestration(c, req)
}

// HandleInternalOrchestratorQuery handles internal microservice-to-microservice orchestrator requests.
func HandleInternalOrchestratorQuery(c *fiber.Ctx) error {
	var req OrchestratorRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"status":  "error",
			"message": "Invalid internal JSON payload for orchestrator request",
		})
	}

	if req.Query == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"status":  "error",
			"message": "Query parameter is required for internal orchestration",
		})
	}

	return executeOrchestration(c, req)
}

func executeOrchestration(c *fiber.Ctx, req OrchestratorRequest) error {
	// 1. Publish NATS JetStream event for audit log and real-time watchers
	eventPayload, _ := json.Marshal(map[string]interface{}{
		"query":          req.Query,
		"target_persona": req.TargetPersona,
		"workspace_id":   req.WorkspaceID,
		"user_id":        req.UserID,
		"user_role":      req.UserRole,
		"timestamp":      time.Now().UTC().Format(time.RFC3339),
	})
	if pubErr := events.PublishEvent("events.ai.internal_orchestrator_request", eventPayload); pubErr != nil {
		log.Printf("⚠️ [AI Orchestrator] Could not publish events.ai.internal_orchestrator_request: %v", pubErr)
	} else {
		log.Printf("📢 [AI Orchestrator] Published events.ai.internal_orchestrator_request for query: %.50s...", req.Query)
	}

	// 2. Forward request synchronously to Python AI sidecar orchestrator endpoint
	targetURL := fmt.Sprintf("%s/internal/ai/orchestrator/execute", aiSidecarURL())
	bodyBytes, err := json.Marshal(req)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"status":  "error",
			"message": "Failed to serialize orchestrator request",
		})
	}

	httpReq, err := http.NewRequestWithContext(c.Context(), http.MethodPost, targetURL, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"status":  "error",
			"message": fmt.Sprintf("Failed to construct request to AI sidecar: %v", err),
		})
	}

	httpReq.Header.Set("Content-Type", "application/json")
	if token := os.Getenv("INTERNAL_API_TOKEN"); token != "" {
		httpReq.Header.Set(middleware.InternalTokenName, token)
	}
	if req.WorkspaceID != "" {
		httpReq.Header.Set("X-Workspace-Id", req.WorkspaceID)
	}
	if req.UserID != "" {
		httpReq.Header.Set("X-User-Id", req.UserID)
	}
	if req.UserRole != "" {
		httpReq.Header.Set("X-User-Role", req.UserRole)
	}

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		log.Printf("❌ [AI Orchestrator] Sidecar request failed: %v", err)
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"status":  "error",
			"message": fmt.Sprintf("AI sidecar orchestrator unreachable: %v", err),
		})
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"status":  "error",
			"message": "Failed to read response from AI sidecar orchestrator",
		})
	}

	var orchResp OrchestratorResponse
	if err := json.Unmarshal(respBody, &orchResp); err != nil {
		// If sidecar returned non-JSON or raw text error
		if resp.StatusCode >= 400 {
			return c.Status(resp.StatusCode).JSON(fiber.Map{
				"status":  "error",
				"message": string(respBody),
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"status":  "error",
			"message": fmt.Sprintf("Invalid JSON response from AI sidecar: %s", string(respBody)),
		})
	}

	if orchResp.Timestamp == "" {
		orchResp.Timestamp = time.Now().UTC().Format(time.RFC3339)
	}

	// Return status directly matching sidecar output (200 OK even for missing_parameters dual-prompt)
	if resp.StatusCode >= 400 {
		return c.Status(resp.StatusCode).JSON(orchResp)
	}
	return c.Status(fiber.StatusOK).JSON(orchResp)
}
