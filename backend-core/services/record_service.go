package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

var ErrRecordVersionConflict = errors.New("record version conflict")

type RecordOperationError struct {
	Message string
	Code    string
}

func (e *RecordOperationError) Error() string { return e.Message }

type RecordQueryResult struct {
	Data       []models.Entity `json:"data"`
	NextCursor string          `json:"next_cursor,omitempty"`
}

func CreateDynamicRecord(db *gorm.DB, workspaceID, actorID uuid.UUID, definitionKey string, input map[string]interface{}) (models.Entity, error) {
	return CreateDynamicRecordAs(db, workspaceID, legacyRecordPrincipal(actorID), definitionKey, input)
}

func CreateDynamicRecordAs(db *gorm.DB, workspaceID uuid.UUID, principal RecordPrincipal, definitionKey string, input map[string]interface{}) (models.Entity, error) {
	definition, version, err := FindPublishedDefinition(db, workspaceID, definitionKey)
	if err != nil {
		return models.Entity{}, err
	}
	fields := parseFields(version.UISchema)
	data := cloneRecordData(input)
	if err := ValidateSystemRecordMutation(definitionKey, "create", data, principal); err != nil {
		return models.Entity{}, err
	}
	if err := ValidateFieldWrites(fields, data, principal); err != nil {
		return models.Entity{}, err
	}
	removeComputedInput(fields, data)
	ApplyFieldDefaults(fields, data)
	if err := ApplyFormulaFields(fields, data); err != nil {
		return models.Entity{}, &RecordOperationError{Message: err.Error()}
	}
	if err := ValidateRecordAgainstSchema(version.JSONSchema, data); err != nil {
		return models.Entity{}, err
	}
	raw, _ := json.Marshal(data)
	record := models.Entity{
		ID:          uuid.New(),
		WorkspaceID: workspaceID, DefinitionID: &definition.ID, EntityType: definition.Key,
		SchemaVersion: version.Version, RecordVersion: 1,
		DisplayValue: DefinitionDisplayValue(definition, data),
		Data:         datatypes.JSON(raw), CreatedBy: optionalUUID(principal.UserID), UpdatedBy: optionalUUID(principal.UserID),
	}
	err = db.Transaction(func(tx *gorm.DB) error {
		if err := ValidateRecordReferences(tx, workspaceID, fields, data); err != nil {
			return err
		}
		if err := tx.Create(&record).Error; err != nil {
			return err
		}
		if err := replaceRecordRelations(tx, definition, record, fields, data); err != nil {
			return err
		}
		if err := WriteRecordAudit(tx, "data.record.create", definition, record, principal, fields, map[string]interface{}{}, data); err != nil {
			return err
		}
		return enqueueRecordEvent(tx, "created", definition, record, fields, map[string]interface{}{}, data)
	})
	return record, err
}

func UpdateDynamicRecord(db *gorm.DB, workspaceID, actorID uuid.UUID, definitionKey string, recordID uuid.UUID, expectedVersion int, input map[string]interface{}) (models.Entity, error) {
	return UpdateDynamicRecordAs(db, workspaceID, legacyRecordPrincipal(actorID), definitionKey, recordID, expectedVersion, input)
}

func UpdateDynamicRecordAs(db *gorm.DB, workspaceID uuid.UUID, principal RecordPrincipal, definitionKey string, recordID uuid.UUID, expectedVersion int, input map[string]interface{}) (models.Entity, error) {
	definition, version, err := FindPublishedDefinition(db, workspaceID, definitionKey)
	if err != nil {
		return models.Entity{}, err
	}
	fields := parseFields(version.UISchema)
	if err := ValidateSystemRecordMutation(definitionKey, "update", input, principal); err != nil {
		return models.Entity{}, err
	}
	var updated models.Entity
	err = db.Transaction(func(tx *gorm.DB) error {
		var current models.Entity
		if err := tx.Where("id = ? AND workspace_id = ? AND definition_id = ?", recordID, workspaceID, definition.ID).First(&current).Error; err != nil {
			return err
		}
		if expectedVersion < 1 || current.RecordVersion != expectedVersion {
			return ErrRecordVersionConflict
		}
		var before map[string]interface{}
		if err := json.Unmarshal(current.Data, &before); err != nil {
			return &RecordOperationError{Message: "stored record data is invalid"}
		}
		if err := ValidateFieldWrites(fields, input, principal); err != nil {
			return err
		}
		data := cloneRecordData(before)
		for key, value := range input {
			data[key] = value
		}
		removeComputedInput(fields, data)
		ApplyFieldDefaults(fields, data)
		if err := ApplyFormulaFields(fields, data); err != nil {
			return &RecordOperationError{Message: err.Error()}
		}
		if err := ValidateRecordAgainstSchema(version.JSONSchema, data); err != nil {
			return err
		}
		if err := ValidateRecordReferences(tx, workspaceID, fields, data); err != nil {
			return err
		}
		raw, _ := json.Marshal(data)
		result := tx.Model(&models.Entity{}).Where(
			"id = ? AND workspace_id = ? AND definition_id = ? AND record_version = ?",
			recordID, workspaceID, definition.ID, expectedVersion,
		).Updates(map[string]interface{}{
			"data": datatypes.JSON(raw), "schema_version": version.Version,
			"record_version": gorm.Expr("record_version + 1"),
			"display_value":  DefinitionDisplayValue(definition, data), "updated_by": optionalUUID(principal.UserID),
			"updated_at": time.Now().UTC(),
		})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrRecordVersionConflict
		}
		if err := tx.Where("id = ?", recordID).First(&updated).Error; err != nil {
			return err
		}
		if err := replaceRecordRelations(tx, definition, updated, fields, data); err != nil {
			return err
		}
		if err := WriteRecordAudit(tx, "data.record.update", definition, updated, principal, fields, before, data); err != nil {
			return err
		}
		return enqueueRecordEvent(tx, "updated", definition, updated, fields, before, data)
	})
	return updated, err
}

