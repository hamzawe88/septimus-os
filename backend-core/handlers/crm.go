package handlers

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"regexp"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
	"gorm.io/datatypes"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	crmClosedWonStage = "closed_won"
	maxCRMQuoteLines  = 100
)

var crmCurrencyCode = regexp.MustCompile(`^[A-Z]{3}$`)

type crmQuoteLineRequest struct {
	ID          string  `json:"id"`
	Description string  `json:"description"`
	Quantity    float64 `json:"quantity"`
	UnitPrice   float64 `json:"unitPrice"`
}

type convertCRMQuoteRequest struct {
	OpportunityID string                `json:"opportunity_id"`
	QuoteNumber   string                `json:"quote_number"`
	ValidUntil    string                `json:"valid_until"`
	Currency      string                `json:"currency"`
	TaxRate       *float64              `json:"tax_rate"`
	Items         []crmQuoteLineRequest `json:"items"`
	Notes         string                `json:"notes"`
}

type crmConversionResult struct {
	Quote       models.Entity `json:"quote"`
	Invoice     models.Entity `json:"invoice"`
	Opportunity models.Entity `json:"opportunity"`
	Replayed    bool          `json:"replayed"`
}

type moveCRMStageRequest struct {
	Stage           string `json:"stage"`
	ExpectedVersion int    `json:"expected_version"`
}

var crmStageTransitions = map[string]map[string]bool{
	"new":         {"contacted": true, "closed_lost": true},
	"contacted":   {"qualified": true, "proposal": true, "closed_lost": true},
	"qualified":   {"proposal": true, "negotiation": true, "closed_lost": true},
	"proposal":    {"negotiation": true, "closed_won": true, "closed_lost": true},
	"negotiation": {"proposal": true, "closed_won": true, "closed_lost": true},
	"closed_won":  {},
	"closed_lost": {},
}

var crmTicketStatusTransitions = map[string]map[string]bool{
	"open":        {"in_progress": true, "resolved": true, "closed": true},
	"in_progress": {"open": true, "resolved": true, "closed": true},
	"resolved":    {"in_progress": true, "closed": true},
	"closed":      {},
}

type crmDomainError struct {
	Status int
	Code   string
	Public string
}

func (e *crmDomainError) Error() string { return e.Public }

// ConvertCRMQuoteToInvoice is the transactional boundary between CRM and
// Finance. A retry with the same Idempotency-Key returns the original quote,
// invoice, and opportunity instead of creating duplicate financial documents.
func ConvertCRMQuoteToInvoice(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}

	idempotencyKey := strings.TrimSpace(c.Get("Idempotency-Key"))
	if len(idempotencyKey) < 8 || len(idempotencyKey) > 128 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Idempotency-Key must contain between 8 and 128 characters",
			"code":  "CRM_IDEMPOTENCY_KEY_REQUIRED",
		})
	}

	var req convertCRMQuoteRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	validated, validationErr := validateCRMConversionRequest(req)
	if validationErr != nil {
		return c.Status(validationErr.Status).JSON(fiber.Map{
			"error": validationErr.Public,
			"code":  validationErr.Code,
		})
	}

	result, err := convertCRMQuoteInTransaction(
		database.GetDB(c), workspaceID, currentUserUUID(c), idempotencyKey, validated, c.IP(),
	)
	if err != nil {
		var domainErr *crmDomainError
		if errors.As(err, &domainErr) {
			return c.Status(domainErr.Status).JSON(fiber.Map{
				"error": domainErr.Public,
				"code":  domainErr.Code,
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to convert quote to invoice",
			"code":  "CRM_QUOTE_CONVERSION_FAILED",
		})
	}

	status := fiber.StatusCreated
	if result.Replayed {
		status = fiber.StatusOK
	}
	return c.Status(status).JSON(result)
}

