package services

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strings"

	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/models"
	"github.com/xeipuuv/gojsonschema"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

const (
	MaxSchemaFields      = 100
	MaxSchemaLabelLength = 120
)

var (
	schemaKeyPattern  = regexp.MustCompile(`^[a-z][a-z0-9_]{1,62}$`)
	roleKeyPattern    = regexp.MustCompile(`^[a-z][a-z0-9_:-]{0,62}$`)
	checksumPattern   = regexp.MustCompile(`^[a-f0-9]{64}$`)
	reservedFieldKeys = map[string]struct{}{
		"id": {}, "workspace_id": {}, "project_id": {}, "definition_id": {},
		"schema_version": {}, "record_version": {}, "entity_type": {},
		"created_at": {}, "updated_at": {}, "deleted_at": {},
		"created_by": {}, "updated_by": {},
	}
)

// SchemaFieldInput is the language-neutral field contract shared by the schema
// builder and API clients. Labels are bilingual; Key is the immutable contract.
type SchemaFieldInput struct {
	ID              string               `json:"id,omitempty"`
	Key             string               `json:"key"`
	LabelAr         string               `json:"label_ar"`
	LabelEn         string               `json:"label_en"`
	Type            string               `json:"type"`
	Required        bool                 `json:"required"`
	Default         interface{}          `json:"default,omitempty"`
	Lifecycle       string               `json:"lifecycle,omitempty"`
	Description     string               `json:"description,omitempty"`
	Options         []string             `json:"options,omitempty"`
	Relation        *RelationFieldConfig `json:"relation,omitempty"`
	Formula         *FormulaFieldConfig  `json:"formula,omitempty"`
	Position        int                  `json:"position"`
	Searchable      bool                 `json:"searchable,omitempty"`
	Indexed         bool                 `json:"indexed,omitempty"`
	Classification  string               `json:"classification,omitempty"`
	ReadRoles       []string             `json:"read_roles,omitempty"`
	WriteRoles      []string             `json:"write_roles,omitempty"`
	IncludeInAI     *bool                `json:"include_in_ai,omitempty"`
	IncludeInEvents *bool                `json:"include_in_events,omitempty"`
	IncludeInExport *bool                `json:"include_in_export,omitempty"`
}

type RelationFieldConfig struct {
	TargetDefinitionKey string `json:"target_definition_key"`
	Cardinality         string `json:"cardinality"`
	OnDelete            string `json:"on_delete"`
}

type FormulaFieldConfig struct {
	Expression string `json:"expression"`
	ResultType string `json:"result_type"`
}

type CompiledSchemaDraft struct {
	JSONSchema datatypes.JSON
	UISchema   datatypes.JSON
	Fields     []SchemaFieldInput
}

// SchemaValidationError contains safe, field-oriented validation messages.
// Handlers may return Issues to clients without exposing SQL or internals.
type SchemaValidationError struct {
	Issues []string
}

func (e *SchemaValidationError) Error() string {
	return strings.Join(e.Issues, "; ")
}

func IsValidDefinitionKey(key string) bool {
	return schemaKeyPattern.MatchString(strings.TrimSpace(key))
}

func IsSystemEntityType(entityType string) bool {
	switch entityType {
	case "task", "document", "meeting", "issue", "lead", "deal", "crm_deal",
		"invoice", "expense", "finance_invoice", "finance_expense", "ticket",
		"leave_request", "evaluation", "hr_employee", "hr_attendance", "hr_leave",
		"hr_leave_request", "hr_job", "hr_policy", "crm_quote", "ai_agent",
		"user_orbit_task", "user_orbit_profile", "crm_account", "crm_contact",
		"crm_opportunity", "crm_activity", "crm_quote_line", "crm_ticket", "crm_ticket_message":
		return true
	default:
		return false
	}
}

