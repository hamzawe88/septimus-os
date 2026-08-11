package handlers

import (
	"encoding/json"
	"fmt"
	"testing"

	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
	"gorm.io/datatypes"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupCRMTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	sqlDB.SetMaxOpenConns(1)
	statements := []string{
		`CREATE TABLE entity_definitions (
			id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, key TEXT NOT NULL,
			label_ar TEXT NOT NULL, label_en TEXT NOT NULL, description_ar TEXT,
			description_en TEXT, status TEXT NOT NULL, current_version INTEGER NOT NULL,
			draft_revision INTEGER NOT NULL, title_field_key TEXT, draft_schema TEXT,
			draft_ui_schema TEXT, settings TEXT, created_by TEXT, updated_by TEXT,
			created_at DATETIME, updated_at DATETIME, deleted_at DATETIME
		)`,
		`CREATE TABLE entity_schema_versions (
			id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, definition_id TEXT NOT NULL,
			version INTEGER NOT NULL, json_schema TEXT NOT NULL, ui_schema TEXT,
			change_set TEXT, checksum TEXT, published_by TEXT, published_at DATETIME
		)`,
		`CREATE TABLE entity_schema_fields (
			id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, definition_id TEXT NOT NULL,
			schema_version INTEGER NOT NULL, schema_checksum TEXT NOT NULL, field_key TEXT NOT NULL,
			field_type TEXT NOT NULL, position INTEGER NOT NULL, required BOOLEAN NOT NULL,
			searchable BOOLEAN NOT NULL, indexed BOOLEAN NOT NULL, classification TEXT NOT NULL,
			read_roles TEXT NOT NULL, write_roles TEXT NOT NULL, config TEXT NOT NULL,
			created_at DATETIME
		)`,
		`CREATE TABLE entity_relations (
			id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, source_definition_id TEXT NOT NULL,
			source_field_key TEXT NOT NULL, target_definition_id TEXT NOT NULL,
			cardinality TEXT NOT NULL, on_delete TEXT NOT NULL, label_ar TEXT, label_en TEXT,
			required BOOLEAN, created_at DATETIME, updated_at DATETIME
		)`,
		`CREATE TABLE entity_record_relations (
			id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, relation_id TEXT NOT NULL,
			source_record_id TEXT NOT NULL, target_record_id TEXT NOT NULL, created_at DATETIME
		)`,
		`CREATE TABLE entities (
			id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT,
			definition_id TEXT, schema_version INTEGER NOT NULL DEFAULT 0,
			record_version INTEGER NOT NULL DEFAULT 1, display_value TEXT,
			created_by TEXT, updated_by TEXT, entity_type TEXT NOT NULL, data TEXT NOT NULL,
			created_at DATETIME, updated_at DATETIME, deleted_at DATETIME
		)`,
		`CREATE TABLE crm_quote_invoice_conversions (
			id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, idempotency_key TEXT NOT NULL,
			request_hash TEXT NOT NULL DEFAULT '',
			opportunity_id TEXT NOT NULL, quote_id TEXT NOT NULL, invoice_id TEXT NOT NULL,
			created_by TEXT, created_at DATETIME,
			UNIQUE(workspace_id, idempotency_key)
		)`,
		`CREATE TABLE audit_logs (
			id TEXT PRIMARY KEY, workspace_id TEXT, user_id TEXT, action TEXT NOT NULL,
			entity_type TEXT, entity_id TEXT, details TEXT, ip_address TEXT, created_at DATETIME
		)`,
		`CREATE TABLE outbox_events (
			id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, subject TEXT NOT NULL,
			event_type TEXT NOT NULL, aggregate_type TEXT NOT NULL, aggregate_id TEXT NOT NULL,
			payload TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL,
			available_at DATETIME NOT NULL, published_at DATETIME, last_error TEXT,
			created_at DATETIME, updated_at DATETIME
		)`,
	}
	for _, statement := range statements {
		if err := db.Exec(statement).Error; err != nil {
			t.Fatal(err)
		}
	}
	return db
}

