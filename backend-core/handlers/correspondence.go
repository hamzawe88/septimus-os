package handlers

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/events"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type CreateCorrespondenceRequest struct {
	TemplateID        string `json:"template_id"`
	Title             string `json:"title"`
	Content           string `json:"content"`
	SenderType        string `json:"sender_type"`
	Type              string `json:"type"`
	SenderDetails     string `json:"sender_details"`    // JSON string
	RecipientDetails  string `json:"recipient_details"` // JSON string
	SecurityLevel     string `json:"security_level"`
	Confidentiality   string `json:"confidentiality"`
	Status            string `json:"status"`
	Attachments       string `json:"attachments"` // JSON array string
	ExternalReference string `json:"external_reference"`
	CurrentHolderID   string `json:"current_holder_id"`
	DeptCode          string `json:"dept_code"`
	AssignSerial      bool   `json:"assign_serial"`
}

type ForwardCorrespondenceRequest struct {
	ToUserID     string `json:"to_user_id"`
	ForwardTo    string `json:"forward_to"` // e.g. "top.ministry.diwan.legal.audit"
	OfficialNote string `json:"official_note"`
	Notes        string `json:"notes"`
	DeptCode     string `json:"dept_code"` // e.g. "hr", "ops", "legal"
}

type SignCorrespondenceRequest struct {
	DeptCode          string `json:"dept_code"`          // Department code for serial e.g. "HR", "LEGAL"
	ExternalReference string `json:"external_reference"` // External signature/reference note if applicable
	SignerName        string `json:"signer_name"`
	SignerTitle       string `json:"signer_title"`
}

// GenerateSerialNumber generates a guaranteed unique institutional serial number using advisory locking
func GenerateSerialNumber(tx *gorm.DB, workspaceID uuid.UUID, deptCode string) string {
	if deptCode == "" || strings.EqualFold(deptCode, "GEN") || strings.EqualFold(deptCode, "DWN") || strings.EqualFold(deptCode, "LBY-DWN") {
		deptCode = "DWN"
	}
	deptCode = strings.ToUpper(strings.TrimSpace(deptCode))
	year := time.Now().Year()

	// Use PostgreSQL advisory transaction lock based on workspace ID hash to prevent race conditions
	lockID := int64(workspaceID.ID() + uint32(year))
	tx.Exec("SELECT pg_advisory_xact_lock(?)", lockID)

	prefix := fmt.Sprintf("LBY-%s-%d-", deptCode, year)
	var count int64
	tx.Model(&models.Correspondence{}).
		Where("workspace_id = ? AND serial_number LIKE ?", workspaceID, prefix+"%").
		Count(&count)

	return fmt.Sprintf("%s%04d", prefix, count+1)
}

// CreateCorrespondence creates a new official correspondence or draft
func CreateCorrespondence(c *fiber.Ctx) error {
	workspaceIDStr, ok := c.Locals("workspace_id").(string)
	if !ok || workspaceIDStr == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized workspace scope"})
	}
	workspaceID := database.ParseUUID(workspaceIDStr)
	userIDStr, _ := c.Locals("user_id").(string)
	userID := database.ParseUUID(userIDStr)

	var req CreateCorrespondenceRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	if req.Title == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "title is required"})
	}

	if req.SenderDetails == "" {
		req.SenderDetails = "{}"
	}
	if req.RecipientDetails == "" {
		req.RecipientDetails = "{}"
	}
	if req.Attachments == "" {
		req.Attachments = "[]"
	}
	if req.SecurityLevel == "" && req.Confidentiality != "" {
		req.SecurityLevel = req.Confidentiality
	}
	if req.SenderType == "" && req.Type != "" {
		req.SenderType = req.Type
	}
	if req.SecurityLevel == "" {
		req.SecurityLevel = "normal"
	}
	if req.Status == "" {
		req.Status = "draft"
	}

	var templateIDPtr *uuid.UUID
	if req.TemplateID != "" {
		tID := database.ParseUUID(req.TemplateID)
		if tID != uuid.Nil {
			templateIDPtr = &tID
		}
	}

	currentHolderID := userID
	if req.CurrentHolderID != "" {
		hID := database.ParseUUID(req.CurrentHolderID)
		if hID != uuid.Nil {
			currentHolderID = hID
		}
	}

	// Default root ltree path segment based on creator
	rootPath := strings.ToLower(strings.ReplaceAll(userIDStr[:8], "-", "_"))

	correspondence := models.Correspondence{
		WorkspaceID:       workspaceID,
		TemplateID:        templateIDPtr,
		Title:             req.Title,
		Content:           req.Content,
		SenderType:        req.SenderType,
		SenderDetails:     datatypes.JSON([]byte(req.SenderDetails)),
		RecipientDetails:  datatypes.JSON([]byte(req.RecipientDetails)),
		SecurityLevel:     req.SecurityLevel,
		Status:            req.Status,
		Path:              rootPath,
		Attachments:       datatypes.JSON([]byte(req.Attachments)),
		ExternalReference: req.ExternalReference,
		CreatedByID:       userID,
		CurrentHolderID:   currentHolderID,
	}

	err := database.GetDB(c).Transaction(func(tx *gorm.DB) error {
		if req.Status != "draft" || req.AssignSerial || req.DeptCode != "" {
			correspondence.SerialNumber = GenerateSerialNumber(tx, workspaceID, req.DeptCode)
		}
		return tx.Create(&correspondence).Error
	})

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create correspondence: " + err.Error()})
	}

	return c.Status(fiber.StatusCreated).JSON(correspondence)
}