// CompileSchemaDraft validates builder fields and emits the canonical JSON
// Schema plus UI metadata. Relations are UUID references materialized in a
// dedicated edge table; formulas are server-computed by a non-eval parser.
func CompileSchemaDraft(labelAr, labelEn string, fields []SchemaFieldInput) (CompiledSchemaDraft, error) {
	labelAr = strings.TrimSpace(labelAr)
	labelEn = strings.TrimSpace(labelEn)
	issues := make([]string, 0)
	if labelAr == "" || len([]rune(labelAr)) > MaxSchemaLabelLength {
		issues = append(issues, "label_ar is required and must be at most 120 characters")
	}
	if labelEn == "" || len([]rune(labelEn)) > MaxSchemaLabelLength {
		issues = append(issues, "label_en is required and must be at most 120 characters")
	}
	if len(fields) == 0 {
		issues = append(issues, "at least one field is required")
	}
	if len(fields) > MaxSchemaFields {
		issues = append(issues, fmt.Sprintf("field count exceeds the limit of %d", MaxSchemaFields))
	}

	properties := make(map[string]interface{}, len(fields))
	required := make([]string, 0, len(fields))
	normalized := make([]SchemaFieldInput, 0, len(fields))
	seen := make(map[string]struct{}, len(fields))

	for index, raw := range fields {
		field := raw
		field.Key = strings.TrimSpace(field.Key)
		field.LabelAr = strings.TrimSpace(field.LabelAr)
		field.LabelEn = strings.TrimSpace(field.LabelEn)
		field.Type = strings.ToLower(strings.TrimSpace(field.Type))
		field.Description = strings.TrimSpace(field.Description)
		field.Position = index
		field.Classification = strings.ToLower(strings.TrimSpace(field.Classification))
		if field.Classification == "" {
			field.Classification = "internal"
		}
		field.Lifecycle = strings.ToLower(strings.TrimSpace(field.Lifecycle))
		if field.Lifecycle == "" {
			field.Lifecycle = "active"
		}
		field.ReadRoles = normalizeRoleList(field.ReadRoles)
		field.WriteRoles = normalizeRoleList(field.WriteRoles)
		if field.Relation != nil {
			field.Relation.TargetDefinitionKey = strings.TrimSpace(field.Relation.TargetDefinitionKey)
			field.Relation.Cardinality = strings.ToLower(strings.TrimSpace(field.Relation.Cardinality))
			field.Relation.OnDelete = strings.ToLower(strings.TrimSpace(field.Relation.OnDelete))
			if field.Relation.OnDelete == "" {
				field.Relation.OnDelete = "restrict"
			}
		}
		if field.Formula != nil {
			field.Formula.Expression = strings.TrimSpace(field.Formula.Expression)
			field.Formula.ResultType = strings.ToLower(strings.TrimSpace(field.Formula.ResultType))
			if field.Formula.ResultType == "" {
				field.Formula.ResultType = "number"
			}
		}

		prefix := fmt.Sprintf("fields[%d]", index)
		if !IsValidDefinitionKey(field.Key) {
			issues = append(issues, prefix+".key must match ^[a-z][a-z0-9_]{1,62}$")
			continue
		}
		if _, reserved := reservedFieldKeys[field.Key]; reserved {
			issues = append(issues, prefix+".key is reserved")
			continue
		}
		if _, duplicate := seen[field.Key]; duplicate {
			issues = append(issues, prefix+".key must be unique")
			continue
		}
		seen[field.Key] = struct{}{}
		if field.LabelAr == "" || len([]rune(field.LabelAr)) > MaxSchemaLabelLength {
			issues = append(issues, prefix+".label_ar is required and must be at most 120 characters")
		}
		if field.LabelEn == "" || len([]rune(field.LabelEn)) > MaxSchemaLabelLength {
			issues = append(issues, prefix+".label_en is required and must be at most 120 characters")
		}
		switch field.Classification {
		case "public", "internal", "confidential", "pii":
		default:
			issues = append(issues, prefix+".classification must be public, internal, confidential, or pii")
		}
		switch field.Lifecycle {
		case "active", "deprecated", "hidden":
		default:
			issues = append(issues, prefix+".lifecycle must be active, deprecated, or hidden")
		}
		for _, role := range append(append([]string{}, field.ReadRoles...), field.WriteRoles...) {
			if !roleKeyPattern.MatchString(role) {
				issues = append(issues, prefix+".roles contain an invalid role key")
				break
			}
		}
		if field.Indexed && !field.Searchable {
			issues = append(issues, prefix+".indexed fields must also be searchable")
		}

		property, err := schemaPropertyForField(field)
		if err != nil {
			issues = append(issues, prefix+": "+err.Error())
			continue
		}
		if field.Default != nil {
			property["default"] = field.Default
			defaultSchema, marshalErr := json.Marshal(map[string]interface{}{
				"type":       "object",
				"properties": map[string]interface{}{field.Key: property},
				"required":   []string{field.Key},
			})
			if marshalErr != nil {
				issues = append(issues, prefix+".default cannot be encoded")
			} else if validationErr := ValidateRecordAgainstSchema(datatypes.JSON(defaultSchema), map[string]interface{}{
				field.Key: field.Default,
			}); validationErr != nil {
				issues = append(issues, prefix+".default does not match the field type")
			}
		}
		properties[field.Key] = property
		if field.Required && field.Type != "formula" {
			required = append(required, field.Key)
		}
		normalized = append(normalized, field)
	}

	if len(issues) == 0 {
		if err := ValidateFormulaGraph(normalized); err != nil {
			issues = append(issues, err.Error())
		}
	}
	if len(issues) > 0 {
		return CompiledSchemaDraft{}, &SchemaValidationError{Issues: issues}
	}

	sort.Strings(required)
	schema := map[string]interface{}{
		"$schema":              "http://json-schema.org/draft-07/schema#",
		"type":                 "object",
		"title":                labelEn,
		"additionalProperties": false,
		"properties":           properties,
		"required":             required,
		"x-septimus": map[string]interface{}{
			"label_ar": labelAr,
			"label_en": labelEn,
		},
	}
	uiSchema := map[string]interface{}{
		"direction": "logical",
		"fields":    normalized,
	}

	schemaBytes, err := json.Marshal(schema)
	if err != nil {
		return CompiledSchemaDraft{}, fmt.Errorf("marshal JSON schema: %w", err)
	}
	if _, err := gojsonschema.NewSchema(gojsonschema.NewBytesLoader(schemaBytes)); err != nil {
		return CompiledSchemaDraft{}, fmt.Errorf("compile JSON schema: %w", err)
	}
	uiBytes, err := json.Marshal(uiSchema)
	if err != nil {
		return CompiledSchemaDraft{}, fmt.Errorf("marshal UI schema: %w", err)
	}
	return CompiledSchemaDraft{
		JSONSchema: datatypes.JSON(schemaBytes),
		UISchema:   datatypes.JSON(uiBytes),
		Fields:     normalized,
	}, nil
}

