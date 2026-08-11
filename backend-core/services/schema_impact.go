package services

import (
	"encoding/json"
	"fmt"
	"reflect"
	"sort"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

const (
	SchemaChangeSafe        = "safe"
	SchemaChangeConditional = "conditional"
	SchemaChangeBreaking    = "breaking"
)

type SchemaChange struct {
	Kind            string      `json:"kind"`
	FieldKey        string      `json:"field_key,omitempty"`
	Severity        string      `json:"severity"`
	MessageCode     string      `json:"message_code"`
	Before          interface{} `json:"before,omitempty"`
	After           interface{} `json:"after,omitempty"`
	AffectedRecords int64       `json:"affected_records"`
}

type SchemaMigrationOperation struct {
	Operation string      `json:"operation"`
	FieldKey  string      `json:"field_key"`
	FromType  string      `json:"from_type,omitempty"`
	ToType    string      `json:"to_type,omitempty"`
	Value     interface{} `json:"value,omitempty"`
}

type SchemaDependencySummary struct {
	Relations int64 `json:"relations"`
	Workflows int64 `json:"workflows"`
	Forms     int64 `json:"forms"`
	Views     int64 `json:"views"`
}

type SchemaImpactReport struct {
	DefinitionID      uuid.UUID                  `json:"definition_id"`
	SourceVersion     int                        `json:"source_version"`
	DraftRevision     int                        `json:"draft_revision"`
	SourceChecksum    string                     `json:"source_checksum,omitempty"`
	TargetChecksum    string                     `json:"target_checksum"`
	Severity          string                     `json:"severity"`
	CanApprove        bool                       `json:"can_approve"`
	RequiresMigration bool                       `json:"requires_migration"`
	RecordCount       int64                      `json:"record_count"`
	AffectedRecords   int64                      `json:"affected_records"`
	Changes           []SchemaChange             `json:"changes"`
	BlockingReasons   []string                   `json:"blocking_reasons"`
	Dependencies      SchemaDependencySummary    `json:"dependencies"`
	Plan              []SchemaMigrationOperation `json:"plan"`
}

type schemaRecordImpactStats struct {
	Total           int64
	Present         map[string]int64
	InvalidNumbers  map[string]int64
	InvalidIntegers map[string]int64
	Values          map[string]map[string]int64
}

// AnalyzeSchemaImpact compares the current immutable version with the draft,
// then checks real records and workflow/relation references before approval.
func AnalyzeSchemaImpact(
	db *gorm.DB,
	definition models.EntityDefinition,
	compiled CompiledSchemaDraft,
) (SchemaImpactReport, error) {
	report := SchemaImpactReport{
		DefinitionID: definition.ID, SourceVersion: definition.CurrentVersion,
		DraftRevision:  definition.DraftRevision,
		TargetChecksum: SchemaChecksum(compiled.JSONSchema, compiled.UISchema),
		Severity:       SchemaChangeSafe, CanApprove: true,
		Changes: []SchemaChange{}, BlockingReasons: []string{},
		Plan: []SchemaMigrationOperation{},
	}

	var sourceFields []SchemaFieldInput
	if definition.CurrentVersion > 0 {
		var source models.EntitySchemaVersion
		if err := db.Where(
			"workspace_id = ? AND definition_id = ? AND version = ?",
			definition.WorkspaceID, definition.ID, definition.CurrentVersion,
		).First(&source).Error; err != nil {
			return report, fmt.Errorf("load source schema version: %w", err)
		}
		report.SourceChecksum = source.Checksum
		sourceFields = parseFields(source.UISchema)
	}

	stats, err := collectSchemaRecordImpactStats(db, definition, sourceFields, compiled.Fields)
	if err != nil {
		return report, err
	}
	report.RecordCount = stats.Total
	diffSchemaFieldsWithStats(sourceFields, compiled.Fields, stats, &report)
	if definition.CurrentVersion > 0 && report.SourceChecksum == report.TargetChecksum {
		block(&report, "schema_has_no_changes")
	} else if definition.CurrentVersion > 0 && len(report.Changes) == 0 {
		addChange(&report, SchemaChange{
			Kind: "metadata_changed", Severity: SchemaChangeSafe,
			MessageCode: "SCHEMA_METADATA_CHANGED",
		})
	}
	dependencies, err := inspectSchemaDependencies(db, definition, sourceFields, compiled.Fields)
	if err != nil {
		return report, err
	}
	report.Dependencies = dependencies
	report.RequiresMigration = len(report.Plan) > 0
	return report, nil
}

func diffSchemaFields(before, after []SchemaFieldInput, records []models.Entity, report *SchemaImpactReport) {
	stats := newSchemaRecordImpactStats()
	oldByKey := fieldMap(before)
	conversions := numericConversionTargets(oldByKey, after)
	trackedValues := trackedListValues(oldByKey, after)
	for _, record := range records {
		addRecordToImpactStats(&stats, recordData(record), conversions, trackedValues)
	}
	diffSchemaFieldsWithStats(before, after, stats, report)
}

func diffSchemaFieldsWithStats(before, after []SchemaFieldInput, stats schemaRecordImpactStats, report *SchemaImpactReport) {
	oldByKey := fieldMap(before)
	newByKey := fieldMap(after)
	keys := make([]string, 0, len(oldByKey)+len(newByKey))
	seen := map[string]bool{}
	for _, field := range before {
		keys = append(keys, field.Key)
		seen[field.Key] = true
	}
	for _, field := range after {
		if !seen[field.Key] {
			keys = append(keys, field.Key)
		}
	}

	for _, key := range keys {
		oldField, hadOld := oldByKey[key]
		newField, hasNew := newByKey[key]
		switch {
		case !hadOld:
			affected := missingFieldCount(stats, key)
			severity := SchemaChangeSafe
			code := "FIELD_ADDED_OPTIONAL"
			if newField.Required && stats.Total > 0 {
				if newField.Default == nil {
					severity = SchemaChangeBreaking
					code = "REQUIRED_FIELD_NEEDS_DEFAULT"
					block(report, "required_field_without_default:"+key)
				} else {
					severity = SchemaChangeConditional
					code = "REQUIRED_FIELD_BACKFILL"
					report.Plan = append(report.Plan, SchemaMigrationOperation{
						Operation: "set_default", FieldKey: key, Value: newField.Default,
					})
				}
			}
			addChange(report, SchemaChange{Kind: "field_added", FieldKey: key, Severity: severity, MessageCode: code, After: newField.Type, AffectedRecords: affected})
		case !hasNew:
			affected := presentFieldCount(stats, key)
			if oldField.Type == "relation" && affected > 0 {
				addChange(report, SchemaChange{Kind: "field_removed", FieldKey: key, Severity: SchemaChangeBreaking, MessageCode: "RELATION_RECORDS_MUST_BE_CLEARED", Before: oldField.Type, AffectedRecords: affected})
				block(report, "relation_records_must_be_cleared:"+key)
			} else if oldField.Lifecycle == "hidden" {
				addChange(report, SchemaChange{Kind: "field_removed", FieldKey: key, Severity: SchemaChangeConditional, MessageCode: "HIDDEN_FIELD_CLEANUP", Before: oldField.Type, AffectedRecords: affected})
				report.Plan = append(report.Plan, SchemaMigrationOperation{Operation: "remove_field", FieldKey: key})
			} else {
				addChange(report, SchemaChange{Kind: "field_removed", FieldKey: key, Severity: SchemaChangeBreaking, MessageCode: "FIELD_MUST_BE_HIDDEN_FIRST", Before: oldField.Type, AffectedRecords: affected})
				block(report, "field_removal_requires_deprecate_and_hide:"+key)
			}
		default:
			diffExistingField(oldField, newField, stats, report)
		}
	}
}

func diffExistingField(oldField, newField SchemaFieldInput, stats schemaRecordImpactStats, report *SchemaImpactReport) {
	key := oldField.Key
	if oldField.Type != newField.Type {
		diffFieldType(oldField, newField, stats, report)
	}
	if oldField.Required != newField.Required {
		severity := SchemaChangeSafe
		code := "FIELD_BECAME_OPTIONAL"
		affected := int64(0)
		if newField.Required {
			affected = missingFieldCount(stats, key)
			code = "FIELD_BECAME_REQUIRED"
			if affected > 0 && newField.Default == nil {
				severity = SchemaChangeBreaking
				block(report, "required_field_without_default:"+key)
			} else if affected > 0 {
				severity = SchemaChangeConditional
				report.Plan = append(report.Plan, SchemaMigrationOperation{Operation: "set_default", FieldKey: key, Value: newField.Default})
			}
		}
		addChange(report, SchemaChange{Kind: "required_changed", FieldKey: key, Severity: severity, MessageCode: code, Before: oldField.Required, After: newField.Required, AffectedRecords: affected})
	}
	if oldField.Lifecycle != newField.Lifecycle {
		valid := (oldField.Lifecycle == "active" && newField.Lifecycle == "deprecated") ||
			(oldField.Lifecycle == "deprecated" && newField.Lifecycle == "hidden") ||
			(oldField.Lifecycle == "deprecated" && newField.Lifecycle == "active") ||
			(oldField.Lifecycle == "hidden" && newField.Lifecycle == "deprecated")
		severity := SchemaChangeSafe
		code := "FIELD_LIFECYCLE_CHANGED"
		if !valid {
			severity = SchemaChangeBreaking
			code = "INVALID_FIELD_LIFECYCLE_TRANSITION"
			block(report, "invalid_field_lifecycle_transition:"+key)
		}
		addChange(report, SchemaChange{Kind: "lifecycle_changed", FieldKey: key, Severity: severity, MessageCode: code, Before: oldField.Lifecycle, After: newField.Lifecycle})
	}
	if oldField.Type == "list" && newField.Type == "list" && !reflect.DeepEqual(oldField.Options, newField.Options) {
		removed := removedStrings(oldField.Options, newField.Options)
		affected := recordsWithValues(stats, key, removed)
		severity := SchemaChangeSafe
		if affected > 0 {
			severity = SchemaChangeBreaking
			block(report, "list_options_are_still_in_use:"+key)
		}
		addChange(report, SchemaChange{Kind: "list_options_changed", FieldKey: key, Severity: severity, MessageCode: "LIST_OPTIONS_CHANGED", Before: oldField.Options, After: newField.Options, AffectedRecords: affected})
	}
	if oldField.Type == "relation" && newField.Type == "relation" && !reflect.DeepEqual(oldField.Relation, newField.Relation) {
		severity := SchemaChangeBreaking
		affected := presentFieldCount(stats, key)
		if oldField.Relation != nil && newField.Relation != nil &&
			oldField.Relation.TargetDefinitionKey == newField.Relation.TargetDefinitionKey &&
			oldField.Relation.Cardinality == "one" && newField.Relation.Cardinality == "many" {
			report.Plan = append(report.Plan, SchemaMigrationOperation{Operation: "relation_one_to_many", FieldKey: key})
		} else if affected > 0 {
			block(report, "relation_change_requires_manual_cleanup:"+key)
		}
		addChange(report, SchemaChange{Kind: "relation_changed", FieldKey: key, Severity: severity, MessageCode: "RELATION_CONTRACT_CHANGED", Before: oldField.Relation, After: newField.Relation, AffectedRecords: affected})
	}
	if oldField.Type == "formula" && newField.Type == "formula" && !reflect.DeepEqual(oldField.Formula, newField.Formula) {
		report.Plan = append(report.Plan, SchemaMigrationOperation{Operation: "recalculate_formula", FieldKey: key})
		addChange(report, SchemaChange{Kind: "formula_changed", FieldKey: key, Severity: SchemaChangeConditional, MessageCode: "FORMULA_RECALCULATION_REQUIRED", Before: oldField.Formula, After: newField.Formula, AffectedRecords: stats.Total})
	}
	if oldField.Classification != newField.Classification ||
		!reflect.DeepEqual(oldField.ReadRoles, newField.ReadRoles) ||
		!reflect.DeepEqual(oldField.WriteRoles, newField.WriteRoles) ||
		!sameBoolPointer(oldField.IncludeInAI, newField.IncludeInAI) ||
		!sameBoolPointer(oldField.IncludeInEvents, newField.IncludeInEvents) ||
		!sameBoolPointer(oldField.IncludeInExport, newField.IncludeInExport) {
		addChange(report, SchemaChange{Kind: "policy_changed", FieldKey: key, Severity: SchemaChangeConditional, MessageCode: "FIELD_POLICY_CHANGED", AffectedRecords: presentFieldCount(stats, key)})
	}
}

func diffFieldType(oldField, newField SchemaFieldInput, stats schemaRecordImpactStats, report *SchemaImpactReport) {
	key := oldField.Key
	affected := presentFieldCount(stats, key)
	severity := SchemaChangeBreaking
	code := "UNSUPPORTED_TYPE_CHANGE"
	supported := false
	switch {
	case oldField.Type == "integer" && newField.Type == "number":
		severity, code = SchemaChangeSafe, "INTEGER_WIDENED_TO_NUMBER"
	case oldField.Type == "text" && (newField.Type == "number" || newField.Type == "integer"):
		invalid := invalidNumericCount(stats, key, newField.Type == "integer")
		if invalid == 0 {
			severity, code, supported = SchemaChangeConditional, "TEXT_NUMERIC_CONVERSION", true
		} else {
			affected = invalid
			code = "TEXT_NUMERIC_CONVERSION_INVALID_VALUES"
		}
	case (oldField.Type == "number" || oldField.Type == "integer") && newField.Type == "text":
		severity, code, supported = SchemaChangeConditional, "NUMBER_TEXT_CONVERSION", true
	}
	if supported {
		report.Plan = append(report.Plan, SchemaMigrationOperation{
			Operation: "convert_type", FieldKey: key, FromType: oldField.Type, ToType: newField.Type,
		})
	} else if severity == SchemaChangeBreaking {
		block(report, "unsupported_or_invalid_type_change:"+key)
	}
	addChange(report, SchemaChange{Kind: "type_changed", FieldKey: key, Severity: severity, MessageCode: code, Before: oldField.Type, After: newField.Type, AffectedRecords: affected})
}

func inspectSchemaDependencies(db *gorm.DB, definition models.EntityDefinition, before, after []SchemaFieldInput) (SchemaDependencySummary, error) {
	var summary SchemaDependencySummary
	if err := db.Model(&models.EntityRelation{}).Where(
		"workspace_id = ? AND (source_definition_id = ? OR target_definition_id = ?)",
		definition.WorkspaceID, definition.ID, definition.ID,
	).Count(&summary.Relations).Error; err != nil {
		return summary, fmt.Errorf("count schema relation dependencies: %w", err)
	}
	if err := db.Model(&models.EntityForm{}).Where(
		"workspace_id = ? AND definition_id = ?", definition.WorkspaceID, definition.ID,
	).Count(&summary.Forms).Error; err != nil {
		return summary, fmt.Errorf("count schema form dependencies: %w", err)
	}
	if err := db.Model(&models.EntityView{}).Where(
		"workspace_id = ? AND definition_id = ?", definition.WorkspaceID, definition.ID,
	).Count(&summary.Views).Error; err != nil {
		return summary, fmt.Errorf("count schema view dependencies: %w", err)
	}
	var workflows []models.Workflow
	if err := db.Select("id", "nodes", "edges").Where("workspace_id = ?", definition.WorkspaceID).Find(&workflows).Error; err != nil {
		return summary, fmt.Errorf("load workflow dependencies: %w", err)
	}
	needles := []string{definition.ID.String(), definition.Key}
	for _, field := range append(append([]SchemaFieldInput{}, before...), after...) {
		needles = append(needles, field.Key)
	}
	for _, workflow := range workflows {
		nodes, err := DecodeWorkflowNodes(workflow.Nodes)
		if err != nil {
			return summary, fmt.Errorf("decode workflow %s for impact analysis: %w", workflow.ID, err)
		}
		if jsonContainsSchemaReference(nodes, needles) || jsonContainsSchemaReference(workflow.Edges, needles) {
			summary.Workflows++
		}
	}
	return summary, nil
}

func addChange(report *SchemaImpactReport, change SchemaChange) {
	report.Changes = append(report.Changes, change)
	if severityRank(change.Severity) > severityRank(report.Severity) {
		report.Severity = change.Severity
	}
	if change.AffectedRecords > report.AffectedRecords {
		report.AffectedRecords = change.AffectedRecords
	}
}

func block(report *SchemaImpactReport, reason string) {
	report.CanApprove = false
	for _, current := range report.BlockingReasons {
		if current == reason {
			return
		}
	}
	report.BlockingReasons = append(report.BlockingReasons, reason)
}

func fieldMap(fields []SchemaFieldInput) map[string]SchemaFieldInput {
	result := make(map[string]SchemaFieldInput, len(fields))
	for _, field := range fields {
		result[field.Key] = field
	}
	return result
}

func recordData(record models.Entity) map[string]interface{} {
	var data map[string]interface{}
	_ = json.Unmarshal(record.Data, &data)
	return data
}

func newSchemaRecordImpactStats() schemaRecordImpactStats {
	return schemaRecordImpactStats{
		Present: map[string]int64{}, InvalidNumbers: map[string]int64{},
		InvalidIntegers: map[string]int64{}, Values: map[string]map[string]int64{},
	}
}

// collectSchemaRecordImpactStats scans in bounded batches, so an impact review
// has constant memory use even for enterprise schemas with millions of rows.
func collectSchemaRecordImpactStats(
	db *gorm.DB,
	definition models.EntityDefinition,
	before, after []SchemaFieldInput,
) (schemaRecordImpactStats, error) {
	stats := newSchemaRecordImpactStats()
	oldByKey := fieldMap(before)
	conversions := numericConversionTargets(oldByKey, after)
	trackedValues := trackedListValues(oldByKey, after)
	batch := make([]models.Entity, 0, 500)
	query := db.Select("id", "data").Where(
		"workspace_id = ? AND definition_id = ? AND deleted_at IS NULL",
		definition.WorkspaceID, definition.ID,
	).Order("id ASC")
	err := query.FindInBatches(&batch, 500, func(_ *gorm.DB, _ int) error {
		for _, record := range batch {
			addRecordToImpactStats(&stats, recordData(record), conversions, trackedValues)
		}
		return nil
	}).Error
	if err != nil {
		return stats, fmt.Errorf("scan records for schema impact: %w", err)
	}
	return stats, nil
}

func addRecordToImpactStats(
	stats *schemaRecordImpactStats,
	data map[string]interface{},
	conversions []SchemaFieldInput,
	trackedValues map[string]map[string]bool,
) {
	stats.Total++
	for key, value := range data {
		if value == nil {
			continue
		}
		stats.Present[key]++
		text := fmt.Sprint(value)
		if trackedValues[key][text] {
			if stats.Values[key] == nil {
				stats.Values[key] = map[string]int64{}
			}
			stats.Values[key][text]++
		}
	}
	for _, target := range conversions {
		value, ok := data[target.Key]
		if !ok || value == nil {
			continue
		}
		text := strings.TrimSpace(fmt.Sprint(value))
		if _, err := strconv.ParseFloat(text, 64); err != nil {
			stats.InvalidNumbers[target.Key]++
		}
		if _, err := strconv.ParseInt(text, 10, 64); err != nil {
			stats.InvalidIntegers[target.Key]++
		}
	}
}

func numericConversionTargets(oldByKey map[string]SchemaFieldInput, after []SchemaFieldInput) []SchemaFieldInput {
	targets := make([]SchemaFieldInput, 0)
	for _, target := range after {
		source, exists := oldByKey[target.Key]
		if exists && source.Type == "text" &&
			(target.Type == "number" || target.Type == "integer") {
			targets = append(targets, target)
		}
	}
	return targets
}

func trackedListValues(oldByKey map[string]SchemaFieldInput, after []SchemaFieldInput) map[string]map[string]bool {
	tracked := map[string]map[string]bool{}
	for _, target := range after {
		source, exists := oldByKey[target.Key]
		if !exists || source.Type != "list" || target.Type != "list" {
			continue
		}
		for _, value := range removedStrings(source.Options, target.Options) {
			if tracked[target.Key] == nil {
				tracked[target.Key] = map[string]bool{}
			}
			tracked[target.Key][value] = true
		}
	}
	return tracked
}

func presentFieldCount(stats schemaRecordImpactStats, key string) int64 {
	return stats.Present[key]
}

func missingFieldCount(stats schemaRecordImpactStats, key string) int64 {
	return stats.Total - presentFieldCount(stats, key)
}

func invalidNumericCount(stats schemaRecordImpactStats, key string, integer bool) int64 {
	if integer {
		return stats.InvalidIntegers[key]
	}
	return stats.InvalidNumbers[key]
}

func recordsWithValues(stats schemaRecordImpactStats, key string, values []string) int64 {
	var count int64
	for _, value := range values {
		count += stats.Values[key][value]
	}
	return count
}

func removedStrings(before, after []string) []string {
	kept := map[string]bool{}
	for _, value := range after {
		kept[value] = true
	}
	var removed []string
	for _, value := range before {
		if !kept[value] {
			removed = append(removed, value)
		}
	}
	sort.Strings(removed)
	return removed
}

func sameBoolPointer(left, right *bool) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}

