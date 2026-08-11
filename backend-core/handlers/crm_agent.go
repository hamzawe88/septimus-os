package handlers

import (
	"errors"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/gorm"
)

// Internal CRM endpoints backing the sales agent's action tools.
//
// These sit on the token-gated /internal group; authorization is enforced in
// the sidecar (the tools are only handed to sales/manager/admin agents and
// re-check the user role), matching the HR agent-tool security model.
//
// Stage moves reuse moveCRMStageInTransaction, so the agent goes through the
// exact same state machine, row lock, optimistic-version check, audit log and
// outbox event a human user does — an agent can never take a transition a
// person could not.

// AdvanceCRMOpportunityInternal moves an opportunity to a target stage on
// behalf of the agent. It resolves the record's current version itself so the
// agent never has to reason about optimistic concurrency.
func AdvanceCRMOpportunityInternal(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	var body struct {
		OpportunityID string `json:"opportunity_id"`
		Stage         string `json:"stage"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	opportunityID, err := uuid.Parse(strings.TrimSpace(body.OpportunityID))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "valid opportunity_id is required"})
	}
	target := normalizeCRMStage(body.Stage)
	if _, ok := crmStageTransitions[target]; !ok {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid CRM stage", "code": "CRM_INVALID_STAGE",
		})
	}

	db := database.GetDB(c)
	// Read the current version so the agent call is a normal optimistic update
	// rather than a blind write.
	var current models.Entity
	if err := db.Select("id, record_version").
		Where("id = ? AND workspace_id = ? AND entity_type = ? AND definition_id IS NOT NULL",
			opportunityID, workspaceID, "crm_opportunity").
		First(&current).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Opportunity not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load opportunity"})
	}

	updated, err := moveCRMStageInTransaction(db, workspaceID, nil, opportunityID, target, current.RecordVersion, c.IP())
	if err != nil {
		var domainErr *crmDomainError
		if errors.As(err, &domainErr) {
			return c.Status(domainErr.Status).JSON(fiber.Map{"error": domainErr.Public, "code": domainErr.Code})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to move CRM stage"})
	}
	// An agent-driven move fires the same automation a human move does.
	go ExecuteWorkflowsByTrigger(workspaceID, "crm.opportunity.stage_changed", crmStageTriggerContext(updated, target, workspaceID))

	return c.JSON(fiber.Map{
		"opportunity_id": updated.ID,
		"title":          updated.DisplayValue,
		"stage":          target,
		"record_version": updated.RecordVersion,
	})
}

// GetCRMPipelineInternal gives the agent the same weighted pipeline summary the
// dashboard shows, so it can answer "how is the pipeline doing?" with real
// numbers instead of guessing. Read-only.
func GetCRMPipelineInternal(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	currency := strings.ToUpper(strings.TrimSpace(c.Query("currency", "SAR")))
	if !crmCurrencyCode.MatchString(currency) {
		currency = "SAR"
	}
	db := database.GetDB(c)

	type stageRow struct {
		Stage string
		Count int64
		Value float64
	}
	var rows []stageRow
	if err := db.Table("entities").
		Where(`workspace_id = ? AND entity_type = ? AND definition_id IS NOT NULL AND deleted_at IS NULL
			AND UPPER(COALESCE(data->>'currency','')) = ?`, workspaceID, "crm_opportunity", currency).
		Select(`LOWER(COALESCE(data->>'stage','new')) AS stage, COUNT(*) AS count,
			COALESCE(SUM(NULLIF(data->>'value','')::numeric), 0) AS value`).
		Group("LOWER(COALESCE(data->>'stage','new'))").Scan(&rows).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to aggregate pipeline"})
	}

	byStage := map[string]stageRow{}
	for _, r := range rows {
		byStage[r.Stage] = r
	}
	var openValue, weighted float64
	var openCount int64
	stages := make([]fiber.Map, 0, len(crmOpenStages))
	for _, st := range crmOpenStages {
		r := byStage[st]
		openValue += r.Value
		weighted += r.Value * crmStageProbability[st]
		openCount += r.Count
		stages = append(stages, fiber.Map{"stage": st, "count": r.Count, "value": round2f(r.Value)})
	}
	return c.JSON(fiber.Map{
		"currency": currency, "open_count": openCount,
		"open_value": round2f(openValue), "weighted_value": round2f(weighted),
		"won_count": byStage["closed_won"].Count, "lost_count": byStage["closed_lost"].Count,
		"by_stage": stages,
	})
}