func GetDynamicRecord(db *gorm.DB, workspaceID uuid.UUID, definitionKey string, recordID uuid.UUID) (models.Entity, error) {
	return GetDynamicRecordAs(db, workspaceID, PrincipalForSystem("system"), definitionKey, recordID)
}

func GetDynamicRecordAs(db *gorm.DB, workspaceID uuid.UUID, principal RecordPrincipal, definitionKey string, recordID uuid.UUID) (models.Entity, error) {
	definition, version, err := FindPublishedDefinition(db, workspaceID, definitionKey)
	if err != nil {
		return models.Entity{}, err
	}
	var record models.Entity
	err = db.Where("id = ? AND workspace_id = ? AND definition_id = ?", recordID, workspaceID, definition.ID).First(&record).Error
	if err != nil {
		return models.Entity{}, err
	}
	return ProjectRecordForRead(record, definition, parseFields(version.UISchema), principal), nil
}

// GetDynamicRecordForAIAs applies both caller read policy and the schema's AI
// disclosure policy. It is the only projection that may be attached to model
// context; ordinary record responses can legitimately contain PII that must
// never cross the AI boundary implicitly.
func GetDynamicRecordForAIAs(db *gorm.DB, workspaceID uuid.UUID, principal RecordPrincipal, definitionKey string, recordID uuid.UUID) (models.Entity, error) {
	definition, version, err := FindPublishedDefinition(db, workspaceID, definitionKey)
	if err != nil {
		return models.Entity{}, err
	}
	var record models.Entity
	if err := db.Where("id = ? AND workspace_id = ? AND definition_id = ?", recordID, workspaceID, definition.ID).First(&record).Error; err != nil {
		return models.Entity{}, err
	}
	return ProjectRecordForAI(record, definition, parseFields(version.UISchema), principal), nil
}

func GetDynamicRecordsByIDsAs(db *gorm.DB, workspaceID uuid.UUID, principal RecordPrincipal, definitionKey string, recordIDs []uuid.UUID) (map[uuid.UUID]models.Entity, error) {
	result := make(map[uuid.UUID]models.Entity)
	if len(recordIDs) == 0 {
		return result, nil
	}
	definition, version, err := FindPublishedDefinition(db, workspaceID, definitionKey)
	if err != nil {
		return nil, err
	}
	unique := make([]uuid.UUID, 0, len(recordIDs))
	seen := make(map[uuid.UUID]struct{}, len(recordIDs))
	for _, recordID := range recordIDs {
		if recordID == uuid.Nil {
			continue
		}
		if _, exists := seen[recordID]; exists {
			continue
		}
		seen[recordID] = struct{}{}
		unique = append(unique, recordID)
	}
	var records []models.Entity
	if err := db.Where("workspace_id = ? AND definition_id = ? AND id IN ?", workspaceID, definition.ID, unique).Find(&records).Error; err != nil {
		return nil, err
	}
	fields := parseFields(version.UISchema)
	for _, record := range records {
		projected := ProjectRecordForRead(record, definition, fields, principal)
		result[record.ID] = projected
	}
	return result, nil
}

