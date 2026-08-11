package services

import (
	"encoding/json"
	"errors"
	"testing"

	"gorm.io/datatypes"
)

func TestCompileSchemaDraftAndValidateRecord(t *testing.T) {
	compiled, err := CompileSchemaDraft("زيارات العملاء", "Customer visits", []SchemaFieldInput{
		{Key: "title", LabelAr: "العنوان", LabelEn: "Title", Type: "text", Required: true},
		{Key: "visit_date", LabelAr: "تاريخ الزيارة", LabelEn: "Visit date", Type: "date"},
		{Key: "status", LabelAr: "الحالة", LabelEn: "Status", Type: "list", Options: []string{"planned", "done"}},
	})
	if err != nil {
		t.Fatalf("CompileSchemaDraft() error = %v", err)
	}
	if err := ValidateRecordAgainstSchema(compiled.JSONSchema, map[string]interface{}{
		"title":      "Quarterly review",
		"visit_date": "2026-07-26",
		"status":     "planned",
	}); err != nil {
		t.Fatalf("valid record rejected: %v", err)
	}

	err = ValidateRecordAgainstSchema(compiled.JSONSchema, map[string]interface{}{
		"visit_date": "not-a-date",
		"status":     "unknown",
		"extra":      true,
	})
	var validationErr *SchemaValidationError
	if !errors.As(err, &validationErr) {
		t.Fatalf("expected SchemaValidationError, got %T (%v)", err, err)
	}
	if len(validationErr.Issues) < 3 {
		t.Fatalf("expected required/date/enum/additional-property issues, got %v", validationErr.Issues)
	}
}

func TestCompileSchemaDraftRejectsUnsafeKeysAndInvalidFormula(t *testing.T) {
	_, err := CompileSchemaDraft("اختبار", "Test", []SchemaFieldInput{
		{Key: "workspace_id", LabelAr: "مساحة العمل", LabelEn: "Workspace", Type: "text"},
		{Key: "calculated", LabelAr: "محسوب", LabelEn: "Calculated", Type: "formula", Formula: &FormulaFieldConfig{Expression: "process.exit()", ResultType: "number"}},
	})
	var validationErr *SchemaValidationError
	if !errors.As(err, &validationErr) {
		t.Fatalf("expected SchemaValidationError, got %T (%v)", err, err)
	}
}

func TestFormulaFieldsCompileAndEvaluateWithoutEval(t *testing.T) {
	fields := []SchemaFieldInput{
		{Key: "quantity", LabelAr: "الكمية", LabelEn: "Quantity", Type: "integer"},
		{Key: "unit_price", LabelAr: "السعر", LabelEn: "Unit price", Type: "number"},
		{Key: "total", LabelAr: "الإجمالي", LabelEn: "Total", Type: "formula", Formula: &FormulaFieldConfig{Expression: "[quantity] * [unit_price]", ResultType: "number"}},
	}
	compiled, err := CompileSchemaDraft("الفواتير", "Invoices", fields)
	if err != nil {
		t.Fatalf("CompileSchemaDraft() error = %v", err)
	}
	data := map[string]interface{}{"quantity": float64(3), "unit_price": 12.5, "total": 999}
	delete(data, "total")
	if err := ApplyFormulaFields(compiled.Fields, data); err != nil {
		t.Fatalf("ApplyFormulaFields() error = %v", err)
	}
	if data["total"] != float64(37.5) {
		t.Fatalf("unexpected formula result: %#v", data["total"])
	}
}

func TestFormulaGraphRejectsCycles(t *testing.T) {
	_, err := CompileSchemaDraft("اختبار", "Test", []SchemaFieldInput{
		{Key: "a_value", LabelAr: "أ", LabelEn: "A", Type: "formula", Formula: &FormulaFieldConfig{Expression: "[b_value] + 1", ResultType: "number"}},
		{Key: "b_value", LabelAr: "ب", LabelEn: "B", Type: "formula", Formula: &FormulaFieldConfig{Expression: "[a_value] + 1", ResultType: "number"}},
	})
	var validationErr *SchemaValidationError
	if !errors.As(err, &validationErr) {
		t.Fatalf("expected cycle validation error, got %v", err)
	}
}

func TestRelationFieldCompilesToUUIDContract(t *testing.T) {
	compiled, err := CompileSchemaDraft("طلبات", "Orders", []SchemaFieldInput{
		{Key: "customer", LabelAr: "العميل", LabelEn: "Customer", Type: "relation", Required: true, Relation: &RelationFieldConfig{
			TargetDefinitionKey: "customers", Cardinality: "one", OnDelete: "restrict",
		}},
	})
	if err != nil {
		t.Fatalf("relation compile failed: %v", err)
	}
	if err := ValidateRecordAgainstSchema(compiled.JSONSchema, map[string]interface{}{"customer": "not-a-uuid"}); err == nil {
		t.Fatal("relation accepted a non-UUID record id")
	}
}

func TestSchemaChecksumIsStable(t *testing.T) {
	schema := datatypes.JSON(json.RawMessage(`{"type":"object"}`))
	ui := datatypes.JSON(json.RawMessage(`{"fields":[]}`))
	first := SchemaChecksum(schema, ui)
	second := SchemaChecksum(schema, ui)
	if first != second || len(first) != 64 {
		t.Fatalf("unexpected checksums: %q %q", first, second)
	}
}