func schemaPropertyForField(field SchemaFieldInput) (map[string]interface{}, error) {
	property := map[string]interface{}{
		"title":                     field.LabelEn,
		"x-septimus-label-ar":       field.LabelAr,
		"x-septimus-field-type":     field.Type,
		"x-septimus-classification": field.Classification,
		"x-septimus-searchable":     field.Searchable,
		"x-septimus-indexed":        field.Indexed,
		"x-septimus-lifecycle":      field.Lifecycle,
	}
	if len(field.ReadRoles) > 0 {
		property["x-septimus-read-roles"] = field.ReadRoles
	}
	if len(field.WriteRoles) > 0 {
		property["x-septimus-write-roles"] = field.WriteRoles
	}
	if field.Description != "" {
		property["description"] = field.Description
	}

	switch field.Type {
	case "text":
		property["type"] = "string"
		property["maxLength"] = 5000
	case "number":
		property["type"] = "number"
	case "integer":
		property["type"] = "integer"
	case "boolean":
		property["type"] = "boolean"
	case "date":
		property["type"] = "string"
		property["format"] = "date"
	case "datetime":
		property["type"] = "string"
		property["format"] = "date-time"
	case "list":
		if len(field.Options) == 0 {
			return nil, fmt.Errorf("list fields require at least one option")
		}
		options := make([]string, 0, len(field.Options))
		seen := make(map[string]struct{}, len(field.Options))
		for _, raw := range field.Options {
			option := strings.TrimSpace(raw)
			if option == "" {
				return nil, fmt.Errorf("list options cannot be empty")
			}
			if _, duplicate := seen[option]; duplicate {
				return nil, fmt.Errorf("list options must be unique")
			}
			seen[option] = struct{}{}
			options = append(options, option)
		}
		property["type"] = "string"
		property["enum"] = options
	case "user", "file":
		property["type"] = "string"
		property["format"] = "uuid"
	case "relation":
		if field.Relation == nil || !IsValidDefinitionKey(field.Relation.TargetDefinitionKey) {
			return nil, fmt.Errorf("relation fields require a valid target_definition_key")
		}
		switch field.Relation.Cardinality {
		case "one":
			property["type"] = "string"
			property["format"] = "uuid"
		case "many":
			property["type"] = "array"
			property["items"] = map[string]interface{}{"type": "string", "format": "uuid"}
			property["uniqueItems"] = true
			property["maxItems"] = 100
		default:
			return nil, fmt.Errorf("relation cardinality must be one or many")
		}
		switch field.Relation.OnDelete {
		case "":
			field.Relation.OnDelete = "restrict"
		case "restrict", "nullify", "cascade":
		default:
			return nil, fmt.Errorf("relation on_delete must be restrict, nullify, or cascade")
		}
		if field.Required && field.Relation.OnDelete == "nullify" {
			return nil, fmt.Errorf("required relation fields cannot use nullify on delete")
		}
		property["x-septimus-relation"] = field.Relation
	case "formula":
		if field.Formula == nil || field.Formula.Expression == "" {
			return nil, fmt.Errorf("formula fields require an expression")
		}
		if field.Required {
			return nil, fmt.Errorf("formula fields are computed and cannot be required")
		}
		if field.Formula.ResultType == "" {
			field.Formula.ResultType = "number"
		}
		switch field.Formula.ResultType {
		case "number":
			property["type"] = "number"
		default:
			return nil, fmt.Errorf("formula result_type must be number")
		}
		if _, err := ParseFormula(field.Formula.Expression); err != nil {
			return nil, fmt.Errorf("invalid formula: %w", err)
		}
		property["readOnly"] = true
		property["x-septimus-formula"] = field.Formula
	default:
		return nil, fmt.Errorf("unsupported field type %q", field.Type)
	}
	return property, nil
}

