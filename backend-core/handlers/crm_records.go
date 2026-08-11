package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
	"gorm.io/gorm"
)

type createCRMOpportunityRequest struct {
	Title       string  `json:"title"`
	Company     string  `json:"company"`
	ContactName string  `json:"contact_name"`
	Email       string  `json:"email"`
	Phone       string  `json:"phone"`
	Value       float64 `json:"value"`
	Currency    string  `json:"currency"`
	Stage       string  `json:"stage"`
	Source      string  `json:"source"`
	Description string  `json:"description"`
}

type createCRMAccountRequest struct {
	Name        string `json:"name"`
	ContactName string `json:"contact_name"`
	Email       string `json:"email"`
	Phone       string `json:"phone"`
	Website     string `json:"website"`
	Industry    string `json:"industry"`
	Status      string `json:"status"`
}

type createCRMTicketRequest struct {
	Subject       string `json:"subject"`
	CustomerName  string `json:"customer_name"`
	AccountID     string `json:"account_id"`
	ContactID     string `json:"contact_id"`
	OpportunityID string `json:"opportunity_id"`
	Priority      string `json:"priority"`
	Channel       string `json:"channel"`
	Assignee      string `json:"assignee"`
	AssignedTeam  string `json:"assigned_team"`
	Description   string `json:"description"`
}

type crmDashboardMonthlyRevenue struct {
	Month   string  `json:"month"`
	Revenue float64 `json:"revenue"`
}