func seedCRMOpportunity(t *testing.T, db *gorm.DB, workspaceID uuid.UUID) models.Entity {
	t.Helper()
	if err := services.EnsureSystemCRMDefinitions(db, workspaceID, nil); err != nil {
		t.Fatal(err)
	}
	account, err := services.CreateDynamicRecordAs(db, workspaceID, services.PrincipalForSystem("test"), "crm_account", map[string]interface{}{
		"name": "Acme", "email": "sales@example.test", "status": "prospect",
	})
	if err != nil {
		t.Fatal(err)
	}
	opportunity, err := services.CreateDynamicRecordAs(db, workspaceID, services.PrincipalForSystem("crm_opportunity_command"), "crm_opportunity", map[string]interface{}{
		"title": "Acme implementation", "account": account.ID.String(), "stage": "proposal", "value": float64(100), "currency": "SAR",
	})
	if err != nil {
		t.Fatal(err)
	}
	db.Exec("DELETE FROM audit_logs")
	db.Exec("DELETE FROM outbox_events")
	return opportunity
}

func validCRMConversionRequest(opportunity models.Entity) convertCRMQuoteRequest {
	taxRate := 0.15
	return convertCRMQuoteRequest{
		OpportunityID: opportunity.ID.String(), QuoteNumber: "QT-TEST-001", ValidUntil: "2026-09-01",
		Currency: "SAR", TaxRate: &taxRate,
		Items: []crmQuoteLineRequest{{ID: "line-1", Description: "Implementation", Quantity: 2, UnitPrice: 100}},
		Notes: "Test quote",
	}
}

func TestConvertCRMQuoteIsAtomicAndIdempotent(t *testing.T) {
	db := setupCRMTestDB(t)
	workspaceID := uuid.New()
	actorID := uuid.New()
	opportunity := seedCRMOpportunity(t, db, workspaceID)
	req := validCRMConversionRequest(opportunity)

	first, err := convertCRMQuoteInTransaction(db, workspaceID, &actorID, "conversion-key-001", req, "127.0.0.1")
	if err != nil {
		t.Fatalf("first conversion: %v", err)
	}
	if first.Replayed {
		t.Fatal("first conversion must not be marked as replayed")
	}
	var invoiceData map[string]interface{}
	if err := json.Unmarshal(first.Invoice.Data, &invoiceData); err != nil {
		t.Fatal(err)
	}
	if got := invoiceData["total"]; got != float64(230) {
		t.Fatalf("expected server-calculated total 230, got %#v", got)
	}

	second, err := convertCRMQuoteInTransaction(db, workspaceID, &actorID, "conversion-key-001", req, "127.0.0.1")
	if err != nil {
		t.Fatalf("idempotent replay: %v", err)
	}
	if !second.Replayed || second.Invoice.ID != first.Invoice.ID || second.Quote.ID != first.Quote.ID {
		t.Fatal("replay did not return the original quote and invoice")
	}
	mismatched := req
	mismatched.Notes = "A different financial request"
	if _, err := convertCRMQuoteInTransaction(db, workspaceID, &actorID, "conversion-key-001", mismatched, "127.0.0.1"); err == nil {
		t.Fatal("same idempotency key accepted a different request payload")
	} else if domainErr, ok := err.(*crmDomainError); !ok || domainErr.Code != "CRM_IDEMPOTENCY_PAYLOAD_MISMATCH" {
		t.Fatalf("expected idempotency payload mismatch, got %v", err)
	}

	var entityCount, auditCount, outboxCount, conversionCount int64
	db.Model(&models.Entity{}).Count(&entityCount)
	db.Model(&models.AuditLog{}).Count(&auditCount)
	db.Model(&models.OutboxEvent{}).Count(&outboxCount)
	db.Model(&models.CRMQuoteInvoiceConversion{}).Count(&conversionCount)
	if entityCount != 5 || auditCount != 5 || outboxCount != 9 || conversionCount != 1 {
		t.Fatalf("unexpected committed counts entities=%d audit=%d outbox=%d conversions=%d", entityCount, auditCount, outboxCount, conversionCount)
	}

	var updatedOpportunity models.Entity
	if err := db.First(&updatedOpportunity, "id = ?", opportunity.ID).Error; err != nil {
		t.Fatal(err)
	}
	var opportunityData map[string]interface{}
	_ = json.Unmarshal(updatedOpportunity.Data, &opportunityData)
	if opportunityData["stage"] != crmClosedWonStage {
		t.Fatalf("opportunity was not closed atomically: %#v", opportunityData)
	}
}

