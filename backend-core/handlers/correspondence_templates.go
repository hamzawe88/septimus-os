package handlers

import (
	"encoding/json"
	"fmt"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/datatypes"
)

type CreateTemplateRequest struct {
	TemplateName      string                 `json:"template_name"`
	Name              string                 `json:"name"`
	LogoURL           string                 `json:"logo_url"`
	CompanyHeaderData string                 `json:"company_header_data"` // JSON string
	HeaderHTML        string                 `json:"header_html"`
	CompanyFooterData string                 `json:"company_footer_data"` // JSON string
	FooterHTML        string                 `json:"footer_html"`
	StylingConfig     string                 `json:"styling_config"`      // JSON string
	LayoutConfig      map[string]interface{} `json:"layout_config"`
	IsDefault         bool                   `json:"is_default"`
}

// CreateTemplate creates a new correspondence template
func CreateTemplate(c *fiber.Ctx) error {
	workspaceIDStr, ok := c.Locals("workspace_id").(string)
	if !ok || workspaceIDStr == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized workspace scope"})
	}
	workspaceID := database.ParseUUID(workspaceIDStr)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid workspace id"})
	}

	var req CreateTemplateRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	if req.TemplateName == "" && req.Name != "" {
		req.TemplateName = req.Name
	}
	if req.TemplateName == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "template_name is required"})
	}

	if req.CompanyHeaderData == "" {
		if req.HeaderHTML != "" {
			req.CompanyHeaderData = fmt.Sprintf(`{"html":%q}`, req.HeaderHTML)
		} else {
			req.CompanyHeaderData = "{}"
		}
	}
	if req.CompanyFooterData == "" {
		if req.FooterHTML != "" {
			req.CompanyFooterData = fmt.Sprintf(`{"html":%q}`, req.FooterHTML)
		} else {
			req.CompanyFooterData = "{}"
		}
	}
	if req.StylingConfig == "" {
		if len(req.LayoutConfig) > 0 {
			if cfgBytes, err := json.Marshal(req.LayoutConfig); err == nil {
				req.StylingConfig = string(cfgBytes)
			} else {
				req.StylingConfig = "{}"
			}
		} else {
			req.StylingConfig = "{}"
		}
	}

	// If marked as default, unset other defaults in workspace
	if req.IsDefault {
		database.GetDB(c).Model(&models.CorrespondenceTemplate{}).
			Where("workspace_id = ?", workspaceID).
			Update("is_default", false)
	}

	template := models.CorrespondenceTemplate{
		WorkspaceID:       workspaceID,
		TemplateName:      req.TemplateName,
		LogoURL:           req.LogoURL,
		CompanyHeaderData: datatypes.JSON([]byte(req.CompanyHeaderData)),
		CompanyFooterData: datatypes.JSON([]byte(req.CompanyFooterData)),
		StylingConfig:     datatypes.JSON([]byte(req.StylingConfig)),
		IsDefault:         req.IsDefault,
	}

	if err := database.GetDB(c).Create(&template).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create template: " + err.Error()})
	}

	return c.Status(fiber.StatusCreated).JSON(template)
}

// GetTemplates retrieves all correspondence templates for the workspace
func GetTemplates(c *fiber.Ctx) error {
	workspaceIDStr, ok := c.Locals("workspace_id").(string)
	if !ok || workspaceIDStr == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized workspace scope"})
	}
	workspaceID := database.ParseUUID(workspaceIDStr)

	var templates []models.CorrespondenceTemplate
	if err := database.GetDB(c).Where("workspace_id = ?", workspaceID).Order("is_default DESC, created_at DESC").Find(&templates).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch templates"})
	}

	return c.JSON(templates)
}

// UpdateTemplate modifies an existing correspondence template
func UpdateTemplate(c *fiber.Ctx) error {
	workspaceIDStr, ok := c.Locals("workspace_id").(string)
	if !ok || workspaceIDStr == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized workspace scope"})
	}
	workspaceID := database.ParseUUID(workspaceIDStr)

	templateIDStr := c.Params("id")
	templateID := database.ParseUUID(templateIDStr)
	if templateID == uuid.Nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid template id"})
	}

	var template models.CorrespondenceTemplate
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", templateID, workspaceID).First(&template).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "template not found"})
	}

	var req CreateTemplateRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	if req.TemplateName == "" && req.Name != "" {
		req.TemplateName = req.Name
	}
	if req.TemplateName != "" {
		template.TemplateName = req.TemplateName
	}
	if req.LogoURL != "" {
		template.LogoURL = req.LogoURL
	}
	if req.CompanyHeaderData == "" && req.HeaderHTML != "" {
		req.CompanyHeaderData = fmt.Sprintf(`{"html":%q}`, req.HeaderHTML)
	}
	if req.CompanyHeaderData != "" {
		template.CompanyHeaderData = datatypes.JSON([]byte(req.CompanyHeaderData))
	}
	if req.CompanyFooterData == "" && req.FooterHTML != "" {
		req.CompanyFooterData = fmt.Sprintf(`{"html":%q}`, req.FooterHTML)
	}
	if req.CompanyFooterData != "" {
		template.CompanyFooterData = datatypes.JSON([]byte(req.CompanyFooterData))
	}
	if req.StylingConfig == "" && len(req.LayoutConfig) > 0 {
		if cfgBytes, err := json.Marshal(req.LayoutConfig); err == nil {
			req.StylingConfig = string(cfgBytes)
		}
	}
	if req.StylingConfig != "" {
		template.StylingConfig = datatypes.JSON([]byte(req.StylingConfig))
	}

	if req.IsDefault && !template.IsDefault {
		database.GetDB(c).Model(&models.CorrespondenceTemplate{}).
			Where("workspace_id = ? AND id != ?", workspaceID, templateID).
			Update("is_default", false)
		template.IsDefault = true
	} else if !req.IsDefault {
		template.IsDefault = req.IsDefault
	}

	if err := database.GetDB(c).Save(&template).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to update template"})
	}

	return c.JSON(template)
}

// DeleteTemplate deletes an existing template
func DeleteTemplate(c *fiber.Ctx) error {
	workspaceIDStr, ok := c.Locals("workspace_id").(string)
	if !ok || workspaceIDStr == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized workspace scope"})
	}
	workspaceID := database.ParseUUID(workspaceIDStr)

	templateIDStr := c.Params("id")
	templateID := database.ParseUUID(templateIDStr)
	if templateID == uuid.Nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid template id"})
	}

	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", templateID, workspaceID).Delete(&models.CorrespondenceTemplate{}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to delete template"})
	}

	return c.JSON(fiber.Map{"success": true})
}