func GetCRMDashboard(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	now := time.Now().UTC()
	period := strings.ToLower(strings.TrimSpace(c.Query("period", "this_month")))
	var start time.Time
	switch period {
	case "this_month":
		start = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	case "this_quarter":
		quarterMonth := time.Month((int(now.Month())-1)/3*3 + 1)
		start = time.Date(now.Year(), quarterMonth, 1, 0, 0, 0, 0, time.UTC)
	case "this_year":
		start = time.Date(now.Year(), 1, 1, 0, 0, 0, 0, time.UTC)
	default:
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid CRM dashboard period"})
	}
	source := strings.ToLower(strings.TrimSpace(c.Query("source", "all")))
	allowedSources := map[string]bool{"all": true, "organic": true, "direct": true, "referral": true, "ads": true, "partner": true, "other": true}
	if !allowedSources[source] {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid CRM source filter"})
	}
	currency := strings.ToUpper(strings.TrimSpace(c.Query("currency")))
	if !crmCurrencyCode.MatchString(currency) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "currency must be a three-letter ISO code"})
	}

	db := database.GetDB(c)
	// Build a fresh GORM statement for every aggregate. Reusing one statement
	// across Select/Group/Order chains can leak clauses between queries (for
	// example, the recent-record ORDER BY into the grouped source aggregate).
	// PostgreSQL correctly rejects that leaked query because created_at is not
	// grouped, so keeping this as a factory is also a correctness boundary.
	opportunities := func() *gorm.DB {
		query := db.Table("entities").
			Where("workspace_id = ? AND entity_type = ? AND definition_id IS NOT NULL AND deleted_at IS NULL AND created_at >= ?", workspaceID, "crm_opportunity", start)
		if source != "all" {
			query = query.Where("LOWER(COALESCE(data->>'source', 'other')) = ?", source)
		}
		return query
	}
	var totals struct {
		Total   int64
		Won     int64
		Revenue float64
	}
	if err := opportunities().Select(`COUNT(*) AS total,
		COUNT(*) FILTER (WHERE data->>'stage' = 'closed_won') AS won,
		COALESCE(SUM(CASE WHEN data->>'stage' = 'closed_won' AND UPPER(COALESCE(data->>'currency', '')) = ?
			THEN (data->>'value')::numeric ELSE 0 END), 0) AS revenue`, currency).Scan(&totals).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to aggregate CRM opportunities"})
	}
	var openTickets int64
	if err := db.Table("entities").Where(
		"workspace_id = ? AND entity_type = ? AND definition_id IS NOT NULL AND deleted_at IS NULL AND created_at >= ? AND data->>'status' = ?",
		workspaceID, "crm_ticket", start, "open",
	).Count(&openTickets).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to aggregate CRM tickets"})
	}
	var sourceRows []struct {
		Source string
		Count  int64
	}
	if err := opportunities().Select("LOWER(COALESCE(data->>'source', 'other')) AS source, COUNT(*) AS count").
		Group("LOWER(COALESCE(data->>'source', 'other'))").Scan(&sourceRows).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to aggregate CRM sources"})
	}
	sources := map[string]int64{}
	for _, row := range sourceRows {
		sources[row.Source] = row.Count
	}
	trendStart := time.Date(now.Year(), now.Month()-5, 1, 0, 0, 0, 0, time.UTC)
	monthlyQuery := db.Table("entities").Where(
		"workspace_id = ? AND entity_type = ? AND definition_id IS NOT NULL AND deleted_at IS NULL AND updated_at >= ? AND data->>'stage' = ? AND UPPER(COALESCE(data->>'currency', '')) = ?",
		workspaceID, "crm_opportunity", trendStart, "closed_won", currency,
	)
	if source != "all" {
		monthlyQuery = monthlyQuery.Where("LOWER(COALESCE(data->>'source', 'other')) = ?", source)
	}
	var monthly []crmDashboardMonthlyRevenue
	if err := monthlyQuery.Select(`TO_CHAR(DATE_TRUNC('month', updated_at), 'YYYY-MM') AS month,
		COALESCE(SUM((data->>'value')::numeric), 0) AS revenue`).
		Group("DATE_TRUNC('month', updated_at)").Order("DATE_TRUNC('month', updated_at)").Scan(&monthly).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to aggregate CRM revenue trend"})
	}
	var recentRaw []models.Entity
	if err := opportunities().Order("created_at DESC, id DESC").Limit(5).Find(&recentRaw).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load recent CRM opportunities"})
	}
	recentIDs := make([]uuid.UUID, 0, len(recentRaw))
	for _, record := range recentRaw {
		recentIDs = append(recentIDs, record.ID)
	}
	principal := dynamicRecordPrincipal(c)
	recentRecords, err := services.GetDynamicRecordsByIDsAs(db, workspaceID, principal, "crm_opportunity", recentIDs)
	if err != nil {
		return dynamicRecordError(c, err)
	}
	accountIDs := make([]uuid.UUID, 0, len(recentIDs))
	for _, recordID := range recentIDs {
		if accountID, parseErr := uuid.Parse(fmt.Sprint(entityData(recentRecords[recordID])["account"])); parseErr == nil {
			accountIDs = append(accountIDs, accountID)
		}
	}
	accounts, err := services.GetDynamicRecordsByIDsAs(db, workspaceID, principal, "crm_account", accountIDs)
	if err != nil {
		return dynamicRecordError(c, err)
	}
	recent := make([]fiber.Map, 0, len(recentIDs))
	for _, recordID := range recentIDs {
		record, exists := recentRecords[recordID]
		if !exists {
			continue
		}
		data := entityData(record)
		recent = append(recent, fiber.Map{
			"id": record.ID, "display_value": record.DisplayValue, "record_version": record.RecordVersion,
			"data": data, "account": optionalCRMRecordFromMap(accounts, fmt.Sprint(data["account"])),
			"created_at": record.CreatedAt, "updated_at": record.UpdatedAt,
		})
	}
	conversionRate := float64(0)
	if totals.Total > 0 {
		conversionRate = math.Round(float64(totals.Won)/float64(totals.Total)*1000) / 10
	}
	return c.JSON(fiber.Map{
		"period": period, "source": source, "currency": currency,
		"stats":   fiber.Map{"total_opportunities": totals.Total, "open_tickets": openTickets, "won_opportunities": totals.Won, "conversion_rate": conversionRate, "revenue": totals.Revenue},
		"sources": sources, "monthly_revenue": monthly, "recent_opportunities": recent,
	})
}

func crmCommandPrincipal(c *fiber.Ctx, source string) services.RecordPrincipal {
	principal := dynamicRecordPrincipal(c)
	principal.Source = source
	return principal
}

