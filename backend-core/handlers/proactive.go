package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/robfig/cron/v3"

	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/events"
	"github.com/septimus-os/backend-core/models"
)

// ProactiveAlert dedups stuck-task alerts — at most one alert per task per
// stuck episode (a new episode begins when the task is updated again).
type ProactiveAlert struct {
	ID        uuid.UUID  `gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	TaskID    *uuid.UUID `gorm:"type:uuid;index"`
	EntityID  *uuid.UUID `gorm:"type:uuid;index"`
	AlertType string     `gorm:"type:varchar(50);index"`
	AlertedAt time.Time  `gorm:"autoCreateTime"`
}

const proactiveAuditorRole = "مدقّق المشاريع"

// stuckStatuses are the actively-worked states a task should not linger in.
var stuckStatuses = []string{"in_progress", "review", "blocked"}

func stuckTaskDays() int {
	if v := os.Getenv("STUCK_TASK_DAYS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return 3
}

// StartProactiveAuditor runs the stuck-task auditor on an interval. This is a
// proactive (not reactive) agent: it surfaces problems nobody asked about.
func StartProactiveAuditor() {
	if err := database.DB.AutoMigrate(&ProactiveAlert{}); err != nil {
		log.Printf("[Auditor] migrate failed: %v", err)
	}

	interval := 6 * time.Hour
	if v := os.Getenv("PROACTIVE_AUDIT_INTERVAL"); v != "" {
		if d, err := time.ParseDuration(v); err == nil && d > 0 {
			interval = d
		}
	}

	go func() {
		time.Sleep(30 * time.Second) // let the app finish booting
		for {
			RunProactiveAudit()
			time.Sleep(interval)
		}
	}()
	log.Printf("[Auditor] proactive project auditor started (interval %s, threshold %d days)", interval, stuckTaskDays())

	// Start Morning Brief cron job alongside auditor
	StartMorningBriefCron()
}

// RunProactiveAudit scans every workspace for stuck tasks and posts one grouped
// alert per workspace to its general channel. Returns the number of alerts posted.
func RunProactiveAudit() int {
	threshold := time.Now().AddDate(0, 0, -stuckTaskDays())

	var tasks []models.Task
	if err := database.DB.
		Where("status IN ? AND updated_at < ?", stuckStatuses, threshold).
		Find(&tasks).Error; err != nil {
		log.Printf("[Auditor] query failed: %v", err)
		return 0
	}

	byWorkspace := map[uuid.UUID][]models.Task{}
	for _, t := range tasks {
		if alreadyAlerted(t) {
			continue
		}
		var project models.Project
		if err := database.DB.Select("workspace_id").First(&project, "id = ?", t.ProjectID).Error; err != nil {
			continue
		}
		byWorkspace[project.WorkspaceID] = append(byWorkspace[project.WorkspaceID], t)
	}

	posted := 0
	for wsID, wsTasks := range byWorkspace {
		channelID := generalChannelID(wsID)
		if channelID == uuid.Nil {
			continue
		}
		if postAuditorMessage(wsID, channelID, buildStuckMessage(wsTasks)) {
			posted++
			for _, t := range wsTasks {
				taskID := t.ID
				database.DB.Create(&ProactiveAlert{TaskID: &taskID, AlertType: "stuck_task"})
			}
		}
	}

	// Anomaly Scanning (JSONB Entities)
	posted += scanEntityAnomalies()

	// HR document expiry (Iqama / insurance) — 60/30/7-day proactive alerts.
	posted += scanExpiringDocuments()

	if posted > 0 {
		log.Printf("[Auditor] posted %d proactive alert(s)", posted)
	}
	return posted
}

func scanEntityAnomalies() int {
	posted := 0

	// Find all workspaces
	var workspaces []models.Workspace
	if err := database.DB.Find(&workspaces).Error; err != nil {
		return 0
	}

	for _, ws := range workspaces {
		channelID := generalChannelID(ws.ID)
		if channelID == uuid.Nil {
			continue
		}

		// 1. Unpaid Invoices older than 30 days
		var invoices []models.Entity
		// We'll just fetch all invoices and filter in memory to avoid complex jsonb date queries across DBs
		database.DB.Where("workspace_id = ? AND entity_type = ?", ws.ID, "invoice").Find(&invoices)

		var anomalousInvoices []models.Entity
		for _, inv := range invoices {
			if alreadyAlertedEntity(inv.ID, "unpaid_invoice") {
				continue
			}
			var data map[string]interface{}
			if err := json.Unmarshal(inv.Data, &data); err == nil {
				if status, ok := data["status"].(string); ok && status != "paid" {
					if dueDateStr, ok := data["due_date"].(string); ok {
						if dueDate, err := time.Parse(time.RFC3339, dueDateStr); err == nil {
							if time.Since(dueDate).Hours() > 30*24 {
								anomalousInvoices = append(anomalousInvoices, inv)
							}
						}
					}
				}
			}
		}

		if len(anomalousInvoices) > 0 {
			msg := buildAnomalousInvoiceMessage(anomalousInvoices)
			if postAuditorMessage(ws.ID, channelID, msg) {
				posted++
				for _, inv := range anomalousInvoices {
					entityID := inv.ID
					database.DB.Create(&ProactiveAlert{EntityID: &entityID, AlertType: "unpaid_invoice"})
				}
			}
		}
	}

	return posted
}

func buildAnomalousInvoiceMessage(invoices []models.Entity) string {
	var b strings.Builder
	b.WriteString(fmt.Sprintf("⚠️ **تنبيه مالي** — لديك %d فاتورة غير مدفوعة ومتأخرة لأكثر من 30 يوماً:\n\n", len(invoices)))
	for i, inv := range invoices {
		if i >= 5 {
			b.WriteString(fmt.Sprintf("• …و%d فواتير أخرى متأخرة.\n", len(invoices)-5))
			break
		}
		var data map[string]interface{}
		json.Unmarshal(inv.Data, &data)
		amount := "غير محدد"
		if amt, ok := data["total_amount"]; ok {
			amount = fmt.Sprintf("%v", amt)
		}
		b.WriteString(fmt.Sprintf("• فاتورة متأخرة (قيمة: %s)\n", amount))
	}
	b.WriteString("\n💡 يُنصح بمتابعة التحصيل مع العملاء.")
	return b.String()
}

// expiringDocAlert pairs an employee document with how close it is to expiry.
type expiringDocAlert struct {
	employee  models.Employee
	label     string
	alertType string
	expiry    time.Time
	days      int
}

// expiryBand returns the tightest 60/30/7-day threshold a document currently
// sits in (7 also covers already-expired), or 0 when it is not yet near expiry.
func expiryBand(days int) int {
	switch {
	case days <= 7:
		return 7
	case days <= 30:
		return 30
	case days <= 60:
		return 60
	default:
		return 0
	}
}

// scanExpiringDocuments raises one grouped alert per workspace for employee
// Iqama / insurance documents crossing the 60, 30, or 7-day thresholds. Each
// (employee, document, band) fires once — de-duped through ProactiveAlert — so a
// document re-alerts as it enters each tighter band, matching the 60/30/7 cadence.
func scanExpiringDocuments() int {
	posted := 0
	var workspaces []models.Workspace
	if err := database.DB.Find(&workspaces).Error; err != nil {
		return 0
	}
	now := time.Now()
	for _, ws := range workspaces {
		channelID := generalChannelID(ws.ID)
		if channelID == uuid.Nil {
			continue
		}
		var employees []models.Employee
		database.DB.Where(
			"workspace_id = ? AND status <> ? AND (iqama_expiry IS NOT NULL OR insurance_expiry IS NOT NULL)",
			ws.ID, "terminated",
		).Find(&employees)

		var alerts []expiringDocAlert
		for _, e := range employees {
			docs := []struct {
				key   string
				label string
				date  *time.Time
			}{
				{"iqama", "الإقامة (Iqama)", e.IqamaExpiry},
				{"insurance", "التأمين الطبي (Insurance)", e.InsuranceExpiry},
			}
			for _, d := range docs {
				if d.date == nil {
					continue
				}
				days := int(d.date.Sub(now).Hours() / 24)
				band := expiryBand(days)
				if band == 0 {
					continue
				}
				alertType := fmt.Sprintf("%s_expiry_%d", d.key, band)
				if alreadyAlertedEntity(e.ID, alertType) {
					continue
				}
				alerts = append(alerts, expiringDocAlert{e, d.label, alertType, *d.date, days})
			}
		}
		if len(alerts) == 0 {
			continue
		}
		if postAuditorMessage(ws.ID, channelID, buildExpiryMessage(alerts)) {
			posted++
			for _, a := range alerts {
				eid := a.employee.ID
				database.DB.Create(&ProactiveAlert{EntityID: &eid, AlertType: a.alertType})
			}
		}
	}
	return posted
}

func buildExpiryMessage(alerts []expiringDocAlert) string {
	var b strings.Builder
	b.WriteString("🛂 تنبيه انتهاء وثائق الموظفين\n\n")
	for _, a := range alerts {
		var status string
		switch {
		case a.days < 0:
			status = fmt.Sprintf("⛔ منتهية منذ %d يوم", -a.days)
		case a.days == 0:
			status = "⚠️ تنتهي اليوم"
		default:
			status = fmt.Sprintf("تنتهي خلال %d يوم", a.days)
		}
		b.WriteString(fmt.Sprintf("• %s — %s (%s): %s\n", a.employee.FullName, a.label, a.expiry.Format("2006-01-02"), status))
	}
	b.WriteString("\nيرجى تجديد الوثائق قبل انتهائها.")
	return b.String()
}

func alreadyAlertedEntity(entityID uuid.UUID, alertType string) bool {
	var alert ProactiveAlert
	err := database.DB.Where("entity_id = ? AND alert_type = ?", entityID, alertType).
		Order("alerted_at desc").First(&alert).Error
	return err == nil
}

// alreadyAlerted is true when this task was alerted since its last update.
func alreadyAlerted(t models.Task) bool {
	var alert ProactiveAlert
	err := database.DB.Where("task_id = ? AND alerted_at >= ?", t.ID, t.UpdatedAt).
		Order("alerted_at desc").First(&alert).Error
	return err == nil
}

// generalChannelID returns the earliest public channel of a workspace.
func generalChannelID(workspaceID uuid.UUID) uuid.UUID {
	var channel models.Channel
	if err := database.DB.
		Where("workspace_id = ? AND type = ?", workspaceID, "PUBLIC").
		Order("created_at asc").First(&channel).Error; err != nil {
		return uuid.Nil
	}
	return channel.ID
}

func buildStuckMessage(tasks []models.Task) string {
	var b strings.Builder
	b.WriteString(fmt.Sprintf("📊 **مدقّق المشاريع الاستباقي** — لديك %d مهمة عالقة منذ أكثر من %d أيام:\n\n", len(tasks), stuckTaskDays()))
	for i, t := range tasks {
		if i >= 10 {
			b.WriteString(fmt.Sprintf("• …و%d مهمة أخرى.\n", len(tasks)-10))
			break
		}
		b.WriteString(fmt.Sprintf("• _%s_ — الحالة **%s** (بلا تحديث منذ %s)\n", t.Title, t.Status, t.UpdatedAt.Format("2006-01-02")))
	}
	b.WriteString("\n💡 يُنصح بمراجعتها: إزالة العوائق، إعادة الإسناد، أو إغلاق المكتمل منها.")
	return b.String()
}

// aiSystemUserID returns the id of the shared AI sender user, creating it on
// first use. Messages.sender_id is NOT NULL with an FK, so AI-authored messages
// must reference a real user.
func aiSystemUserID(workspaceID uuid.UUID) (uuid.UUID, error) {
	var u models.User
	if err := database.DB.Where("email = ?", "ai@septimus.os").First(&u).Error; err != nil {
		// users.workspace_id has a NOT-NULL-effective FK; scope the shared AI
		// user to a valid workspace on creation.
		u = models.User{Email: "ai@septimus.os", PasswordHash: "none", Role: "AI_AGENT", WorkspaceID: workspaceID}
		if err := database.DB.Create(&u).Error; err != nil {
			return uuid.Nil, err
		}
	}
	return u.ID, nil
}

func postAuditorMessage(workspaceID, channelID uuid.UUID, content string) bool {
	senderID, err := aiSystemUserID(workspaceID)
	if err != nil {
		log.Printf("[Auditor] cannot resolve AI sender user: %v", err)
		return false
	}

	msg := models.Message{
		SenderID:      senderID,
		ChannelID:     channelID,
		Content:       content,
		IsAIGenerated: true,
		AIAgentRole:   proactiveAuditorRole,
	}
	if err := database.DB.Create(&msg).Error; err != nil {
		log.Printf("[Auditor] failed to post message: %v", err)
		return false
	}

	out, _ := json.Marshal(map[string]interface{}{
		"ID":            msg.ID,
		"CreatedAt":     msg.CreatedAt,
		"Content":       msg.Content,
		"ChannelID":     msg.ChannelID,
		"type":          "chat_message",
		"IsAIGenerated": true,
		"AIAgentRole":   proactiveAuditorRole,
		"User":          map[string]interface{}{"Email": proactiveAuditorRole},
	})
	WSHub.BroadcastToChannel(channelID.String(), out)
	return true
}

// TriggerProactiveAudit lets an operator run the auditor on demand.
func TriggerProactiveAudit(c *fiber.Ctx) error {
	posted := RunProactiveAudit()
	return c.JSON(fiber.Map{"message": "Proactive audit complete", "alerts_posted": posted})
}

// ─── Morning Brief Proactive Digest ──────────────────────────────────────────

const morningBriefRole = "المساعد الصباحي"

var morningCron *cron.Cron

// StartMorningBriefCron initializes the daily Morning Brief cron job
func StartMorningBriefCron() {
	if morningCron != nil {
		morningCron.Stop()
	}
	morningCron = cron.New()
	schedule := os.Getenv("MORNING_BRIEF_CRON")
	if schedule == "" {
		schedule = "0 7 * * *" // 07:00 AM daily
	}
	_, err := morningCron.AddFunc(schedule, func() {
		log.Println("[MorningBrief] Running scheduled morning brief...")
		RunMorningBrief()
	})
	if err != nil {
		log.Printf("[MorningBrief] failed to schedule cron %s: %v", schedule, err)
	} else {
		morningCron.Start()
		log.Printf("[MorningBrief] cron scheduled with pattern: %s", schedule)
	}
}

// RunMorningBrief runs the digest for every workspace via cron
func RunMorningBrief() int {
	var workspaces []models.Workspace
	if err := database.DB.Find(&workspaces).Error; err != nil {
		log.Printf("[MorningBrief] error fetching workspaces: %v", err)
		return 0
	}

	posted := 0
	for _, ws := range workspaces {
		err := triggerMorningBriefForWorkspace(ws.ID, "system")
		if err != nil {
			log.Printf("[MorningBrief] Failed to trigger AI for ws %s: %v", ws.ID, err)
			continue
		}
		posted++
	}
	return posted
}

// TriggerMorningBrief allows users to trigger their personalized digest via API
func TriggerMorningBrief(c *fiber.Ctx) error {
	workspaceIDStr, _ := c.Locals("workspace_id").(string)
	userIDStr, _ := c.Locals("user_id").(string)

	wsID := database.ParseUUID(workspaceIDStr)

	err := triggerMorningBriefForWorkspace(wsID, userIDStr)
	if err != nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "Failed to trigger morning brief"})
	}

	return c.JSON(fiber.Map{
		"message": "Morning brief triggered and being processed by AI",
	})
}

func triggerMorningBriefForWorkspace(wsID uuid.UUID, userIDStr string) error {
	var entities []models.Entity
	var tasks []models.Task

	// Relational PM is the only task source. JSONB entities remain for finance
	// and schema-backed CRM records only.
	cutoff24 := time.Now().Add(-24 * time.Hour)
	if err := database.DB.Where("workspace_id = ? AND status <> 'done' AND due_date IS NOT NULL AND due_date < ?", wsID, time.Now()).
		Order("due_date ASC").Limit(100).Find(&tasks).Error; err != nil {
		return fmt.Errorf("failed to gather PM tasks: %w", err)
	}
	err := database.DB.Where("workspace_id = ?", wsID).
		Where("(entity_type = 'finance_invoice' AND data->>'status' = 'overdue') OR "+
			"(entity_type = 'crm_opportunity' AND definition_id IS NOT NULL AND created_at >= ?)",
			cutoff24).
		Find(&entities).Error

	if err != nil {
		return fmt.Errorf("failed to gather entities: %w", err)
	}

	// We also need the CEO ID (or fallback to an admin) to direct the WebSocket message properly
	var users []models.User
	database.DB.Where("workspace_id = ? AND role IN ('admin', 'owner', 'ceo')", wsID).Limit(1).Find(&users)
	targetUserID := userIDStr
	if targetUserID == "" || targetUserID == "system" {
		if len(users) > 0 {
			targetUserID = users[0].ID.String()
		}
	}

	payloadData := map[string]interface{}{
		"workspace_id": wsID.String(),
		"user_id":      targetUserID, // The CEO/Admin to receive the message
		"entities":     entities,
		"tasks":        tasks,
	}

	payloadBytes, err := json.Marshal(payloadData)
	if err != nil {
		return err
	}

	if events.NatsConn == nil {
		return fmt.Errorf("NATS connection not initialized")
	}

	// Publish directly to NATS. The AI Sidecar will handle generation and Centrifugo publishing.
	subject := fmt.Sprintf("ai.auditor.morning_brief.%s", wsID.String())
	return events.NatsConn.Publish(subject, payloadBytes)
}
