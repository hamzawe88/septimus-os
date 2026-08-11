package handlers

import (
	"encoding/json"
	"errors"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type schemaFormSection struct {
	ID      string   `json:"id"`
	LabelAr string   `json:"label_ar"`
	LabelEn string   `json:"label_en"`
	Columns int      `json:"columns"`
	Fields  []string `json:"fields"`
}

type schemaFormLayout struct {
	Sections []schemaFormSection `json:"sections"`
}

type schemaVisibilityRule struct {
	Field       string      `json:"field"`
	Operator    string      `json:"operator"`
	Value       interface{} `json:"value,omitempty"`
	TargetField string      `json:"target_field"`
}

type schemaFormRequest struct {
	NameAr           string                 `json:"name_ar"`
	NameEn           string                 `json:"name_en"`
	Mode             string                 `json:"mode"`
	Status           string                 `json:"status"`
	Layout           schemaFormLayout       `json:"layout"`
	VisibilityRules  []schemaVisibilityRule `json:"visibility_rules"`
	IsDefault        bool                   `json:"is_default"`
	ExpectedRevision int                    `json:"expected_revision"`
}

type schemaViewConfig struct {
	Columns       []string `json:"columns"`
	GroupField    string   `json:"group_field,omitempty"`
	CalendarField string   `json:"calendar_field,omitempty"`
	CoverField    string   `json:"cover_field,omitempty"`
}

type schemaViewRequest struct {
	NameAr           string                      `json:"name_ar"`
	NameEn           string                      `json:"name_en"`
	ViewType         string                      `json:"view_type"`
	Sharing          string                      `json:"sharing"`
	Query            services.RecordQueryRequest `json:"query"`
	Config           schemaViewConfig            `json:"config"`
	IsDefault        bool                        `json:"is_default"`
	ExpectedRevision int                         `json:"expected_revision"`
}

type schemaResourceDeleteRequest struct {
	ExpectedRevision int `json:"expected_revision"`
}

func ListSchemaForms(c *fiber.Ctx) error {
	definition, err := findSchemaDefinition(c)
	if err != nil {
		return err
	}
	var forms []models.EntityForm
	if err := database.GetDB(c).Where(
		"workspace_id = ? AND definition_id = ?", definition.WorkspaceID, definition.ID,
	).Order("is_default DESC, updated_at DESC").Find(&forms).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to list schema forms"})
	}
	return c.JSON(fiber.Map{"data": forms})
}

func CreateSchemaForm(c *fiber.Ctx) error {
	definition, err := findSchemaDefinition(c)
	if err != nil {
		return err
	}
	var req schemaFormRequest
	if err := c.BodyParser(&req); err != nil {
		return invalidSchemaResource(c, "invalid form request")
	}
	normalizeSchemaFormRequest(&req)
	fields := parseSchemaFields(definition.DraftUISchema)
	if err := validateSchemaFormRequest(req, fields); err != nil {
		return invalidSchemaResource(c, err.Error())
	}
	layout, _ := json.Marshal(req.Layout)
	rules, _ := json.Marshal(req.VisibilityRules)
	actor := currentUserUUID(c)
	form := models.EntityForm{
		ID: uuid.New(), WorkspaceID: definition.WorkspaceID, DefinitionID: definition.ID,
		NameAr: strings.TrimSpace(req.NameAr), NameEn: strings.TrimSpace(req.NameEn),
		Mode: req.Mode, Status: req.Status, Layout: datatypes.JSON(layout),
		VisibilityRules: datatypes.JSON(rules), Revision: 1, IsDefault: req.IsDefault,
		CreatedBy: actor, UpdatedBy: actor,
	}
	if err := database.GetDB(c).Transaction(func(tx *gorm.DB) error {
		if form.IsDefault {
			if err := clearDefaultForms(tx, definition, form.Mode, uuid.Nil); err != nil {
				return err
			}
		}
		if err := tx.Create(&form).Error; err != nil {
			return err
		}
		return writeSchemaAudit(tx, definition, actor, "schema_definition.form.create", c.IP(), map[string]interface{}{
			"form_id": form.ID, "mode": form.Mode,
		})
	}); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create schema form"})
	}
	return c.Status(fiber.StatusCreated).JSON(form)
}