// GetCorrespondences retrieves and filters correspondence records
func GetCorrespondences(c *fiber.Ctx) error {
	workspaceIDStr, ok := c.Locals("workspace_id").(string)
	if !ok || workspaceIDStr == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized workspace scope"})
	}
	workspaceID := database.ParseUUID(workspaceIDStr)

	query := database.GetDB(c).Where("workspace_id = ?", workspaceID)

	// Filter by status
	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status)
	}
	// Filter by security level
	if secLevel := c.Query("security_level"); secLevel != "" {
		query = query.Where("security_level = ?", secLevel)
	}
	// Filter by current holder
	if holderID := c.Query("current_holder_id"); holderID != "" {
		query = query.Where("current_holder_id = ?", database.ParseUUID(holderID))
	}
	// Filter by ltree path query e.g. "hr.*"
	if pathQuery := c.Query("path"); pathQuery != "" {
		query = query.Where("path ~ ?", pathQuery)
	}
	// Full-text search or fallback ILIKE search
	if search := strings.TrimSpace(c.Query("search")); search != "" {
		query = query.Where("title ILIKE ? OR content ILIKE ? OR serial_number ILIKE ?", "%"+search+"%", "%"+search+"%", "%"+search+"%")
	}

	var correspondences []models.Correspondence
	if err := query.Preload("Template").Preload("CreatedBy").Preload("CurrentHolder").Order("created_at DESC").Find(&correspondences).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch correspondences"})
	}

	return c.JSON(correspondences)
}

// GetCorrespondenceByID gets a single correspondence with full details and forwarding chain
func GetCorrespondenceByID(c *fiber.Ctx) error {
	workspaceIDStr, ok := c.Locals("workspace_id").(string)
	if !ok || workspaceIDStr == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized workspace scope"})
	}
	workspaceID := database.ParseUUID(workspaceIDStr)

	idStr := c.Params("id")
	id := database.ParseUUID(idStr)
	if id == uuid.Nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid correspondence id"})
	}

	var correspondence models.Correspondence
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", id, workspaceID).
		Preload("Template").Preload("CreatedBy").Preload("CurrentHolder").
		First(&correspondence).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "correspondence not found"})
	}

	var forwardLogs []models.CorrespondenceForwardLog
	database.GetDB(c).Where("correspondence_id = ?", id).
		Preload("FromUser").Preload("ToUser").
		Order("forwarded_at ASC").Find(&forwardLogs)

	return c.JSON(fiber.Map{
		"correspondence": correspondence,
		"forward_logs":   forwardLogs,
	})
}

