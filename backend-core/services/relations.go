package services

import (
	"fmt"

	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/gorm"
)

func SyncPublishedRelations(tx *gorm.DB, definition models.EntityDefinition, fields []SchemaFieldInput) error {
	if err := ValidateRelationTargets(tx, definition.WorkspaceID, fields); err != nil {
		return err
	}
	var existing []models.EntityRelation
	if err := tx.Where("workspace_id = ? AND source_definition_id = ?", definition.WorkspaceID, definition.ID).
		Find(&existing).Error; err != nil {
		return err
	}
	byField := make(map[string]models.EntityRelation, len(existing))
	for _, relation := range existing {
		byField[relation.SourceFieldKey] = relation
	}
	kept := map[string]bool{}
	for _, field := range fields {
		if field.Type != "relation" || field.Relation == nil {
			continue
		}
		var target models.EntityDefinition
		if err := tx.Where("workspace_id = ? AND key = ? AND status = ?",
			definition.WorkspaceID, field.Relation.TargetDefinitionKey, models.EntityDefinitionStatusPublished).
			First(&target).Error; err != nil {
			return fmt.Errorf("relation %s target %s must be published", field.Key, field.Relation.TargetDefinitionKey)
		}
		onDelete := field.Relation.OnDelete
		if onDelete == "" {
			onDelete = "restrict"
		}
		relation := models.EntityRelation{
			ID:          uuid.New(),
			WorkspaceID: definition.WorkspaceID, SourceDefinitionID: definition.ID,
			SourceFieldKey: field.Key, TargetDefinitionID: target.ID,
			Cardinality: field.Relation.Cardinality, OnDelete: onDelete,
			LabelAr: field.LabelAr, LabelEn: field.LabelEn, Required: field.Required,
		}
		if current, ok := byField[field.Key]; ok {
			relation.ID = current.ID
			if err := tx.Model(&models.EntityRelation{}).Where("id = ? AND workspace_id = ?", current.ID, definition.WorkspaceID).
				Updates(map[string]interface{}{
					"target_definition_id": target.ID, "cardinality": relation.Cardinality,
					"on_delete": relation.OnDelete, "label_ar": relation.LabelAr,
					"label_en": relation.LabelEn, "required": relation.Required,
				}).Error; err != nil {
				return err
			}
		} else if err := tx.Create(&relation).Error; err != nil {
			return err
		}
		kept[field.Key] = true
	}
	for _, relation := range existing {
		if kept[relation.SourceFieldKey] {
			continue
		}
		var links int64
		if err := tx.Model(&models.EntityRecordRelation{}).Where("relation_id = ?", relation.ID).Count(&links).Error; err != nil {
			return err
		}
		if links > 0 {
			return fmt.Errorf("relation %s cannot be removed while records still reference it", relation.SourceFieldKey)
		}
		if err := tx.Delete(&relation).Error; err != nil {
			return err
		}
	}
	return nil
}

func ValidateRelationTargets(db *gorm.DB, workspaceID uuid.UUID, fields []SchemaFieldInput) error {
	for _, field := range fields {
		if field.Type != "relation" || field.Relation == nil {
			continue
		}
		var count int64
		if err := db.Model(&models.EntityDefinition{}).Where(
			"workspace_id = ? AND key = ? AND status = ?",
			workspaceID, field.Relation.TargetDefinitionKey, models.EntityDefinitionStatusPublished,
		).Count(&count).Error; err != nil {
			return err
		}
		if count != 1 {
			return fmt.Errorf("relation %s target %s must be published", field.Key, field.Relation.TargetDefinitionKey)
		}
	}
	return nil
}

func relationUUIDs(value interface{}, cardinality string) ([]uuid.UUID, error) {
	if value == nil {
		return nil, nil
	}
	raw := []interface{}{value}
	if cardinality == "many" {
		values, ok := value.([]interface{})
		if !ok {
			return nil, fmt.Errorf("must be an array of record ids")
		}
		raw = values
	}
	ids := make([]uuid.UUID, 0, len(raw))
	seen := map[uuid.UUID]bool{}
	for _, item := range raw {
		text, ok := item.(string)
		id, err := uuid.Parse(text)
		if !ok || err != nil {
			return nil, fmt.Errorf("contains an invalid record id")
		}
		if !seen[id] {
			ids = append(ids, id)
			seen[id] = true
		}
	}
	return ids, nil
}