func UpdateSchemaForm(c *fiber.Ctx) error {
	definition, err := findSchemaDefinition(c)
	if err != nil {
		return err
	}
	formID, err := uuid.Parse(c.Params("formId"))
	if err != nil {
		return invalidSchemaResource(c, "invalid form id")
	}
	var req schemaFormRequest
	if err := c.BodyParser(&req); err != nil {
		return invalidSchemaResource(c, "invalid form request")
	}
	normalizeSchemaFormRequest(&req)
	if err := validateSchemaFormRequest(req, parseSchemaFields(definition.DraftUISchema)); err != nil {
		return invalidSchemaResource(c, err.Error())
	}
	if req.ExpectedRevision < 1 {
		return schemaResourceConflict(c)
	}
	layout, _ := json.Marshal(req.Layout)
	rules, _ := json.Marshal(req.VisibilityRules)
	actor := currentUserUUID(c)
	var updated models.EntityForm
	err = database.GetDB(c).Transaction(func(tx *gorm.DB) error {
		if req.IsDefault {
			if err := clearDefaultForms(tx, definition, req.Mode, formID); err != nil {
				return err
			}
		}
		result := tx.Model(&models.EntityForm{}).Where(
			"id = ? AND workspace_id = ? AND definition_id = ? AND revision = ?",
			formID, definition.WorkspaceID, definition.ID, req.ExpectedRevision,
		).Updates(map[string]interface{}{
			"name_ar": strings.TrimSpace(req.NameAr), "name_en": strings.TrimSpace(req.NameEn),
			"mode": req.Mode, "status": req.Status, "layout": datatypes.JSON(layout),
			"visibility_rules": datatypes.JSON(rules), "is_default": req.IsDefault,
			"updated_by": actor, "revision": gorm.Expr("revision + 1"),
		})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return gorm.ErrRecordNotFound
		}
		if err := tx.Where("id = ? AND workspace_id = ?", formID, definition.WorkspaceID).First(&updated).Error; err != nil {
			return err
		}
		return writeSchemaAudit(tx, definition, actor, "schema_definition.form.update", c.IP(), map[string]interface{}{
			"form_id": formID, "revision": updated.Revision,
		})
	})
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return schemaResourceConflict(c)
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to update schema form"})
	}
	return c.JSON(updated)
}

func DeleteSchemaForm(c *fiber.Ctx) error {
	return deleteSchemaResource(c, "form")
}

func ListSchemaViews(c *fiber.Ctx) error {
	definition, err := findSchemaDefinition(c)
	if err != nil {
		return err
	}
	query := database.GetDB(c).Where(
		"workspace_id = ? AND definition_id = ?", definition.WorkspaceID, definition.ID,
	)
	if actor := currentUserUUID(c); actor != nil {
		query = query.Where("sharing = ? OR owner_id = ?", "workspace", *actor)
	} else {
		query = query.Where("sharing = ?", "workspace")
	}
	var views []models.EntityView
	if err := query.Order("is_default DESC, updated_at DESC").Find(&views).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to list schema views"})
	}
	return c.JSON(fiber.Map{"data": views})
}

