package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/events"
	"github.com/septimus-os/backend-core/models"
)

type CorrespondenceMetrics struct {
	TotalCorrespondences int              `json:"total_correspondences"`
	PendingCount         int              `json:"pending_count"`
	SignedOrDispatched   int              `json:"signed_or_dispatched"`
	AvgProcessingDays    float64          `json:"avg_processing_days"`
	BottlenecksByPath    []PathBottleneck `json:"bottlenecks_by_path"`
}

type PathBottleneck struct {
	PathSegment  string  `json:"path_segment"`
	PendingCount int     `json:"pending_count"`
	AvgDaysOpen  float64 `json:"avg_days_open"`
}

type FinanceCRMMetrics struct {
	TotalInvoices        int     `json:"total_invoices"`
	OverdueInvoices      int     `json:"overdue_invoices"`
	OverduePercentage    float64 `json:"overdue_percentage"`
	TotalInvoiceAmount   float64 `json:"total_invoice_amount"`
	OverdueAmount        float64 `json:"overdue_amount"`
	TotalDeals           int     `json:"total_deals"`
	WonDeals             int     `json:"won_deals"`
	DealConversionRate   float64 `json:"deal_conversion_rate"`
	TotalDealValue       float64 `json:"total_deal_value"`
}

type OperationalMetrics struct {
	TotalAttendanceLogs int     `json:"total_attendance_logs"`
	LateCheckIns        int     `json:"late_check_ins"`
	LatePercentage      float64 `json:"late_percentage"`
	TotalTasks          int     `json:"total_tasks"`
	CompletedTasks      int     `json:"completed_tasks"`
	TaskCompletionRate  float64 `json:"task_completion_rate"`
	AvgTaskDays         float64 `json:"avg_task_days"`
}

type MinedOrganizationalPatterns struct {
	WorkspaceID           uuid.UUID             `json:"workspace_id"`
	Timestamp             time.Time             `json:"timestamp"`
	CorrespondenceMetrics CorrespondenceMetrics `json:"correspondence_metrics"`
	FinanceCRMMetrics     FinanceCRMMetrics     `json:"finance_crm_metrics"`
	OperationalMetrics    OperationalMetrics    `json:"operational_metrics"`
	CandidateInsights     []string              `json:"candidate_insights"`
}

// MineOrganizationalPatterns performs SQL analytical mining over institutional DB tables,
// enforces Section 4 re-derivation (exact numerics and denominators), and publishes
// events.analytics.mine_requested to the ai-sidecar NATS JetStream for candidate fact distillation.
func MineOrganizationalPatterns(c *fiber.Ctx) error {
	var workspaceID uuid.UUID
	if val := c.Locals("workspace_id"); val != nil {
		if str, ok := val.(string); ok {
			workspaceID = database.ParseUUID(str)
		}
	}
	if workspaceID == uuid.Nil {
		if qID := c.Query("workspace_id"); qID != "" {
			workspaceID = database.ParseUUID(qID)
		}
	}
	if workspaceID == uuid.Nil {
		workspaceID = resolveDefaultWorkspaceID()
	}

	patterns, err := ComputeOrganizationalPatterns(workspaceID)
	if err != nil {
		log.Printf("❌ [Analytics Miner] Failed to compute patterns for workspace %s: %v", workspaceID, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "failed to mine organizational patterns",
			"details": err.Error(),
		})
	}

	// Publish NATS event so ai-sidecar (agents_miner.py) can distill candidate facts into pgvector
	eventPayload := map[string]interface{}{
		"workspace_id": workspaceID.String(),
		"timestamp":    patterns.Timestamp.Format(time.RFC3339),
		"patterns":     patterns,
	}
	if rawBytes, err := json.Marshal(eventPayload); err == nil {
		if pubErr := events.PublishEvent("events.analytics.mine_requested", rawBytes); pubErr != nil {
			log.Printf("⚠️ [Analytics Miner] Could not publish events.analytics.mine_requested: %v", pubErr)
		} else {
			log.Printf("📢 [Analytics Miner] Published events.analytics.mine_requested for workspace %s", workspaceID)
		}
	}

	return c.JSON(fiber.Map{
		"status":   "success",
		"patterns": patterns,
	})
}