func jsonContainsSchemaReference(raw []byte, needles []string) bool {
	var value interface{}
	if json.Unmarshal(raw, &value) != nil {
		return false
	}
	set := make(map[string]bool, len(needles))
	for _, needle := range needles {
		if needle != "" {
			set[needle] = true
		}
	}
	var inspect func(interface{}) bool
	inspect = func(current interface{}) bool {
		switch typed := current.(type) {
		case map[string]interface{}:
			for key, nested := range typed {
				if set[key] || inspect(nested) {
					return true
				}
			}
		case []interface{}:
			for _, nested := range typed {
				if inspect(nested) {
					return true
				}
			}
		case string:
			if set[typed] {
				return true
			}
			for needle := range set {
				for _, token := range []string{
					"[" + needle + "]", "{{" + needle + "}}",
					"/" + needle + "/", "." + needle, needle + ".",
				} {
					if strings.Contains(typed, token) {
						return true
					}
				}
			}
		}
		return false
	}
	return inspect(value)
}

func severityRank(value string) int {
	switch value {
	case SchemaChangeBreaking:
		return 3
	case SchemaChangeConditional:
		return 2
	default:
		return 1
	}
}

func MarshalSchemaImpact(report SchemaImpactReport) (datatypes.JSON, error) {
	raw, err := json.Marshal(report)
	return datatypes.JSON(raw), err
}

func MarshalMigrationPlan(plan []SchemaMigrationOperation) (datatypes.JSON, error) {
	raw, err := json.Marshal(plan)
	return datatypes.JSON(raw), err
}