// UpdateCorrespondence modifies an existing correspondence record
func UpdateCorrespondence(c *fiber.Ctx) error {
	workspaceIDStr, ok := c.Locals("workspace_id").(string)
	if !ok || workspaceIDStr == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized workspace scope"})
	}
	workspaceID := database.ParseUUID(workspaceIDStr)

	idStr := c.Params("id")
	id := database.ParseUUID(idStr)

	var correspondence models.Correspondence
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", id, workspaceID).First(&correspondence).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "correspondence not found"})
	}

	var req CreateCorrespondenceRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	if req.Title != "" {
		correspondence.Title = req.Title
	}
	if req.Content != "" {
		correspondence.Content = req.Content
	}
	if req.SenderType != "" {
		correspondence.SenderType = req.SenderType
	}
	if req.SenderDetails != "" {
		correspondence.SenderDetails = datatypes.JSON([]byte(req.SenderDetails))
	}
	if req.RecipientDetails != "" {
		correspondence.RecipientDetails = datatypes.JSON([]byte(req.RecipientDetails))
	}
	if req.SecurityLevel == "" && req.Confidentiality != "" {
		req.SecurityLevel = req.Confidentiality
	}
	if req.SenderType == "" && req.Type != "" {
		req.SenderType = req.Type
	}
	if req.SecurityLevel != "" {
		correspondence.SecurityLevel = req.SecurityLevel
	}
	if req.Status != "" {
		correspondence.Status = req.Status
	}
	if req.Attachments != "" {
		correspondence.Attachments = datatypes.JSON([]byte(req.Attachments))
	}
	if req.ExternalReference != "" {
		correspondence.ExternalReference = req.ExternalReference
	}
	if req.TemplateID != "" {
		tID := database.ParseUUID(req.TemplateID)
		if tID != uuid.Nil {
			correspondence.TemplateID = &tID
		}
	}
	if req.CurrentHolderID != "" {
		hID := database.ParseUUID(req.CurrentHolderID)
		if hID != uuid.Nil {
			correspondence.CurrentHolderID = hID
		}
	}

	if err := database.GetDB(c).Save(&correspondence).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to update correspondence"})
	}

	return c.JSON(correspondence)
}

// ForwardCorrespondence appends a node to ltree path and transfers custody with official note
func ForwardCorrespondence(c *fiber.Ctx) error {
	workspaceIDStr, ok := c.Locals("workspace_id").(string)
	if !ok || workspaceIDStr == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized workspace scope"})
	}
	workspaceID := database.ParseUUID(workspaceIDStr)
	fromUserIDStr, _ := c.Locals("user_id").(string)
	fromUserID := database.ParseUUID(fromUserIDStr)

	idStr := c.Params("id")
	id := database.ParseUUID(idStr)

	var req ForwardCorrespondenceRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	toUserID := database.ParseUUID(req.ToUserID)
	if toUserID == uuid.Nil {
		toUserID = fromUserID // Transfer or route to current holder if ltree forward_to path is specified
	}

	var correspondence models.Correspondence
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", id, workspaceID).First(&correspondence).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "correspondence not found"})
	}

	note := req.OfficialNote
	if note == "" {
		note = req.Notes
	}

	// Determine new segment for ltree path
	segment := req.DeptCode
	if segment == "" && req.ForwardTo != "" {
		segment = req.ForwardTo
	}
	if segment == "" && req.ToUserID != "" {
		segment = strings.ToLower(strings.ReplaceAll(req.ToUserID[:8], "-", "_"))
	}
	segment = strings.ToLower(strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' || r == '.' {
			return r
		}
		return '_'
	}, segment))
	if segment == "" {
		segment = "fwd"
	}

	newPath := req.ForwardTo
	if newPath == "" {
		if correspondence.Path == "" {
			newPath = segment
		} else {
			newPath = correspondence.Path + "." + segment
		}
	}

	err := database.GetDB(c).Transaction(func(tx *gorm.DB) error {
		correspondence.Path = newPath
		correspondence.CurrentHolderID = toUserID
		if correspondence.Status == "draft" {
			correspondence.Status = "pending_approval"
		}
		if err := tx.Save(&correspondence).Error; err != nil {
			return err
		}

		forwardLog := models.CorrespondenceForwardLog{
			CorrespondenceID: correspondence.ID,
			FromUserID:       fromUserID,
			ToUserID:         toUserID,
			OfficialNote:     note,
			PathSegment:      segment,
		}
		return tx.Create(&forwardLog).Error
	})

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to forward correspondence: " + err.Error()})
	}

	wsPayload := map[string]interface{}{
		"type":              "correspondence_forwarded",
		"correspondence_id": correspondence.ID,
		"path":              newPath,
		"from_user_id":      fromUserID,
		"to_user_id":        toUserID,
		"note":              note,
	}
	PublishToCentrifugo(WorkspaceChannel(workspaceID), wsPayload)

	return c.JSON(fiber.Map{
		"success":        true,
		"message":        "Correspondence forwarded successfully",
		"correspondence": correspondence,
	})
}

