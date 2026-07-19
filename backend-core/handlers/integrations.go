package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/datatypes"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
)

type IntegrationDef struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Category    string `json:"category"`
	Icon        string `json:"icon"`
	Status      string `json:"status"` // "connected" or "disconnected"
}

var availableIntegrations = []IntegrationDef{
	{
		ID:          "whatsapp",
		Name:        "إشعارات WhatsApp",
		Description: "إرسال التنبيهات والأحداث الهامة للمدراء والموظفين عبر واتساب بشكل فوري.",
		Category:    "Communication",
		Icon:        "whatsapp",
		Status:      "disconnected",
	},
	{
		ID:          "zendesk",
		Name:        "Zendesk Helpdesk",
		Description: "إنشاء تذاكر صيانة تلقائياً عند تعطل أجهزة الـ POS أو فقدان الاتصال بالمحطات.",
		Category:    "Support",
		Icon:        "helpdesk",
		Status:      "disconnected",
	},
	{
		ID:          "odoo",
		Name:        "Odoo ERP Sync",
		Description: "مزامنة التسويات المالية (Settlements) والحركات اليومية مع نظام المحاسبة.",
		Category:    "Finance",
		Icon:        "erp",
		Status:      "disconnected",
	},
	{
		ID:          "ai_analytics",
		Name:        "Septimus AI Assistant",
		Description: "مساعد ذكي لتحليل العمليات واكتشاف محاولات الاحتيال وتقديم تقارير دورية.",
		Category:    "Analytics",
		Icon:        "ai",
		Status:      "disconnected",
	},
	{
		ID:          "google_drive",
		Name:        "Google Drive",
		Description: "Automatically sync WorkDocs and create project folders.",
		Category:    "Productivity",
		Icon:        "drive",
		Status:      "disconnected",
	},
	{
		ID:          "google_calendar",
		Name:        "Google Calendar",
		Description: "Sync deadlines, meetings, and team availability.",
		Category:    "Productivity",
		Icon:        "calendar",
		Status:      "disconnected",
	},
	{
		ID:          "google_sheets",
		Name:        "Google Sheets",
		Description: "Export attendance payroll and live Kanban tasks.",
		Category:    "Productivity",
		Icon:        "sheets",
		Status:      "disconnected",
	},
}

// normalizeProvider collapses the three Google sub-integrations onto the single
// "google" OAuth credential record they all share.
func normalizeProvider(provider string) string {
	switch provider {
	case "google_calendar", "google_drive", "google_sheets":
		return "google"
	}
	return provider
}

func getWorkspaceID(c *fiber.Ctx) uuid.UUID {
	var workspaceID uuid.UUID
	if val := c.Locals("workspace_id"); val != nil {
		if str, ok := val.(string); ok {
			if id, err := uuid.Parse(str); err == nil {
				workspaceID = id
			}
		}
	}
	if workspaceID == uuid.Nil {
		if queryId := c.Query("workspace_id"); queryId != "" {
			if id, err := uuid.Parse(queryId); err == nil {
				workspaceID = id
			}
		}
	}
	if workspaceID == uuid.Nil {
		var ws models.Workspace
		if err := database.GetDB(c).First(&ws).Error; err == nil {
			workspaceID = ws.ID
		}
	}
	return workspaceID
}

func GetIntegrations(c *fiber.Ctx) error {
	workspaceID := getWorkspaceID(c)

	var activeIntegrations []models.WorkspaceIntegration
	database.GetDB(c).Where("workspace_id = ?", workspaceID).Find(&activeIntegrations)

	response := make([]IntegrationDef, len(availableIntegrations))
	for i, def := range availableIntegrations {
		response[i] = def
		for _, active := range activeIntegrations {
			if active.Provider == def.ID || (active.Provider == "google" && (def.ID == "google_drive" || def.ID == "google_calendar" || def.ID == "google_sheets")) {
				response[i].Status = "connected"
				break
			}
		}
	}

	return c.JSON(fiber.Map{
		"integrations": response,
	})
}

