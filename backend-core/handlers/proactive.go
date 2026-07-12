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
	"github.com/septimus-os/backend-core/models"
)

// ProactiveAlert dedups stuck-task alerts — at most one alert per task per
// stuck episode (a new episode begins when the task is updated again).
type ProactiveAlert struct {
	ID        uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	TaskID    uuid.UUID `gorm:"type:uuid;index"`
	AlertedAt time.Time `gorm:"autoCreateTime"`
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
				database.DB.Create(&ProactiveAlert{TaskID: t.ID})
			}
		}
	}
	if posted > 0 {
		log.Printf("[Auditor] posted %d stuck-task alert(s)", posted)
	}
	return posted
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
		schedule = "0 8 * * *" // 8:00 AM daily
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

// RunMorningBrief runs the digest for every workspace and returns how many were posted
func RunMorningBrief() int {
	var workspaces []models.Workspace
	if err := database.DB.Find(&workspaces).Error; err != nil {
		log.Printf("[MorningBrief] error fetching workspaces: %v", err)
		return 0
	}

	posted := 0
	for _, ws := range workspaces {
		channelID := generalChannelID(ws.ID)
		if channelID == uuid.Nil {
			continue
		}
		brief := buildMorningBriefMessage(ws.ID)
		if postMorningBriefMessage(ws.ID, channelID, brief) {
			posted++
		}
	}
	if posted > 0 {
		log.Printf("[MorningBrief] posted %d morning brief(s)", posted)
	}
	return posted
}

func buildMorningBriefMessage(wsID uuid.UUID) string {
	var projects []models.Project
	database.DB.Where("workspace_id = ?", wsID).Find(&projects)
	var projIDs []uuid.UUID
	for _, p := range projects {
		projIDs = append(projIDs, p.ID)
	}

	var recentTasks []models.Task
	var stuckTasks []models.Task
	if len(projIDs) > 0 {
		cutoff24 := time.Now().Add(-24 * time.Hour)
		database.DB.Where("project_id IN ? AND updated_at >= ?", projIDs, cutoff24).Find(&recentTasks)
		stuckCutoff := time.Now().AddDate(0, 0, -stuckTaskDays())
		database.DB.Where("project_id IN ? AND status IN ? AND updated_at < ?", projIDs, stuckStatuses, stuckCutoff).Find(&stuckTasks)
	}

	var users []models.User
	database.DB.Where("workspace_id = ?", wsID).Find(&users)
	var userIDs []uuid.UUID
	for _, u := range users {
		userIDs = append(userIDs, u.ID)
	}

	var attendanceLogs []models.AttendanceLog
	if len(userIDs) > 0 {
		cutoff24 := time.Now().Add(-24 * time.Hour)
		database.DB.Where("user_id IN ? AND check_in_time >= ?", userIDs, cutoff24).Find(&attendanceLogs)
	}

	var entities []models.Entity
	database.DB.Where("workspace_id = ? AND entity_type IN (?, ?)", wsID, "deal", "CRM_DEAL").Find(&entities)

	completedCount := 0
	inProgressCount := 0
	for _, t := range recentTasks {
		if t.Status == "done" {
			completedCount++
		} else if t.Status == "in_progress" {
			inProgressCount++
		}
	}

	var b strings.Builder
	b.WriteString(fmt.Sprintf("☀️ **الملخص الصباحي المخصص اليومي** (%s)\n\n", time.Now().Format("2006-01-02")))

	b.WriteString("📋 **ملخص حركة المهام (آخر 24 ساعة):**\n")
	b.WriteString(fmt.Sprintf("• المنجزة حديثاً: **%d** مهمة\n", completedCount))
	b.WriteString(fmt.Sprintf("• قيد التنفيذ: **%d** مهمة\n", inProgressCount))
	if len(stuckTasks) > 0 {
		b.WriteString(fmt.Sprintf("• ⚠️ مهام راكدة (> %d أيام): **%d** مهمة\n", stuckTaskDays(), len(stuckTasks)))
	} else {
		b.WriteString("• ✅ لا توجد مهام راكدة حالياً.\n")
	}

	if len(entities) > 0 {
		b.WriteString(fmt.Sprintf("\n💼 **ملخص الصفقات والمتابعات:**\n• إجمالي الصفقات النشطة/المسجلة: **%d**\n", len(entities)))
	}

	b.WriteString("\n⏰ **تقرير الحضور والموارد البشرية:**\n")
	if len(attendanceLogs) > 0 {
		presentCount := 0
		lateCount := 0
		for _, a := range attendanceLogs {
			if a.Status == "late" {
				lateCount++
			} else {
				presentCount++
			}
		}
		b.WriteString(fmt.Sprintf("• الحضور اليومي المسجل: **%d** (منهم %d تأخير)\n", len(attendanceLogs), lateCount))
	} else {
		b.WriteString("• لم يتم تسجيل حركات حضور جديدة في آخر 24 ساعة.\n")
	}

	b.WriteString("\n🚀 _تمنياتنا لكم بيوم عمل مثمر وإنجازات متواصلة!_")
	return b.String()
}

func postMorningBriefMessage(workspaceID, channelID uuid.UUID, content string) bool {
	senderID, err := aiSystemUserID(workspaceID)
	if err != nil {
		log.Printf("[MorningBrief] cannot resolve AI sender user: %v", err)
		return false
	}

	msg := models.Message{
		SenderID:      senderID,
		ChannelID:     channelID,
		Content:       content,
		IsAIGenerated: true,
		AIAgentRole:   morningBriefRole,
	}
	if err := database.DB.Create(&msg).Error; err != nil {
		log.Printf("[MorningBrief] failed to post message: %v", err)
		return false
	}

	out, _ := json.Marshal(map[string]interface{}{
		"ID":            msg.ID,
		"CreatedAt":     msg.CreatedAt,
		"Content":       msg.Content,
		"ChannelID":     msg.ChannelID,
		"type":          "chat_message",
		"IsAIGenerated": true,
		"AIAgentRole":   morningBriefRole,
		"User":          map[string]interface{}{"Email": morningBriefRole},
	})
	WSHub.BroadcastToChannel(channelID.String(), out)
	return true
}

// TriggerMorningBrief allows operators to trigger the digest via API
func TriggerMorningBrief(c *fiber.Ctx) error {
	posted := RunMorningBrief()
	return c.JSON(fiber.Map{"message": "Morning brief run complete", "briefs_posted": posted})
}