func CreateSchemaView(c *fiber.Ctx) error {
	definition, err := findSchemaDefinition(c)
	if err != nil {
		return err
	}
	var req schemaViewRequest
	if err := c.BodyParser(&req); err != nil {
		return invalidSchemaResource(c, "invalid view request")
	}
	normalizeSchemaViewRequest(&req)
	fields := parseSchemaFields(definition.DraftUISchema)
	if err := validateSchemaViewRequest(req, fields); err != nil {
		return invalidSchemaResource(c, err.Error())
	}
	queryJSON, _ := json.Marshal(req.Query)
	configJSON, _ := json.Marshal(req.Config)
	actor := currentUserUUID(c)
	view := models.EntityView{
		ID: uuid.New(), WorkspaceID: definition.WorkspaceID, DefinitionID: definition.ID,
		NameAr: strings.TrimSpace(req.NameAr), NameEn: strings.TrimSpace(req.NameEn),
		ViewType: req.ViewType, Sharing: req.Sharing, Query: datatypes.JSON(queryJSON),
		Config: datatypes.JSON(configJSON), Revision: 1, IsDefault: req.IsDefault,
		OwnerID: actor, CreatedBy: actor, UpdatedBy: actor,
	}
	if err := database.GetDB(c).Transaction(func(tx *gorm.DB) error {
		if view.IsDefault {
			if err := clearDefaultViews(tx, definition, uuid.Nil); err != nil {
				return err
			}
		}
		if err := tx.Create(&view).Error; err != nil {
			return err
		}
		return writeSchemaAudit(tx, definition, actor, "schema_definition.view.create", c.IP(), map[string]interface{}{
			"view_id": view.ID, "view_type": view.ViewType,
		})
	}); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create schema view"})
	}
	return c.Status(fiber.StatusCreated).JSON(view)
}

func UpdateSchemaView(c *fiber.Ctx) error {
	definition, err := findSchemaDefinition(c)
	if err != nil {
		return err
	}
	viewID, err := uuid.Parse(c.Params("viewId"))
	if err != nil {
		return invalidSchemaResource(c, "invalid view id")
	}
	var req schemaViewRequest
	if err := c.BodyParser(&req); err != nil {
		return invalidSchemaResource(c, "invalid view request")
	}
	normalizeSchemaViewRequest(&req)
	fields := parseSchemaFields(definition.DraftUISchema)
	if err := validateSchemaViewRequest(req, fields); err != nil {
		return invalidSchemaResource(c, err.Error())
	}
	if req.ExpectedRevision < 1 {
		return schemaResourceConflict(c)
	}
	queryJSON, _ := json.Marshal(req.Query)
	configJSON, _ := json.Marshal(req.Config)
	actor := currentUserUUID(c)
	var existing models.EntityView
	if err := database.GetDB(c).Where(
		"id = ? AND workspace_id = ? AND definition_id = ?",
		viewID, definition.WorkspaceID, definition.ID,
	).First(&existing).Error; err != nil {
		return schemaResourceConflict(c)
	}
	if existing.Sharing == "private" && (actor == nil || existing.OwnerID == nil || *existing.OwnerID != *actor) {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "private view ownership is required"})
	}
	var updated models.EntityView
	err = database.GetDB(c).Transaction(func(tx *gorm.DB) error {
		if req.IsDefault {
			if err := clearDefaultViews(tx, definition, viewID); err != nil {
				return err
			}
		}
		result := tx.Model(&models.EntityView{}).Where(
			"id = ? AND workspace_id = ? AND definition_id = ? AND revision = ?",
			viewID, definition.WorkspaceID, definition.ID, req.ExpectedRevision,
		).Updates(map[string]interface{}{
			"name_ar": strings.TrimSpace(req.NameAr), "name_en": strings.TrimSpace(req.NameEn),
			"view_type": req.ViewType, "sharing": req.Sharing, "query": datatypes.JSON(queryJSON),
			"config": datatypes.JSON(configJSON), "is_default": req.IsDefault,
			"updated_by": actor, "revision": gorm.Expr("revision + 1"),
		})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return gorm.ErrRecordNotFound
		}
		if err := tx.Where("id = ? AND workspace_id = ?", viewID, definition.WorkspaceID).First(&updated).Error; err != nil {
			return err
		}
		return writeSchemaAudit(tx, definition, actor, "schema_definition.view.update", c.IP(), map[string]interface{}{
			"view_id": viewID, "revision": updated.Revision,
		})
	})
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return schemaResourceConflict(c)
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to update schema view"})
	}
	return c.JSON(updated)
}

