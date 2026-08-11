package handlers

import (
	"testing"

	"github.com/septimus-os/backend-core/services"
)

func schemaResourceTestFields() []services.SchemaFieldInput {
	return []services.SchemaFieldInput{
		{Key: "title", LabelAr: "العنوان", LabelEn: "Title", Type: "text"},
		{Key: "status", LabelAr: "الحالة", LabelEn: "Status", Type: "list"},
		{Key: "due_at", LabelAr: "الاستحقاق", LabelEn: "Due at", Type: "datetime"},
	}
}

func TestValidateSchemaFormRejectsDuplicateOrUnknownFields(t *testing.T) {
	request := schemaFormRequest{
		NameAr: "نموذج", NameEn: "Form", Mode: "create", Status: "active",
		Layout: schemaFormLayout{Sections: []schemaFormSection{
			{ID: "main", Columns: 2, Fields: []string{"title"}},
			{ID: "details", Columns: 1, Fields: []string{"title"}},
		}},
	}
	if err := validateSchemaFormRequest(request, schemaResourceTestFields()); err == nil {
		t.Fatal("expected duplicate form field to be rejected")
	}
	request.Layout.Sections[1].Fields = []string{"unknown"}
	if err := validateSchemaFormRequest(request, schemaResourceTestFields()); err == nil {
		t.Fatal("expected unknown form field to be rejected")
	}
}

func TestValidateSchemaViewUsesAllowlistedQueryAST(t *testing.T) {
	request := schemaViewRequest{
		NameAr: "متابعة", NameEn: "Tracking", ViewType: "table", Sharing: "workspace",
		Config: schemaViewConfig{Columns: []string{"title", "status"}},
		Query: services.RecordQueryRequest{Filter: &services.RecordFilter{
			Field: "unknown", Op: "eq", Value: "open",
		}},
	}
	if err := validateSchemaViewRequest(request, schemaResourceTestFields()); err == nil {
		t.Fatal("expected unknown query field to be rejected")
	}
	request.Query.Filter.Field = "status"
	if err := validateSchemaViewRequest(request, schemaResourceTestFields()); err != nil {
		t.Fatalf("expected allowlisted saved view to pass: %v", err)
	}
}

func TestValidateSchemaFormVisibilityRulesAreBounded(t *testing.T) {
	request := schemaFormRequest{
		NameAr: "نموذج", NameEn: "Form", Mode: "edit", Status: "active",
		Layout: schemaFormLayout{Sections: []schemaFormSection{
			{ID: "main", Columns: 2, Fields: []string{"title", "status"}},
		}},
		VisibilityRules: []schemaVisibilityRule{
			{Field: "status", Operator: "eq", Value: "open", TargetField: "title"},
		},
	}
	if err := validateSchemaFormRequest(request, schemaResourceTestFields()); err != nil {
		t.Fatalf("expected valid rule to pass: %v", err)
	}
	request.VisibilityRules[0].Operator = "script"
	if err := validateSchemaFormRequest(request, schemaResourceTestFields()); err == nil {
		t.Fatal("expected unsupported visibility operator to be rejected")
	}
}