func ComputeOrganizationalPatterns(workspaceID uuid.UUID) (*MinedOrganizationalPatterns, error) {
	out := &MinedOrganizationalPatterns{
		WorkspaceID:       workspaceID,
		Timestamp:         time.Now().UTC(),
		CandidateInsights: make([]string, 0),
	}
	out.CorrespondenceMetrics.BottlenecksByPath = make([]PathBottleneck, 0)

	// 1. Correspondence Mining
	var corrs []models.Correspondence
	if err := database.DB.Where("workspace_id = ?", workspaceID).Find(&corrs).Error; err != nil {
		return nil, fmt.Errorf("failed querying correspondences: %w", err)
	}

	out.CorrespondenceMetrics.TotalCorrespondences = len(corrs)
	var totalDays float64
	var completedOrSigned int
	pathPendingMap := make(map[string]int)
	pathDaysMap := make(map[string]float64)

	for _, c := range corrs {
		statusLower := strings.ToLower(c.Status)
		if statusLower == "pending_approval" || statusLower == "draft" {
			out.CorrespondenceMetrics.PendingCount++
			path := c.Path
			if path == "" {
				path = "general_diwan"
			}
			pathPendingMap[path]++
			daysOpen := time.Since(c.CreatedAt).Hours() / 24.0
			pathDaysMap[path] += daysOpen
		} else if statusLower == "signed" || statusLower == "dispatched" || statusLower == "archived" {
			out.CorrespondenceMetrics.SignedOrDispatched++
			completedOrSigned++
			days := c.UpdatedAt.Sub(c.CreatedAt).Hours() / 24.0
			if days > 0 {
				totalDays += days
			}
		}
	}

	if completedOrSigned > 0 {
		out.CorrespondenceMetrics.AvgProcessingDays = math.Round((totalDays/float64(completedOrSigned))*100) / 100
	}

	for path, count := range pathPendingMap {
		avgDays := 0.0
		if count > 0 {
			avgDays = math.Round((pathDaysMap[path]/float64(count))*100) / 100
		}
		out.CorrespondenceMetrics.BottlenecksByPath = append(out.CorrespondenceMetrics.BottlenecksByPath, PathBottleneck{
			PathSegment:  path,
			PendingCount: count,
			AvgDaysOpen:  avgDays,
		})
		if count >= 3 || avgDays >= 3.0 {
			out.CandidateInsights = append(out.CandidateInsights, fmt.Sprintf(
				"[VERIFIED STATS] المراسلات في المسار المؤسسي ('%s') تعاني من تراكم (%d معاملة معلقة) بمتوسط تأخير %.1f أيام.",
				path, count, avgDays,
			))
		}
	}

	// 2. Finance & CRM Mining (from JSONB entities)
	var entities []models.Entity
	if err := database.DB.Where("workspace_id = ? AND entity_type IN (?, ?, ?, ?)",
		workspaceID, "invoice", "finance_invoice", "deal", "crm_deal").Find(&entities).Error; err == nil {

		for _, e := range entities {
			var dataMap map[string]interface{}
			if err := json.Unmarshal(e.Data, &dataMap); err != nil || dataMap == nil {
				continue
			}

			status, _ := extractJSONString(dataMap, "status")
			amount, _ := extractJSONFloat(dataMap, "amount", "total_amount", "value")

			if e.EntityType == "invoice" || e.EntityType == "finance_invoice" {
				out.FinanceCRMMetrics.TotalInvoices++
				out.FinanceCRMMetrics.TotalInvoiceAmount += amount
				statusLower := strings.ToLower(status)
				if statusLower == "overdue" || statusLower == "unpaid" {
					out.FinanceCRMMetrics.OverdueInvoices++
					out.FinanceCRMMetrics.OverdueAmount += amount
				}
			} else if e.EntityType == "deal" || e.EntityType == "crm_deal" {
				out.FinanceCRMMetrics.TotalDeals++
				out.FinanceCRMMetrics.TotalDealValue += amount
				stage, _ := extractJSONString(dataMap, "stage")
				if strings.ToLower(stage) == "won" || strings.ToLower(status) == "won" {
					out.FinanceCRMMetrics.WonDeals++
				}
			}
		}

		if out.FinanceCRMMetrics.TotalInvoices > 0 {
			out.FinanceCRMMetrics.OverduePercentage = math.Round((float64(out.FinanceCRMMetrics.OverdueInvoices)/float64(out.FinanceCRMMetrics.TotalInvoices))*10000) / 100
			if out.FinanceCRMMetrics.OverduePercentage >= 25.0 {
				out.CandidateInsights = append(out.CandidateInsights, fmt.Sprintf(
					"[VERIFIED STATS] الفواتير المالية في مسار التحصيل تواجه تأخراً بنسبة %.1f%% (%d فاتورة متأخرة بإجمالي قيمة %.2f د.ل).",
					out.FinanceCRMMetrics.OverduePercentage, out.FinanceCRMMetrics.OverdueInvoices, out.FinanceCRMMetrics.OverdueAmount,
				))
			}
		}
		if out.FinanceCRMMetrics.TotalDeals > 0 {
			out.FinanceCRMMetrics.DealConversionRate = math.Round((float64(out.FinanceCRMMetrics.WonDeals)/float64(out.FinanceCRMMetrics.TotalDeals))*10000) / 100
		}
	}

	// 3. Operational & Attendance Mining
	var attLogs []models.AttendanceLog
	if err := database.DB.Joins("User").Where("User.workspace_id = ?", workspaceID).Find(&attLogs).Error; err == nil {
		out.OperationalMetrics.TotalAttendanceLogs = len(attLogs)
		for _, l := range attLogs {
			if strings.ToLower(l.Status) == "late" {
				out.OperationalMetrics.LateCheckIns++
			}
		}
		if out.OperationalMetrics.TotalAttendanceLogs > 0 {
			out.OperationalMetrics.LatePercentage = math.Round((float64(out.OperationalMetrics.LateCheckIns)/float64(out.OperationalMetrics.TotalAttendanceLogs))*10000) / 100
			if out.OperationalMetrics.LatePercentage >= 20.0 {
				out.CandidateInsights = append(out.CandidateInsights, fmt.Sprintf(
					"[VERIFIED STATS] معدلات التأخر في تسجيل الحضور والانصراف تبلغ %.1f%% (%d حالة تأخير من إجمالي %d سجل).",
					out.OperationalMetrics.LatePercentage, out.OperationalMetrics.LateCheckIns, out.OperationalMetrics.TotalAttendanceLogs,
				))
			}
		}
	}

	// Tasks Mining
	var tasks []models.Task
	if err := database.DB.Joins("Project").Where("Project.workspace_id = ?", workspaceID).Find(&tasks).Error; err == nil {
		out.OperationalMetrics.TotalTasks = len(tasks)
		var taskDaysSum float64
		for _, t := range tasks {
			statusLower := strings.ToLower(t.Status)
			if statusLower == "done" || statusLower == "completed" {
				out.OperationalMetrics.CompletedTasks++
				duration := t.UpdatedAt.Sub(t.CreatedAt).Hours() / 24.0
				if duration > 0 {
					taskDaysSum += duration
				}
			}
		}
		if out.OperationalMetrics.TotalTasks > 0 {
			out.OperationalMetrics.TaskCompletionRate = math.Round((float64(out.OperationalMetrics.CompletedTasks)/float64(out.OperationalMetrics.TotalTasks))*10000) / 100
		}
		if out.OperationalMetrics.CompletedTasks > 0 {
			out.OperationalMetrics.AvgTaskDays = math.Round((taskDaysSum/float64(out.OperationalMetrics.CompletedTasks))*100) / 100
		}
	}

	return out, nil
}

func extractJSONString(m map[string]interface{}, keys ...string) (string, bool) {
	for _, k := range keys {
		if val, ok := m[k]; ok && val != nil {
			if s, ok := val.(string); ok {
				return s, true
			}
		}
	}
	return "", false
}

func extractJSONFloat(m map[string]interface{}, keys ...string) (float64, bool) {
	for _, k := range keys {
		if val, ok := m[k]; ok && val != nil {
			switch v := val.(type) {
			case float64:
				return v, true
			case int:
				return float64(v), true
			case int64:
				return float64(v), true
			}
		}
	}
	return 0, false
}