func DeleteSchemaView(c *fiber.Ctx) error {
	return deleteSchemaResource(c, "view")
}

func validateSchemaFormRequest(req schemaFormRequest, fields []services.SchemaFieldInput) error {
	if err := validateResourceNames(req.NameAr, req.NameEn); err != nil {
		return err
	}
	if req.Mode != "create" && req.Mode != "edit" && req.Mode != "readonly" {
		return errors.New("invalid form mode")
	}
	if req.Status != "active" && req.Status != "archived" {
		return errors.New("invalid form status")
	}
	allowed := schemaFieldKeys(fields)
	if len(req.Layout.Sections) == 0 || len(req.Layout.Sections) > 20 {
		return errors.New("form layout requires 1 to 20 sections")
	}
	seenSections := map[string]bool{}
	seenFields := map[string]bool{}
	for _, section := range req.Layout.Sections {
		if strings.TrimSpace(section.ID) == "" || seenSections[section.ID] || section.Columns < 1 || section.Columns > 3 {
			return errors.New("invalid form section")
		}
		seenSections[section.ID] = true
		for _, key := range section.Fields {
			if !allowed[key] || seenFields[key] {
				return errors.New("form layout contains an unknown or duplicate field")
			}
			seenFields[key] = true
		}
	}
	if len(req.VisibilityRules) > 50 {
		return errors.New("form visibility rules exceed the limit")
	}
	for _, rule := range req.VisibilityRules {
		if !allowed[rule.Field] || !allowed[rule.TargetField] {
			return errors.New("visibility rule references an unknown field")
		}
		switch rule.Operator {
		case "eq", "neq", "is_empty", "not_empty":
		default:
			return errors.New("unsupported visibility rule operator")
		}
	}
	return nil
}

func normalizeSchemaFormRequest(req *schemaFormRequest) {
	if req.Mode == "" {
		req.Mode = "create"
	}
	if req.Status == "" {
		req.Status = "active"
	}
}

func normalizeSchemaViewRequest(req *schemaViewRequest) {
	if req.ViewType == "" {
		req.ViewType = "table"
	}
	if req.Sharing == "" {
		req.Sharing = "workspace"
	}
}

func validateSchemaViewRequest(req schemaViewRequest, fields []services.SchemaFieldInput) error {
	if err := validateResourceNames(req.NameAr, req.NameEn); err != nil {
		return err
	}
	switch req.ViewType {
	case "table", "kanban", "calendar", "gallery":
	default:
		return errors.New("invalid view type")
	}
	if req.Sharing != "private" && req.Sharing != "workspace" {
		return errors.New("invalid view sharing")
	}
	allowed := schemaFieldKeys(fields)
	if len(req.Config.Columns) > 50 {
		return errors.New("view column limit exceeded")
	}
	seen := map[string]bool{}
	for _, key := range req.Config.Columns {
		if !allowed[key] || seen[key] {
			return errors.New("view contains an unknown or duplicate column")
		}
		seen[key] = true
	}
	if req.Config.GroupField != "" && !allowed[req.Config.GroupField] {
		return errors.New("view group field is unknown")
	}
	if req.Config.CalendarField != "" && !allowed[req.Config.CalendarField] {
		return errors.New("view calendar field is unknown")
	}
	if req.Config.CoverField != "" && !allowed[req.Config.CoverField] {
		return errors.New("view cover field is unknown")
	}
	if req.Query.Filter != nil {
		if _, _, err := services.CompileRecordFilter(*req.Query.Filter, fields); err != nil {
			return err
		}
	}
	if req.Query.Limit < 0 || req.Query.Limit > 100 {
		return errors.New("view query limit must be between 1 and 100")
	}
	return nil
}

