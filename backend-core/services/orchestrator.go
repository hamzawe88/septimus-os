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

	contentBytes, err := json.Marshal(entity.Data)
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
	logPayload, _ := json.Marshal(map[string]interface{}{
		"agent_name":  "Orchestrator",
		"action":      "Created Project from CRM Deal",
		"input_data":  dealName,
		"output_data": fmt.Sprintf("Project %s and Task created", newProject.ID),
		"status":      "completed",
	})
	events.PublishEvent("agent.collaboration.log", logPayload)
}