// MoveCRMOpportunityStage enforces the canonical pipeline and optimistic
// concurrency. Lifecycle changes never go through unrestricted JSONB merging.
func MoveCRMOpportunityStage(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	entityID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid opportunity ID"})
	}
	var req moveCRMStageRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	req.Stage = normalizeCRMStage(req.Stage)
	if _, valid := crmStageTransitions[req.Stage]; !valid {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid CRM stage", "code": "CRM_INVALID_STAGE",
		})
	}
	if req.ExpectedVersion < 1 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "expected_version is required", "code": "CRM_EXPECTED_VERSION_REQUIRED",
		})
	}

	updated, moveErr := moveCRMStageInTransaction(
		database.GetDB(c), workspaceID, currentUserUUID(c), entityID,
		req.Stage, req.ExpectedVersion, c.IP(),
	)
	if moveErr != nil {
		var domainErr *crmDomainError
		if errors.As(moveErr, &domainErr) {
			return c.Status(domainErr.Status).JSON(fiber.Map{"error": domainErr.Public, "code": domainErr.Code})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to move CRM stage", "code": "CRM_STAGE_MOVE_FAILED",
		})
	}
	// Fire the automation trigger AFTER the transaction commits, so a workflow
	// never observes a stage the database rolled back. The outbox event already
	// carries the change to external consumers; this is what lets users build
	// visual follow-up automations (send a quote, create a task, alert a channel)
	// on a stage move — the same pattern the HR lifecycle uses.
	go ExecuteWorkflowsByTrigger(workspaceID, "crm.opportunity.stage_changed", crmStageTriggerContext(updated, req.Stage, workspaceID))

	return c.JSON(fiber.Map{"entity": updated})
}

// crmStageTriggerContext is the payload CRM automations receive; keys match what
// send_chat / ai_agent / create-task nodes interpolate.
func crmStageTriggerContext(entity models.Entity, stage string, workspaceID uuid.UUID) map[string]interface{} {
	ctx := map[string]interface{}{
		"opportunity_id": entity.ID.String(),
		"title":          entity.DisplayValue,
		"stage":          stage,
		"record_version": entity.RecordVersion,
		"workspace_id":   workspaceID.String(),
	}
	var data map[string]interface{}
	if err := json.Unmarshal(entity.Data, &data); err == nil {
		for _, key := range []string{"value", "currency", "company", "source", "account"} {
			if v, ok := data[key]; ok {
				ctx[key] = v
			}
		}
	}
	return ctx
}