func ListCRMOpportunities(c *fiber.Ctx) error {
	db, workspaceID, principal := database.GetDB(c), CurrentWorkspaceID(c), dynamicRecordPrincipal(c)
	result, err := services.QueryDynamicRecordsAs(db, workspaceID, principal, "crm_opportunity", services.RecordQueryRequest{Limit: c.QueryInt("limit", 100), Cursor: c.Query("cursor")})
	if err != nil {
		return dynamicRecordError(c, err)
	}
	accountIDs, contactIDs := make([]uuid.UUID, 0, len(result.Data)), make([]uuid.UUID, 0, len(result.Data))
	for _, opportunity := range result.Data {
		data := entityData(opportunity)
		if id, parseErr := uuid.Parse(fmt.Sprint(data["account"])); parseErr == nil {
			accountIDs = append(accountIDs, id)
		}
		if id, parseErr := uuid.Parse(fmt.Sprint(data["primary_contact"])); parseErr == nil {
			contactIDs = append(contactIDs, id)
		}
	}
	accounts, err := services.GetDynamicRecordsByIDsAs(db, workspaceID, principal, "crm_account", accountIDs)
	if err != nil {
		return dynamicRecordError(c, err)
	}
	contacts, err := services.GetDynamicRecordsByIDsAs(db, workspaceID, principal, "crm_contact", contactIDs)
	if err != nil {
		return dynamicRecordError(c, err)
	}
	views := make([]fiber.Map, 0, len(result.Data))
	for _, opportunity := range result.Data {
		data := entityData(opportunity)
		account := optionalCRMRecordFromMap(accounts, fmt.Sprint(data["account"]))
		contact := optionalCRMRecordFromMap(contacts, fmt.Sprint(data["primary_contact"]))
		views = append(views, fiber.Map{
			"id": opportunity.ID, "entity_type": opportunity.EntityType, "definition_id": opportunity.DefinitionID,
			"schema_version": opportunity.SchemaVersion, "record_version": opportunity.RecordVersion,
			"display_value": opportunity.DisplayValue, "data": data, "account": account, "contact": contact,
			"created_at": opportunity.CreatedAt, "updated_at": opportunity.UpdatedAt,
		})
	}
	return c.JSON(fiber.Map{"data": views, "next_cursor": result.NextCursor})
}

func ListCRMTickets(c *fiber.Ctx) error {
	request := services.RecordQueryRequest{Limit: c.QueryInt("limit", 30), Cursor: c.Query("cursor")}
	filters := []services.RecordFilter{}
	if query := strings.TrimSpace(c.Query("q")); query != "" {
		if len(query) > 200 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ticket search is too long"})
		}
		filters = append(filters, services.RecordFilter{Field: "subject", Op: "contains", Value: query})
	}
	if status := strings.ToLower(strings.TrimSpace(c.Query("status"))); status != "" && status != "all" {
		if status != "open" && status != "in_progress" && status != "resolved" && status != "closed" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid ticket status filter"})
		}
		filters = append(filters, services.RecordFilter{Field: "status", Op: "eq", Value: status})
	}
	if len(filters) == 1 {
		request.Filter = &filters[0]
	} else if len(filters) > 1 {
		request.Filter = &services.RecordFilter{And: filters}
	}
	result, err := services.QueryDynamicRecordsAs(database.GetDB(c), CurrentWorkspaceID(c), dynamicRecordPrincipal(c), "crm_ticket", request)
	if err != nil {
		return dynamicRecordError(c, err)
	}
	return c.JSON(result)
}

func listCRMRecords(c *fiber.Ctx, key string) error {
	limit := c.QueryInt("limit", 100)
	result, err := services.QueryDynamicRecordsAs(database.GetDB(c), CurrentWorkspaceID(c), dynamicRecordPrincipal(c), key, services.RecordQueryRequest{Limit: limit, Cursor: c.Query("cursor")})
	if err != nil {
		return dynamicRecordError(c, err)
	}
	return c.JSON(result)
}