func QueryDynamicRecords(db *gorm.DB, workspaceID uuid.UUID, definitionKey string, request RecordQueryRequest) (RecordQueryResult, error) {
	return QueryDynamicRecordsAs(db, workspaceID, PrincipalForSystem("system"), definitionKey, request)
}

func QueryDynamicRecordsAs(db *gorm.DB, workspaceID uuid.UUID, principal RecordPrincipal, definitionKey string, request RecordQueryRequest) (RecordQueryResult, error) {
	definition, version, err := FindPublishedDefinition(db, workspaceID, definitionKey)
	if err != nil {
		return RecordQueryResult{}, err
	}
	query := db.Where("workspace_id = ? AND definition_id = ?", workspaceID, definition.ID)
	fields := parseFields(version.UISchema)
	query, limit, err := applyRecordQuery(query, request, ReadableSchemaFields(fields, principal))
	if err != nil {
		return RecordQueryResult{}, &RecordOperationError{Message: err.Error()}
	}
	var records []models.Entity
	if err := query.Find(&records).Error; err != nil {
		return RecordQueryResult{}, err
	}
	result := RecordQueryResult{Data: records}
	if len(records) > limit {
		result.NextCursor = encodeRecordCursor(records[limit-1])
		result.Data = records[:limit]
	}
	for index := range result.Data {
		result.Data[index] = ProjectRecordForRead(result.Data[index], definition, fields, principal)
	}
	return result, nil
}

func QueryDynamicRecordsForAIAs(db *gorm.DB, workspaceID uuid.UUID, principal RecordPrincipal, definitionKey string, request RecordQueryRequest) (RecordQueryResult, error) {
	result, err := QueryDynamicRecordsAs(db, workspaceID, principal, definitionKey, request)
	if err != nil {
		return RecordQueryResult{}, err
	}
	definition, version, err := FindPublishedDefinition(db, workspaceID, definitionKey)
	if err != nil {
		return RecordQueryResult{}, err
	}
	fields := parseFields(version.UISchema)
	for index := range result.Data {
		result.Data[index] = ProjectRecordForAI(result.Data[index], definition, fields, principal)
	}
	return result, nil
}

func DeleteDynamicRecord(db *gorm.DB, workspaceID, actorID uuid.UUID, definitionKey string, recordID uuid.UUID) error {
	return DeleteDynamicRecordAs(db, workspaceID, legacyRecordPrincipal(actorID), definitionKey, recordID)
}

func DeleteDynamicRecordAs(db *gorm.DB, workspaceID uuid.UUID, principal RecordPrincipal, definitionKey string, recordID uuid.UUID) error {
	if err := ValidateSystemRecordMutation(definitionKey, "delete", nil, principal); err != nil {
		return err
	}
	definition, _, err := FindPublishedDefinition(db, workspaceID, definitionKey)
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		var record models.Entity
		if err := tx.Where("id = ? AND workspace_id = ? AND definition_id = ?", recordID, workspaceID, definition.ID).First(&record).Error; err != nil {
			return err
		}
		return deleteRecordTree(tx, workspaceID, record, definition, principal, map[uuid.UUID]bool{})
	})
}

func deleteRecordTree(tx *gorm.DB, workspaceID uuid.UUID, record models.Entity, definition models.EntityDefinition, principal RecordPrincipal, seen map[uuid.UUID]bool) error {
	if seen[record.ID] {
		return nil
	}
	seen[record.ID] = true
	var blocking int64
	if err := tx.Table("entity_record_relations AS links").
		Joins("JOIN entity_relations AS relations ON relations.id = links.relation_id").
		Where("links.workspace_id = ? AND links.target_record_id = ? AND relations.on_delete = ?", workspaceID, record.ID, "restrict").
		Count(&blocking).Error; err != nil {
		return err
	}
	if blocking > 0 {
		return &RecordOperationError{Message: "record is referenced by a restricted relation"}
	}
	var cascades []models.EntityRecordRelation
	if err := tx.Table("entity_record_relations AS links").
		Select("links.*").Joins("JOIN entity_relations AS relations ON relations.id = links.relation_id").
		Where("links.workspace_id = ? AND links.target_record_id = ? AND relations.on_delete = ?", workspaceID, record.ID, "cascade").
		Find(&cascades).Error; err != nil {
		return err
	}
	for _, edge := range cascades {
		var source models.Entity
		if err := tx.Where("id = ? AND workspace_id = ?", edge.SourceRecordID, workspaceID).First(&source).Error; err != nil {
			continue
		}
		var sourceDefinition models.EntityDefinition
		if source.DefinitionID == nil || tx.Where("id = ? AND workspace_id = ?", *source.DefinitionID, workspaceID).First(&sourceDefinition).Error != nil {
			return fmt.Errorf("dependent record schema is unavailable")
		}
		if err := deleteRecordTree(tx, workspaceID, source, sourceDefinition, principal, seen); err != nil {
			return err
		}
	}
	if err := nullifyIncomingRelations(tx, workspaceID, record.ID, principal); err != nil {
		return err
	}
	if err := tx.Where("workspace_id = ? AND (source_record_id = ? OR target_record_id = ?)", workspaceID, record.ID, record.ID).
		Delete(&models.EntityRecordRelation{}).Error; err != nil {
		return err
	}
	if err := tx.Delete(&record).Error; err != nil {
		return err
	}
	var data map[string]interface{}
	_ = json.Unmarshal(record.Data, &data)
	var version models.EntitySchemaVersion
	if err := tx.Where(
		"workspace_id = ? AND definition_id = ? AND version = ?",
		workspaceID, definition.ID, definition.CurrentVersion,
	).First(&version).Error; err != nil {
		return err
	}
	fields := parseFields(version.UISchema)
	if err := WriteRecordAudit(tx, "data.record.delete", definition, record, principal, fields, data, map[string]interface{}{}); err != nil {
		return err
	}
	return enqueueRecordEvent(tx, "deleted", definition, record, fields, data, map[string]interface{}{})
}

