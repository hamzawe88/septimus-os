package services

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/gorm"
)

const crmLegacyMigrationVersion = 1

// CRMLegacyMigrationReport is intentionally count-only: customer data must not
// leak into startup logs. Failures return an error and roll back that source
// record rather than leaving a partial graph.
type CRMLegacyMigrationReport struct {
	Sources  int64 `json:"sources"`
	Migrated int64 `json:"migrated"`
	Skipped  int64 `json:"skipped"`
}

// MigrateAllLegacyCRM migrates the three pre-schema-builder CRM roots after
// the managed contracts are available. Links make this safe on every startup.
func MigrateAllLegacyCRM(db *gorm.DB) (CRMLegacyMigrationReport, error) {
	var total CRMLegacyMigrationReport
	var workspaceIDs []uuid.UUID
	if err := db.Model(&models.Workspace{}).Pluck("id", &workspaceIDs).Error; err != nil {
		return total, err
	}
	for _, workspaceID := range workspaceIDs {
		report, err := MigrateLegacyCRMWorkspace(db, workspaceID)
		if err != nil {
			return total, fmt.Errorf("migrate legacy CRM workspace %s: %w", workspaceID, err)
		}
		total.Sources += report.Sources
		total.Migrated += report.Migrated
		total.Skipped += report.Skipped
	}
	return total, nil
}

func MigrateLegacyCRMWorkspace(db *gorm.DB, workspaceID uuid.UUID) (CRMLegacyMigrationReport, error) {
	var report CRMLegacyMigrationReport
	if db == nil || workspaceID == uuid.Nil {
		return report, fmt.Errorf("CRM migration requires database and workspace")
	}
	for _, entityType := range []string{"lead", "ticket", "crm_quote"} {
		var sources []models.Entity
		if err := db.Where(
			"workspace_id = ? AND entity_type = ? AND definition_id IS NULL", workspaceID, entityType,
		).Order("created_at ASC, id ASC").Find(&sources).Error; err != nil {
			return report, err
		}
		for _, source := range sources {
			report.Sources++
			skipped, err := migrateLegacyCRMSource(db, source)
			if err != nil {
				return report, fmt.Errorf("%s %s: %w", entityType, source.ID, err)
			}
			if skipped {
				report.Skipped++
			} else {
				report.Migrated++
			}
		}
	}
	return report, nil
}

func migrateLegacyCRMSource(db *gorm.DB, source models.Entity) (bool, error) {
	primaryKey := map[string]string{
		"lead": "crm_opportunity", "ticket": "crm_ticket", "crm_quote": "crm_quote",
	}[source.EntityType]
	if primaryKey == "" {
		return true, nil
	}
	var existing int64
	if err := db.Model(&models.CRMLegacyRecordLink{}).Where(
		"workspace_id = ? AND legacy_entity_id = ? AND target_definition_key = ?",
		source.WorkspaceID, source.ID, primaryKey,
	).Count(&existing).Error; err != nil {
		return false, err
	}
	if existing > 0 {
		return true, nil
	}
	return false, db.Transaction(func(tx *gorm.DB) error {
		var data map[string]interface{}
		if err := json.Unmarshal(source.Data, &data); err != nil {
			return fmt.Errorf("decode legacy data: %w", err)
		}
		switch source.EntityType {
		case "lead":
			return migrateLegacyLead(tx, source, data)
		case "ticket":
			return migrateLegacyTicket(tx, source, data)
		case "crm_quote":
			return migrateLegacyQuote(tx, source, data)
		default:
			return nil
		}
	})
}

