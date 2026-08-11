package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

const crmSchemaContractVersion = 4

type systemCRMDefinitionSpec struct {
	Key           string
	LabelAr       string
	LabelEn       string
	DescriptionAr string
	DescriptionEn string
	TitleFieldKey string
	Fields        []SchemaFieldInput
}

var crmPipelineStages = []string{
	"new", "contacted", "qualified", "proposal", "negotiation", "closed_won", "closed_lost",
}

func crmField(key, ar, en, fieldType string, required bool) SchemaFieldInput {
	return SchemaFieldInput{Key: key, LabelAr: ar, LabelEn: en, Type: fieldType, Required: required}
}

func crmRelation(key, ar, en, target, onDelete string, required bool) SchemaFieldInput {
	return SchemaFieldInput{
		Key: key, LabelAr: ar, LabelEn: en, Type: "relation", Required: required,
		Relation: &RelationFieldConfig{TargetDefinitionKey: target, Cardinality: "one", OnDelete: onDelete},
	}
}

func systemCRMDefinitionSpecs() []systemCRMDefinitionSpec {
	piiExcluded := false
	return []systemCRMDefinitionSpec{
		{
			Key: "crm_account", LabelAr: "حسابات العملاء", LabelEn: "CRM Accounts",
			DescriptionAr: "الشركات والمؤسسات التي ترتبط بها جهات الاتصال والفرص.",
			DescriptionEn: "Companies and organizations linked to contacts and opportunities.",
			TitleFieldKey: "name",
			Fields: []SchemaFieldInput{
				func() SchemaFieldInput {
					f := crmField("name", "اسم الحساب", "Account name", "text", true)
					f.Searchable = true
					f.Indexed = true
					return f
				}(),
				func() SchemaFieldInput {
					f := crmField("email", "البريد العام", "General email", "text", false)
					f.Searchable = true
					f.Classification = "pii"
					f.IncludeInAI = &piiExcluded
					f.IncludeInEvents = &piiExcluded
					return f
				}(),
				func() SchemaFieldInput {
					f := crmField("phone", "الهاتف", "Phone", "text", false)
					f.Classification = "pii"
					f.IncludeInAI = &piiExcluded
					f.IncludeInEvents = &piiExcluded
					return f
				}(),
				crmField("website", "الموقع الإلكتروني", "Website", "text", false),
				crmField("industry", "القطاع", "Industry", "text", false),
				func() SchemaFieldInput {
					f := crmField("status", "الحالة", "Status", "list", true)
					f.Options = []string{"prospect", "active", "inactive"}
					f.Default = "prospect"
					f.Searchable = true
					f.Indexed = true
					return f
				}(),
				crmField("owner", "المالك", "Owner", "user", false),
				func() SchemaFieldInput {
					f := crmField("annual_revenue", "الإيراد السنوي", "Annual revenue", "number", false)
					f.Classification = "confidential"
					return f
				}(),
				func() SchemaFieldInput {
					f := crmField("notes", "ملاحظات", "Notes", "text", false)
					f.Classification = "confidential"
					return f
				}(),
			},
		},
		{
			Key: "crm_contact", LabelAr: "جهات الاتصال", LabelEn: "CRM Contacts",
			DescriptionAr: "الأشخاص وجهات الاتصال المرتبطة بحسابات العملاء.",
			DescriptionEn: "People and contacts linked to customer accounts.",
			TitleFieldKey: "full_name",
			Fields: []SchemaFieldInput{
				func() SchemaFieldInput {
					f := crmField("full_name", "الاسم الكامل", "Full name", "text", true)
					f.Searchable = true
					f.Indexed = true
					f.Classification = "pii"
					f.IncludeInAI = &piiExcluded
					f.IncludeInEvents = &piiExcluded
					return f
				}(),
				crmRelation("account", "حساب العميل", "Account", "crm_account", "nullify", false),
				func() SchemaFieldInput {
					f := crmField("email", "البريد الإلكتروني", "Email", "text", false)
					f.Searchable = true
					f.Indexed = true
					f.Classification = "pii"
					f.IncludeInAI = &piiExcluded
					f.IncludeInEvents = &piiExcluded
					return f
				}(),
				func() SchemaFieldInput {
					f := crmField("phone", "الهاتف", "Phone", "text", false)
					f.Searchable = true
					f.Classification = "pii"
					f.IncludeInAI = &piiExcluded
					f.IncludeInEvents = &piiExcluded
					return f
				}(),
				crmField("job_title", "المسمى الوظيفي", "Job title", "text", false),
				crmField("owner", "المالك", "Owner", "user", false),
				func() SchemaFieldInput {
					f := crmField("source", "المصدر", "Source", "list", false)
					f.Options = []string{"organic", "direct", "referral", "ads", "partner", "other"}
					return f
				}(),
				func() SchemaFieldInput {
					f := crmField("consent_status", "حالة الموافقة", "Consent status", "list", true)
					f.Options = []string{"unknown", "granted", "withdrawn"}
					f.Default = "unknown"
					return f
				}(),
				func() SchemaFieldInput {
					f := crmField("notes", "ملاحظات", "Notes", "text", false)
					f.Classification = "confidential"
					return f
				}(),
			},
		},
		{
			Key: "crm_opportunity", LabelAr: "فرص المبيعات", LabelEn: "CRM Opportunities",
			DescriptionAr: "مسار المبيعات الموحد من العميل الجديد حتى الإغلاق.",
			DescriptionEn: "Canonical sales pipeline from new lead through closure.",
			TitleFieldKey: "title",
			Fields: []SchemaFieldInput{
				func() SchemaFieldInput {
					f := crmField("title", "عنوان الفرصة", "Opportunity title", "text", true)
					f.Searchable = true
					f.Indexed = true
					return f
				}(),
				crmRelation("account", "حساب العميل", "Account", "crm_account", "restrict", true),
				crmRelation("primary_contact", "جهة الاتصال الأساسية", "Primary contact", "crm_contact", "nullify", false),
				func() SchemaFieldInput {
					f := crmField("project_id", "معرف المشروع", "Project ID", "text", false)
					f.Indexed = true
					return f
				}(),
				func() SchemaFieldInput {
					f := crmField("stage", "المرحلة", "Stage", "list", true)
					f.Options = crmPipelineStages
					f.Default = "new"
					f.Searchable = true
					f.Indexed = true
					return f
				}(),
				func() SchemaFieldInput {
					f := crmField("value", "القيمة", "Value", "number", true)
					f.Classification = "confidential"
					return f
				}(),
				func() SchemaFieldInput {
					f := crmField("currency", "العملة", "Currency", "text", true)
					f.Default = "SAR"
					return f
				}(),
				func() SchemaFieldInput {
					f := crmField("probability", "احتمال الإغلاق", "Close probability", "integer", false)
					f.Classification = "confidential"
					return f
				}(),
				crmField("expected_close_date", "تاريخ الإغلاق المتوقع", "Expected close date", "date", false),
				crmField("owner", "مالك الفرصة", "Owner", "user", false),
				func() SchemaFieldInput {
					f := crmField("source", "المصدر", "Source", "list", false)
					f.Options = []string{"organic", "direct", "referral", "ads", "partner", "other"}
					f.Searchable = true
					return f
				}(),
				crmField("next_activity_at", "المتابعة القادمة", "Next activity", "datetime", false),
				crmField("last_activity_at", "آخر نشاط", "Last activity", "datetime", false),
				crmField("loss_reason", "سبب الخسارة", "Loss reason", "text", false),
				func() SchemaFieldInput {
					f := crmField("description", "الوصف", "Description", "text", false)
					f.Classification = "confidential"
					return f
				}(),
			},
		},
		{
			Key: "crm_activity", LabelAr: "أنشطة العملاء", LabelEn: "CRM Activities",
			DescriptionAr: "المكالمات والاجتماعات والرسائل ومهام المتابعة.",
			DescriptionEn: "Calls, meetings, messages, and follow-up tasks.",
			TitleFieldKey: "subject",
			Fields: []SchemaFieldInput{
				func() SchemaFieldInput {
					f := crmField("subject", "الموضوع", "Subject", "text", true)
					f.Searchable = true
					return f
				}(),
				func() SchemaFieldInput {
					f := crmField("activity_type", "نوع النشاط", "Activity type", "list", true)
					f.Options = []string{"call", "meeting", "email", "whatsapp", "note", "task"}
					f.Searchable = true
					f.Indexed = true
					return f
				}(),
				crmRelation("opportunity", "الفرصة", "Opportunity", "crm_opportunity", "nullify", false),
				crmRelation("account", "حساب العميل", "Account", "crm_account", "nullify", false),
				crmRelation("contact", "جهة الاتصال", "Contact", "crm_contact", "nullify", false),
				func() SchemaFieldInput {
					f := crmField("status", "الحالة", "Status", "list", true)
					f.Options = []string{"planned", "completed", "cancelled"}
					f.Default = "planned"
					f.Searchable = true
					return f
				}(),
				crmField("due_at", "موعد التنفيذ", "Due at", "datetime", false),
				crmField("completed_at", "وقت الإكمال", "Completed at", "datetime", false),
				crmField("owner", "المسؤول", "Owner", "user", false),
				func() SchemaFieldInput {
					f := crmField("notes", "التفاصيل", "Details", "text", false)
					f.Classification = "confidential"
					return f
				}(),
			},
		},
		{
			Key: "crm_quote", LabelAr: "عروض الأسعار", LabelEn: "CRM Quotes",
			DescriptionAr: "عروض الأسعار المرتبطة بفرص المبيعات.",
			DescriptionEn: "Quotations linked to sales opportunities.",
			TitleFieldKey: "quote_number",
			Fields: []SchemaFieldInput{
				func() SchemaFieldInput {
					f := crmField("quote_number", "رقم العرض", "Quote number", "text", true)
					f.Searchable = true
					f.Indexed = true
					return f
				}(),
				crmRelation("opportunity", "الفرصة", "Opportunity", "crm_opportunity", "restrict", true),
				func() SchemaFieldInput {
					f := crmField("status", "الحالة", "Status", "list", true)
					f.Options = []string{"draft", "sent", "accepted", "rejected", "expired", "converted"}
					f.Default = "draft"
					f.Searchable = true
					f.Indexed = true
					return f
				}(),
				crmField("valid_until", "صالح حتى", "Valid until", "date", true),
				func() SchemaFieldInput {
					f := crmField("currency", "العملة", "Currency", "text", true)
					f.Default = "SAR"
					return f
				}(),
				func() SchemaFieldInput {
					f := crmField("subtotal", "الإجمالي قبل الضريبة", "Subtotal", "number", true)
					f.Classification = "confidential"
					return f
				}(),
				crmField("tax_rate", "نسبة الضريبة", "Tax rate", "number", true),
				func() SchemaFieldInput {
					f := crmField("total_tax", "إجمالي الضريبة", "Total tax", "number", true)
					f.Classification = "confidential"
					return f
				}(),
				func() SchemaFieldInput {
					f := crmField("total", "الإجمالي", "Total", "number", true)
					f.Classification = "confidential"
					return f
				}(),
				crmField("invoice_id", "معرف الفاتورة", "Invoice ID", "text", false),
				func() SchemaFieldInput {
					f := crmField("notes", "الشروط والملاحظات", "Terms and notes", "text", false)
					f.Classification = "confidential"
					return f
				}(),
			},
		},
		{
			Key: "crm_quote_line", LabelAr: "بنود عروض الأسعار", LabelEn: "CRM Quote Lines",
			DescriptionAr: "بنود المنتجات والخدمات داخل عرض السعر.",
			DescriptionEn: "Product and service lines within a quote.",
			TitleFieldKey: "description",
			Fields: []SchemaFieldInput{
				crmRelation("quote", "عرض السعر", "Quote", "crm_quote", "cascade", true),
				func() SchemaFieldInput {
					f := crmField("description", "الوصف", "Description", "text", true)
					f.Searchable = true
					return f
				}(),
				crmField("quantity", "الكمية", "Quantity", "number", true),
				crmField("unit_price", "سعر الوحدة", "Unit price", "number", true),
				crmField("tax_rate", "نسبة الضريبة", "Tax rate", "number", false),
				{Key: "line_total", LabelAr: "إجمالي البند", LabelEn: "Line total", Type: "formula", Formula: &FormulaFieldConfig{Expression: "[quantity] * [unit_price]", ResultType: "number"}, Classification: "confidential"},
			},
		},
		{
			Key: "crm_ticket", LabelAr: "تذاكر العملاء", LabelEn: "CRM Tickets",
			DescriptionAr: "طلبات الدعم المرتبطة بالعملاء مع حالة وأولوية واتفاقية خدمة.",
			DescriptionEn: "Customer support requests with status, priority, and SLA tracking.",
			TitleFieldKey: "subject",
			Fields: []SchemaFieldInput{
				func() SchemaFieldInput {
					f := crmField("subject", "الموضوع", "Subject", "text", true)
					f.Searchable = true
					f.Indexed = true
					return f
				}(),
				crmRelation("account", "حساب العميل", "Account", "crm_account", "nullify", false),
				crmRelation("contact", "جهة الاتصال", "Contact", "crm_contact", "nullify", false),
				crmRelation("opportunity", "الفرصة", "Opportunity", "crm_opportunity", "nullify", false),
				func() SchemaFieldInput {
					f := crmField("customer_name", "اسم العميل", "Customer name", "text", false)
					f.Classification = "pii"
					f.IncludeInAI = &piiExcluded
					f.IncludeInEvents = &piiExcluded
					return f
				}(),
				func() SchemaFieldInput {
					f := crmField("status", "الحالة", "Status", "list", true)
					f.Options = []string{"open", "in_progress", "resolved", "closed"}
					f.Default = "open"
					f.Searchable = true
					f.Indexed = true
					return f
				}(),
				func() SchemaFieldInput {
					f := crmField("priority", "الأولوية", "Priority", "list", true)
					f.Options = []string{"low", "medium", "high", "urgent"}
					f.Default = "medium"
					f.Searchable = true
					return f
				}(),
				func() SchemaFieldInput {
					f := crmField("channel", "القناة", "Channel", "list", true)
					f.Options = []string{"portal", "email", "whatsapp", "phone", "zendesk", "other"}
					f.Default = "portal"
					return f
				}(),
				func() SchemaFieldInput {
					f := crmField("external_provider", "المزود الخارجي", "External provider", "list", false)
					f.Options = []string{"zendesk", "whatsapp", "email", "other"}
					f.Searchable = true
					f.Indexed = true
					return f
				}(),
				func() SchemaFieldInput {
					f := crmField("external_ticket_id", "معرف التذكرة الخارجي", "External ticket ID", "text", false)
					f.Searchable = true
					f.Indexed = true
					return f
				}(),
				crmField("assignee", "المسؤول", "Assignee", "user", false),
				crmField("assigned_team", "فريق الإسناد", "Assigned team", "text", false),
				crmField("sla_due_at", "موعد اتفاقية الخدمة", "SLA due at", "datetime", false),
				func() SchemaFieldInput {
					f := crmField("sla_status", "حالة اتفاقية الخدمة", "SLA status", "list", true)
					f.Options = []string{"on_track", "due_soon", "breached", "paused", "resolved"}
					f.Default = "on_track"
					f.Searchable = true
					f.Indexed = true
					return f
				}(),
				func() SchemaFieldInput {
					f := crmField("escalation_level", "مستوى التصعيد", "Escalation level", "integer", true)
					f.Default = 0
					return f
				}(),
				crmField("resolved_at", "وقت الحل", "Resolved at", "datetime", false),
				func() SchemaFieldInput {
					f := crmField("description", "الوصف", "Description", "text", false)
					f.Classification = "confidential"
					return f
				}(),
			},
		},
		{
			Key: "crm_ticket_message", LabelAr: "رسائل تذاكر العملاء", LabelEn: "CRM Ticket Messages",
			DescriptionAr: "سجل رسائل مستقل وآمن لكل تذكرة.",
			DescriptionEn: "Independent, auditable message records for each ticket.",
			TitleFieldKey: "body",
			Fields: []SchemaFieldInput{
				crmRelation("ticket", "التذكرة", "Ticket", "crm_ticket", "cascade", true),
				func() SchemaFieldInput {
					f := crmField("body", "نص الرسالة", "Message body", "text", true)
					f.Classification = "confidential"
					return f
				}(),
				func() SchemaFieldInput {
					f := crmField("channel", "القناة", "Channel", "list", true)
					f.Options = []string{"portal", "email", "whatsapp", "phone", "zendesk", "system"}
					f.Default = "portal"
					return f
				}(),
				crmField("sender", "المرسل", "Sender", "user", false),
				crmField("sent_at", "وقت الإرسال", "Sent at", "datetime", true),
				crmField("external_message_id", "معرف الرسالة الخارجية", "External message ID", "text", false),
				func() SchemaFieldInput {
					f := crmField("delivery_status", "حالة التسليم", "Delivery status", "list", true)
					f.Options = []string{"pending", "sent", "delivered", "failed", "received"}
					f.Default = "pending"
					return f
				}(),
			},
		},
	}
}