func ValidateRecordAgainstSchema(schemaData datatypes.JSON, data map[string]interface{}) error {
	result, err := gojsonschema.Validate(
		gojsonschema.NewBytesLoader(schemaData),
		gojsonschema.NewGoLoader(data),
	)
	if err != nil {
		return fmt.Errorf("schema validation check failed: %w", err)
	}
	if result.Valid() {
		return nil
	}
	issues := make([]string, 0, len(result.Errors()))
	for _, issue := range result.Errors() {
		issues = append(issues, issue.String())
	}
	return &SchemaValidationError{Issues: issues}
}

func SchemaChecksum(schemaData, uiSchema datatypes.JSON) string {
	sum := sha256.Sum256(append(append([]byte{}, schemaData...), uiSchema...))
	return hex.EncodeToString(sum[:])
}

func FindPublishedDefinition(db *gorm.DB, workspaceID uuid.UUID, key string) (models.EntityDefinition, models.EntitySchemaVersion, error) {
	var definition models.EntityDefinition
	err := db.Where(
		"workspace_id = ? AND key = ? AND status = ?",
		workspaceID,
		key,
		models.EntityDefinitionStatusPublished,
	).First(&definition).Error
	if err != nil {
		return models.EntityDefinition{}, models.EntitySchemaVersion{}, err
	}

	var version models.EntitySchemaVersion
	err = db.Where(
		"workspace_id = ? AND definition_id = ? AND version = ?",
		workspaceID,
		definition.ID,
		definition.CurrentVersion,
	).First(&version).Error
	if err != nil {
		return models.EntityDefinition{}, models.EntitySchemaVersion{}, err
	}
	return definition, version, nil
}

func DefinitionDisplayValue(definition models.EntityDefinition, data map[string]interface{}) string {
	if definition.TitleFieldKey == "" {
		return ""
	}
	value, ok := data[definition.TitleFieldKey]
	if !ok || value == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(value))
}

// MaterializePublishedFields writes the immutable, queryable projection for a
// published version. It must run in the same transaction that creates the
// version so integrations never observe a version without its field catalog.
func MaterializePublishedFields(
	tx *gorm.DB,
	definition models.EntityDefinition,
	version int,
	checksum string,
	fields []SchemaFieldInput,
) error {
	if !checksumPattern.MatchString(checksum) {
		return fmt.Errorf("schema checksum must contain 64 hexadecimal characters")
	}
	rows := make([]models.EntitySchemaField, 0, len(fields))
	for position, field := range fields {
		readRoles, err := json.Marshal(field.ReadRoles)
		if err != nil {
			return fmt.Errorf("marshal field read roles: %w", err)
		}
		writeRoles, err := json.Marshal(field.WriteRoles)
		if err != nil {
			return fmt.Errorf("marshal field write roles: %w", err)
		}
		config, err := json.Marshal(field)
		if err != nil {
			return fmt.Errorf("marshal field config: %w", err)
		}
		rows = append(rows, models.EntitySchemaField{
			ID:             uuid.New(),
			WorkspaceID:    definition.WorkspaceID,
			DefinitionID:   definition.ID,
			SchemaVersion:  version,
			SchemaChecksum: checksum,
			FieldKey:       field.Key,
			FieldType:      field.Type,
			Position:       position,
			Required:       field.Required,
			Searchable:     field.Searchable,
			Indexed:        field.Indexed,
			Classification: field.Classification,
			ReadRoles:      datatypes.JSON(readRoles),
			WriteRoles:     datatypes.JSON(writeRoles),
			Config:         datatypes.JSON(config),
		})
	}
	if len(rows) == 0 {
		return &SchemaValidationError{Issues: []string{"at least one field is required"}}
	}
	return tx.Create(&rows).Error
}

func normalizeRoleList(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(values))
	normalized := make([]string, 0, len(values))
	for _, raw := range values {
		value := strings.ToLower(strings.TrimSpace(raw))
		if value == "" {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		normalized = append(normalized, value)
	}
	sort.Strings(normalized)
	return normalized
}
