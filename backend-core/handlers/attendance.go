package handlers

import (
	"encoding/json"
	"log"
	"math"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
	"github.com/septimus-os/backend-core/utils"
	"gorm.io/datatypes"
)

// Haversine formula to calculate the distance between two points in meters
func haversine(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371000 // Earth radius in meters
	dLat := (lat2 - lat1) * math.Pi / 180.0
	dLon := (lon2 - lon1) * math.Pi / 180.0

	lat1Rad := lat1 * math.Pi / 180.0
	lat2Rad := lat2 * math.Pi / 180.0

	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Sin(dLon/2)*math.Sin(dLon/2)*math.Cos(lat1Rad)*math.Cos(lat2Rad)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	return R * c
}

type CheckInRequest struct {
	OfficeID  string  `json:"office_id"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

func attendanceWorkspaceID(c *fiber.Ctx) uuid.UUID {
	return CurrentWorkspaceID(c)
}

func CheckIn(c *fiber.Ctx) error {
	userIDStr, _ := c.Locals("user_id").(string)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "Unauthorized"})
	}

	var req CheckInRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request"})
	}

	officeID, err := uuid.Parse(req.OfficeID)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid office ID"})
	}
	workspaceID := attendanceWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}

	var office models.OfficeLocation
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", officeID, workspaceID).First(&office).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Office not found"})
	}

	// Prevent duplicate check-ins: a user who is already checked in (an
	// attendance record with no check-out yet) must check out before checking
	// in again. Without this the same account could log in 2nd, 3rd, 4th time.
	var openLog models.AttendanceLog
	if err := database.GetDB(c).Where("user_id = ? AND workspace_id = ? AND check_out_time IS NULL", userID, workspaceID).
		Order("check_in_time desc").First(&openLog).Error; err == nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error": "You are already checked in. Please check out first.",
			"log":   openLog,
		})
	}

	distance := haversine(office.Latitude, office.Longitude, req.Latitude, req.Longitude)

	if distance > float64(office.RadiusMeters) {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error":           "You are out of the office boundaries.",
			"distance_meters": distance,
		})
	}

	now := time.Now()
	log := models.AttendanceLog{
		WorkspaceID: workspaceID,
		UserID:      userID,
		OfficeID:    officeID,
		CheckInTime: now,
		CheckInLat:  req.Latitude,
		CheckInLng:  req.Longitude,
		Status:      "present",
	}

	if err := database.GetDB(c).Create(&log).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to check in"})
	}

	// Webhook for n8n/Google Sheets sync
	if _, active := GetActiveIntegration(workspaceID, "google_sheets"); active {
		utils.DispatchN8NWebhook("attendance", "CheckIn", fiber.Map{
			"user_id":   userID,
			"time":      now,
			"action":    "CheckIn",
			"office_id": officeID,
		})
	}

	return c.JSON(fiber.Map{"message": "Check-in successful", "log": log, "distance_meters": distance})
}

func GetOffices(c *fiber.Ctx) error {
	var offices []models.OfficeLocation
	workspaceID := attendanceWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	if err := database.GetDB(c).Where("workspace_id = ?", workspaceID).Find(&offices).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch offices"})
	}
	return c.JSON(offices)
}

func CreateOffice(c *fiber.Ctx) error {
	var office models.OfficeLocation
	if err := c.BodyParser(&office); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}
	office.WorkspaceID = attendanceWorkspaceID(c)
	if office.WorkspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	if err := database.GetDB(c).Create(&office).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create office"})
	}
	return c.JSON(office)
}

func UpdateOffice(c *fiber.Ctx) error {
	id := c.Params("id")
	var req models.OfficeLocation
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	var office models.OfficeLocation
	workspaceID := attendanceWorkspaceID(c)
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", id, workspaceID).First(&office).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Office not found"})
	}

	office.Name = req.Name
	office.Latitude = req.Latitude
	office.Longitude = req.Longitude
	office.RadiusMeters = req.RadiusMeters

	if err := database.GetDB(c).Save(&office).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update office"})
	}
	return c.JSON(office)
}

func DeleteOffice(c *fiber.Ctx) error {
	id := c.Params("id")
	workspaceID := attendanceWorkspaceID(c)
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", id, workspaceID).Delete(&models.OfficeLocation{}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete office"})
	}
	return c.JSON(fiber.Map{"message": "Office deleted successfully"})
}

// GetAttendanceSummary returns present-headcount per weekday over the trailing
// 7 days, powering the HR dashboard's attendance-trend chart (which previously
// rendered hardcoded zeros). "Present" is the number of distinct users with at
// least one check-in on that calendar day; the frontend derives "absent" from
// total headcount so this endpoint stays a single, cheap, honest aggregate.
//
// weekday follows PostgreSQL EXTRACT(DOW): 0 = Sunday … 6 = Saturday.
func GetAttendanceSummary(c *fiber.Ctx) error {
	workspaceID := attendanceWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}

	type weekdayCount struct {
		Weekday int `json:"weekday"`
		Present int `json:"present"`
	}
	var rows []weekdayCount
	if err := database.GetDB(c).
		Model(&models.AttendanceLog{}).
		Select("EXTRACT(DOW FROM check_in_time)::int AS weekday, COUNT(DISTINCT user_id) AS present").
		Where("workspace_id = ? AND check_in_time >= (now() - interval '7 days')", workspaceID).
		Group("EXTRACT(DOW FROM check_in_time)").
		Scan(&rows).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to summarize attendance"})
	}

	// Dense 0..6 array so the client never has to reason about missing days.
	present := make([]int, 7)
	for _, r := range rows {
		if r.Weekday >= 0 && r.Weekday <= 6 {
			present[r.Weekday] = r.Present
		}
	}
	days := make([]weekdayCount, 7)
	for i := 0; i < 7; i++ {
		days[i] = weekdayCount{Weekday: i, Present: present[i]}
	}
	return c.JSON(fiber.Map{"days": days})
}

func GetAttendanceLogs(c *fiber.Ctx) error {
	var logs []models.AttendanceLog
	workspaceID := attendanceWorkspaceID(c)
	if err := database.GetDB(c).Where("workspace_id = ?", workspaceID).Preload("User").Preload("Office").Order("check_in_time desc").Find(&logs).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch attendance logs"})
	}
	return c.JSON(logs)
}

func CheckOut(c *fiber.Ctx) error {
	userIDStr, _ := c.Locals("user_id").(string)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "Unauthorized"})
	}

	var req CheckInRequest // Reusing the same request body struct
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request"})
	}

	officeID, err := uuid.Parse(req.OfficeID)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid office ID"})
	}
	workspaceID := attendanceWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}

	var office models.OfficeLocation
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", officeID, workspaceID).First(&office).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Office not found"})
	}

	distance := haversine(office.Latitude, office.Longitude, req.Latitude, req.Longitude)
	if distance > float64(office.RadiusMeters) {
		return c.Status(403).JSON(fiber.Map{
			"error":           "You are out of the office boundaries.",
			"distance_meters": distance,
		})
	}

	// Find the latest open attendance log for this user
	var logRecord models.AttendanceLog
	if err := database.GetDB(c).Where("user_id = ? AND workspace_id = ? AND check_out_time IS NULL", userID, workspaceID).Order("check_in_time desc").First(&logRecord).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "No open check-in found to check out from"})
	}

	now := time.Now()
	logRecord.CheckOutTime = &now
	logRecord.CheckOutLat = &req.Latitude
	logRecord.CheckOutLng = &req.Longitude

	if err := database.GetDB(c).Save(&logRecord).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to check out"})
	}

	if integration, active := GetActiveIntegration(workspaceID, "google_sheets"); active {
		token := services.GetClient(integration.AccessToken, integration.RefreshToken, integration.Expiry)

		spreadsheetID := ""
		if integration.Metadata != nil {
			var meta map[string]interface{}
			json.Unmarshal(integration.Metadata, &meta)
			if id, ok := meta["spreadsheet_id"].(string); ok {
				spreadsheetID = id
			}
		}

		if spreadsheetID == "" {
			// Create a new spreadsheet
			id, _, err := services.CreateSpreadsheet(c.Context(), token, "Septimus OS - Attendance Logs")
			if err == nil {
				spreadsheetID = id
				meta := map[string]interface{}{"spreadsheet_id": id}
				b, _ := json.Marshal(meta)
				integration.Metadata = datatypes.JSON(b)
				database.GetDB(c).Save(integration)

				// Optionally add headers
				services.AppendToSheet(c.Context(), token, spreadsheetID, "Sheet1!A1:G1", []interface{}{
					"Date", "User ID", "Office", "Check-in", "Check-out", "Status", "Total Time",
				})
			} else {
				log.Printf("Failed to create spreadsheet: %v", err)
			}
		}

		if spreadsheetID != "" {
			totalTime := "N/A"
			if logRecord.CheckOutTime != nil {
				totalTime = logRecord.CheckOutTime.Sub(logRecord.CheckInTime).String()
			}
			err := services.AppendToSheet(c.Context(), token, spreadsheetID, "Sheet1!A:G", []interface{}{
				now.Format("2006-01-02"),
				userID.String(),
				office.Name,
				logRecord.CheckInTime.Format("15:04:05"),
				logRecord.CheckOutTime.Format("15:04:05"),
				logRecord.Status,
				totalTime,
			})
			if err != nil {
				log.Printf("Failed to append to sheet: %v", err)
			}
		}

		utils.DispatchN8NWebhook("attendance", "CheckOut", fiber.Map{
			"user_id":   userID,
			"time":      now,
			"action":    "CheckOut",
			"office_id": officeID,
		})
	}

	return c.JSON(fiber.Map{"message": "Check-out successful", "log": logRecord, "distance_meters": distance})
}