func moveCRMStageInTransaction(
	db *gorm.DB,
	workspaceID uuid.UUID,
	actorID *uuid.UUID,
	entityID uuid.UUID,
	targetStage string,
	expectedVersion int,
	ipAddress string,
) (models.Entity, error) {
	var output models.Entity
	err := db.Transaction(func(tx *gorm.DB) error {
		var entity models.Entity
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ? AND workspace_id = ? AND entity_type = ? AND definition_id IS NOT NULL", entityID, workspaceID, "crm_opportunity").
			First(&entity).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return &crmDomainError{fiber.StatusNotFound, "CRM_OPPORTUNITY_NOT_FOUND", "Opportunity not found"}
			}
			return err
		}
		if entity.RecordVersion != expectedVersion {
			return &crmDomainError{fiber.StatusConflict, "CRM_RECORD_VERSION_CONFLICT", "The opportunity was changed by another editor"}
		}
		data := map[string]interface{}{}
		if err := json.Unmarshal(entity.Data, &data); err != nil {
			return &crmDomainError{fiber.StatusUnprocessableEntity, "CRM_INVALID_LEAD_DATA", "Opportunity data is invalid"}
		}
		currentStage := normalizeCRMStage(firstCRMString(data, "stage", "status"))
		if currentStage == targetStage {
			output = entity
			return nil
		}
		if !crmStageTransitions[currentStage][targetStage] {
			return &crmDomainError{fiber.StatusConflict, "CRM_STAGE_TRANSITION_NOT_ALLOWED", fmt.Sprintf("Cannot move opportunity from %s to %s", currentStage, targetStage)}
		}

		now := time.Now().UTC()
		principal := services.PrincipalForSystem("crm_pipeline")
		if actorID != nil {
			principal = services.PrincipalForUser(*actorID, "")
			principal.Source = "crm_pipeline"
		}
		updated, updateErr := services.UpdateDynamicRecordAs(tx, workspaceID, principal, "crm_opportunity", entity.ID, expectedVersion, map[string]interface{}{"stage": targetStage})
		if errors.Is(updateErr, services.ErrRecordVersionConflict) {
			return &crmDomainError{fiber.StatusConflict, "CRM_RECORD_VERSION_CONFLICT", "The opportunity was changed by another editor"}
		}
		if updateErr != nil {
			return updateErr
		}
		entity = updated

		details, _ := json.Marshal(map[string]interface{}{"from": currentStage, "to": targetStage})
		if err := tx.Create(&models.AuditLog{
			ID: uuid.New(), WorkspaceID: &workspaceID, UserID: actorID,
			Action: "crm.opportunity.stage_changed", EntityType: "CRMOpportunity", EntityID: entity.ID.String(),
			Details: datatypes.JSON(details), IPAddress: ipAddress, CreatedAt: now,
		}).Error; err != nil {
			return err
		}
		if err := services.EnqueueOutbox(tx, workspaceID, "events.crm.opportunity.stage_changed", "crm.opportunity.stage_changed", "crm_opportunity", entity.ID, map[string]interface{}{
			"opportunity_id": entity.ID.String(), "from_stage": currentStage,
			"to_stage": targetStage, "record_version": entity.RecordVersion,
		}); err != nil {
			return err
		}
		output = entity

		// Auto-create PM Project if won
		if targetStage == "closed_won" {
			var count int64
			tx.Model(&models.Project{}).Where("workspace_id = ? AND name = ?", workspaceID, output.DisplayValue).Count(&count)
			if count == 0 {
				creatorID := uuid.Nil
				if actorID != nil {
					creatorID = *actorID
				}
				project := models.Project{
					ID:          uuid.New(),
					WorkspaceID: workspaceID,
					CreatedBy:   creatorID,
					Name:        output.DisplayValue,
					Settings:    datatypes.JSON([]byte("{}")),
				}
				if err := tx.Create(&project).Error; err == nil {
					// Update CRM opportunity with project_id
					updated2, updateErr2 := services.UpdateDynamicRecordAs(tx, workspaceID, principal, "crm_opportunity", entity.ID, output.RecordVersion, map[string]interface{}{"project_id": project.ID.String()})
					if updateErr2 == nil {
						output = updated2
					}
				}
			}

			// Auto-update Performance Goals
			var ownerIDStr string
			if v, ok := data["owner"].(string); ok {
				ownerIDStr = v
			} else if data["owner"] != nil {
				ownerIDStr = fmt.Sprintf("%v", data["owner"])
			}
			if ownerIDStr != "" {
				if ownerID, parseErr := uuid.Parse(ownerIDStr); parseErr == nil {
					var wonValue float64
					if v, ok := data["value"].(float64); ok {
						wonValue = v
					}
					if wonValue > 0 {
						tx.Model(&models.PerformanceGoal{}).
							Where("workspace_id = ? AND employee_id IN (SELECT id FROM employees WHERE user_id = ? AND workspace_id = ?) AND status = 'active' AND metric ILIKE '%sale%'", workspaceID, ownerID, workspaceID).
							UpdateColumn("current_value", gorm.Expr("current_value + ?", wonValue))
					}
				}
			}
		}

		return nil
	})
	return output, err
}