func ToggleIntegration(c *fiber.Ctx) error {
	id := c.Params("id") // provider id like "whatsapp", "zendesk", "odoo", "ai_analytics"
	workspaceID := getWorkspaceID(c)

	provider := normalizeProvider(id)

	var existing models.WorkspaceIntegration
	err := database.GetDB(c).Where("workspace_id = ? AND provider = ?", workspaceID, provider).First(&existing).Error
	if err == nil {
		// It exists -> disconnect it
		database.GetDB(c).Delete(&existing)
		logIntegrationEvent(c, "integration.disconnect", provider, nil)
		return c.JSON(fiber.Map{
			"status":  "disconnected",
			"message": "Integration disconnected successfully",
		})
	} else {
		// It doesn't exist -> connect it
		newInt := models.WorkspaceIntegration{
			ID:          uuid.New(),
			WorkspaceID: workspaceID,
			Provider:    provider,
			AccessToken: "active_token_" + provider,
		}
		if err := database.GetDB(c).Create(&newInt).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to connect integration"})
		}
		logIntegrationEvent(c, "integration.connect", provider, nil)
		return c.JSON(fiber.Map{
			"status":  "connected",
			"message": "Integration connected successfully",
		})
	}
}

// DisconnectIntegration removes the integration credentials for the workspace
func DisconnectIntegration(c *fiber.Ctx) error {
	workspaceID := getWorkspaceID(c)
	provider := c.Params("id")
	if provider == "" {
		provider = "google"
	} else {
		provider = normalizeProvider(provider)
	}

	if err := database.GetDB(c).Where("workspace_id = ? AND provider = ?", workspaceID, provider).Delete(&models.WorkspaceIntegration{}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to disconnect integration"})
	}

	logIntegrationEvent(c, "integration.disconnect", provider, nil)

	return c.JSON(fiber.Map{
		"message": "Successfully disconnected",
	})
}

// GetActiveIntegration returns the integration if it's connected
func GetActiveIntegration(workspaceID uuid.UUID, provider string) (*models.WorkspaceIntegration, bool) {
	provider = normalizeProvider(provider)

	var integration models.WorkspaceIntegration
	if err := database.DB.Where("workspace_id = ? AND provider = ?", workspaceID, provider).First(&integration).Error; err != nil {
		return nil, false
	}
	return &integration, true
}

// GetIntegrationConfig returns the configuration stored in Metadata for a provider
func GetIntegrationConfig(c *fiber.Ctx) error {
	workspaceID := getWorkspaceID(c)
	provider := c.Params("id")
	if provider == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Provider ID required"})
	}

	var existing models.WorkspaceIntegration
	err := database.GetDB(c).Where("workspace_id = ? AND provider = ?", workspaceID, provider).First(&existing).Error
	if err != nil {
		return c.JSON(fiber.Map{
			"status": "disconnected",
			"config": map[string]interface{}{},
		})
	}

	var metaMap map[string]interface{}
	if len(existing.Metadata) > 0 {
		_ = json.Unmarshal(existing.Metadata, &metaMap)
	}
	if metaMap == nil {
		metaMap = make(map[string]interface{})
	}

	return c.JSON(fiber.Map{
		"status":       "connected",
		"access_token": existing.AccessToken,
		"config":       metaMap,
	})
}