func migrateLegacyLead(tx *gorm.DB, source models.Entity, data map[string]interface{}) error {
	company := firstText(data, "company", "account_name", "organization", "name", "title")
	if company == "" {
		company = nonEmpty(source.DisplayValue, "Legacy CRM account")
	}
	account, err := createLinkedCRMRecord(tx, source, "crm_account", "crm_account", cleanMap(map[string]interface{}{
		"name": company, "email": firstText(data, "company_email"), "phone": firstText(data, "company_phone"),
		"website": firstText(data, "website"), "industry": firstText(data, "industry"), "status": "prospect",
		"notes": firstText(data, "notes"),
	}))
	if err != nil {
		return err
	}

	contactName := firstText(data, "contact_person", "contact_name", "full_name")
	email, phone := firstText(data, "email"), firstText(data, "phone")
	var contactID string
	if contactName != "" || email != "" || phone != "" {
		contactName = nonEmpty(contactName, email, "Legacy CRM contact")
		contact, createErr := createLinkedCRMRecord(tx, source, "crm_contact", "crm_contact", cleanMap(map[string]interface{}{
			"full_name": contactName, "account": account.ID.String(), "email": email, "phone": phone,
			"job_title": firstText(data, "job_title"), "source": normalizeCRMSource(firstText(data, "source")),
			"notes": firstText(data, "contact_notes"),
		}))
		if createErr != nil {
			return createErr
		}
		contactID = contact.ID.String()
	}

	opportunityData := cleanMap(map[string]interface{}{
		"title": nonEmpty(firstText(data, "title", "name"), company), "account": account.ID.String(),
		"primary_contact": contactID, "stage": normalizeCRMStage(firstText(data, "stage", "status")),
		"value":               numberValue(data, "value", "amount", "estimated_value"),
		"currency":            strings.ToUpper(nonEmpty(firstText(data, "currency"), "SAR")),
		"probability":         integerValue(data, "probability", "score"),
		"expected_close_date": dateValue(data, "expected_close_date", "close_date"),
		"source":              normalizeCRMSource(firstText(data, "source")),
		"next_activity_at":    dateTimeValue(data, "next_activity_at", "next_follow_up"),
		"last_activity_at":    dateTimeValue(data, "last_activity_at", "last_contacted_at"),
		"loss_reason":         firstText(data, "loss_reason"), "description": firstText(data, "description", "notes"),
	})
	_, err = createLinkedCRMRecord(tx, source, "crm_opportunity", "crm_opportunity", opportunityData)
	return err
}

func migrateLegacyTicket(tx *gorm.DB, source models.Entity, data map[string]interface{}) error {
	priority := normalizeTicketPriority(firstText(data, "priority"))
	status := normalizeTicketStatus(firstText(data, "status"))
	due := dateTimeValue(data, "sla_due_at", "due_at")
	if due == "" {
		due = source.CreatedAt.UTC().Add(slaDuration(priority)).Format(time.RFC3339)
	}
	ticket, err := createLinkedCRMRecord(tx, source, "crm_ticket", "crm_ticket", cleanMap(map[string]interface{}{
		"subject":       nonEmpty(firstText(data, "subject", "title", "name"), source.DisplayValue, "Legacy support ticket"),
		"customer_name": firstText(data, "customer", "customer_name", "company"),
		"status":        status, "priority": priority, "channel": normalizeTicketChannel(firstText(data, "channel")),
		"assignee":      validWorkspaceUser(tx, source.WorkspaceID, firstText(data, "assignee", "assignee_id", "owner_id")),
		"assigned_team": firstText(data, "assigned_team", "team"), "sla_due_at": due,
		"sla_status": deriveSLAStatus(status, due), "escalation_level": integerValue(data, "escalation_level"),
		"resolved_at": dateTimeValue(data, "resolved_at", "closed_at"),
		"description": firstText(data, "description", "details"),
	}))
	if err != nil {
		return err
	}
	messages, _ := data["messages"].([]interface{})
	for index, raw := range messages {
		message, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		body := firstText(message, "body", "content", "text", "message")
		if body == "" {
			continue
		}
		sentAt := dateTimeValue(message, "sent_at", "created_at", "timestamp")
		if sentAt == "" {
			sentAt = source.CreatedAt.UTC().Add(time.Duration(index) * time.Millisecond).Format(time.RFC3339Nano)
		}
		_, err = createLinkedCRMRecord(tx, source, fmt.Sprintf("crm_ticket_message:%d", index), "crm_ticket_message", cleanMap(map[string]interface{}{
			"ticket": ticket.ID.String(), "body": body, "channel": normalizeMessageChannel(firstText(message, "channel")),
			"sender":  validWorkspaceUser(tx, source.WorkspaceID, firstText(message, "sender", "sender_id", "user_id")),
			"sent_at": sentAt, "external_message_id": firstText(message, "external_message_id", "id"),
			"delivery_status": normalizeDeliveryStatus(firstText(message, "delivery_status", "status")),
		}))
		if err != nil {
			return err
		}
	}
	return nil
}

