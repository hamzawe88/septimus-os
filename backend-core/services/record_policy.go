package services

import (
	"encoding/json"
	"fmt"
	"reflect"
	"sort"
	"strings"

	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

const redactedAuditValue = "[REDACTED]"

// RecordPrincipal describes who initiated a record operation. Role is the
// workspace role for browser sessions; Source distinguishes API keys, internal
// AI calls, workflows, and trusted system jobs so field policies cannot be
// bypassed by switching transport.
type RecordPrincipal struct {
	UserID    uuid.UUID
	Role      string
	Source    string
	IPAddress string
}

const systemRecordCommandRequiredCode = "SYSTEM_RECORD_COMMAND_REQUIRED"

var crmProtectedWriteSources = map[string]map[string]struct{}{
	"crm_account":        sourceSet("crm_account_command", "crm_migration"),
	"crm_contact":        sourceSet("crm_contact_command", "crm_migration"),
	"crm_opportunity":    sourceSet("crm_opportunity_command", "crm_pipeline", "crm_quote_conversion", "crm_migration", "approved_ai"),
	"crm_activity":       sourceSet("crm_activity_command", "crm_migration"),
	"crm_quote":          sourceSet("crm_quote_command", "crm_quote_conversion", "crm_migration"),
	"crm_quote_line":     sourceSet("crm_quote_command", "crm_quote_conversion", "crm_migration"),
	"crm_ticket":         sourceSet("crm_ticket_command", "crm_sla", "crm_migration"),
	"crm_ticket_message": sourceSet("crm_ticket_message_command", "crm_migration"),
}

var crmProtectedFields = map[string]map[string]struct{}{
	"crm_opportunity": fieldSet("stage"),
	"crm_quote":       fieldSet("status", "subtotal", "tax_rate", "total_tax", "total", "invoice_id"),
	"crm_quote_line":  fieldSet("quote", "quantity", "unit_price", "tax_rate"),
	"crm_ticket": fieldSet(
		"status", "priority", "external_provider", "external_ticket_id", "assignee", "assigned_team", "sla_due_at", "sla_status",
		"escalation_level", "resolved_at",
	),
	"crm_ticket_message": fieldSet(
		"ticket", "channel", "sender", "sent_at", "external_message_id", "delivery_status",
	),
}

var crmCommandOnlyCreates = map[string]struct{}{
	"crm_quote": {}, "crm_quote_line": {}, "crm_ticket": {}, "crm_ticket_message": {},
}

func sourceSet(values ...string) map[string]struct{} {
	result := make(map[string]struct{}, len(values))
	for _, value := range values {
		result[value] = struct{}{}
	}
	return result
}

func fieldSet(values ...string) map[string]struct{} { return sourceSet(values...) }

// ValidateSystemRecordMutation keeps business lifecycle fields behind their
// dedicated command handlers. Schema Builder remains the canonical record
// store, but a generic browser/API-key write cannot bypass CRM permissions,
// transition graphs, SLA calculations, or financial transactions.
func ValidateSystemRecordMutation(definitionKey, operation string, input map[string]interface{}, principal RecordPrincipal) error {
	allowedSources, isCRM := crmProtectedWriteSources[definitionKey]
	if !isCRM {
		return nil
	}
	source := strings.ToLower(strings.TrimSpace(principal.Source))
	_, commandSource := allowedSources[source]
	if operation == "delete" {
		if commandSource || source == "crm_migration" {
			return nil
		}
		return systemRecordCommandError(definitionKey, "delete")
	}
	if operation == "create" {
		if _, commandOnly := crmCommandOnlyCreates[definitionKey]; commandOnly && !commandSource {
			return systemRecordCommandError(definitionKey, "create")
		}
	}
	if commandSource {
		return nil
	}
	for field := range input {
		if _, protected := crmProtectedFields[definitionKey][field]; protected {
			return systemRecordCommandError(definitionKey, field)
		}
	}
	return nil
}

func systemRecordCommandError(definitionKey, field string) error {
	return &RecordOperationError{
		Message: fmt.Sprintf("%s.%s must be changed through the dedicated domain command", definitionKey, field),
		Code:    systemRecordCommandRequiredCode,
	}
}

func PrincipalForUser(userID uuid.UUID, role string) RecordPrincipal {
	return RecordPrincipal{UserID: userID, Role: role, Source: "authenticated"}
}

func PrincipalForSystem(source string) RecordPrincipal {
	source = strings.ToLower(strings.TrimSpace(source))
	if source == "" {
		source = "system"
	}
	return RecordPrincipal{Source: source}
}

func (principal RecordPrincipal) policyKeys() map[string]struct{} {
	keys := map[string]struct{}{}
	for _, raw := range []string{principal.Role, principal.Source} {
		value := strings.ToLower(strings.TrimSpace(raw))
		if value != "" {
			keys[value] = struct{}{}
		}
	}
	if principal.UserID != uuid.Nil {
		keys["authenticated"] = struct{}{}
	}
	if len(keys) == 0 {
		keys["system"] = struct{}{}
	}
	return keys
}

func fieldPolicyAllows(allowed []string, principal RecordPrincipal) bool {
	if len(allowed) == 0 {
		return true
	}
	keys := principal.policyKeys()
	for _, raw := range allowed {
		if _, ok := keys[strings.ToLower(strings.TrimSpace(raw))]; ok {
			return true
		}
	}
	return false
}

func ValidateFieldWrites(fields []SchemaFieldInput, input map[string]interface{}, principal RecordPrincipal) error {
	byKey := make(map[string]SchemaFieldInput, len(fields))
	for _, field := range fields {
		byKey[field.Key] = field
	}
	for key := range input {
		field, exists := byKey[key]
		if !exists || field.Type == "formula" {
			continue
		}
		if field.Lifecycle == "hidden" || !fieldPolicyAllows(field.WriteRoles, principal) {
			return &RecordOperationError{
				Message: fmt.Sprintf("%s is not writable for this principal", key),
				Code:    "FIELD_WRITE_FORBIDDEN",
			}
		}
	}
	return nil
}

func ReadableSchemaFields(fields []SchemaFieldInput, principal RecordPrincipal) []SchemaFieldInput {
	readable := make([]SchemaFieldInput, 0, len(fields))
	for _, field := range fields {
		if field.Lifecycle != "hidden" && fieldPolicyAllows(field.ReadRoles, principal) {
			readable = append(readable, field)
		}
	}
	return readable
}

func ProjectRecordForRead(record models.Entity, definition models.EntityDefinition, fields []SchemaFieldInput, principal RecordPrincipal) models.Entity {
	var data map[string]interface{}
	if err := json.Unmarshal(record.Data, &data); err != nil {
		data = map[string]interface{}{}
	}
	for _, field := range fields {
		if field.Lifecycle == "hidden" || !fieldPolicyAllows(field.ReadRoles, principal) {
			delete(data, field.Key)
			if field.Key == definition.TitleFieldKey {
				record.DisplayValue = ""
			}
		}
	}
	raw, _ := json.Marshal(data)
	record.Data = datatypes.JSON(raw)
	return record
}

func ProjectRecordForAI(record models.Entity, definition models.EntityDefinition, fields []SchemaFieldInput, principal RecordPrincipal) models.Entity {
	var data map[string]interface{}
	if err := json.Unmarshal(record.Data, &data); err != nil {
		data = map[string]interface{}{}
	}
	for _, field := range fields {
		semanticType := field.Type != "file" && field.Type != "user" && field.Type != "relation"
		if !semanticType || !fieldPolicyAllows(field.ReadRoles, principal) || !FieldIncludedInAI(field) {
			delete(data, field.Key)
			if field.Key == definition.TitleFieldKey {
				record.DisplayValue = ""
			}
		}
	}
	raw, _ := json.Marshal(data)
	record.Data = datatypes.JSON(raw)
	return record
}

// ValidateRecordReferences checks references that JSON Schema can only
// represent as UUID strings. Existence, workspace ownership, and file security
// state are enforced inside the record transaction.
func ValidateRecordReferences(tx *gorm.DB, workspaceID uuid.UUID, fields []SchemaFieldInput, data map[string]interface{}) error {
	for _, field := range fields {
		value, exists := data[field.Key]
		if !exists || value == nil || fmt.Sprint(value) == "" {
			continue
		}
		switch field.Type {
		case "user":
			id, err := recordReferenceUUID(value)
			if err != nil {
				return &RecordOperationError{Message: fmt.Sprintf("%s must reference a valid workspace user", field.Key)}
			}
			var count int64
			if err := tx.Model(&models.User{}).
				Where("id = ? AND workspace_id = ?", id, workspaceID).
				Count(&count).Error; err != nil {
				return err
			}
			if count != 1 {
				return &RecordOperationError{Message: fmt.Sprintf("%s references a user outside this workspace", field.Key)}
			}
		case "file":
			id, err := recordReferenceUUID(value)
			if err != nil || !workspaceOwnsSafeFile(tx, workspaceID, id) {
				return &RecordOperationError{Message: fmt.Sprintf("%s must reference a safe private file in this workspace", field.Key)}
			}
		}
	}
	return nil
}

func recordReferenceUUID(value interface{}) (uuid.UUID, error) {
	switch typed := value.(type) {
	case string:
		return uuid.Parse(strings.TrimSpace(typed))
	case uuid.UUID:
		if typed == uuid.Nil {
			return uuid.Nil, fmt.Errorf("empty UUID")
		}
		return typed, nil
	default:
		return uuid.Nil, fmt.Errorf("reference must be a UUID")
	}
}

func workspaceOwnsSafeFile(tx *gorm.DB, workspaceID, fileID uuid.UUID) bool {
	var driveFile models.DriveFile
	if err := tx.Select("id", "data").
		Where("id = ? AND workspace_id = ?", fileID, workspaceID).
		First(&driveFile).Error; err == nil {
		var metadata map[string]interface{}
		_ = json.Unmarshal(driveFile.Data, &metadata)
		return metadata["status"] == "ready" &&
			metadata["security_policy"] == "malware_scan_passed"
	}

	var workDoc models.WorkDoc
	if err := tx.Select("id").
		Where("id = ? AND workspace_id = ?", fileID, workspaceID).
		First(&workDoc).Error; err == nil {
		return true
	}

	// FileRecord rows are inserted only after synchronous malware scanning has
	// succeeded, so a tenant-scoped row is the durable clean-file assertion.
	var fileRecord models.FileRecord
	return tx.Select("id").
		Where("id = ? AND workspace_id = ?", fileID, workspaceID).
		First(&fileRecord).Error == nil
}

func ChangedRecordFields(before, after map[string]interface{}) []string {
	keys := make(map[string]struct{}, len(before)+len(after))
	for key := range before {
		keys[key] = struct{}{}
	}
	for key := range after {
		keys[key] = struct{}{}
	}
	changed := make([]string, 0, len(keys))
	for key := range keys {
		if !reflect.DeepEqual(before[key], after[key]) {
			changed = append(changed, key)
		}
	}
	sort.Strings(changed)
	return changed
}

func EventRecordData(fields []SchemaFieldInput, data map[string]interface{}) map[string]interface{} {
	output := make(map[string]interface{}, len(data))
	byKey := make(map[string]SchemaFieldInput, len(fields))
	for _, field := range fields {
		byKey[field.Key] = field
	}
	for key, value := range data {
		field, known := byKey[key]
		if !known {
			continue
		}
		if field.Lifecycle == "hidden" {
			continue
		}
		if field.IncludeInEvents != nil && !*field.IncludeInEvents {
			continue
		}
		if field.Classification == "confidential" || field.Classification == "pii" {
			continue
		}
		output[key] = value
	}
	return output
}

func FieldIncludedInAI(field SchemaFieldInput) bool {
	if field.Lifecycle == "hidden" || field.Classification == "confidential" || field.Classification == "pii" {
		return false
	}
	if field.IncludeInAI != nil {
		return *field.IncludeInAI
	}
	return true
}

func WriteRecordAudit(
	tx *gorm.DB,
	action string,
	definition models.EntityDefinition,
	record models.Entity,
	principal RecordPrincipal,
	fields []SchemaFieldInput,
	before map[string]interface{},
	after map[string]interface{},
) error {
	changed := ChangedRecordFields(before, after)
	beforeAudit := auditRecordValues(fields, before, changed)
	afterAudit := auditRecordValues(fields, after, changed)
	details, err := json.Marshal(map[string]interface{}{
		"definition_key": definition.Key,
		"schema_version": record.SchemaVersion,
		"record_version": record.RecordVersion,
		"changed_fields": changed,
		"before":         beforeAudit,
		"after":          afterAudit,
		"source":         principal.Source,
	})
	if err != nil {
		return fmt.Errorf("marshal record audit: %w", err)
	}
	var actor *uuid.UUID
	if principal.UserID != uuid.Nil {
		value := principal.UserID
		actor = &value
	}
	workspaceID := definition.WorkspaceID
	return tx.Create(&models.AuditLog{
		ID:          uuid.New(),
		WorkspaceID: &workspaceID,
		UserID:      actor,
		Action:      action,
		EntityType:  "DynamicRecord",
		EntityID:    record.ID.String(),
		Details:     datatypes.JSON(details),
		IPAddress:   principal.IPAddress,
	}).Error
}

func auditRecordValues(fields []SchemaFieldInput, values map[string]interface{}, changed []string) map[string]interface{} {
	byKey := make(map[string]SchemaFieldInput, len(fields))
	for _, field := range fields {
		byKey[field.Key] = field
	}
	output := make(map[string]interface{}, len(changed))
	for _, key := range changed {
		value, exists := values[key]
		if !exists {
			continue
		}
		field, known := byKey[key]
		if !known || field.Classification == "confidential" || field.Classification == "pii" {
			output[key] = redactedAuditValue
			continue
		}
		output[key] = value
	}
	return output
}