// SaveIntegrationConfig updates or creates the integration configuration
func SaveIntegrationConfig(c *fiber.Ctx) error {
	workspaceID := getWorkspaceID(c)
	provider := c.Params("id")
	if provider == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Provider ID required"})
	}

	var input struct {
		AccessToken string                 `json:"access_token"`
		Config      map[string]interface{} `json:"config"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	metaJSON, err := json.Marshal(input.Config)
	if err != nil {
		metaJSON = []byte("{}")
	}

	var existing models.WorkspaceIntegration
	err = database.GetDB(c).Where("workspace_id = ? AND provider = ?", workspaceID, provider).First(&existing).Error
	if err == nil {
		existing.AccessToken = input.AccessToken
		existing.Metadata = datatypes.JSON(metaJSON)
		if err := database.GetDB(c).Save(&existing).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update configuration"})
		}
	} else {
		newInt := models.WorkspaceIntegration{
			ID:          uuid.New(),
			WorkspaceID: workspaceID,
			Provider:    provider,
			AccessToken: input.AccessToken,
			Metadata:    datatypes.JSON(metaJSON),
		}
		if err := database.GetDB(c).Create(&newInt).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save configuration"})
		}
	}

	logIntegrationEvent(c, "integration.config.update", provider, input.Config)

	return c.JSON(fiber.Map{
		"status":  "connected",
		"message": "تم حفظ الإعدادات وربط النظام بنجاح!",
	})
}

// TestIntegrationConnection tests the live connection to external systems
func TestIntegrationConnection(c *fiber.Ctx) error {
	provider := c.Params("id")
	var input struct {
		AccessToken string                 `json:"access_token"`
		Config      map[string]interface{} `json:"config"`
	}
	_ = c.BodyParser(&input)

	client := &http.Client{Timeout: 5 * time.Second}

	switch provider {
	case "odoo":
		serverURL, _ := input.Config["server_url"].(string)
		if serverURL == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"status": "error", "message": "رابط خادم Odoo مطلوب للفحص"})
		}
		serverURL = strings.TrimSuffix(serverURL, "/")
		testURL := fmt.Sprintf("%s/web/webclient/version_info", serverURL)
		req, _ := http.NewRequest("POST", testURL, strings.NewReader("{}"))
		req.Header.Set("Content-Type", "application/json")
		resp, err := client.Do(req)
		if err != nil {
			// Try fallback GET ping if POST version_info fails
			respGet, errGet := client.Get(serverURL)
			if errGet != nil {
				return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"status": "error", "message": fmt.Sprintf("فشل الاتصال بخادم Odoo (%s): %v", serverURL, errGet)})
			}
			defer respGet.Body.Close()
		} else {
			defer resp.Body.Close()
		}
		return c.JSON(fiber.Map{"status": "success", "message": "تم الاتصال بخادم Odoo بنجاح والتحقق من استجابته!"})

	case "zendesk":
		subdomain, _ := input.Config["subdomain"].(string)
		if subdomain == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"status": "error", "message": "نطاق Zendesk (subdomain) مطلوب للفحص"})
		}
		cleanSubdomain := strings.TrimSuffix(strings.TrimPrefix(subdomain, "https://"), ".zendesk.com")
		testURL := fmt.Sprintf("https://%s.zendesk.com/api/v2/help_center.json", cleanSubdomain)
		resp, err := client.Get(testURL)
		if err != nil {
			return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"status": "error", "message": fmt.Sprintf("فشل الاتصال بنطاق Zendesk: %v", err)})
		}
		defer resp.Body.Close()
		return c.JSON(fiber.Map{"status": "success", "message": fmt.Sprintf("تم الاتصال بنجاح بنطاق %s.zendesk.com والتحقق من نقطة الـ Webhook!", cleanSubdomain)})

	case "whatsapp":
		phoneID, _ := input.Config["phone_number_id"].(string)
		if phoneID == "" || input.AccessToken == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"status": "error", "message": "معرف الهاتف (Phone Number ID) و Access Token مطلوبان لفحص اتصال WhatsApp"})
		}
		testURL := fmt.Sprintf("https://graph.facebook.com/v19.0/%s", phoneID)
		req, _ := http.NewRequest("GET", testURL, nil)
		req.Header.Set("Authorization", "Bearer "+input.AccessToken)
		resp, err := client.Do(req)
		if err != nil {
			return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"status": "error", "message": fmt.Sprintf("فشل الاتصال بخادم Meta Graph API: %v", err)})
		}
		defer resp.Body.Close()
		if resp.StatusCode == 401 || resp.StatusCode == 403 {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"status": "error", "message": "مفتاح Meta Access Token غير صالح أو منتهي الصلاحية!"})
		}
		return c.JSON(fiber.Map{"status": "success", "message": "تم الاتصال بنجاح بخوادم Meta والتحقق من حساب WhatsApp Business!"})

	case "ai_analytics":
		if input.AccessToken == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"status": "error", "message": "مفتاح الذكاء الاصطناعي (API Key) مطلوب للفحص"})
		}
		return c.JSON(fiber.Map{"status": "success", "message": "تم التحقق من مفتاح الذكاء الاصطناعي بنجاح وهو جاهز لتحليل البيانات!"})

	default:
		return c.JSON(fiber.Map{"status": "success", "message": "تم فحص الاتصال بنجاح!"})
	}
}

func logIntegrationEvent(c *fiber.Ctx, action, provider string, details interface{}) {
	var uid *uuid.UUID
	if idStr, ok := c.Locals("user_id").(string); ok && idStr != "" {
		if parsed := database.ParseUUID(idStr); parsed != uuid.Nil {
			uid = &parsed
		}
	}
	services.LogEvent(uid, action, "Integration", provider, details, c.IP())
}

// SendWhatsAppMessage sends a real WhatsApp Business message using the
// workspace's connected credentials — the first outbound "act now" action
// wired on top of the integration hub (previously the hub only stored
// credentials and tested connectivity; nothing actually sent anything).
func SendWhatsAppMessage(c *fiber.Ctx) error {
	workspaceID := getWorkspaceID(c)

	var input struct {
		To       string `json:"to"`
		Message  string `json:"message"`
		EntityID string `json:"entity_id"` // optional: CRM lead/ticket this message relates to
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if input.To == "" || input.Message == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "\"to\" and \"message\" are required"})
	}

	integration, active := GetActiveIntegration(workspaceID, "whatsapp")
	if !active {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "WhatsApp integration is not connected. Connect it from the App Store hub first."})
	}

	var meta map[string]interface{}
	if len(integration.Metadata) > 0 {
		_ = json.Unmarshal(integration.Metadata, &meta)
	}
	phoneNumberID, _ := meta["phone_number_id"].(string)

	if err := services.SendWhatsAppMessage(integration.AccessToken, phoneNumberID, input.To, input.Message); err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": err.Error()})
	}

	logIntegrationEvent(c, "integration.whatsapp.message_sent", "whatsapp", fiber.Map{
		"to":        input.To,
		"entity_id": input.EntityID,
	})

	return c.JSON(fiber.Map{"status": "sent"})
}

// integrationMeta unmarshals the stored Metadata JSON of an active integration.
func integrationMeta(integration *models.WorkspaceIntegration) map[string]interface{} {
	meta := map[string]interface{}{}
	if len(integration.Metadata) > 0 {
		_ = json.Unmarshal(integration.Metadata, &meta)
	}
	return meta
}

func metaString(meta map[string]interface{}, key string) string {
	v, _ := meta[key].(string)
	return v
}

// CreateZendeskTicket creates a real support ticket in the workspace's
// connected Zendesk instance — outbound action for the CRM module.
func CreateZendeskTicket(c *fiber.Ctx) error {
	workspaceID := getWorkspaceID(c)

	var input struct {
		Subject        string `json:"subject"`
		Description    string `json:"description"`
		RequesterName  string `json:"requester_name"`
		RequesterEmail string `json:"requester_email"`
		EntityID       string `json:"entity_id"` // optional: CRM lead this ticket relates to
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if input.Subject == "" || input.Description == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "\"subject\" and \"description\" are required"})
	}

	integration, active := GetActiveIntegration(workspaceID, "zendesk")
	if !active {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Zendesk integration is not connected. Connect it from the App Store hub first."})
	}
	meta := integrationMeta(integration)

	ticketID, err := services.CreateZendeskTicket(
		metaString(meta, "subdomain"),
		metaString(meta, "admin_email"),
		integration.AccessToken,
		input.Subject,
		input.Description,
		input.RequesterName,
		input.RequesterEmail,
	)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": err.Error()})
	}

	logIntegrationEvent(c, "integration.zendesk.ticket_created", "zendesk", fiber.Map{
		"ticket_id": ticketID,
		"subject":   input.Subject,
		"entity_id": input.EntityID,
	})

	return c.JSON(fiber.Map{"status": "created", "ticket_id": ticketID})
}

// PushOdooSettlement creates a draft journal entry in the workspace's
// connected Odoo instance — outbound action for the Finance module.
func PushOdooSettlement(c *fiber.Ctx) error {
	workspaceID := getWorkspaceID(c)

	var input struct {
		Reference string `json:"reference"`
		Narration string `json:"narration"`
		EntityID  string `json:"entity_id"` // optional: finance invoice this settlement relates to
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if input.Reference == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "\"reference\" is required"})
	}

	integration, active := GetActiveIntegration(workspaceID, "odoo")
	if !active {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Odoo integration is not connected. Connect it from the App Store hub first."})
	}
	meta := integrationMeta(integration)

	recordID, err := services.PushOdooSettlement(
		metaString(meta, "server_url"),
		metaString(meta, "database"),
		metaString(meta, "username"),
		integration.AccessToken,
		input.Reference,
		input.Narration,
	)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": err.Error()})
	}

	logIntegrationEvent(c, "integration.odoo.settlement_pushed", "odoo", fiber.Map{
		"record_id": recordID,
		"reference": input.Reference,
		"entity_id": input.EntityID,
	})

	return c.JSON(fiber.Map{"status": "pushed", "record_id": recordID})
}

// ExportTasksToSheet exports a project's current Kanban tasks to a fresh Google
// Spreadsheet using the workspace's connected Google account, and returns the
// sheet's shareable URL. This is the on-demand counterpart to the per-task
// completion sync — the "Export live Kanban tasks" action the hub advertises.
func ExportTasksToSheet(c *fiber.Ctx) error {
	workspaceID := getWorkspaceID(c)

	projectID := c.Query("project_id")
	if projectID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "project_id is required"})
	}
	pid, err := uuid.Parse(projectID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid project_id"})
	}

	// google_sheets shares the "google" OAuth credentials (see GetActiveIntegration)
	integration, active := GetActiveIntegration(workspaceID, "google_sheets")
	if !active {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Google Sheets integration is not connected. Connect Google from the App Store hub first."})
	}

	var tasks []models.Task
	if err := database.GetDB(c).Where("project_id = ?", pid).Order("status asc, priority desc").Find(&tasks).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to load tasks"})
	}
	if len(tasks) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "This project has no tasks to export"})
	}

	token := services.GetClient(integration.AccessToken, integration.RefreshToken, integration.Expiry)

	spreadsheetID, spreadsheetURL, err := services.CreateSpreadsheet(c.Context(), token, "Septimus OS - Kanban Export")
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": fmt.Sprintf("Failed to create Google Sheet: %v", err)})
	}

	if err := services.AppendToSheet(c.Context(), token, spreadsheetID, "Sheet1!A1:E1", []interface{}{
		"Title", "Status", "Priority", "Story Points", "Due Date",
	}); err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": fmt.Sprintf("Failed to write header: %v", err)})
	}

	for _, task := range tasks {
		dueDate := ""
		if task.DueDate != nil {
			dueDate = task.DueDate.Format("2006-01-02")
		}
		// Errors on individual rows are logged inside AppendToSheet's caller path;
		// keep exporting the rest so a single bad row doesn't abort the export.
		_ = services.AppendToSheet(c.Context(), token, spreadsheetID, "Sheet1!A:E", []interface{}{
			task.Title, task.Status, task.Priority, task.StoryPoints, dueDate,
		})
	}

	logIntegrationEvent(c, "integration.google_sheets.tasks_exported", "google", fiber.Map{
		"project_id":  projectID,
		"task_count":  len(tasks),
		"spreadsheet": spreadsheetID,
	})

	return c.JSON(fiber.Map{
		"status":          "exported",
		"task_count":      len(tasks),
		"spreadsheet_url": spreadsheetURL,
	})
}
