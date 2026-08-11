package services

import (
	"encoding/json"
	"fmt"
	"log"

	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/events"
	"github.com/septimus-os/backend-core/models"
)

// HandleEntityChange embeds the new entity state and triggers Cross-Department orchestration
func HandleEntityChange(entityID uuid.UUID) {
	var entity models.Entity
	if err := database.DB.Where("id = ?", entityID).First(&entity).Error; err != nil {
		log.Printf("HandleEntityChange: Entity not found: %s", entityID)
		return
	}

	var recordData map[string]interface{}
	if err := json.Unmarshal(entity.Data, &recordData); err != nil {
		log.Printf("HandleEntityChange: Error decoding data: %v", err)
		return
	}
	embeddingPayload := map[string]interface{}{
		"definition_key": entity.EntityType,
		"display_value":  entity.DisplayValue,
		"fields":         recordData,
	}
	// File/user/relation values are identifiers, not semantic content. Exclude
	// them from the embedding text while keeping numeric formulas and labels.
	if entity.DefinitionID != nil {
		var definition models.EntityDefinition
		if err := database.DB.Where("id = ? AND workspace_id = ?", *entity.DefinitionID, entity.WorkspaceID).First(&definition).Error; err == nil {
			var version models.EntitySchemaVersion
			if err := database.DB.Where(
				"workspace_id = ? AND definition_id = ? AND version = ?",
				entity.WorkspaceID, definition.ID, entity.SchemaVersion,
			).First(&version).Error; err != nil {
				log.Printf("HandleEntityChange: published schema version unavailable for entity %s", entityID)
				return
			}
			fields := parseFields(version.UISchema)
			searchable := map[string]interface{}{}
			for _, field := range fields {
				switch field.Type {
				case "file", "user", "relation":
					continue
				}
				if !FieldIncludedInAI(field) {
					if field.Key == definition.TitleFieldKey {
						embeddingPayload["display_value"] = ""
					}
					continue
				}
				if value, exists := recordData[field.Key]; exists {
					searchable[field.Key] = value
				}
			}
			embeddingPayload["definition_label_ar"] = definition.LabelAr
			embeddingPayload["definition_label_en"] = definition.LabelEn
			embeddingPayload["fields"] = searchable
		}
	}
	contentBytes, err := json.Marshal(embeddingPayload)
	if err != nil {
		log.Printf("HandleEntityChange: Error marshaling data: %v", err)
		return
	}
	contentStr := string(contentBytes)

	// Generate & Store Embedding for RAG
	err = StoreEmbedding(entity.WorkspaceID, entity.EntityType, entity.ID, contentStr)
	if err != nil {
		log.Printf("HandleEntityChange: Warning, could not store embedding: %v", err)
	}

	// Trigger Cross-Department Logic
	if entity.EntityType == "deal" {
		processDealOrchestration(entity)
	}
}

func processDealOrchestration(entity models.Entity) {
	var data map[string]interface{}
	json.Unmarshal(entity.Data, &data)

	status, ok := data["status"].(string)
	if !ok || status != "Closed Won" {
		return // Only orchestrate on Closed Won deals
	}

	dealName, _ := data["title"].(string)
	if dealName == "" {
		dealName = "New CRM Deal"
	}

	log.Printf("🚀 Cross-Department Orchestrator triggered for Closed Won deal: %s", dealName)

	// Create a new Project for the Deal
	newProject := models.Project{
		WorkspaceID: entity.WorkspaceID,
		Name:        fmt.Sprintf("Project for %s", dealName),
	}
	if err := database.DB.Create(&newProject).Error; err != nil {
		log.Printf("Error creating project for deal: %v", err)
		return
	}

	// Create a default kickoff task
	newTask := models.Task{
		ProjectID:   newProject.ID,
		Title:       "Kickoff Meeting for " + dealName,
		Description: "Automatically created by AI Orchestrator based on a Closed Won CRM Deal.",
		Status:      "todo",
	}
	database.DB.Create(&newTask)

	// Optionally notify via NATS to the orchestrator UI / log stream
	if err := events.PublishTenantEvent("agent.collaboration.log", entity.WorkspaceID, map[string]interface{}{
		"agent_name":  "Orchestrator",
		"action":      "Created Project from CRM Deal",
		"input_data":  dealName,
		"output_data": fmt.Sprintf("Project %s and Task created", newProject.ID),
		"status":      "completed",
	}); err != nil {
		log.Printf("agent.collaboration.log not published for entity %s: %v", entity.ID, err)
	}
}