func validateCRMConversionRequest(req convertCRMQuoteRequest) (convertCRMQuoteRequest, *crmDomainError) {
	req.OpportunityID = strings.TrimSpace(req.OpportunityID)
	if _, err := uuid.Parse(req.OpportunityID); err != nil {
		return req, &crmDomainError{fiber.StatusBadRequest, "CRM_INVALID_OPPORTUNITY_ID", "A valid opportunity_id is required"}
	}
	req.QuoteNumber = strings.TrimSpace(req.QuoteNumber)
	if req.QuoteNumber == "" || len(req.QuoteNumber) > 64 {
		return req, &crmDomainError{fiber.StatusBadRequest, "CRM_INVALID_QUOTE_NUMBER", "quote_number is required and must not exceed 64 characters"}
	}
	if len(req.Items) == 0 || len(req.Items) > maxCRMQuoteLines {
		return req, &crmDomainError{fiber.StatusBadRequest, "CRM_INVALID_QUOTE_LINES", "A quote must contain between 1 and 100 line items"}
	}
	for index := range req.Items {
		item := &req.Items[index]
		item.Description = strings.TrimSpace(item.Description)
		if item.ID == "" {
			item.ID = uuid.NewString()
		}
		if item.Description == "" || len(item.Description) > 500 ||
			item.Quantity <= 0 || math.IsNaN(item.Quantity) || math.IsInf(item.Quantity, 0) ||
			item.UnitPrice < 0 || math.IsNaN(item.UnitPrice) || math.IsInf(item.UnitPrice, 0) {
			return req, &crmDomainError{fiber.StatusBadRequest, "CRM_INVALID_QUOTE_LINE", fmt.Sprintf("Invalid quote line at position %d", index+1)}
		}
	}
	if req.ValidUntil != "" {
		if _, err := time.Parse("2006-01-02", req.ValidUntil); err != nil {
			return req, &crmDomainError{fiber.StatusBadRequest, "CRM_INVALID_VALID_UNTIL", "valid_until must use YYYY-MM-DD"}
		}
	} else {
		return req, &crmDomainError{fiber.StatusBadRequest, "CRM_VALID_UNTIL_REQUIRED", "valid_until is required"}
	}
	req.Currency = strings.ToUpper(strings.TrimSpace(req.Currency))
	if req.Currency == "" {
		return req, &crmDomainError{fiber.StatusBadRequest, "CRM_CURRENCY_REQUIRED", "currency is required"}
	}
	if !crmCurrencyCode.MatchString(req.Currency) {
		return req, &crmDomainError{fiber.StatusBadRequest, "CRM_INVALID_CURRENCY", "currency must be a three-letter ISO code"}
	}
	if req.TaxRate == nil {
		return req, &crmDomainError{fiber.StatusBadRequest, "CRM_TAX_RATE_REQUIRED", "tax_rate is required"}
	}
	if math.IsNaN(*req.TaxRate) || math.IsInf(*req.TaxRate, 0) || *req.TaxRate < 0 || *req.TaxRate > 1 {
		return req, &crmDomainError{fiber.StatusBadRequest, "CRM_INVALID_TAX_RATE", "tax_rate must be between 0 and 1"}
	}
	req.Notes = strings.TrimSpace(req.Notes)
	if len(req.Notes) > 10_000 {
		return req, &crmDomainError{fiber.StatusBadRequest, "CRM_NOTES_TOO_LONG", "notes must not exceed 10000 characters"}
	}
	return req, nil
}