func SystemCRMDefinitionKeys() []string {
	specs := systemCRMDefinitionSpecs()
	keys := make([]string, 0, len(specs))
	for _, spec := range specs {
		keys = append(keys, spec.Key)
	}
	return keys
}

func IsSystemManagedDefinition(definition models.EntityDefinition) bool {
	var settings map[string]interface{}
	if json.Unmarshal(definition.Settings, &settings) != nil {
		return false
	}
	managed, _ := settings["system_managed"].(bool)
	return managed
}

// EnsureSystemCRMDefinitions publishes the immutable CRM v1 contracts for one
// workspace. It is idempotent and refuses to take over a user-owned key.
func EnsureSystemCRMDefinitions(db *gorm.DB, workspaceID uuid.UUID, actorID *uuid.UUID) error {
	if db == nil || workspaceID == uuid.Nil {
		return fmt.Errorf("CRM schema seed requires database and workspace")
	}
	return db.Transaction(func(tx *gorm.DB) error {
		definitions := make(map[string]models.EntityDefinition)
		published := make(map[string]bool)
		for _, spec := range systemCRMDefinitionSpecs() {
			var existing models.EntityDefinition
			err := tx.Where("workspace_id = ? AND key = ?", workspaceID, spec.Key).First(&existing).Error
			if err == nil {
				if !IsSystemManagedDefinition(existing) {
					return fmt.Errorf("CRM system schema key %s is already user-managed", spec.Key)
				}
				if existing.Status != models.EntityDefinitionStatusPublished || existing.CurrentVersion < 1 {
					return fmt.Errorf("CRM system schema %s is not in a published state", spec.Key)
				}
				if existing.CurrentVersion < crmSchemaContractVersion {
					compiled, compileErr := CompileSchemaDraft(spec.LabelAr, spec.LabelEn, spec.Fields)
					if compileErr != nil {
						return fmt.Errorf("compile CRM schema upgrade %s: %w", spec.Key, compileErr)
					}
					checksum := SchemaChecksum(compiled.JSONSchema, compiled.UISchema)
					changeSet, _ := json.Marshal(map[string]interface{}{
						"source": "system_upgrade", "from_version": existing.CurrentVersion,
						"contract_version": crmSchemaContractVersion,
					})
					if err := tx.Create(&models.EntitySchemaVersion{
						ID: uuid.New(), WorkspaceID: workspaceID, DefinitionID: existing.ID,
						Version: crmSchemaContractVersion, JSONSchema: compiled.JSONSchema,
						UISchema: compiled.UISchema, ChangeSet: datatypes.JSON(changeSet),
						Checksum: checksum, PublishedBy: actorID, PublishedAt: time.Now().UTC(),
					}).Error; err != nil {
						return err
					}
					if err := MaterializePublishedFields(tx, existing, crmSchemaContractVersion, checksum, compiled.Fields); err != nil {
						return err
					}
					if err := tx.Model(&models.EntityDefinition{}).Where("id = ? AND workspace_id = ?", existing.ID, workspaceID).Updates(map[string]interface{}{
						"current_version": crmSchemaContractVersion, "draft_revision": gorm.Expr("draft_revision + 1"),
						"draft_schema": compiled.JSONSchema, "draft_ui_schema": compiled.UISchema,
						"updated_by": actorID, "updated_at": time.Now().UTC(),
					}).Error; err != nil {
						return err
					}
					existing.CurrentVersion = crmSchemaContractVersion
					existing.DraftSchema = compiled.JSONSchema
					existing.DraftUISchema = compiled.UISchema
					published[spec.Key] = true
				}
				definitions[spec.Key] = existing
				continue
			}
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}

			compiled, err := CompileSchemaDraft(spec.LabelAr, spec.LabelEn, spec.Fields)
			if err != nil {
				return fmt.Errorf("compile CRM schema %s: %w", spec.Key, err)
			}
			settings, _ := json.Marshal(map[string]interface{}{
				"system_managed": true, "module": "crm", "contract_version": crmSchemaContractVersion,
			})
			definition := models.EntityDefinition{
				ID: uuid.New(), WorkspaceID: workspaceID, Key: spec.Key,
				LabelAr: spec.LabelAr, LabelEn: spec.LabelEn,
				DescriptionAr: spec.DescriptionAr, DescriptionEn: spec.DescriptionEn,
				Status: models.EntityDefinitionStatusPublished, CurrentVersion: crmSchemaContractVersion, DraftRevision: 1,
				TitleFieldKey: spec.TitleFieldKey, DraftSchema: compiled.JSONSchema,
				DraftUISchema: compiled.UISchema, Settings: datatypes.JSON(settings),
				CreatedBy: actorID, UpdatedBy: actorID,
			}
			if err := tx.Create(&definition).Error; err != nil {
				return err
			}
			checksum := SchemaChecksum(compiled.JSONSchema, compiled.UISchema)
			changeSet, _ := json.Marshal(map[string]interface{}{
				"source": "system_seed", "contract_version": crmSchemaContractVersion,
			})
			if err := tx.Create(&models.EntitySchemaVersion{
				ID: uuid.New(), WorkspaceID: workspaceID, DefinitionID: definition.ID,
				Version: crmSchemaContractVersion, JSONSchema: compiled.JSONSchema, UISchema: compiled.UISchema,
				ChangeSet: datatypes.JSON(changeSet), Checksum: checksum,
				PublishedBy: actorID, PublishedAt: time.Now().UTC(),
			}).Error; err != nil {
				return err
			}
			if err := MaterializePublishedFields(tx, definition, crmSchemaContractVersion, checksum, compiled.Fields); err != nil {
				return err
			}
			definitions[spec.Key] = definition
			published[spec.Key] = true
		}

		// Relations are synchronized only after every target definition exists.
		for _, spec := range systemCRMDefinitionSpecs() {
			if !published[spec.Key] {
				continue
			}
			definition := definitions[spec.Key]
			if err := SyncPublishedRelations(tx, definition, spec.Fields); err != nil {
				return fmt.Errorf("sync CRM relations for %s: %w", spec.Key, err)
			}
			details, _ := json.Marshal(map[string]interface{}{
				"definition_key": spec.Key, "schema_version": crmSchemaContractVersion, "contract_version": crmSchemaContractVersion,
			})
			if err := tx.Create(&models.AuditLog{
				ID: uuid.New(), WorkspaceID: &workspaceID, UserID: actorID,
				Action: "schema_definition.system_seed", EntityType: "EntityDefinition",
				EntityID: definition.ID.String(), Details: datatypes.JSON(details), CreatedAt: time.Now().UTC(),
			}).Error; err != nil {
				return err
			}
			if err := EnqueueOutbox(tx, workspaceID, "events.data.schema.published", "data.schema.published", "schema", definition.ID, map[string]interface{}{
				"definition_id": definition.ID.String(), "definition_key": spec.Key,
				"schema_version": crmSchemaContractVersion, "system_managed": true,
			}); err != nil {
				return err
			}
		}
		return nil
	})
}

func EnsureAllWorkspaceCRMDefinitions(db *gorm.DB) error {
	var workspaceIDs []uuid.UUID
	if err := db.Model(&models.Workspace{}).Pluck("id", &workspaceIDs).Error; err != nil {
		return err
	}
	for _, workspaceID := range workspaceIDs {
		if err := EnsureSystemCRMDefinitions(db, workspaceID, nil); err != nil {
			return fmt.Errorf("seed CRM schemas for workspace %s: %w", workspaceID, err)
		}
	}
	return nil
}