func CreateCRMOpportunity(c *fiber.Ctx) error {
	var request createCRMOpportunityRequest
	if err := c.BodyParser(&request); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid opportunity body"})
	}
	request.Title = strings.TrimSpace(request.Title)
	request.Company = strings.TrimSpace(request.Company)
	if request.Title == "" || request.Company == "" || request.Value < 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "title, company, and a non-negative value are required"})
	}
	request.Stage = normalizeCRMStage(request.Stage)
	if request.Stage != "new" {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error": "new opportunities must enter the pipeline at the new stage",
			"code":  "CRM_INITIAL_STAGE_REQUIRED",
		})
	}
	request.Currency = strings.ToUpper(strings.TrimSpace(request.Currency))
	if request.Currency == "" {
		request.Currency = "SAR"
	}
	if !crmCurrencyCode.MatchString(request.Currency) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "currency must be a three-letter ISO code"})
	}
	principal := crmCommandPrincipal(c, "crm_opportunity_command")
	var account, contact, opportunity models.Entity
	err := database.GetDB(c).Transaction(func(tx *gorm.DB) error {
		var err error
		account, err = services.CreateDynamicRecordAs(tx, CurrentWorkspaceID(c), principal, "crm_account", cleanCRMData(map[string]interface{}{
			"name": request.Company, "email": request.Email, "phone": request.Phone, "status": "prospect",
		}))
		if err != nil {
			return err
		}
		if request.ContactName != "" || request.Email != "" || request.Phone != "" {
			contact, err = services.CreateDynamicRecordAs(tx, CurrentWorkspaceID(c), principal, "crm_contact", cleanCRMData(map[string]interface{}{
				"full_name": crmFirstNonEmpty(request.ContactName, request.Email, request.Company), "account": account.ID.String(),
				"email": request.Email, "phone": request.Phone, "source": normalizeCRMSourceValue(request.Source),
			}))
			if err != nil {
				return err
			}
		}
		opportunity, err = services.CreateDynamicRecordAs(tx, CurrentWorkspaceID(c), principal, "crm_opportunity", cleanCRMData(map[string]interface{}{
			"title": request.Title, "account": account.ID.String(), "primary_contact": optionalEntityID(contact),
			"stage": request.Stage, "value": request.Value, "currency": request.Currency,
			"source": normalizeCRMSourceValue(request.Source), "description": request.Description,
		}))
		return err
	})
	if err != nil {
		return dynamicRecordError(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"opportunity": opportunity, "account": account, "contact": contact})
}

func CreateCRMAccount(c *fiber.Ctx) error {
	var request createCRMAccountRequest
	if err := c.BodyParser(&request); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid CRM account body"})
	}
	request.Name = strings.TrimSpace(request.Name)
	request.Status = strings.ToLower(strings.TrimSpace(request.Status))
	if request.Name == "" || len(request.Name) > 300 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "account name is required and must not exceed 300 characters"})
	}
	if request.Status == "" {
		request.Status = "prospect"
	}
	if request.Status != "prospect" && request.Status != "active" && request.Status != "inactive" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid CRM account status"})
	}
	var account, contact models.Entity
	err := database.GetDB(c).Transaction(func(tx *gorm.DB) error {
		var createErr error
		account, createErr = services.CreateDynamicRecordAs(tx, CurrentWorkspaceID(c), crmCommandPrincipal(c, "crm_account_command"), "crm_account", cleanCRMData(map[string]interface{}{
			"name": request.Name, "email": strings.TrimSpace(request.Email), "phone": strings.TrimSpace(request.Phone),
			"website": strings.TrimSpace(request.Website), "industry": strings.TrimSpace(request.Industry), "status": request.Status,
		}))
		if createErr != nil {
			return createErr
		}
		if strings.TrimSpace(request.ContactName) == "" {
			return nil
		}
		contact, createErr = services.CreateDynamicRecordAs(tx, CurrentWorkspaceID(c), crmCommandPrincipal(c, "crm_contact_command"), "crm_contact", cleanCRMData(map[string]interface{}{
			"full_name": strings.TrimSpace(request.ContactName), "account": account.ID.String(),
			"email": strings.TrimSpace(request.Email), "phone": strings.TrimSpace(request.Phone), "consent_status": "unknown",
		}))
		return createErr
	})
	if err != nil {
		return dynamicRecordError(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"account": account, "contact": contact})
}