func convertCRMQuoteInTransaction(
	db *gorm.DB,
	workspaceID uuid.UUID,
	actorID *uuid.UUID,
	idempotencyKey string,
	req convertCRMQuoteRequest,
	ipAddress string,
) (crmConversionResult, error) {
	opportunityID, _ := uuid.Parse(req.OpportunityID)
	requestHash, hashErr := crmConversionRequestHash(req)
	if hashErr != nil {
		return crmConversionResult{}, hashErr
	}
	var output crmConversionResult

	err := db.Transaction(func(tx *gorm.DB) error {
		if existing, found, err := loadCRMConversion(tx, workspaceID, idempotencyKey, requestHash); err != nil {
			return err
		} else if found {
			output = existing
			return nil
		}

		var opportunity models.Entity
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ? AND workspace_id = ? AND entity_type = ? AND definition_id IS NOT NULL", opportunityID, workspaceID, "crm_opportunity").
			First(&opportunity).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return &crmDomainError{fiber.StatusNotFound, "CRM_OPPORTUNITY_NOT_FOUND", "Opportunity not found"}
			}
			return err
		}

		// A concurrent request may have completed while this transaction waited
		// for the opportunity lock. Re-check after acquiring the lock.
		if existing, found, err := loadCRMConversion(tx, workspaceID, idempotencyKey, requestHash); err != nil {
			return err
		} else if found {
			output = existing
			return nil
		}

		opportunityData := map[string]interface{}{}
		if err := json.Unmarshal(opportunity.Data, &opportunityData); err != nil {
			return &crmDomainError{fiber.StatusUnprocessableEntity, "CRM_INVALID_OPPORTUNITY_DATA", "Opportunity data is invalid"}
		}
		currentStage := normalizeCRMStage(firstCRMString(opportunityData, "stage"))
		if currentStage == crmClosedWonStage {
			return &crmDomainError{fiber.StatusConflict, "CRM_OPPORTUNITY_ALREADY_WON", "This opportunity is already closed won"}
		}
		if currentStage != "proposal" && currentStage != "negotiation" {
			return &crmDomainError{fiber.StatusConflict, "CRM_OPPORTUNITY_NOT_QUOTABLE", "An opportunity must be in proposal or negotiation before conversion"}
		}

		subtotalCents, taxCents, totalCents, calcErr := calculateCRMQuote(req.Items, *req.TaxRate)
		if calcErr != nil {
			return calcErr
		}
		now := time.Now().UTC()
		invoiceNumber := fmt.Sprintf("INV-%s-%s", now.Format("2006"), strings.ToUpper(uuid.NewString()[:8]))
		company := firstCRMString(opportunityData, "title")
		contact := ""
		email := ""
		if accountID, parseErr := uuid.Parse(firstCRMString(opportunityData, "account")); parseErr == nil {
			if account, getErr := services.GetDynamicRecord(tx, workspaceID, "crm_account", accountID); getErr == nil {
				accountData := map[string]interface{}{}
				_ = json.Unmarshal(account.Data, &accountData)
				company = firstCRMString(accountData, "name")
				email = firstCRMString(accountData, "email")
			}
		}
		if contactID, parseErr := uuid.Parse(firstCRMString(opportunityData, "primary_contact")); parseErr == nil {
			if contactRecord, getErr := services.GetDynamicRecord(tx, workspaceID, "crm_contact", contactID); getErr == nil {
				contactData := map[string]interface{}{}
				_ = json.Unmarshal(contactRecord.Data, &contactData)
				contact = firstCRMString(contactData, "full_name")
				if email == "" {
					email = firstCRMString(contactData, "email")
				}
			}
		}

		lineItems := make([]map[string]interface{}, 0, len(req.Items))
		for _, item := range req.Items {
			lineItems = append(lineItems, map[string]interface{}{
				"id": item.ID, "description": item.Description,
				"quantity": item.Quantity, "unitPrice": money2(item.UnitPrice),
			})
		}

		principal := services.PrincipalForSystem("crm_quote_conversion")
		if actorID != nil {
			principal = services.PrincipalForUser(*actorID, "")
			principal.Source = "crm_quote_conversion"
		}
		if existingQuotes, queryErr := services.QueryDynamicRecordsAs(tx, workspaceID, principal, "crm_quote", services.RecordQueryRequest{
			Limit: 1, Filter: &services.RecordFilter{Field: "quote_number", Op: "eq", Value: req.QuoteNumber},
		}); queryErr != nil {
			return queryErr
		} else if len(existingQuotes.Data) > 0 {
			return &crmDomainError{fiber.StatusConflict, "CRM_QUOTE_NUMBER_EXISTS", "quote_number already exists in this workspace"}
		}
		quoteData := map[string]interface{}{
			"quote_number": req.QuoteNumber, "opportunity": opportunity.ID.String(), "status": "converted",
			"valid_until": req.ValidUntil, "currency": req.Currency,
			"subtotal": centsToMoney(subtotalCents), "tax_rate": *req.TaxRate * 100,
			"total_tax": centsToMoney(taxCents), "total": centsToMoney(totalCents), "notes": req.Notes,
		}
		quote, err := services.CreateDynamicRecordAs(tx, workspaceID, principal, "crm_quote", quoteData)
		if err != nil {
			return crmQuoteNumberError(err)
		}
		for _, item := range req.Items {
			if _, err := services.CreateDynamicRecordAs(tx, workspaceID, principal, "crm_quote_line", map[string]interface{}{
				"quote": quote.ID.String(), "description": item.Description, "quantity": item.Quantity,
				"unit_price": money2(item.UnitPrice), "tax_rate": *req.TaxRate * 100,
			}); err != nil {
				return err
			}
		}

		invoiceData := map[string]interface{}{
			"invoiceNumber": invoiceNumber, "invoice_number": invoiceNumber,
			"quoteId": quote.ID.String(), "quoteNumber": req.QuoteNumber,
			"crmOpportunityId": opportunity.ID.String(), "clientName": company, "clientContact": contact, "clientEmail": email,
			"lineItems": lineItems, "items": lineItems,
			"subtotal": centsToMoney(subtotalCents), "totalDiscount": 0,
			"totalTax": centsToMoney(taxCents), "vat_amount": centsToMoney(taxCents),
			"total": centsToMoney(totalCents), "amount": centsToMoney(totalCents),
			"taxRate": *req.TaxRate, "currency": req.Currency, "status": "issued",
			"issueDate": now.Format("2006-01-02"), "issue_date": now.Format("2006-01-02"),
			"dueDate": req.ValidUntil, "due_date": req.ValidUntil, "notes": req.Notes,
		}
		invoice, err := createCRMEntity(tx, workspaceID, actorID, "finance_invoice", invoiceNumber, invoiceData)
		if err != nil {
			return err
		}

		quote, err = services.UpdateDynamicRecordAs(tx, workspaceID, principal, "crm_quote", quote.ID, quote.RecordVersion, map[string]interface{}{"invoice_id": invoice.ID.String()})
		if err != nil {
			return err
		}
		opportunity, err = services.UpdateDynamicRecordAs(tx, workspaceID, principal, "crm_opportunity", opportunity.ID, opportunity.RecordVersion, map[string]interface{}{
			"stage": crmClosedWonStage, "value": centsToMoney(totalCents),
		})
		if err != nil {
			return err
		}

		conversion := models.CRMQuoteInvoiceConversion{
			ID: uuid.New(), WorkspaceID: workspaceID, IdempotencyKey: idempotencyKey,
			RequestHash:   requestHash,
			OpportunityID: opportunity.ID, QuoteID: quote.ID, InvoiceID: invoice.ID, CreatedBy: actorID, CreatedAt: now,
		}
		if err := tx.Create(&conversion).Error; err != nil {
			return err
		}

		auditDetails, _ := json.Marshal(map[string]interface{}{
			"quote_id": quote.ID, "invoice_id": invoice.ID, "invoice_number": invoiceNumber,
			"total": centsToMoney(totalCents), "currency": req.Currency,
		})
		if err := tx.Create(&models.AuditLog{
			ID: uuid.New(), WorkspaceID: &workspaceID, UserID: actorID,
			Action: "crm.quote.convert_to_invoice", EntityType: "CRMQuote", EntityID: quote.ID.String(),
			Details: datatypes.JSON(auditDetails), IPAddress: ipAddress, CreatedAt: now,
		}).Error; err != nil {
			return err
		}
		if err := services.EnqueueOutbox(tx, workspaceID, "events.crm.quote.converted", "crm.quote.converted", "crm_quote", quote.ID, map[string]interface{}{
			"quote_id": quote.ID.String(), "invoice_id": invoice.ID.String(), "opportunity_id": opportunity.ID.String(),
			"invoice_number": invoiceNumber, "total": centsToMoney(totalCents), "currency": req.Currency,
		}); err != nil {
			return err
		}

		output = crmConversionResult{Quote: quote, Invoice: invoice, Opportunity: opportunity}
		return nil
	})
	return output, err
}

