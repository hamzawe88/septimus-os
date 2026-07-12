package handlers

import (
	"context"
	"encoding/json"
	"os"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/generative-ai-go/genai"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"google.golang.org/api/option"
)

// GetCommunicationReport returns metrics for the Communication dashboard
func GetCommunicationReport(c *fiber.Ctx) error {
	var totalMessages int64
	var activeChannels int64
	var channelStats []struct {
		Type  string `json:"type"`
		Count int64  `json:"count"`
	}

	// 1. Total Messages
	if err := database.DB.Model(&models.Message{}).Count(&totalMessages).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch total messages"})
	}

	// 2. Active Channels (Channels that have had messages in the last 30 days)
	thirtyDaysAgo := time.Now().AddDate(0, 0, -30)
	if err := database.DB.Model(&models.Message{}).
		Where("created_at > ?", thirtyDaysAgo).
		Distinct("channel_id").
		Count(&activeChannels).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch active channels"})
	}

	// 3. Channels vs DMs (Message distribution by channel type)
	if err := database.DB.Table("messages").
		Select("channels.type, count(messages.id) as count").
		Joins("JOIN channels ON channels.id = messages.channel_id").
		Group("channels.type").
		Scan(&channelStats).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch channel stats"})
	}

	// 4. Daily Messages (Last 7 days)
	var dailyMessages []struct {
		Date  string `json:"date"`
		Count int64  `json:"count"`
	}
	// Note: date(created_at) works in sqlite/postgres depending on dialect. For Postgres:
	if err := database.DB.Table("messages").
		Select("DATE(created_at) as date, count(id) as count").
		Where("created_at > ?", time.Now().AddDate(0, 0, -7)).
		Group("DATE(created_at)").
		Order("DATE(created_at) ASC").
		Scan(&dailyMessages).Error; err != nil {
		// Ignore error, might be syntax issue depending on DB, will just return empty
	}

	return c.JSON(fiber.Map{
		"total_messages":  totalMessages,
		"active_channels": activeChannels,
		"distribution":    channelStats,
		"daily_trend":     dailyMessages,
	})
}

// GetAIReport returns metrics for the AI Analytics dashboard
func GetAIReport(c *fiber.Ctx) error {
	var totalAIActions int64
	var workflowStats []struct {
		Status string `json:"status"`
		Count  int64  `json:"count"`
	}

	// 1. Total AI Generated Messages
	if err := database.DB.Model(&models.Message{}).Where("is_ai_generated = ?", true).Count(&totalAIActions).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch AI messages count"})
	}

	// 2. Workflow Success vs Failures
	if err := database.DB.Model(&models.WorkflowRun{}).
		Select("status, count(id) as count").
		Group("status").
		Scan(&workflowStats).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch workflow stats"})
	}

	// 3. AI Usage Over Time (Last 7 days)
	var dailyAIUsage []struct {
		Date  string `json:"date"`
		Count int64  `json:"count"`
	}
	if err := database.DB.Table("messages").
		Select("DATE(created_at) as date, count(id) as count").
		Where("is_ai_generated = ? AND created_at > ?", true, time.Now().AddDate(0, 0, -7)).
		Group("DATE(created_at)").
		Order("DATE(created_at) ASC").
		Scan(&dailyAIUsage).Error; err != nil {
		// Ignore error
	}

	// Calculate total runs and success rate
	var totalRuns int64
	var successRuns int64
	for _, s := range workflowStats {
		totalRuns += s.Count
		if s.Status == "success" {
			successRuns += s.Count
		}
	}

	successRate := float64(0)
	if totalRuns > 0 {
		successRate = (float64(successRuns) / float64(totalRuns)) * 100
	}

	return c.JSON(fiber.Map{
		"total_ai_actions": totalAIActions,
		"workflow_stats":   workflowStats,
		"success_rate":     successRate,
		"daily_trend":      dailyAIUsage,
		"feedback":         aiFeedbackSummary(),
	})
}

// GetFinanceForecast uses Gemini to predict the next 3 months of cash flow
func GetFinanceForecast(c *fiber.Ctx) error {
	// We'll mock the historical context here directly for the AI 
	// (as requested by the user for better presentation realism).
	
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		return c.Status(500).JSON(fiber.Map{"error": "GEMINI_API_KEY is not set"})
	}

	ctx := context.Background()
	client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to create Gemini client"})
	}
	defer client.Close()

	model := client.GenerativeModel("gemini-2.5-flash")
	model.ResponseMIMEType = "application/json"

	prompt := `
You are an expert financial AI. Based on a theoretical software company that has had the following cash flow over the last 6 months:
Jan: Rev $4000, Exp $2400
Feb: Rev $3000, Exp $1398
Mar: Rev $2000, Exp $9800 (one time server purchase)
Apr: Rev $2780, Exp $3908
May: Rev $1890, Exp $4800
Jun: Rev $2390, Exp $3800
Jul: Rev $3490, Exp $4300

Predict the next 3 months (Aug, Sep, Oct). Notice that revenue is starting to pick up again after a dip.
You must return ONLY a JSON object with this exact schema:
{
  "forecast": [
    { "month": "Aug", "revenue": 0, "expenses": 0 },
    { "month": "Sep", "revenue": 0, "expenses": 0 },
    { "month": "Oct", "revenue": 0, "expenses": 0 }
  ],
  "insight": "A short 1 sentence insight explaining the trend in Arabic."
}
`

	resp, err := model.GenerateContent(ctx, genai.Text(prompt))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to generate forecast: " + err.Error()})
	}

	if len(resp.Candidates) == 0 || len(resp.Candidates[0].Content.Parts) == 0 {
		return c.Status(500).JSON(fiber.Map{"error": "Empty response from Gemini"})
	}

	// Parse JSON output
	var result map[string]interface{}
	part := resp.Candidates[0].Content.Parts[0]
	if txt, ok := part.(genai.Text); ok {
		if err := json.Unmarshal([]byte(txt), &result); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Failed to parse AI response JSON"})
		}
	} else {
		return c.Status(500).JSON(fiber.Map{"error": "Unexpected AI response format"})
	}

	return c.JSON(result)
}
