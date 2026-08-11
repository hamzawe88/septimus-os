package handlers

import (
	"github.com/gofiber/fiber/v2"
)

type AutomationTemplate struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Icon        string `json:"icon"`
	Trigger     string `json:"trigger"`
	Action      string `json:"action"`
	Status      string `json:"status"` // e.g. "available", "active"
}

// In-memory templates for n8n representation
var templates = []AutomationTemplate{
	{
		ID:          "tpl_slack_task",
		Name:        "Slack Notification on New Task",
		Description: "Send a message to a specific Slack channel whenever a new task is created in a project.",
		Icon:        "slack",
		Trigger:     "Task Created",
		Action:      "Send Slack Message",
		Status:      "available",
	},
	{
		ID:          "tpl_github_pr",
		Name:        "Link GitHub PRs to Tasks",
		Description: "Automatically update task status to 'In Progress' when a related PR is opened.",
		Icon:        "github",
		Trigger:     "PR Opened",
		Action:      "Update Task Status",
		Status:      "available",
	},
	{
		ID:          "tpl_email_daily",
		Name:        "Daily Project Summary Email",
		Description: "Compile a daily digest of all completed tasks and email it to the project manager.",
		Icon:        "mail",
		Trigger:     "Schedule (Daily)",
		Action:      "Send Email",
		Status:      "available",
	},
	{
		ID:          "tpl_google_calendar",
		Name:        "Sync Task Deadlines to Google Calendar",
		Description: "Automatically create a Google Calendar event when a Task gets a due date.",
		Icon:        "calendar",
		Trigger:     "Task Updated",
		Action:      "Create Calendar Event",
		Status:      "available",
	},
	{
		ID:          "tpl_google_drive",
		Name:        "Auto-Create Project Folders in Drive",
		Description: "Generate a new structured folder in Google Drive whenever a new Project is created.",
		Icon:        "drive",
		Trigger:     "Project Created",
		Action:      "Create Drive Folder",
		Status:      "available",
	},
	{
		ID:          "tpl_google_sheets",
		Name:        "Export Attendance to Google Sheets",
		Description: "Sync daily check-in/out logs to a master HR spreadsheet for payroll processing.",
		Icon:        "sheets",
		Trigger:     "Schedule (Weekly)",
		Action:      "Update Google Sheet",
		Status:      "available",
	},
}

// GetAutomationTemplates returns the available n8n templates
func GetAutomationTemplates(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"templates": templates,
	})
}

// ActivateAutomation simulates activating a workflow in n8n
func ActivateAutomation(c *fiber.Ctx) error {
	id := c.Params("id")

	// In a real integration, we would:
	// 1. Fetch the n8n JSON workflow template.
	// 2. Make a POST request to n8n API to create the workflow.
	// 3. Make a POST request to activate the workflow.
	// 4. Save the mapping (WorkspaceID -> n8n WorkflowID) in our DB.

	for i, tpl := range templates {
		if tpl.ID == id {
			templates[i].Status = "active"
			return c.JSON(fiber.Map{
				"message":  "Automation activated successfully in n8n",
				"template": templates[i],
			})
		}
	}

	return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Template not found"})
}