func replaceRecordRelations(tx *gorm.DB, definition models.EntityDefinition, record models.Entity, fields []SchemaFieldInput, data map[string]interface{}) error {
	var relations []models.EntityRelation
	if err := tx.Where("workspace_id = ? AND source_definition_id = ?", definition.WorkspaceID, definition.ID).Find(&relations).Error; err != nil {
		return err
	}
	for _, relation := range relations {
		ids, err := relationUUIDs(data[relation.SourceFieldKey], relation.Cardinality)
		if err != nil {
			return &RecordOperationError{Message: fmt.Sprintf("%s %v", relation.SourceFieldKey, err)}
		}
		if relation.Required && len(ids) == 0 {
			return &RecordOperationError{Message: fmt.Sprintf("%s requires at least one related record", relation.SourceFieldKey)}
		}
		if err := tx.Where("workspace_id = ? AND relation_id = ? AND source_record_id = ?", definition.WorkspaceID, relation.ID, record.ID).
			Delete(&models.EntityRecordRelation{}).Error; err != nil {
			return err
		}
		for _, targetID := range ids {
			var count int64
			if err := tx.Model(&models.Entity{}).Where(
				"id = ? AND workspace_id = ? AND definition_id = ?", targetID, definition.WorkspaceID, relation.TargetDefinitionID,
			).Count(&count).Error; err != nil {
				return err
			}
			if count != 1 {
				return &RecordOperationError{Message: fmt.Sprintf("%s references a missing target record", relation.SourceFieldKey)}
			}
			link := models.EntityRecordRelation{
				ID:          uuid.New(),
				WorkspaceID: definition.WorkspaceID, RelationID: relation.ID,
				SourceRecordID: record.ID, TargetRecordID: targetID,
			}
			if err := tx.Create(&link).Error; err != nil {
				return err
			}
		}
	}
	return nil
}