// SignCorrespondence officially signs and seals the letter, assigning serial number and QR token
func SignCorrespondence(c *fiber.Ctx) error {
	workspaceIDStr, ok := c.Locals("workspace_id").(string)
	if !ok || workspaceIDStr == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized workspace scope"})
	}
	workspaceID := database.ParseUUID(workspaceIDStr)
	userIDStr, _ := c.Locals("user_id").(string)

	idStr := c.Params("id")
	id := database.ParseUUID(idStr)

	var req SignCorrespondenceRequest
	_ = c.BodyParser(&req)

	var correspondence models.Correspondence
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", id, workspaceID).First(&correspondence).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "correspondence not found"})
	}

	if correspondence.Status == "signed" || correspondence.Status == "dispatched" {
		return c.JSON(correspondence) // Already signed
	}

	now := time.Now()

	err := database.GetDB(c).Transaction(func(tx *gorm.DB) error {
		// Generate serial number if not already generated
		if correspondence.SerialNumber == "" {
			correspondence.SerialNumber = GenerateSerialNumber(tx, workspaceID, req.DeptCode)
		}

		// Generate QR checksum & verification link
		rawTokenData := fmt.Sprintf("%s:%s:%s:%d:%s:%s", correspondence.ID.String(), correspondence.SerialNumber, userIDStr, now.Unix(), req.SignerName, req.SignerTitle)
		hash := sha256.Sum256([]byte(rawTokenData))
		qrToken := hex.EncodeToString(hash[:])[:24]

		correspondence.QRToken = fmt.Sprintf("LBY-SEC-HMAC256-%s", qrToken)
		correspondence.QRCodeURL = fmt.Sprintf("/verify/correspondence?serial=%s&token=%s", correspondence.SerialNumber, correspondence.QRToken)
		if req.ExternalReference != "" {
			correspondence.ExternalReference = req.ExternalReference
		} else if req.SignerName != "" {
			correspondence.ExternalReference = fmt.Sprintf("%s - %s", req.SignerName, req.SignerTitle)
		}
		correspondence.Status = "signed"
		correspondence.SignedAt = &now

		return tx.Save(&correspondence).Error
	})

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to sign correspondence: " + err.Error()})
	}

	return c.JSON(correspondence)
}

// ArchiveCorrespondence marks the correspondence as archived and ready for AI RAG indexing
func ArchiveCorrespondence(c *fiber.Ctx) error {
	workspaceIDStr, ok := c.Locals("workspace_id").(string)
	if !ok || workspaceIDStr == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized workspace scope"})
	}
	workspaceID := database.ParseUUID(workspaceIDStr)

	idStr := c.Params("id")
	id := database.ParseUUID(idStr)

	var correspondence models.Correspondence
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", id, workspaceID).First(&correspondence).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "correspondence not found"})
	}

	now := time.Now()
	correspondence.Status = "archived"
	correspondence.ArchivedAt = &now

	if err := database.GetDB(c).Save(&correspondence).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to archive correspondence"})
	}

	payloadBytes, _ := json.Marshal(fiber.Map{
		"correspondence_id": correspondence.ID.String(),
		"serial_number":     correspondence.SerialNumber,
		"title":             correspondence.Title,
		"content":           correspondence.Content,
		"workspace_id":      workspaceID.String(),
		"archived_at":       correspondence.ArchivedAt,
	})
	_ = events.PublishEvent("events.correspondence.archived", payloadBytes)

	return c.JSON(fiber.Map{
		"success":        true,
		"correspondence": correspondence,
	})
}
