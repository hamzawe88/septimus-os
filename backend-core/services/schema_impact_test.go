package services

import (
	"encoding/json"
	"testing"

	"github.com/septimus-os/backend-core/models"
	"gorm.io/datatypes"
)

func TestSchemaDiffBlocksRequiredFieldWithoutDefault(t *testing.T) {
	before := []SchemaFieldInput{impactField("title", "text", true)}
	after := append(append([]SchemaFieldInput{}, before...), impactField("priority", "integer", true))
	report := SchemaImpactReport{Severity: SchemaChangeSafe, CanApprove: true}

	diffSchemaFields(before, after, impactRecords(
		map[string]interface{}{"title": "One"},
		map[string]interface{}{"title": "Two"},
	), &report)

	if report.Severity != SchemaChangeBreaking || report.CanApprove {
		t.Fatalf("required field without a default must block publishing: %+v", report)
	}
	if len(report.BlockingReasons) != 1 || len(report.Plan) != 0 {
		t.Fatalf("unexpected impact details: %+v", report)
	}
}

func TestSchemaDiffPlansIdempotentDefaultBackfill(t *testing.T) {
	before := []SchemaFieldInput{impactField("title", "text", true)}
	field := impactField("priority", "integer", true)
	field.Default = float64(1)
	after := append(append([]SchemaFieldInput{}, before...), field)
	report := SchemaImpactReport{Severity: SchemaChangeSafe, CanApprove: true}

	diffSchemaFields(before, after, impactRecords(map[string]interface{}{"title": "One"}), &report)

	if report.Severity != SchemaChangeConditional || !report.CanApprove || len(report.Plan) != 1 {
		t.Fatalf("expected an approvable backfill plan: %+v", report)
	}
	data := map[string]interface{}{"title": "One"}
	if err := applySchemaMigrationPlan(report.Plan, data); err != nil {
		t.Fatal(err)
	}
	if err := applySchemaMigrationPlan(report.Plan, data); err != nil {
		t.Fatalf("backfill must be idempotent: %v", err)
	}
	if data["priority"] != float64(1) {
		t.Fatalf("default was not applied: %#v", data)
	}
}

func TestSchemaDiffEnforcesDeprecateHideCleanup(t *testing.T) {
	active := impactField("legacy", "text", false)
	blocked := SchemaImpactReport{Severity: SchemaChangeSafe, CanApprove: true}
	diffSchemaFields([]SchemaFieldInput{active}, nil, impactRecords(map[string]interface{}{"legacy": "value"}), &blocked)
	if blocked.CanApprove || blocked.Severity != SchemaChangeBreaking {
		t.Fatalf("active field deletion must be blocked: %+v", blocked)
	}

	active.Lifecycle = "hidden"
	allowed := SchemaImpactReport{Severity: SchemaChangeSafe, CanApprove: true}
	diffSchemaFields([]SchemaFieldInput{active}, nil, impactRecords(map[string]interface{}{"legacy": "value"}), &allowed)
	if !allowed.CanApprove || allowed.Severity != SchemaChangeConditional ||
		len(allowed.Plan) != 1 || allowed.Plan[0].Operation != "remove_field" {
		t.Fatalf("hidden field cleanup should produce a migration plan: %+v", allowed)
	}
}

func TestSchemaDiffRejectsInvalidTextNumericValues(t *testing.T) {
	before := []SchemaFieldInput{impactField("amount", "text", false)}
	after := []SchemaFieldInput{impactField("amount", "number", false)}
	report := SchemaImpactReport{Severity: SchemaChangeSafe, CanApprove: true}
	diffSchemaFields(before, after, impactRecords(
		map[string]interface{}{"amount": "12.5"},
		map[string]interface{}{"amount": "not-a-number"},
	), &report)
	if report.CanApprove || report.AffectedRecords != 1 {
		t.Fatalf("invalid numeric values must block conversion: %+v", report)
	}
}

func TestCompileSchemaDefaultAndRecordApplication(t *testing.T) {
	field := impactField("status", "list", true)
	field.Options = []string{"new", "done"}
	field.Default = "new"
	compiled, err := CompileSchemaDraft("طلبات", "Orders", []SchemaFieldInput{field})
	if err != nil {
		t.Fatal(err)
	}
	data := map[string]interface{}{}
	ApplyFieldDefaults(compiled.Fields, data)
	if err := ValidateRecordAgainstSchema(compiled.JSONSchema, data); err != nil {
		t.Fatalf("defaulted record should satisfy the schema: %v", err)
	}
	if data["status"] != "new" {
		t.Fatalf("default was not applied: %#v", data)
	}
}

func impactField(key, fieldType string, required bool) SchemaFieldInput {
	return SchemaFieldInput{
		Key: key, LabelAr: key, LabelEn: key, Type: fieldType,
		Required: required, Lifecycle: "active", Classification: "internal",
	}
}

func impactRecords(values ...map[string]interface{}) []models.Entity {
	records := make([]models.Entity, 0, len(values))
	for _, value := range values {
		raw, _ := json.Marshal(value)
		records = append(records, models.Entity{Data: datatypes.JSON(raw)})
	}
	return records
}