func CreateCRMQuote(c *fiber.Ctx) error {
	var request convertCRMQuoteRequest
	if err := c.BodyParser(&request); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid quote body"})
	}
	validated, validationErr := validateCRMConversionRequest(request)
	if validationErr != nil {
		return c.Status(validationErr.Status).JSON(fiber.Map{"error": validationErr.Public, "code": validationErr.Code})
	}
	opportunityID, _ := uuid.Parse(validated.OpportunityID)
	if _, err := services.GetDynamicRecordAs(database.GetDB(c), CurrentWorkspaceID(c), dynamicRecordPrincipal(c), "crm_opportunity", opportunityID); err != nil {
		return dynamicRecordError(c, err)
	}
	subtotalCents, taxCents, totalCents, err := calculateCRMQuote(validated.Items, *validated.TaxRate)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	principal := crmCommandPrincipal(c, "crm_quote_command")
	var quote models.Entity
	err = database.GetDB(c).Transaction(func(tx *gorm.DB) error {
		if existing, queryErr := services.QueryDynamicRecordsAs(tx, CurrentWorkspaceID(c), principal, "crm_quote", services.RecordQueryRequest{
			Limit: 1, Filter: &services.RecordFilter{Field: "quote_number", Op: "eq", Value: validated.QuoteNumber},
		}); queryErr != nil {
			return queryErr
		} else if len(existing.Data) > 0 {
			return &crmDomainError{fiber.StatusConflict, "CRM_QUOTE_NUMBER_EXISTS", "quote_number already exists in this workspace"}
		}
		var createErr error
		quote, createErr = services.CreateDynamicRecordAs(tx, CurrentWorkspaceID(c), principal, "crm_quote", map[string]interface{}{
			"quote_number": validated.QuoteNumber, "opportunity": opportunityID.String(), "status": "draft",
			"valid_until": validated.ValidUntil, "currency": validated.Currency,
			"subtotal": centsToMoney(subtotalCents), "tax_rate": *validated.TaxRate * 100,
			"total_tax": centsToMoney(taxCents), "total": centsToMoney(totalCents), "notes": validated.Notes,
		})
		if createErr != nil {
			return crmQuoteNumberError(createErr)
		}
		for _, item := range validated.Items {
			if _, createErr = services.CreateDynamicRecordAs(tx, CurrentWorkspaceID(c), principal, "crm_quote_line", map[string]interface{}{
				"quote": quote.ID.String(), "description": item.Description, "quantity": item.Quantity,
				"unit_price": money2(item.UnitPrice), "tax_rate": *validated.TaxRate * 100,
			}); createErr != nil {
				return createErr
			}
		}
		return nil
	})
	if err != nil {
		var domainErr *crmDomainError
		if errors.As(err, &domainErr) {
			return c.Status(domainErr.Status).JSON(fiber.Map{"error": domainErr.Public, "code": domainErr.Code})
		}
		return dynamicRecordError(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(quote)
}

func GetCRMCustomer360(c *fiber.Ctx) error {
	opportunityID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid opportunity id"})
	}
	db, workspaceID, principal := database.GetDB(c), CurrentWorkspaceID(c), dynamicRecordPrincipal(c)
	opportunity, err := services.GetDynamicRecordAs(db, workspaceID, principal, "crm_opportunity", opportunityID)
	if err != nil {
		return dynamicRecordError(c, err)
	}
	data := entityData(opportunity)
	account := getOptionalCRMRecord(db, workspaceID, principal, "crm_account", fmt.Sprint(data["account"]))
	contact := getOptionalCRMRecord(db, workspaceID, principal, "crm_contact", fmt.Sprint(data["primary_contact"]))
	activities, err := queryRelatedCRMRecords(db, workspaceID, principal, "crm_activity", "opportunity", opportunityID.String(), 100)
	if err != nil {
		return dynamicRecordError(c, err)
	}
	tickets, err := queryRelatedCRMRecords(db, workspaceID, principal, "crm_ticket", "opportunity", opportunityID.String(), 100)
	if err != nil {
		return dynamicRecordError(c, err)
	}
	quotes, err := queryRelatedCRMRecords(db, workspaceID, principal, "crm_quote", "opportunity", opportunityID.String(), 100)
	if err != nil {
		return dynamicRecordError(c, err)
	}
	return c.JSON(fiber.Map{
		"opportunity": opportunity, "account": account, "contact": contact,
		"activities": activities.Data, "tickets": tickets.Data, "quotes": quotes.Data,
	})
}