func nullifyIncomingRelations(tx *gorm.DB, workspaceID, targetID uuid.UUID, principal RecordPrincipal) error {
	var links []models.EntityRecordRelation
	if err := tx.Table("entity_record_relations AS links").
		Select("links.*").Joins("JOIN entity_relations AS relations ON relations.id = links.relation_id").
		Where("links.workspace_id = ? AND links.target_record_id = ? AND relations.on_delete = ?", workspaceID, targetID, "nullify").
		Find(&links).Error; err != nil {
		return err
	}
	for _, link := range links {
		var relation models.EntityRelation
		var source models.Entity
		if tx.First(&relation, "id = ?", link.RelationID).Error != nil ||
			tx.First(&source, "id = ? AND workspace_id = ?", link.SourceRecordID, workspaceID).Error != nil {
			continue
		}
		var data map[string]interface{}
		_ = json.Unmarshal(source.Data, &data)
		before := cloneRecordData(data)
		if relation.Cardinality == "one" {
			delete(data, relation.SourceFieldKey)
		} else if values, ok := data[relation.SourceFieldKey].([]interface{}); ok {
			filtered := make([]interface{}, 0, len(values))
			for _, value := range values {
				if fmt.Sprint(value) != targetID.String() {
					filtered = append(filtered, value)
				}
			}
			data[relation.SourceFieldKey] = filtered
		}
		var definition models.EntityDefinition
		if source.DefinitionID == nil || tx.Where(
			"id = ? AND workspace_id = ?", *source.DefinitionID, workspaceID,
		).First(&definition).Error != nil {
			return fmt.Errorf("dependent record schema is unavailable")
		}
		var version models.EntitySchemaVersion
		if err := tx.Where(
			"workspace_id = ? AND definition_id = ? AND version = ?",
			workspaceID, definition.ID, definition.CurrentVersion,
		).First(&version).Error; err != nil {
			return err
		}
		fields := parseFields(version.UISchema)
		if err := ApplyFormulaFields(fields, data); err != nil {
			return err
		}
		if err := ValidateRecordAgainstSchema(version.JSONSchema, data); err != nil {
			return err
		}
		raw, _ := json.Marshal(data)
		if err := tx.Model(&source).Updates(map[string]interface{}{
			"data":           datatypes.JSON(raw),
			"schema_version": version.Version,
			"record_version": gorm.Expr("record_version + 1"),
			"display_value":  DefinitionDisplayValue(definition, data),
			"updated_by":     optionalUUID(principal.UserID),
			"updated_at":     time.Now().UTC(),
		}).Error; err != nil {
			return err
		}
		var updated models.Entity
		if err := tx.Where("id = ? AND workspace_id = ?", source.ID, workspaceID).First(&updated).Error; err != nil {
			return err
		}
		if err := WriteRecordAudit(tx, "data.record.update", definition, updated, principal, fields, before, data); err != nil {
			return err
		}
		if err := enqueueRecordEvent(tx, "updated", definition, updated, fields, before, data); err != nil {
			return err
		}
	}
	return nil
}

func enqueueRecordEvent(
	tx *gorm.DB,
	action string,
	definition models.EntityDefinition,
	record models.Entity,
	fields []SchemaFieldInput,
	before map[string]interface{},
	after map[string]interface{},
) error {
	eventType := "data.record." + action
	changedFields := ChangedRecordFields(before, after)
	eventData := after
	if action == "deleted" {
		eventData = before
	}
	payload := map[string]interface{}{
		"record_id": record.ID.String(), "entity_id": record.ID.String(),
		"definition_id": definition.ID.String(), "definition_key": definition.Key,
		"schema_version": record.SchemaVersion, "record_version": record.RecordVersion,
		"display_value": record.DisplayValue, "changed_fields": changedFields,
		"data": EventRecordData(fields, eventData),
	}
	if err := EnqueueOutbox(tx, definition.WorkspaceID, "events."+eventType, eventType, definition.Key, record.ID, cloneRecordData(payload)); err != nil {
		return err
	}
	if strings.HasPrefix(definition.Key, "crm_") {
		domainType := strings.ReplaceAll(strings.TrimPrefix(definition.Key, "crm_"), "_", ".")
		crmEventType := "crm." + domainType + "." + action
		return EnqueueOutbox(tx, definition.WorkspaceID, "events."+crmEventType, crmEventType, definition.Key, record.ID, cloneRecordData(payload))
	}
	return nil
}

func parseFields(uiSchema datatypes.JSON) []SchemaFieldInput {
	var value struct {
		Fields []SchemaFieldInput `json:"fields"`
	}
	_ = json.Unmarshal(uiSchema, &value)
	for index := range value.Fields {
		if value.Fields[index].Lifecycle == "" {
			value.Fields[index].Lifecycle = "active"
		}
		if value.Fields[index].Classification == "" {
			value.Fields[index].Classification = "internal"
		}
	}
	return value.Fields
}
func cloneRecordData(input map[string]interface{}) map[string]interface{} {
	output := make(map[string]interface{}, len(input))
	for key, value := range input {
		output[key] = value
	}
	return output
}
func removeComputedInput(fields []SchemaFieldInput, data map[string]interface{}) {
	for _, field := range fields {
		if field.Type == "formula" {
			delete(data, field.Key)
		}
	}
}
func ApplyFieldDefaults(fields []SchemaFieldInput, data map[string]interface{}) {
	for _, field := range fields {
		if field.Type == "formula" || field.Default == nil {
			continue
		}
		if value, exists := data[field.Key]; !exists || value == nil {
			data[field.Key] = field.Default
		}
	}
}
func optionalUUID(id uuid.UUID) *uuid.UUID {
	if id == uuid.Nil {
		return nil
	}
	return &id
}

func legacyRecordPrincipal(actorID uuid.UUID) RecordPrincipal {
	if actorID == uuid.Nil {
		return PrincipalForSystem("system")
	}
	return PrincipalForUser(actorID, "")
}