func validateResourceNames(nameAr, nameEn string) error {
	if strings.TrimSpace(nameAr) == "" || strings.TrimSpace(nameEn) == "" {
		return errors.New("Arabic and English names are required")
	}
	if len([]rune(nameAr)) > 120 || len([]rune(nameEn)) > 120 {
		return errors.New("resource name exceeds 120 characters")
	}
	return nil
}

func schemaFieldKeys(fields []services.SchemaFieldInput) map[string]bool {
	result := make(map[string]bool, len(fields))
	for _, field := range fields {
		if field.Lifecycle != "hidden" {
			result[field.Key] = true
		}
	}
	return result
}

func clearDefaultForms(tx *gorm.DB, definition models.EntityDefinition, mode string, except uuid.UUID) error {
	query := tx.Model(&models.EntityForm{}).Where(
		"workspace_id = ? AND definition_id = ? AND mode = ? AND is_default = true",
		definition.WorkspaceID, definition.ID, mode,
	)
	if except != uuid.Nil {
		query = query.Where("id <> ?", except)
	}
	return query.Updates(map[string]interface{}{
		"is_default": false, "revision": gorm.Expr("revision + 1"),
	}).Error
}

func clearDefaultViews(tx *gorm.DB, definition models.EntityDefinition, except uuid.UUID) error {
	query := tx.Model(&models.EntityView{}).Where(
		"workspace_id = ? AND definition_id = ? AND is_default = true",
		definition.WorkspaceID, definition.ID,
	)
	if except != uuid.Nil {
		query = query.Where("id <> ?", except)
	}
	return query.Updates(map[string]interface{}{
		"is_default": false, "revision": gorm.Expr("revision + 1"),
	}).Error
}

func deleteSchemaResource(c *fiber.Ctx, kind string) error {
	definition, err := findSchemaDefinition(c)
	if err != nil {
		return err
	}
	param := "formId"
	if kind == "view" {
		param = "viewId"
	}
	resourceID, err := uuid.Parse(c.Params(param))
	if err != nil {
		return invalidSchemaResource(c, "invalid resource id")
	}
	var req schemaResourceDeleteRequest
	if err := c.BodyParser(&req); err != nil || req.ExpectedRevision < 1 {
		return schemaResourceConflict(c)
	}
	actor := currentUserUUID(c)
	err = database.GetDB(c).Transaction(func(tx *gorm.DB) error {
		var result *gorm.DB
		if kind == "form" {
			result = tx.Where(
				"id = ? AND workspace_id = ? AND definition_id = ? AND revision = ?",
				resourceID, definition.WorkspaceID, definition.ID, req.ExpectedRevision,
			).Delete(&models.EntityForm{})
		} else {
			scoped := tx.Where(
				"id = ? AND workspace_id = ? AND definition_id = ? AND revision = ?",
				resourceID, definition.WorkspaceID, definition.ID, req.ExpectedRevision,
			)
			if actor != nil {
				scoped = scoped.Where("sharing = ? OR owner_id = ?", "workspace", *actor)
			}
			result = scoped.Delete(&models.EntityView{})
		}
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return gorm.ErrRecordNotFound
		}
		return writeSchemaAudit(tx, definition, actor, "schema_definition."+kind+".delete", c.IP(), map[string]interface{}{
			kind + "_id": resourceID,
		})
	})
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return schemaResourceConflict(c)
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to delete schema resource"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func invalidSchemaResource(c *fiber.Ctx, detail string) error {
	return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
		"error": "schema resource validation failed", "code": "SCHEMA_RESOURCE_INVALID", "details": []string{detail},
	})
}

func schemaResourceConflict(c *fiber.Ctx) error {
	return c.Status(fiber.StatusConflict).JSON(fiber.Map{
		"error": "schema resource was changed by another editor", "code": "SCHEMA_RESOURCE_REVISION_CONFLICT",
	})
}