func CreateCRMActivity(c *fiber.Ctx) error {
	opportunityID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid opportunity id"})
	}
	if _, err := services.GetDynamicRecordAs(database.GetDB(c), CurrentWorkspaceID(c), dynamicRecordPrincipal(c), "crm_opportunity", opportunityID); err != nil {
		return dynamicRecordError(c, err)
	}
	var request struct {
		Subject      string `json:"subject"`
		ActivityType string `json:"activity_type"`
		Status       string `json:"status"`
		DueAt        string `json:"due_at"`
		Notes        string `json:"notes"`
	}
	if err := c.BodyParser(&request); err != nil || strings.TrimSpace(request.Subject) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "subject is required"})
	}
	if request.ActivityType == "" {
		request.ActivityType = "note"
	}
	if request.Status == "" {
		request.Status = "completed"
	}
	data := cleanCRMData(map[string]interface{}{
		"subject": strings.TrimSpace(request.Subject), "activity_type": request.ActivityType,
		"status": request.Status, "opportunity": opportunityID.String(), "due_at": request.DueAt,
		"completed_at": completedAtForStatus(request.Status), "owner": actorUUID(c).String(), "notes": request.Notes,
	})
	if actorUUID(c) == uuid.Nil {
		delete(data, "owner")
	}
	record, err := services.CreateDynamicRecordAs(database.GetDB(c), CurrentWorkspaceID(c), crmCommandPrincipal(c, "crm_activity_command"), "crm_activity", data)
	if err != nil {
		return dynamicRecordError(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(record)
}

func CreateCRMTicket(c *fiber.Ctx) error {
	var request createCRMTicketRequest
	if err := c.BodyParser(&request); err != nil || strings.TrimSpace(request.Subject) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "subject is required"})
	}
	priority := normalizeTicketPriorityValue(request.Priority)
	due := time.Now().UTC().Add(crmSLADuration(priority)).Format(time.RFC3339)
	for key, candidate := range map[string]string{
		"account_id": request.AccountID, "contact_id": request.ContactID, "opportunity_id": request.OpportunityID,
	} {
		definitionKey := map[string]string{"account_id": "crm_account", "contact_id": "crm_contact", "opportunity_id": "crm_opportunity"}[key]
		if strings.TrimSpace(candidate) != "" && validOptionalCRMRelation(database.GetDB(c), CurrentWorkspaceID(c), definitionKey, candidate) == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": key + " is not a valid workspace CRM record"})
		}
	}
	if strings.TrimSpace(request.Assignee) != "" && validWorkspaceUserValue(database.GetDB(c), CurrentWorkspaceID(c), request.Assignee) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "assignee is not a workspace member"})
	}
	data := cleanCRMData(map[string]interface{}{
		"subject": strings.TrimSpace(request.Subject), "customer_name": request.CustomerName,
		"account":     validOptionalCRMRelation(database.GetDB(c), CurrentWorkspaceID(c), "crm_account", request.AccountID),
		"contact":     validOptionalCRMRelation(database.GetDB(c), CurrentWorkspaceID(c), "crm_contact", request.ContactID),
		"opportunity": validOptionalCRMRelation(database.GetDB(c), CurrentWorkspaceID(c), "crm_opportunity", request.OpportunityID),
		"status":      "open", "priority": priority, "channel": normalizeTicketChannelValue(request.Channel),
		"assignee":      validWorkspaceUserValue(database.GetDB(c), CurrentWorkspaceID(c), request.Assignee),
		"assigned_team": request.AssignedTeam, "sla_due_at": due, "sla_status": "on_track",
		"escalation_level": 0, "description": request.Description,
	})
	record, err := services.CreateDynamicRecordAs(database.GetDB(c), CurrentWorkspaceID(c), crmCommandPrincipal(c, "crm_ticket_command"), "crm_ticket", data)
	if err != nil {
		return dynamicRecordError(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(record)
}

func UpdateCRMTicket(c *fiber.Ctx) error {
	ticketID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid ticket id"})
	}
	var request struct {
		ExpectedRecordVersion int    `json:"expected_record_version"`
		Subject               string `json:"subject"`
		CustomerName          string `json:"customer_name"`
		Description           string `json:"description"`
		Status                string `json:"status"`
		Priority              string `json:"priority"`
		Assignee              string `json:"assignee"`
		AssignedTeam          string `json:"assigned_team"`
		Escalate              bool   `json:"escalate"`
	}
	if err := c.BodyParser(&request); err != nil || request.ExpectedRecordVersion < 1 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "expected_record_version is required"})
	}
	current, getErr := services.GetDynamicRecordAs(database.GetDB(c), CurrentWorkspaceID(c), dynamicRecordPrincipal(c), "crm_ticket", ticketID)
	if getErr != nil {
		return dynamicRecordError(c, getErr)
	}
	if current.RecordVersion != request.ExpectedRecordVersion {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "record was changed by another editor", "code": "RECORD_VERSION_CONFLICT"})
	}
	currentData := entityData(current)
	updates := map[string]interface{}{}
	if strings.TrimSpace(request.Subject) != "" && strings.TrimSpace(request.Subject) != strings.TrimSpace(fmt.Sprint(currentData["subject"])) {
		updates["subject"] = strings.TrimSpace(request.Subject)
	}
	if strings.TrimSpace(request.CustomerName) != "" && strings.TrimSpace(request.CustomerName) != strings.TrimSpace(fmt.Sprint(currentData["customer_name"])) {
		updates["customer_name"] = strings.TrimSpace(request.CustomerName)
	}
	if request.Description != "" && request.Description != fmt.Sprint(currentData["description"]) {
		updates["description"] = request.Description
	}
	if request.Status != "" {
		status := normalizeTicketStatusValue(request.Status)
		currentStatus := normalizeTicketStatusValue(fmt.Sprint(currentData["status"]))
		if status != currentStatus {
			if !crmTicketStatusTransitions[currentStatus][status] {
				return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "ticket status transition is not allowed", "code": "CRM_TICKET_TRANSITION_NOT_ALLOWED"})
			}
			updates["status"] = status
			if status == "resolved" || status == "closed" {
				updates["sla_status"] = "resolved"
				updates["resolved_at"] = time.Now().UTC().Format(time.RFC3339)
			} else if currentStatus == "resolved" {
				priority := normalizeTicketPriorityValue(fmt.Sprint(currentData["priority"]))
				updates["resolved_at"] = nil
				updates["sla_status"] = "on_track"
				updates["sla_due_at"] = time.Now().UTC().Add(crmSLADuration(priority)).Format(time.RFC3339)
			}
		}
	}
	if request.Priority != "" {
		priority := normalizeTicketPriorityValue(request.Priority)
		if priority != normalizeTicketPriorityValue(fmt.Sprint(currentData["priority"])) {
			updates["priority"] = priority
			updates["sla_due_at"] = time.Now().UTC().Add(crmSLADuration(priority)).Format(time.RFC3339)
			updates["sla_status"] = "on_track"
		}
	}
	if request.Assignee != "" {
		assignee := validWorkspaceUserValue(database.GetDB(c), CurrentWorkspaceID(c), request.Assignee)
		if assignee == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "assignee is not a workspace member"})
		}
		updates["assignee"] = assignee
	}
	if request.AssignedTeam != "" && strings.TrimSpace(request.AssignedTeam) != strings.TrimSpace(fmt.Sprint(currentData["assigned_team"])) {
		updates["assigned_team"] = strings.TrimSpace(request.AssignedTeam)
	}
	if request.Escalate {
		updates["escalation_level"] = int(numberFromAny(currentData["escalation_level"])) + 1
	}
	if len(updates) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "no ticket changes supplied"})
	}
	record, err := services.UpdateDynamicRecordAs(database.GetDB(c), CurrentWorkspaceID(c), crmCommandPrincipal(c, "crm_ticket_command"), "crm_ticket", ticketID, request.ExpectedRecordVersion, updates)
	if err != nil {
		return dynamicRecordError(c, err)
	}
	return c.JSON(record)
}

