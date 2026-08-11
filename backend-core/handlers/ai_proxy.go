package handlers

import (
	"encoding/json"
	"log"
	"os"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/proxy"
	"github.com/google/uuid"

	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/middleware"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
)

// aiSidecarURL is the internal address of the Python AI sidecar. It is only
// reachable from within the Docker network — browsers reach it exclusively
// through this JWT-protected proxy.
func aiSidecarURL() string {
	if v := os.Getenv("AI_SIDECAR_URL"); v != "" {
		return strings.TrimRight(v, "/")
	}
	return "http://ai-sidecar:8000"
}

// ProxyToAISidecar forwards a JWT-authenticated /api/v1/ai/* request to the AI
// sidecar. Because it lives under the `protected` group, the caller has already
// passed JWTMiddleware, so we can trust the workspace_id claim and stamp it onto
// the outgoing request instead of relying on client-supplied values. The shared
// internal token proves to the sidecar that the request originated here.
func ProxyToAISidecar(c *fiber.Ctx) error {
	target := aiSidecarURL() + c.OriginalURL()
	if err := prepareAIChatBody(c); err != nil {
		return err
	}

	// The token is the shared service secret — never print its value.
	if token := os.Getenv("INTERNAL_API_TOKEN"); token != "" {
		c.Request().Header.Set(middleware.InternalTokenName, token)
	} else {
		log.Println("ai_proxy: INTERNAL_API_TOKEN is empty — the sidecar will reject this request")
	}
	if ws, ok := c.Locals("workspace_id").(string); ok && ws != "" {
		c.Request().Header.Set("X-Workspace-Id", ws)
	}
	if uid, ok := c.Locals("user_id").(string); ok && uid != "" {
		c.Request().Header.Set("X-User-Id", uid)

		if _, parseErr := uuid.Parse(uid); parseErr == nil && database.DB != nil &&
			string(c.Request().Header.Method()) == "POST" && strings.Contains(string(c.Request().Header.ContentType()), "application/json") {
			var user models.User
			if err := database.DB.Where("id = ?", uid).First(&user).Error; err == nil {
				if len(user.Data) > 0 {
					var dataMap map[string]interface{}
					if err := json.Unmarshal(user.Data, &dataMap); err == nil {
						if prefs, exists := dataMap["llm_preferences"]; exists {
							var bodyMap map[string]interface{}
							bodyBytes := c.Request().Body()
							if len(bodyBytes) > 0 {
								if err := json.Unmarshal(bodyBytes, &bodyMap); err == nil {
									bodyMap["llm_preferences"] = prefs
									newBody, _ := json.Marshal(bodyMap)
									c.Request().SetBody(newBody)
									c.Request().Header.SetContentLength(len(newBody))
								}
							}
						}
					}
				}
			}
		}
	}
	if role, ok := c.Locals("role").(string); ok && role != "" {
		c.Request().Header.Set("X-User-Role", role)
	}

	// Strip the browser Authorization header before crossing into the internal
	// network; the sidecar authenticates on the internal token, not the JWT.
	c.Request().Header.Del("Authorization")

	return proxy.Do(c, target)
}

func prepareAIChatBody(c *fiber.Ctx) error {
	if c.Method() != fiber.MethodPost || !strings.HasSuffix(c.Path(), "/ai/chat") ||
		!strings.Contains(strings.ToLower(c.Get(fiber.HeaderContentType)), "application/json") || len(c.Body()) == 0 {
		return nil
	}
	var body map[string]interface{}
	if err := json.Unmarshal(c.Body(), &body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid AI chat body"})
	}
	// Browser callers cannot replace the role prompt or select model/provider
	// preferences in request JSON. Preferences are attached below from the
	// authenticated user's server-side profile.
	delete(body, "system_prompt")
	delete(body, "llm_preferences")

	rawContext, _ := body["context"].(map[string]interface{})
	safeContext := map[string]interface{}{}
	if lang := strings.ToLower(strings.TrimSpace(stringValue(rawContext, "lang"))); lang == "ar" || lang == "en" {
		safeContext["lang"] = lang
	}
	if streamID := strings.TrimSpace(stringValue(rawContext, "stream_id")); streamID != "" {
		if _, err := uuid.Parse(streamID); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid AI stream reference"})
		}
		safeContext["stream_id"] = streamID
	}
	purpose := strings.ToLower(strings.TrimSpace(stringValue(rawContext, "purpose")))
	switch purpose {
	case "crm_email_draft", "crm_opportunity_assist", "crm_ticket_assist":
		safeContext["purpose"] = purpose
	default:
		safeContext["purpose"] = "general_assistance"
	}

	ref, _ := rawContext["entity_ref"].(map[string]interface{})
	definitionKey := strings.TrimSpace(stringValue(ref, "definition_key"))
	recordIDText := strings.TrimSpace(stringValue(ref, "record_id"))
	if definitionKey != "" || recordIDText != "" {
		if !isCRMDefinitionKey(definitionKey) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "unsupported AI entity reference"})
		}
		recordID, err := uuid.Parse(recordIDText)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid AI entity reference"})
		}
		agentType := strings.ToLower(strings.TrimSpace(stringValue(body, "agent_type")))
		if agentType != "crm" && agentType != "sales" && agentType != "supervisor" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "AI agent cannot access the referenced CRM context"})
		}
		workspaceID := CurrentWorkspaceID(c)
		if workspaceID == uuid.Nil {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
		}
		record, err := services.GetDynamicRecordForAIAs(
			database.GetDB(c), workspaceID, dynamicRecordPrincipal(c), definitionKey, recordID,
		)
		if err != nil {
			return dynamicRecordError(c, err)
		}
		var fields map[string]interface{}
		_ = json.Unmarshal(record.Data, &fields)
		safeContext["entity_ref"] = map[string]interface{}{"definition_key": definitionKey, "record_id": record.ID.String()}
		safeContext["record"] = map[string]interface{}{
			"definition_key": definitionKey, "record_id": record.ID.String(),
			"schema_version": record.SchemaVersion, "record_version": record.RecordVersion,
			"display_value": record.DisplayValue, "fields": fields,
		}
		safeContext["provenance"] = map[string]interface{}{
			"source_type": "schema_record", "definition_key": definitionKey,
			"record_id": record.ID.String(), "schema_version": record.SchemaVersion,
		}
	}
	body["context"] = safeContext
	encoded, err := json.Marshal(body)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid AI chat body"})
	}
	c.Request().SetBody(encoded)
	c.Request().Header.SetContentLength(len(encoded))
	return nil
}

func stringValue(values map[string]interface{}, key string) string {
	if values == nil {
		return ""
	}
	value, _ := values[key].(string)
	return value
}

func isCRMDefinitionKey(key string) bool {
	for _, allowed := range services.SystemCRMDefinitionKeys() {
		if key == allowed {
			return true
		}
	}
	return false
}