func calculateCRMQuote(items []crmQuoteLineRequest, taxRate float64) (int64, int64, int64, error) {
	var subtotal int64
	for _, item := range items {
		lineCents := int64(math.Round(item.Quantity * item.UnitPrice * 100))
		if lineCents < 0 || subtotal > math.MaxInt64-lineCents {
			return 0, 0, 0, &crmDomainError{fiber.StatusBadRequest, "CRM_QUOTE_TOTAL_TOO_LARGE", "Quote total is too large"}
		}
		subtotal += lineCents
	}
	tax := int64(math.Round(float64(subtotal) * taxRate))
	if subtotal > math.MaxInt64-tax {
		return 0, 0, 0, &crmDomainError{fiber.StatusBadRequest, "CRM_QUOTE_TOTAL_TOO_LARGE", "Quote total is too large"}
	}
	return subtotal, tax, subtotal + tax, nil
}

func createCRMEntity(tx *gorm.DB, workspaceID uuid.UUID, actorID *uuid.UUID, entityType, displayValue string, data map[string]interface{}) (models.Entity, error) {
	raw, err := json.Marshal(data)
	if err != nil {
		return models.Entity{}, err
	}
	entity := models.Entity{
		ID: uuid.New(), WorkspaceID: workspaceID, EntityType: entityType,
		Data: datatypes.JSON(raw), DisplayValue: displayValue,
		RecordVersion: 1, CreatedBy: actorID, UpdatedBy: actorID,
	}
	if err := tx.Create(&entity).Error; err != nil {
		return models.Entity{}, err
	}
	return entity, nil
}