func migrateLegacyQuote(tx *gorm.DB, source models.Entity, data map[string]interface{}) error {
	opportunityID := linkedTargetID(tx, source.WorkspaceID, parseUUID(firstText(data, "lead_id", "opportunity_id")), "crm_opportunity")
	if opportunityID == uuid.Nil {
		account, err := createLinkedCRMRecord(tx, source, "crm_account", "crm_account", map[string]interface{}{
			"name": nonEmpty(firstText(data, "company", "customer"), "Legacy quote customer"), "status": "prospect",
		})
		if err != nil {
			return err
		}
		opportunity, err := createLinkedCRMRecord(tx, source, "crm_opportunity", "crm_opportunity", map[string]interface{}{
			"title":   nonEmpty(firstText(data, "company", "customer"), firstText(data, "quote_number"), "Legacy quotation"),
			"account": account.ID.String(), "stage": "proposal", "value": numberValue(data, "total", "total_amount"),
			"currency": strings.ToUpper(nonEmpty(firstText(data, "currency"), "SAR")),
		})
		if err != nil {
			return err
		}
		opportunityID = opportunity.ID
	}
	subtotal := numberValue(data, "subtotal")
	taxRate := numberValue(data, "tax_rate")
	totalTax := numberValue(data, "total_tax", "tax_amount")
	total := numberValue(data, "total", "total_amount")
	if totalTax == 0 && subtotal > 0 && taxRate > 0 {
		totalTax = roundMoney(subtotal * taxRate / 100)
	}
	if total == 0 {
		total = roundMoney(subtotal + totalTax)
	}
	validUntil := dateValue(data, "valid_until", "expiry_date")
	if validUntil == "" {
		validUntil = source.CreatedAt.UTC().AddDate(0, 0, 30).Format("2006-01-02")
	}
	quote, err := createLinkedCRMRecord(tx, source, "crm_quote", "crm_quote", cleanMap(map[string]interface{}{
		"quote_number": nonEmpty(firstText(data, "quote_number", "number"), "LEGACY-"+strings.ToUpper(source.ID.String()[:8])),
		"opportunity":  opportunityID.String(), "status": normalizeQuoteStatus(firstText(data, "status")),
		"valid_until": validUntil, "currency": strings.ToUpper(nonEmpty(firstText(data, "currency"), "SAR")),
		"subtotal": subtotal, "tax_rate": taxRate, "total_tax": totalTax, "total": total,
		"invoice_id": firstText(data, "invoice_id"), "notes": firstText(data, "notes", "terms"),
	}))
	if err != nil {
		return err
	}
	items, _ := data["items"].([]interface{})
	for index, raw := range items {
		item, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		_, err = createLinkedCRMRecord(tx, source, fmt.Sprintf("crm_quote_line:%d", index), "crm_quote_line", map[string]interface{}{
			"quote": quote.ID.String(), "description": nonEmpty(firstText(item, "description", "name"), "Legacy quote line"),
			"quantity":   positiveNumber(numberValue(item, "quantity", "qty"), 1),
			"unit_price": numberValue(item, "unit_price", "unitPrice", "price"), "tax_rate": numberValue(item, "tax_rate"),
		})
		if err != nil {
			return err
		}
	}
	return nil
}

func createLinkedCRMRecord(tx *gorm.DB, source models.Entity, linkKey, definitionKey string, data map[string]interface{}) (models.Entity, error) {
	var link models.CRMLegacyRecordLink
	err := tx.Where("workspace_id = ? AND legacy_entity_id = ? AND target_definition_key = ?", source.WorkspaceID, source.ID, linkKey).First(&link).Error
	if err == nil {
		var record models.Entity
		return record, tx.Where("id = ? AND workspace_id = ?", link.TargetRecordID, source.WorkspaceID).First(&record).Error
	}
	if err != nil && err != gorm.ErrRecordNotFound {
		return models.Entity{}, err
	}
	record, err := CreateDynamicRecordAs(tx, source.WorkspaceID, PrincipalForSystem("crm_migration"), definitionKey, data)
	if err != nil {
		return models.Entity{}, err
	}
	link = models.CRMLegacyRecordLink{
		ID: uuid.New(), WorkspaceID: source.WorkspaceID, LegacyEntityID: source.ID,
		TargetDefinitionKey: linkKey, TargetRecordID: record.ID, MigrationVersion: crmLegacyMigrationVersion,
	}
	if err := tx.Create(&link).Error; err != nil {
		return models.Entity{}, err
	}
	return record, nil
}

func linkedTargetID(tx *gorm.DB, workspaceID, sourceID uuid.UUID, key string) uuid.UUID {
	if sourceID == uuid.Nil {
		return uuid.Nil
	}
	var link models.CRMLegacyRecordLink
	if tx.Where("workspace_id = ? AND legacy_entity_id = ? AND target_definition_key = ?", workspaceID, sourceID, key).First(&link).Error != nil {
		return uuid.Nil
	}
	return link.TargetRecordID
}

func firstText(data map[string]interface{}, keys ...string) string {
	for _, key := range keys {
		if value, exists := data[key]; exists && value != nil {
			text := strings.TrimSpace(fmt.Sprint(value))
			if text != "" && text != "<nil>" {
				return text
			}
		}
	}
	return ""
}

func nonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func numberValue(data map[string]interface{}, keys ...string) float64 {
	for _, key := range keys {
		switch value := data[key].(type) {
		case float64:
			if !math.IsNaN(value) && !math.IsInf(value, 0) {
				return value
			}
		case float32:
			return float64(value)
		case int:
			return float64(value)
		case int64:
			return float64(value)
		case json.Number:
			parsed, _ := value.Float64()
			return parsed
		case string:
			parsed, err := strconv.ParseFloat(strings.TrimSpace(value), 64)
			if err == nil {
				return parsed
			}
		}
	}
	return 0
}

func integerValue(data map[string]interface{}, keys ...string) int {
	value := int(math.Round(numberValue(data, keys...)))
	if value < 0 {
		return 0
	}
	if value > 100 && (len(keys) > 0 && (keys[0] == "probability" || keys[0] == "score")) {
		return 100
	}
	return value
}

func dateValue(data map[string]interface{}, keys ...string) string {
	value := firstText(data, keys...)
	if value == "" {
		return ""
	}
	if parsed, ok := parseFlexibleTime(value); ok {
		return parsed.Format("2006-01-02")
	}
	return ""
}

func dateTimeValue(data map[string]interface{}, keys ...string) string {
	value := firstText(data, keys...)
	if parsed, ok := parseFlexibleTime(value); ok {
		return parsed.UTC().Format(time.RFC3339)
	}
	return ""
}

func parseFlexibleTime(value string) (time.Time, bool) {
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339, "2006-01-02", "2006-01-02 15:04:05"} {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed, true
		}
	}
	return time.Time{}, false
}

func parseUUID(value string) uuid.UUID {
	parsed, _ := uuid.Parse(strings.TrimSpace(value))
	return parsed
}

func validWorkspaceUser(tx *gorm.DB, workspaceID uuid.UUID, value string) string {
	userID := parseUUID(value)
	if userID == uuid.Nil {
		return ""
	}
	var count int64
	if tx.Model(&models.User{}).Where("id = ? AND workspace_id = ?", userID, workspaceID).Count(&count).Error != nil || count == 0 {
		return ""
	}
	return userID.String()
}

func cleanMap(data map[string]interface{}) map[string]interface{} {
	for key, value := range data {
		if value == nil || value == "" {
			delete(data, key)
		}
	}
	return data
}

func positiveNumber(value, fallback float64) float64 {
	if value > 0 {
		return value
	}
	return fallback
}

func roundMoney(value float64) float64 { return math.Round(value*100) / 100 }

func normalizeCRMStage(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "contacted", "qualified", "proposal", "negotiation", "closed_won", "closed_lost":
		return strings.ToLower(strings.TrimSpace(value))
	case "won", "closed won", "closed-won":
		return "closed_won"
	case "lost", "closed lost", "closed-lost":
		return "closed_lost"
	default:
		return "new"
	}
}

func normalizeCRMSource(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "organic", "direct", "referral", "ads", "partner", "other":
		return strings.ToLower(strings.TrimSpace(value))
	case "website", "web":
		return "organic"
	case "google", "facebook", "linkedin", "campaign":
		return "ads"
	default:
		return "other"
	}
}

func normalizeTicketPriority(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "low", "high", "urgent":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return "medium"
	}
}

func normalizeTicketStatus(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "in_progress", "resolved", "closed":
		return strings.ToLower(strings.TrimSpace(value))
	case "pending", "processing":
		return "in_progress"
	default:
		return "open"
	}
}

func normalizeTicketChannel(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "email", "whatsapp", "phone", "zendesk", "other":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return "portal"
	}
}

func normalizeMessageChannel(value string) string {
	if strings.EqualFold(strings.TrimSpace(value), "system") {
		return "system"
	}
	return normalizeTicketChannel(value)
}

func normalizeDeliveryStatus(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "pending", "sent", "delivered", "failed", "received":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return "received"
	}
}

func normalizeQuoteStatus(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "sent", "accepted", "rejected", "expired", "converted":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return "draft"
	}
}

func slaDuration(priority string) time.Duration {
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

func deriveSLAStatus(status, due string) string {
	if status == "resolved" || status == "closed" {
		return "resolved"
	}
	deadline, ok := parseFlexibleTime(due)
	if !ok {
		return "on_track"
	}
	remaining := time.Until(deadline)
	if remaining <= 0 {
		return "breached"
	}
	if remaining <= 2*time.Hour {
		return "due_soon"
	}
	return "on_track"
}