func TestConvertCRMQuoteRejectsSecondBusinessConversion(t *testing.T) {
	db := setupCRMTestDB(t)
	workspaceID := uuid.New()
	opportunity := seedCRMOpportunity(t, db, workspaceID)
	req := validCRMConversionRequest(opportunity)
	if _, err := convertCRMQuoteInTransaction(db, workspaceID, nil, "conversion-key-001", req, ""); err != nil {
		t.Fatal(err)
	}
	_, err := convertCRMQuoteInTransaction(db, workspaceID, nil, "conversion-key-002", req, "")
	domainErr, ok := err.(*crmDomainError)
	if !ok || domainErr.Code != "CRM_OPPORTUNITY_ALREADY_WON" {
		t.Fatalf("expected already-converted conflict, got %v", err)
	}
}

func TestValidateCRMConversionRejectsInvalidMoney(t *testing.T) {
	opportunity := models.Entity{ID: uuid.New()}
	req := validCRMConversionRequest(opportunity)
	req.Items[0].Quantity = 0
	if _, err := validateCRMConversionRequest(req); err == nil || err.Code != "CRM_INVALID_QUOTE_LINE" {
		t.Fatalf("expected invalid quote line, got %v", err)
	}
}

func TestValidateCRMConversionRequiresExplicitFinancialTerms(t *testing.T) {
	opportunity := models.Entity{ID: uuid.New()}
	for name, mutate := range map[string]func(*convertCRMQuoteRequest){
		"currency":    func(req *convertCRMQuoteRequest) { req.Currency = "" },
		"tax_rate":    func(req *convertCRMQuoteRequest) { req.TaxRate = nil },
		"valid_until": func(req *convertCRMQuoteRequest) { req.ValidUntil = "" },
	} {
		t.Run(name, func(t *testing.T) {
			req := validCRMConversionRequest(opportunity)
			mutate(&req)
			if _, err := validateCRMConversionRequest(req); err == nil {
				t.Fatalf("expected %s to be required", name)
			}
		})
	}
}

func TestConvertCRMQuoteRequiresQuotableStageAndUniqueNumber(t *testing.T) {
	db := setupCRMTestDB(t)
	workspaceID := uuid.New()
	firstOpportunity := seedCRMOpportunity(t, db, workspaceID)
	firstReq := validCRMConversionRequest(firstOpportunity)
	if _, err := convertCRMQuoteInTransaction(db, workspaceID, nil, "conversion-key-001", firstReq, ""); err != nil {
		t.Fatal(err)
	}

	firstData := entityData(firstOpportunity)
	secondOpportunity, err := services.CreateDynamicRecordAs(db, workspaceID, services.PrincipalForSystem("crm_opportunity_command"), "crm_opportunity", map[string]interface{}{
		"title": "Second proposal", "account": firstData["account"], "stage": "proposal", "value": 100, "currency": "SAR",
	})
	if err != nil {
		t.Fatal(err)
	}
	duplicate := validCRMConversionRequest(secondOpportunity)
	duplicate.QuoteNumber = firstReq.QuoteNumber
	if _, err := convertCRMQuoteInTransaction(db, workspaceID, nil, "conversion-key-002", duplicate, ""); err == nil {
		t.Fatal("duplicate quote number was accepted")
	} else if domainErr, ok := err.(*crmDomainError); !ok || domainErr.Code != "CRM_QUOTE_NUMBER_EXISTS" {
		t.Fatalf("expected quote number conflict, got %v", err)
	}

	thirdOpportunity, err := services.CreateDynamicRecordAs(db, workspaceID, services.PrincipalForSystem("crm_opportunity_command"), "crm_opportunity", map[string]interface{}{
		"title": "Unqualified opportunity", "account": firstData["account"], "stage": "new", "value": 100, "currency": "SAR",
	})
	if err != nil {
		t.Fatal(err)
	}
	notQuotable := validCRMConversionRequest(thirdOpportunity)
	notQuotable.QuoteNumber = "QT-NOT-READY"
	if _, err := convertCRMQuoteInTransaction(db, workspaceID, nil, "conversion-key-003", notQuotable, ""); err == nil {
		t.Fatal("new opportunity was converted directly to an invoice")
	} else if domainErr, ok := err.(*crmDomainError); !ok || domainErr.Code != "CRM_OPPORTUNITY_NOT_QUOTABLE" {
		t.Fatalf("expected not-quotable conflict, got %v", err)
	}
}