func loadCRMConversion(tx *gorm.DB, workspaceID uuid.UUID, key, requestHash string) (crmConversionResult, bool, error) {
	var conversion models.CRMQuoteInvoiceConversion
	if err := tx.Where("workspace_id = ? AND idempotency_key = ?", workspaceID, key).First(&conversion).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return crmConversionResult{}, false, nil
		}
		return crmConversionResult{}, false, err
	}
	if conversion.RequestHash == "" {
		// Compatibility for rows created before request hashes were introduced:
		// the first post-upgrade replay anchors the immutable payload fingerprint.
		if err := tx.Model(&models.CRMQuoteInvoiceConversion{}).
			Where("id = ? AND request_hash = ''", conversion.ID).
			Update("request_hash", requestHash).Error; err != nil {
			return crmConversionResult{}, false, err
		}
		conversion.RequestHash = requestHash
	}
	if conversion.RequestHash != requestHash {
		return crmConversionResult{}, false, &crmDomainError{
			fiber.StatusConflict, "CRM_IDEMPOTENCY_PAYLOAD_MISMATCH",
			"Idempotency-Key was already used with a different conversion payload",
		}
	}
	var quote, invoice, opportunity models.Entity
	for id, target := range map[uuid.UUID]*models.Entity{
		conversion.QuoteID: &quote, conversion.InvoiceID: &invoice, conversion.OpportunityID: &opportunity,
	} {
		if err := tx.Where("id = ? AND workspace_id = ?", id, workspaceID).First(target).Error; err != nil {
			return crmConversionResult{}, false, err
		}
	}
	return crmConversionResult{Quote: quote, Invoice: invoice, Opportunity: opportunity, Replayed: true}, true, nil
}

func crmConversionRequestHash(req convertCRMQuoteRequest) (string, error) {
	if req.TaxRate == nil {
		return "", &crmDomainError{fiber.StatusBadRequest, "CRM_TAX_RATE_REQUIRED", "tax_rate is required"}
	}
	// Client-generated line ids are deliberately excluded: they do not affect
	// financial meaning and must not make semantically identical retries differ.
	type hashLine struct {
		Description string  `json:"description"`
		Quantity    float64 `json:"quantity"`
		UnitPrice   float64 `json:"unit_price"`
	}
	type hashPayload struct {
		OpportunityID string     `json:"opportunity_id"`
		QuoteNumber   string     `json:"quote_number"`
		ValidUntil    string     `json:"valid_until"`
		Currency      string     `json:"currency"`
		TaxRate       float64    `json:"tax_rate"`
		Items         []hashLine `json:"items"`
		Notes         string     `json:"notes"`
	}
	items := make([]hashLine, 0, len(req.Items))
	for _, item := range req.Items {
		items = append(items, hashLine{Description: item.Description, Quantity: item.Quantity, UnitPrice: item.UnitPrice})
	}
	payload := hashPayload{
		OpportunityID: req.OpportunityID, QuoteNumber: req.QuoteNumber, ValidUntil: req.ValidUntil,
		Currency: req.Currency, TaxRate: *req.TaxRate, Items: items, Notes: req.Notes,
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", sha256.Sum256(raw)), nil
}

func firstCRMString(data map[string]interface{}, keys ...string) string {
	for _, key := range keys {
		if value, ok := data[key].(string); ok && strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func normalizeCRMStage(value string) string {
	stage := strings.ToLower(strings.TrimSpace(value))
	switch stage {
	case "quote_sent":
		return "proposal"
	case "won":
		return "closed_won"
	case "lost":
		return "closed_lost"
	case "":
		return "new"
	default:
		return stage
	}
}

func money2(value float64) float64     { return math.Round(value*100) / 100 }
func centsToMoney(value int64) float64 { return float64(value) / 100 }

func crmQuoteNumberError(err error) error {
	if err == nil {
		return nil
	}
	message := strings.ToLower(err.Error())
	if strings.Contains(message, "idx_crm_quote_number_unique") ||
		(strings.Contains(message, "duplicate key") && strings.Contains(message, "quote")) ||
		(strings.Contains(message, "unique constraint") && strings.Contains(message, "quote")) {
		return &crmDomainError{fiber.StatusConflict, "CRM_QUOTE_NUMBER_EXISTS", "quote_number already exists in this workspace"}
	}
	return err
}
