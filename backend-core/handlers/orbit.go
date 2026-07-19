package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"sort"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/events"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/datatypes"
)

// OrbitTaskData represents the JSON structure stored inside data for user_orbit_task entities
type OrbitTaskData struct {
	ID               string                 `json:"id"`
	UserID           string                 `json:"user_id"`
	Title            string                 `json:"title"`
	Description      string                 `json:"description"`
	SourceType       string                 `json:"source_type"` // CHAT, WORKFLOW, CRM, HR, PRIVATE
	SourceID         string                 `json:"source_id"`
	SourceLink       string                 `json:"source_link"`
	SourceMeta       map[string]interface{} `json:"source_meta"`
	Status           string                 `json:"status"` // TODO, IN_PROGRESS, DONE, ARCHIVED
	FocusPriority    int                    `json:"focus_priority"` // 1, 2, or 3 if in Daily Top 3, 0 if normal
	EnergyTag        string                 `json:"energy_tag"`     // HIGH_ENERGY, DEEP_FOCUS, LIGHT
	XPReward         int                    `json:"xp_reward"`
	TimeSpentSeconds int                    `json:"time_spent_seconds"`
	CreatedAt        time.Time              `json:"created_at"`
	CompletedAt      *time.Time             `json:"completed_at"`
}

// OrbitProfileData represents the JSON structure stored inside data for user_orbit_profile entities
type OrbitProfileData struct {
	UserID                   string   `json:"user_id"`
	XP                       int      `json:"xp"`
	Level                    int      `json:"level"`
	LevelTitle               string   `json:"level_title"`
	DailyEnergyMode          string   `json:"daily_energy_mode"` // HIGH_ENERGY, DEEP_FOCUS, LIGHT
	ThemePreference          string   `json:"theme_preference"`  // CYBER_NEBULA, DEEP_SPACE, SERENE_HORIZON
	EarnedBadges             []string `json:"earned_badges"`
	FocusTimerActive         bool     `json:"focus_timer_active"`
	ActiveTaskID             string   `json:"active_task_id"`
	PomodoroSecondsRemaining int      `json:"pomodoro_seconds_remaining"`
}

func getLevelTitle(xp int) (int, string) {
	level := int(math.Floor(float64(xp)/200.0)) + 1
	var title string
	switch {
	case level == 1:
		title = "Novice Cadet 🌟"
	case level == 2:
		title = "Orbit Navigator 🛸"
	case level == 3:
		title = "Orbit Commander 🚀"
	case level == 4:
		title = "Galactic Strategist ⚡"
	case level == 5:
		title = "Quantum Pioneer 🔮"
	case level >= 6:
		title = fmt.Sprintf("Sovereign Architect (Lvl %d) 👑", level)
	}
	return level, title
}

// GetOrbitTasks returns all tasks for the logged-in user in their current workspace
func GetOrbitTasks(c *fiber.Ctx) error {
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized"})
	}
	workspaceIDStr, _ := c.Locals("workspace_id").(string)
	workspaceID := database.ParseUUID(workspaceIDStr)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid workspace_id"})
	}

	var entities []models.Entity
	err := database.GetDB(c).Where("workspace_id = ? AND entity_type = ? AND data->>'user_id' = ?",
		workspaceID, "user_orbit_task", userID).Find(&entities).Error
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch orbit tasks"})
	}

	tasks := make([]OrbitTaskData, 0, len(entities))
	for _, e := range entities {
		var task OrbitTaskData
		if err := json.Unmarshal(e.Data, &task); err == nil {
			tasks = append(tasks, task)
		}
	}

	// Sort tasks: Top 3 focus priority first (1, 2, 3), then non-done, then newly created
	sort.Slice(tasks, func(i, j int) bool {
		if tasks[i].FocusPriority > 0 && tasks[j].FocusPriority > 0 {
			return tasks[i].FocusPriority < tasks[j].FocusPriority
		}
		if tasks[i].FocusPriority > 0 && tasks[j].FocusPriority == 0 {
			return true
		}
		if tasks[i].FocusPriority == 0 && tasks[j].FocusPriority > 0 {
			return false
		}
		return tasks[i].CreatedAt.After(tasks[j].CreatedAt)
	})

	return c.JSON(fiber.Map{"status": "success", "tasks": tasks})
}