func TestMoveCRMStageUsesVersionAuditAndOutbox(t *testing.T) {
	db := setupCRMTestDB(t)
	workspaceID := uuid.New()
	actorID := uuid.New()
	opportunity := seedCRMOpportunity(t, db, workspaceID)

	updated, err := moveCRMStageInTransaction(
		db, workspaceID, &actorID, opportunity.ID, "negotiation", 1, "127.0.0.1",
	)
	if err != nil {
		t.Fatal(err)
	}
	if updated.RecordVersion != 2 {
		t.Fatalf("expected record version 2, got %d", updated.RecordVersion)
	}
	var data map[string]interface{}
	_ = json.Unmarshal(updated.Data, &data)
	if data["stage"] != "negotiation" {
		t.Fatalf("canonical stage was not updated: %#v", data)
	}
	var audits, outbox int64
	db.Model(&models.AuditLog{}).Count(&audits)
	db.Model(&models.OutboxEvent{}).Count(&outbox)
	if audits != 2 || outbox != 3 {
		t.Fatalf("expected schema and domain audit/outbox events, got audit=%d outbox=%d", audits, outbox)
	}
}

func TestMoveCRMStageRejectsStaleVersionAndInvalidTransition(t *testing.T) {
	db := setupCRMTestDB(t)
	workspaceID := uuid.New()
	opportunity := seedCRMOpportunity(t, db, workspaceID)

	_, err := moveCRMStageInTransaction(db, workspaceID, nil, opportunity.ID, "negotiation", 2, "")
	if domainErr, ok := err.(*crmDomainError); !ok || domainErr.Code != "CRM_RECORD_VERSION_CONFLICT" {
		t.Fatalf("expected version conflict, got %v", err)
	}

	var raw map[string]interface{}
	_ = json.Unmarshal(opportunity.Data, &raw)
	raw["stage"] = "new"
	encoded, _ := json.Marshal(raw)
	if err := db.Model(&models.Entity{}).Where("id = ?", opportunity.ID).Update("data", datatypes.JSON(encoded)).Error; err != nil {
		t.Fatal(err)
	}
	_, err = moveCRMStageInTransaction(db, workspaceID, nil, opportunity.ID, "closed_won", 1, "")
	if domainErr, ok := err.(*crmDomainError); !ok || domainErr.Code != "CRM_STAGE_TRANSITION_NOT_ALLOWED" {
		t.Fatalf("expected invalid transition, got %v", err)
	}
}

func TestCRMCommandsCannotCrossWorkspaceBoundary(t *testing.T) {
	db := setupCRMTestDB(t)
	ownerWorkspace := uuid.New()
	attackerWorkspace := uuid.New()
	opportunity := seedCRMOpportunity(t, db, ownerWorkspace)
	if err := services.EnsureSystemCRMDefinitions(db, attackerWorkspace, nil); err != nil {
		t.Fatal(err)
	}

	_, err := moveCRMStageInTransaction(db, attackerWorkspace, nil, opportunity.ID, "negotiation", opportunity.RecordVersion, "")
	if domainErr, ok := err.(*crmDomainError); !ok || domainErr.Code != "CRM_OPPORTUNITY_NOT_FOUND" {
		t.Fatalf("cross-workspace stage command did not fail closed: %v", err)
	}
	req := validCRMConversionRequest(opportunity)
	_, err = convertCRMQuoteInTransaction(db, attackerWorkspace, nil, "cross-tenant-conversion", req, "")
	if domainErr, ok := err.(*crmDomainError); !ok || domainErr.Code != "CRM_OPPORTUNITY_NOT_FOUND" {
		t.Fatalf("cross-workspace quote conversion did not fail closed: %v", err)
	}
}