func ListCRMTicketMessages(c *fiber.Ctx) error {
	ticketID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid ticket id"})
	}
	if _, err := services.GetDynamicRecordAs(database.GetDB(c), CurrentWorkspaceID(c), dynamicRecordPrincipal(c), "crm_ticket", ticketID); err != nil {
		return dynamicRecordError(c, err)
	}
	result, err := queryRelatedCRMRecords(database.GetDB(c), CurrentWorkspaceID(c), dynamicRecordPrincipal(c), "crm_ticket_message", "ticket", ticketID.String(), 100)
	if err != nil {
		return dynamicRecordError(c, err)
	}
	return c.JSON(result)
}

func CreateCRMTicketMessage(c *fiber.Ctx) error {
	ticketID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid ticket id"})
	}
	if _, err := services.GetDynamicRecordAs(database.GetDB(c), CurrentWorkspaceID(c), dynamicRecordPrincipal(c), "crm_ticket", ticketID); err != nil {
		return dynamicRecordError(c, err)
	}
	var request struct {
		Body    string `json:"body"`
		Channel string `json:"channel"`
	}
	if err := c.BodyParser(&request); err != nil || strings.TrimSpace(request.Body) == "" || len(request.Body) > 20_000 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "message body must contain 1 to 20000 characters"})
	}
	data := map[string]interface{}{
		"ticket": ticketID.String(), "body": strings.TrimSpace(request.Body),
		"channel": normalizeMessageChannelValue(request.Channel), "sent_at": time.Now().UTC().Format(time.RFC3339),
		"delivery_status": "sent",
	}
	if actorUUID(c) != uuid.Nil {
		data["sender"] = actorUUID(c).String()
	}
	record, err := services.CreateDynamicRecordAs(database.GetDB(c), CurrentWorkspaceID(c), crmCommandPrincipal(c, "crm_ticket_message_command"), "crm_ticket_message", data)
	if err != nil {
		return dynamicRecordError(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(record)
}

func queryRelatedCRMRecords(db *gorm.DB, workspaceID uuid.UUID, principal services.RecordPrincipal, key, field, value string, limit int) (services.RecordQueryResult, error) {
	return services.QueryDynamicRecordsAs(db, workspaceID, principal, key, services.RecordQueryRequest{
		Limit: limit, Filter: &services.RecordFilter{Field: field, Op: "eq", Value: value},
	})
}

func getOptionalCRMRecord(db *gorm.DB, workspaceID uuid.UUID, principal services.RecordPrincipal, key, value string) interface{} {
	recordID, err := uuid.Parse(strings.TrimSpace(value))
	if err != nil {
		return nil
	}
	record, err := services.GetDynamicRecordAs(db, workspaceID, principal, key, recordID)
	if err != nil {
		return nil
	}
	return record
}

func optionalCRMRecordFromMap(records map[uuid.UUID]models.Entity, value string) interface{} {
	recordID, err := uuid.Parse(strings.TrimSpace(value))
	if err != nil {
		return nil
	}
	record, exists := records[recordID]
	if !exists {
		return nil
	}
	return record
}

func validOptionalCRMRelation(db *gorm.DB, workspaceID uuid.UUID, key, value string) string {
	recordID, err := uuid.Parse(strings.TrimSpace(value))
	if err != nil {
		return ""
	}
	if _, err := services.GetDynamicRecord(db, workspaceID, key, recordID); err != nil {
		return ""
	}
	return recordID.String()
}

func validWorkspaceUserValue(db *gorm.DB, workspaceID uuid.UUID, value string) string {
	userID, err := uuid.Parse(strings.TrimSpace(value))
	if err != nil {
		return ""
	}
	var count int64
	if db.Model(&models.User{}).Where("id = ? AND workspace_id = ?", userID, workspaceID).Count(&count).Error != nil || count == 0 {
		return ""
	}
	return userID.String()
}

func entityData(record models.Entity) map[string]interface{} {
	data := map[string]interface{}{}
	_ = json.Unmarshal(record.Data, &data)
	return data
}

func cleanCRMData(data map[string]interface{}) map[string]interface{} {
	for key, value := range data {
		if value == nil || value == "" {
			delete(data, key)
		}
	}
	return data
}

func optionalEntityID(record models.Entity) string {
	if record.ID == uuid.Nil {
		return ""
	}
	return record.ID.String()
}

func crmFirstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func normalizeCRMSourceValue(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "organic", "direct", "referral", "ads", "partner", "other":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return "other"
	}
}

func normalizeTicketPriorityValue(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "low", "high", "urgent":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return "medium"
	}
}

func normalizeTicketStatusValue(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "in_progress", "resolved", "closed":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return "open"
	}
}

func normalizeTicketChannelValue(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "email", "whatsapp", "phone", "zendesk", "other":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return "portal"
	}
}

func normalizeMessageChannelValue(value string) string {
	if strings.EqualFold(strings.TrimSpace(value), "system") {
		return "system"
	}
	return normalizeTicketChannelValue(value)
}

func crmSLADuration(priority string) time.Duration {
	switch priority {
	case "urgent":
		return 4 * time.Hour
	case "high":
		return 8 * time.Hour
	case "low":
		return 48 * time.Hour
	default:
		return 24 * time.Hour
	}
}

func completedAtForStatus(status string) string {
	if status == "completed" {
		return time.Now().UTC().Format(time.RFC3339)
	}
	return ""
}

func numberFromAny(value interface{}) float64 {
	switch typed := value.(type) {
	case float64:
		return typed
	case int:
		return float64(typed)
	case json.Number:
		result, _ := typed.Float64()
		return result
	default:
		return 0
	}
}