// CreateOrbitTask creates a new personal orbit task or auto-captures from chat/workflow
func CreateOrbitTask(c *fiber.Ctx) error {
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized"})
	}
	workspaceIDStr, _ := c.Locals("workspace_id").(string)
	workspaceID := database.ParseUUID(workspaceIDStr)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid workspace_id"})
	}

	var req struct {
		Title         string                 `json:"title"`
		Description   string                 `json:"description"`
		SourceType    string                 `json:"source_type"`
		SourceID      string                 `json:"source_id"`
		SourceLink    string                 `json:"source_link"`
		SourceMeta    map[string]interface{} `json:"source_meta"`
		FocusPriority int                    `json:"focus_priority"`
		EnergyTag     string                 `json:"energy_tag"`
		XPReward      int                    `json:"xp_reward"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid payload"})
	}
	if req.Title == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Title is required"})
	}
	if req.SourceType == "" {
		req.SourceType = "PRIVATE"
	}
	if req.EnergyTag == "" {
		req.EnergyTag = "HIGH_ENERGY"
	}
	if req.XPReward <= 0 {
		if req.SourceType == "WORKFLOW" || req.SourceType == "CRM" || req.SourceType == "HR" {
			req.XPReward = 25
		} else {
			req.XPReward = 15
		}
	}

	taskID := uuid.New().String()
	task := OrbitTaskData{
		ID:               taskID,
		UserID:           userID,
		Title:            req.Title,
		Description:      req.Description,
		SourceType:       req.SourceType,
		SourceID:         req.SourceID,
		SourceLink:       req.SourceLink,
		SourceMeta:       req.SourceMeta,
		Status:           "TODO",
		FocusPriority:    req.FocusPriority,
		EnergyTag:        req.EnergyTag,
		XPReward:         req.XPReward,
		TimeSpentSeconds: 0,
		CreatedAt:        time.Now(),
	}

	dataBytes, _ := json.Marshal(task)
	entity := models.Entity{
		ID:          uuid.New(),
		WorkspaceID: workspaceID,
		EntityType:  "user_orbit_task",
		Data:        datatypes.JSON(dataBytes),
	}

	if err := database.GetDB(c).Create(&entity).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save orbit task"})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"status": "success", "task": task, "entity_id": entity.ID})
}

// UpdateOrbitTask updates task status, priority, or energy tag, granting XP if marked DONE
func UpdateOrbitTask(c *fiber.Ctx) error {
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized"})
	}
	workspaceIDStr, _ := c.Locals("workspace_id").(string)
	workspaceID := database.ParseUUID(workspaceIDStr)
	taskID := c.Params("id")

	var entity models.Entity
	err := database.GetDB(c).Where("workspace_id = ? AND entity_type = ? AND data->>'id' = ? AND data->>'user_id' = ?",
		workspaceID, "user_orbit_task", taskID, userID).First(&entity).Error
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Orbit task not found"})
	}

	var task OrbitTaskData
	if err := json.Unmarshal(entity.Data, &task); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Corrupt task data"})
	}

	var req struct {
		Title            *string `json:"title"`
		Description      *string `json:"description"`
		Status           *string `json:"status"`
		FocusPriority    *int    `json:"focus_priority"`
		EnergyTag        *string `json:"energy_tag"`
		TimeSpentSeconds *int    `json:"time_spent_seconds"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid update payload"})
	}

	oldStatus := task.Status
	if req.Title != nil {
		task.Title = *req.Title
	}
	if req.Description != nil {
		task.Description = *req.Description
	}
	if req.FocusPriority != nil {
		task.FocusPriority = *req.FocusPriority
	}
	if req.EnergyTag != nil {
		task.EnergyTag = *req.EnergyTag
	}
	if req.TimeSpentSeconds != nil {
		task.TimeSpentSeconds = *req.TimeSpentSeconds
	}
	if req.Status != nil {
		task.Status = *req.Status
		if *req.Status == "DONE" && oldStatus != "DONE" {
			now := time.Now()
			task.CompletedAt = &now

			// Grant XP to Profile
			xpToGrant := task.XPReward
			if task.FocusPriority >= 1 && task.FocusPriority <= 3 {
				xpToGrant += 25 // Top 3 bonus
			}
			go grantOrbitXP(workspaceID, userID, xpToGrant, task.Title)
		}
	}

	updatedBytes, _ := json.Marshal(task)
	entity.Data = datatypes.JSON(updatedBytes)
	if err := database.GetDB(c).Save(&entity).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update orbit task"})
	}

	return c.JSON(fiber.Map{"status": "success", "task": task})
}

