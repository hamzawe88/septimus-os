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

	var office models.OfficeLocation
	if err := database.DB.First(&office, "id = ?", officeID).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Office not found"})
	}

	// Prevent duplicate check-ins: a user who is already checked in (an
	// attendance record with no check-out yet) must check out before checking
	// in again. Without this the same account could log in 2nd, 3rd, 4th time.
	var openLog models.AttendanceLog
	if err := database.DB.Where("user_id = ? AND check_out_time IS NULL", userID).
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
		UserID:      userID,
		OfficeID:    officeID,
		CheckInTime: now,
		CheckInLat:  req.Latitude,
		CheckInLng:  req.Longitude,
		Status:      "present",
	}

	if err := database.DB.Create(&log).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to check in"})
	}

	// Webhook for n8n/Google Sheets sync
	workspaceIDStr, _ := c.Locals("workspace_id").(string)
	workspaceID, _ := uuid.Parse(workspaceIDStr)
	if _, active := GetActiveIntegration(workspaceID, "google_sheets"); active {
		utils.DispatchWebhook("http://localhost:5678/webhook/attendance", "CheckIn", fiber.Map{
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
	if err := database.DB.Find(&offices).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch offices"})
	}
	return c.JSON(offices)
}

func CreateOffice(c *fiber.Ctx) error {
	var office models.OfficeLocation
	if err := c.BodyParser(&office); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}
	if err := database.DB.Create(&office).Error; err != nil {
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
	if err := database.DB.Where("id = ?", id).First(&office).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Office not found"})
	}

	office.Name = req.Name
	office.Latitude = req.Latitude
	office.Longitude = req.Longitude
	office.RadiusMeters = req.RadiusMeters

	if err := database.DB.Save(&office).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update office"})
	}
	return c.JSON(office)
}

func DeleteOffice(c *fiber.Ctx) error {
	id := c.Params("id")
	if err := database.DB.Where("id = ?", id).Delete(&models.OfficeLocation{}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete office"})
	}
	return c.JSON(fiber.Map{"message": "Office deleted successfully"})
}

func GetAttendanceLogs(c *fiber.Ctx) error {
	var logs []models.AttendanceLog
	if err := database.DB.Preload("User").Preload("Office").Order("check_in_time desc").Find(&logs).Error; err != nil {
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

	var office models.OfficeLocation
	if err := database.DB.First(&office, "id = ?", officeID).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Office not found"})
	}

	distance := haversine(office.Latitude, office.Longitude, req.Latitude, req.Longitude)
	if distance > float64(office.RadiusMeters) {
		return c.Status(403).JSON(fiber.Map{
			"error": "You are out of the office boundaries.",
			"distance_meters": distance,
		})
	}

	// Find the latest open attendance log for this user
	var logRecord models.AttendanceLog
	if err := database.DB.Where("user_id = ? AND check_out_time IS NULL", userID).Order("check_in_time desc").First(&logRecord).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "No open check-in found to check out from"})
	}

	now := time.Now()
	logRecord.CheckOutTime = &now
	logRecord.CheckOutLat = &req.Latitude
	logRecord.CheckOutLng = &req.Longitude

	if err := database.DB.Save(&logRecord).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to check out"})
	}

	workspaceIDStr, _ := c.Locals("workspace_id").(string)
	workspaceID, _ := uuid.Parse(workspaceIDStr)
	
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
				database.DB.Save(integration)

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

		utils.DispatchWebhook("http://localhost:5678/webhook/attendance", "CheckOut", fiber.Map{
			"user_id":   userID,
			"time":      now,
			"action":    "CheckOut",
			"office_id": officeID,
		})
	}

	return c.JSON(fiber.Map{"message": "Check-out successful", "log": logRecord, "distance_meters": distance})
}