// DeleteOrbitTask removes a personal orbit task
func DeleteOrbitTask(c *fiber.Ctx) error {
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized"})
	}
	workspaceIDStr, _ := c.Locals("workspace_id").(string)
	workspaceID := database.ParseUUID(workspaceIDStr)
	taskID := c.Params("id")

	err := database.GetDB(c).Where("workspace_id = ? AND entity_type = ? AND data->>'id' = ? AND data->>'user_id' = ?",
		workspaceID, "user_orbit_task", taskID, userID).Delete(&models.Entity{}).Error
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete task"})
	}

	return c.JSON(fiber.Map{"status": "success", "message": "Task removed from Orbit"})
}

// GetOrbitProfile returns or initializes the user's gamification profile
func GetOrbitProfile(c *fiber.Ctx) error {
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized"})
	}
	workspaceIDStr, _ := c.Locals("workspace_id").(string)
	workspaceID := database.ParseUUID(workspaceIDStr)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid workspace_id"})
	}

	var entity models.Entity
	err := database.GetDB(c).Where("workspace_id = ? AND entity_type = ? AND data->>'user_id' = ?",
		workspaceID, "user_orbit_profile", userID).First(&entity).Error

	var profile OrbitProfileData
	if err != nil {
		// Initialize default profile
		profile = OrbitProfileData{
			UserID:                   userID,
			XP:                       100, // Welcome bonus
			Level:                    1,
			LevelTitle:               "Novice Cadet 🌟",
			DailyEnergyMode:          "HIGH_ENERGY",
			ThemePreference:          "CYBER_NEBULA",
			EarnedBadges:             []string{"WELCOME_ORBIT_🌟"},
			FocusTimerActive:         false,
			ActiveTaskID:             "",
			PomodoroSecondsRemaining: 1500,
		}
		dataBytes, _ := json.Marshal(profile)
		newEntity := models.Entity{
			ID:          uuid.New(),
			WorkspaceID: workspaceID,
			EntityType:  "user_orbit_profile",
			Data:        datatypes.JSON(dataBytes),
		}
		database.GetDB(c).Create(&newEntity)
	} else {
		json.Unmarshal(entity.Data, &profile)
		// Ensure level title sync
		lvl, title := getLevelTitle(profile.XP)
		if profile.Level != lvl || profile.LevelTitle != title {
			profile.Level = lvl
			profile.LevelTitle = title
			dataBytes, _ := json.Marshal(profile)
			entity.Data = datatypes.JSON(dataBytes)
			database.GetDB(c).Save(&entity)
		}
	}

	return c.JSON(fiber.Map{"status": "success", "profile": profile})
}

// UpdateOrbitProfile modifies energy mode, theme, or active focus timer
func UpdateOrbitProfile(c *fiber.Ctx) error {
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized"})
	}
	workspaceIDStr, _ := c.Locals("workspace_id").(string)
	workspaceID := database.ParseUUID(workspaceIDStr)

	var entity models.Entity
	err := database.GetDB(c).Where("workspace_id = ? AND entity_type = ? AND data->>'user_id' = ?",
		workspaceID, "user_orbit_profile", userID).First(&entity).Error
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Profile not found. Call GET first."})
	}

	var profile OrbitProfileData
	json.Unmarshal(entity.Data, &profile)

	var req struct {
		DailyEnergyMode          *string `json:"daily_energy_mode"`
		ThemePreference          *string `json:"theme_preference"`
		FocusTimerActive         *bool   `json:"focus_timer_active"`
		ActiveTaskID             *string `json:"active_task_id"`
		PomodoroSecondsRemaining *int    `json:"pomodoro_seconds_remaining"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid profile update payload"})
	}

	oldTimerActive := profile.FocusTimerActive
	if req.DailyEnergyMode != nil {
		profile.DailyEnergyMode = *req.DailyEnergyMode
	}
	if req.ThemePreference != nil {
		profile.ThemePreference = *req.ThemePreference
	}
	if req.ActiveTaskID != nil {
		profile.ActiveTaskID = *req.ActiveTaskID
	}
	if req.PomodoroSecondsRemaining != nil {
		profile.PomodoroSecondsRemaining = *req.PomodoroSecondsRemaining
	}
	if req.FocusTimerActive != nil {
		profile.FocusTimerActive = *req.FocusTimerActive
		// Broadcast focus status toggle if changed
		if *req.FocusTimerActive != oldTimerActive {
			statusMsg := "Available 🟢"
			if *req.FocusTimerActive {
				statusMsg = "Do Not Disturb - In Focus 🔴"
			}
			// Emit NATS notification about presence change
			eventPayload, _ := json.Marshal(map[string]interface{}{
				"user_id":     userID,
				"workspace_id": workspaceID.String(),
				"in_focus":    *req.FocusTimerActive,
				"status_text": statusMsg,
				"timestamp":   time.Now().Format(time.RFC3339),
			})
			events.PublishEvent("events.user.presence.focus", eventPayload)
		}
	}

	dataBytes, _ := json.Marshal(profile)
	entity.Data = datatypes.JSON(dataBytes)
	if err := database.GetDB(c).Save(&entity).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update orbit profile"})
	}

	return c.JSON(fiber.Map{"status": "success", "profile": profile})
}

// grantOrbitXP increments XP and checks for level up or badges
func grantOrbitXP(workspaceID uuid.UUID, userID string, xpAdd int, taskTitle string) {
	var entity models.Entity
	err := database.DB.Where("workspace_id = ? AND entity_type = ? AND data->>'user_id' = ?",
		workspaceID, "user_orbit_profile", userID).First(&entity).Error
	if err != nil {
		return
	}

	var profile OrbitProfileData
	if err := json.Unmarshal(entity.Data, &profile); err != nil {
		return
	}

	oldLevel := profile.Level
	profile.XP += xpAdd
	newLevel, newTitle := getLevelTitle(profile.XP)
	profile.Level = newLevel
	profile.LevelTitle = newTitle

	// Check if badge should be awarded
	hasBadge := func(b string) bool {
		for _, ex := range profile.EarnedBadges {
			if ex == b {
				return true
			}
		}
		return false
	}

	if newLevel > oldLevel && !hasBadge(fmt.Sprintf("LEVEL_UP_%d_🚀", newLevel)) {
		profile.EarnedBadges = append(profile.EarnedBadges, fmt.Sprintf("LEVEL_UP_%d_🚀", newLevel))
	}
	if profile.XP >= 500 && !hasBadge("XP_CENTURION_500_🎯") {
		profile.EarnedBadges = append(profile.EarnedBadges, "XP_CENTURION_500_🎯")
	}
	if profile.XP >= 1000 && !hasBadge("ORBIT_LEGEND_1000_👑") {
		profile.EarnedBadges = append(profile.EarnedBadges, "ORBIT_LEGEND_1000_👑")
	}

	dataBytes, _ := json.Marshal(profile)
	entity.Data = datatypes.JSON(dataBytes)
	database.DB.Save(&entity)
	log.Printf("[MyOrbit] Granted +%d XP to user %s for completing '%s'. Total XP: %d (Level %d)", xpAdd, userID, taskTitle, profile.XP, profile.Level)
}

// GenerateWeeklyHarvest creates an executive AI summary report of completed tasks this week
func GenerateWeeklyHarvest(c *fiber.Ctx) error {
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized"})
	}
	workspaceIDStr, _ := c.Locals("workspace_id").(string)
	workspaceID := database.ParseUUID(workspaceIDStr)

	var req struct {
		Language string `json:"language"` // "en" or "ar"
	}
	c.BodyParser(&req)
	if req.Language != "ar" {
		req.Language = "en"
	}

	var entities []models.Entity
	err := database.GetDB(c).Where("workspace_id = ? AND entity_type = ? AND data->>'user_id' = ?",
		workspaceID, "user_orbit_task", userID).Find(&entities).Error
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to query tasks"})
	}

	var completedThisWeek []OrbitTaskData
	weekAgo := time.Now().AddDate(0, 0, -7)
	totalXPThisWeek := 0
	chatTasks := 0
	workflowTasks := 0

	for _, e := range entities {
		var task OrbitTaskData
		if err := json.Unmarshal(e.Data, &task); err == nil {
			if task.Status == "DONE" && task.CompletedAt != nil && task.CompletedAt.After(weekAgo) {
				completedThisWeek = append(completedThisWeek, task)
				totalXPThisWeek += task.XPReward
				if task.SourceType == "CHAT" {
					chatTasks++
				} else if task.SourceType == "WORKFLOW" || task.SourceType == "CRM" || task.SourceType == "HR" {
					workflowTasks++
				}
			}
		}
	}

	var summaryText string
	if req.Language == "ar" {
		summaryText = fmt.Sprintf("🎯 **حصاد الأسبوع في مداري الشخصي**\n\n"+
			"✨ **أبرز الإنجازات:** تم إنجاز **%d مهام** بنجاح خلال الـ 7 أيام الماضية، وإضافة **+%d نقطة إنجاز (XP)** إلى رصيدي!\n\n"+
			"💬 **من الدردشة والقنوات:** تمت معالجة وإغلاق %d مهام تحولت مباشرة من المحادثات.\n"+
			"⚡ **من سير العمل والموافقات:** تم إنجاز %d مهام تشغيلية وإدارية.\n\n"+
			"🚀 *تم التوليد تلقائياً عبر المساعد الإنجاز (My Orbit AI)*",
			len(completedThisWeek), totalXPThisWeek, chatTasks, workflowTasks)
	} else {
		summaryText = fmt.Sprintf("🎯 **My Weekly Orbit Harvest**\n\n"+
			"✨ **Top Achievements:** Successfully completed **%d tasks** over the past 7 days, earning **+%d XP**!\n\n"+
			"💬 **From Chat & Channels:** Processed and resolved %d tasks captured directly from team conversations.\n"+
			"⚡ **From Workflows & Approvals:** Executed %d operational/CRM/HR workflow items.\n\n"+
			"🚀 *Auto-Generated by My Orbit AI Productivity Copilot*",
			len(completedThisWeek), totalXPThisWeek, chatTasks, workflowTasks)
	}

	return c.JSON(fiber.Map{
		"status":          "success",
		"summary":         summaryText,
		"completed_count": len(completedThisWeek),
		"xp_earned":       totalXPThisWeek,
		"tasks":           completedThisWeek,
	})
}
