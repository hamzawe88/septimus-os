package handlers

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/events"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
)

// Meetings are stored as JSONB entities (entity_type = "meeting") so the module
// rides the existing dynamic-entity engine: zero migrations, RLS via the
// entities policy, and AI agents can read them like any other entity.
//
// The previous Meetings page was a local demo: a fake roster, an invite button
// that discarded its argument, and an AI "summary" whose prompt literally said
// "invent 3 realistic business updates". These handlers replace that with a
// real, workspace-scoped meeting session synced over Centrifugo, and a real
// transcript that the AI summarizes — or honestly declines to when it is empty.

const meetingEntityType = "meeting"

const (
	maxTranscriptLines    = 1000
	maxTranscriptLineLen  = 2000
	maxMeetingTitleLength = 200
)

type meetingParticipant struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Avatar        string `json:"avatar,omitempty"`
	Role          string `json:"role"` // HOST | SPEAKER | LISTENER
	Muted         bool   `json:"muted"`
	HandRaised    bool   `json:"hand_raised"`
	ScreenSharing bool   `json:"screen_sharing"`
}

type meetingTranscriptLine struct {
	ID        string `json:"id"`
	SpeakerID string `json:"speaker_id"`
	Speaker   string `json:"speaker"`
	Text      string `json:"text"`
	Timestamp string `json:"ts"`
}

type meetingSummary struct {
	Text         string `json:"text"`
	Lang         string `json:"lang"`
	CreatedAt    string `json:"created_at"`
	TargetUserID string `json:"target_user_id,omitempty"`
	NoTranscript bool   `json:"no_transcript,omitempty"`
}

type meetingData struct {
	Title        string                  `json:"title"`
	Status       string                  `json:"status"` // live | ended
	HostID       string                  `json:"host_id"`
	Locked       bool                    `json:"locked"`
	StartedAt    string                  `json:"started_at"`
	EndedAt      string                  `json:"ended_at,omitempty"`
	Participants []meetingParticipant    `json:"participants"`
	Transcript   []meetingTranscriptLine `json:"transcript"`
	Summary      *meetingSummary         `json:"summary,omitempty"`
}

// ─── helpers ─────────────────────────────────────────────────────────────────

func meetingUserDisplay(u models.User) string {
	if strings.TrimSpace(u.JobTitle) != "" {
		return u.JobTitle
	}
	if at := strings.Index(u.Email, "@"); at > 0 {
		return u.Email[:at]
	}
	return u.Email
}

func broadcastMeetingEvent(workspaceID uuid.UUID, eventType string, payload fiber.Map) {
	payload["type"] = eventType
	// Best effort: realtime fan-out must never fail the API write that
	// already committed.
	_ = PublishToCentrifugo(WorkspaceChannel(workspaceID), payload)
}

func decodeMeeting(e *models.Entity) (*meetingData, error) {
	var d meetingData
	if err := json.Unmarshal(e.Data, &d); err != nil {
		return nil, err
	}
	return &d, nil
}

func encodeMeeting(d *meetingData) (datatypes.JSON, error) {
	raw, err := json.Marshal(d)
	if err != nil {
		return nil, err
	}
	return datatypes.JSON(raw), nil
}

// loadMeetingForUpdate fetches and row-locks a live-or-ended meeting inside tx.
func loadMeetingForUpdate(tx *gorm.DB, workspaceID uuid.UUID, meetingID string) (*models.Entity, *meetingData, error) {
	var e models.Entity
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("id = ? AND workspace_id = ? AND entity_type = ?", meetingID, workspaceID, meetingEntityType).
		First(&e).Error; err != nil {
		return nil, nil, err
	}
	d, err := decodeMeeting(&e)
	if err != nil {
		return nil, nil, err
	}
	return &e, d, nil
}

func requesterIdentity(c *fiber.Ctx) (uuid.UUID, string, bool) {
	idStr, _ := c.Locals("user_id").(string)
	id := database.ParseUUID(idStr)
	if id == uuid.Nil {
		return uuid.Nil, "", false
	}
	return id, idStr, true
}

func findParticipant(d *meetingData, userID string) *meetingParticipant {
	for i := range d.Participants {
		if d.Participants[i].ID == userID {
			return &d.Participants[i]
		}
	}
	return nil
}

func isMeetingHost(d *meetingData, userID string) bool {
	if d.HostID == userID {
		return true
	}
	p := findParticipant(d, userID)
	return p != nil && p.Role == "HOST"
}

// ─── lifecycle ───────────────────────────────────────────────────────────────

// StartMeeting creates a live meeting, or returns the existing live one — a
// workspace has at most one live meeting at a time.
func StartMeeting(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Workspace context is required"})
	}
	userID, userIDStr, ok := requesterIdentity(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Missing user context"})
	}

	var req struct {
		Title string `json:"title"`
	}
	_ = c.BodyParser(&req)
	title := strings.TrimSpace(req.Title)
	if title == "" {
		title = "Meeting"
	}
	if len(title) > maxMeetingTitleLength {
		title = title[:maxMeetingTitleLength]
	}

	var user models.User
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", userID, workspaceID).First(&user).Error; err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "User is not a member of this workspace"})
	}

	var created *models.Entity
	err := database.GetDB(c).Transaction(func(tx *gorm.DB) error {
		// Return the existing live meeting instead of forking a second one.
		var existing models.Entity
		errLive := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("workspace_id = ? AND entity_type = ? AND data->>'status' = 'live'", workspaceID, meetingEntityType).
			First(&existing).Error
		if errLive == nil {
			created = &existing
			return nil
		}

		d := meetingData{
			Title:     title,
			Status:    "live",
			HostID:    userIDStr,
			StartedAt: time.Now().UTC().Format(time.RFC3339),
			Participants: []meetingParticipant{{
				ID:     userIDStr,
				Name:   meetingUserDisplay(user),
				Avatar: user.Avatar,
				Role:   "HOST",
			}},
			Transcript: []meetingTranscriptLine{},
		}
		raw, err := encodeMeeting(&d)
		if err != nil {
			return err
		}
		e := models.Entity{WorkspaceID: workspaceID, EntityType: meetingEntityType, Data: raw}
		if err := tx.Create(&e).Error; err != nil {
			return err
		}
		created = &e
		return nil
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to start meeting"})
	}

	broadcastMeetingEvent(workspaceID, "meeting.started", fiber.Map{"meeting_id": created.ID.String()})
	return c.JSON(created)
}

// GetActiveMeeting returns the workspace's live meeting, if any.
func GetActiveMeeting(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Workspace context is required"})
	}
	var e models.Entity
	err := database.GetDB(c).
		Where("workspace_id = ? AND entity_type = ? AND data->>'status' = 'live'", workspaceID, meetingEntityType).
		Order("created_at DESC").First(&e).Error
	if err != nil {
		return c.JSON(fiber.Map{"meeting": nil})
	}
	return c.JSON(fiber.Map{"meeting": e})
}

// JoinMeeting adds the requester to the roster (LISTENER by default).
func JoinMeeting(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Workspace context is required"})
	}
	userID, userIDStr, ok := requesterIdentity(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Missing user context"})
	}

	var user models.User
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", userID, workspaceID).First(&user).Error; err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "User is not a member of this workspace"})
	}

	var statusCode int
	var statusMsg string
	err := database.GetDB(c).Transaction(func(tx *gorm.DB) error {
		e, d, err := loadMeetingForUpdate(tx, workspaceID, c.Params("id"))
		if err != nil {
			statusCode, statusMsg = fiber.StatusNotFound, "Meeting not found"
			return err
		}
		if d.Status != "live" {
			statusCode, statusMsg = fiber.StatusGone, "Meeting has ended"
			return gorm.ErrInvalidData
		}
		if findParticipant(d, userIDStr) != nil {
			return nil // idempotent re-join
		}
		if d.Locked {
			statusCode, statusMsg = fiber.StatusForbidden, "Meeting is locked"
			return gorm.ErrInvalidData
		}
		d.Participants = append(d.Participants, meetingParticipant{
			ID:     userIDStr,
			Name:   meetingUserDisplay(user),
			Avatar: user.Avatar,
			Role:   "LISTENER",
			Muted:  true,
		})
		raw, err := encodeMeeting(d)
		if err != nil {
			return err
		}
		return tx.Model(e).Update("data", raw).Error
	})
	if err != nil {
		if statusCode == 0 {
			statusCode, statusMsg = fiber.StatusInternalServerError, "Failed to join meeting"
		}
		return c.Status(statusCode).JSON(fiber.Map{"error": statusMsg})
	}

	broadcastMeetingEvent(workspaceID, "meeting.roster", fiber.Map{"meeting_id": c.Params("id")})
	return c.JSON(fiber.Map{"status": "joined"})
}

// LeaveMeeting removes the requester from the roster.
func LeaveMeeting(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Workspace context is required"})
	}
	_, userIDStr, ok := requesterIdentity(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Missing user context"})
	}

	err := database.GetDB(c).Transaction(func(tx *gorm.DB) error {
		e, d, err := loadMeetingForUpdate(tx, workspaceID, c.Params("id"))
		if err != nil {
			return err
		}
		kept := d.Participants[:0]
		for _, p := range d.Participants {
			if p.ID != userIDStr {
				kept = append(kept, p)
			}
		}
		d.Participants = kept
		raw, err := encodeMeeting(d)
		if err != nil {
			return err
		}
		return tx.Model(e).Update("data", raw).Error
	})
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Meeting not found"})
	}
	broadcastMeetingEvent(workspaceID, "meeting.roster", fiber.Map{"meeting_id": c.Params("id")})
	return c.JSON(fiber.Map{"status": "left"})
}

// EndMeeting closes the meeting. Host only.
func EndMeeting(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Workspace context is required"})
	}
	_, userIDStr, ok := requesterIdentity(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Missing user context"})
	}

	forbidden := false
	err := database.GetDB(c).Transaction(func(tx *gorm.DB) error {
		e, d, err := loadMeetingForUpdate(tx, workspaceID, c.Params("id"))
		if err != nil {
			return err
		}
		if !isMeetingHost(d, userIDStr) {
			forbidden = true
			return gorm.ErrInvalidData
		}
		d.Status = "ended"
		d.EndedAt = time.Now().UTC().Format(time.RFC3339)
		raw, err := encodeMeeting(d)
		if err != nil {
			return err
		}
		return tx.Model(e).Update("data", raw).Error
	})
	if forbidden {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Only the host can end the meeting"})
	}
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Meeting not found"})
	}
	broadcastMeetingEvent(workspaceID, "meeting.ended", fiber.Map{"meeting_id": c.Params("id")})

	// Fire-and-forget: the sidecar indexes the transcript + summary into the
	// RAG store so meeting history becomes searchable knowledge.
	archivePayload, _ := json.Marshal(map[string]interface{}{
		"workspace_id": workspaceID.String(),
		"meeting_id":   c.Params("id"),
	})
	if err := events.NatsConn.Publish("meeting.archive", archivePayload); err != nil {
		// Archive failure must not fail the end-of-meeting call.
		_ = err
	}
	return c.JSON(fiber.Map{"status": "ended"})
}

// ─── state & roster actions ──────────────────────────────────────────────────

// UpdateMeetingState applies roster/state actions. Host-only actions are
// enforced server-side — the old page enforced them in local component state,
// which is to say not at all.
func UpdateMeetingState(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Workspace context is required"})
	}
	_, userIDStr, ok := requesterIdentity(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Missing user context"})
	}

	var req struct {
		Action   string `json:"action"`
		TargetID string `json:"target_id"`
		Role     string `json:"role"`
		Value    bool   `json:"value"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	hostOnly := map[string]bool{"mute_all": true, "lock": true, "unlock": true, "set_role": true, "remove": true}
	validRole := map[string]bool{"HOST": true, "SPEAKER": true, "LISTENER": true}

	statusCode := 0
	statusMsg := ""
	err := database.GetDB(c).Transaction(func(tx *gorm.DB) error {
		e, d, err := loadMeetingForUpdate(tx, workspaceID, c.Params("id"))
		if err != nil {
			statusCode, statusMsg = fiber.StatusNotFound, "Meeting not found"
			return err
		}
		if d.Status != "live" {
			statusCode, statusMsg = fiber.StatusGone, "Meeting has ended"
			return gorm.ErrInvalidData
		}
		if hostOnly[req.Action] && !isMeetingHost(d, userIDStr) {
			statusCode, statusMsg = fiber.StatusForbidden, "Host permission required"
			return gorm.ErrInvalidData
		}

		switch req.Action {
		case "mute_all":
			for i := range d.Participants {
				if d.Participants[i].Role != "HOST" {
					d.Participants[i].Muted = true
				}
			}
		case "lock":
			d.Locked = true
		case "unlock":
			d.Locked = false
		case "set_role":
			if !validRole[req.Role] {
				statusCode, statusMsg = fiber.StatusBadRequest, "Invalid role"
				return gorm.ErrInvalidData
			}
			p := findParticipant(d, req.TargetID)
			if p == nil {
				statusCode, statusMsg = fiber.StatusNotFound, "Participant not found"
				return gorm.ErrInvalidData
			}
			p.Role = req.Role
			if req.Role == "LISTENER" {
				p.Muted = true
			}
		case "remove":
			kept := d.Participants[:0]
			for _, p := range d.Participants {
				if p.ID != req.TargetID {
					kept = append(kept, p)
				}
			}
			d.Participants = kept
		case "hand":
			p := findParticipant(d, userIDStr)
			if p == nil {
				statusCode, statusMsg = fiber.StatusForbidden, "Not a participant"
				return gorm.ErrInvalidData
			}
			p.HandRaised = req.Value
		case "self":
			// Own mute / screen-share state. TargetID is ignored on purpose:
			// a participant can only update themselves here.
			p := findParticipant(d, userIDStr)
			if p == nil {
				statusCode, statusMsg = fiber.StatusForbidden, "Not a participant"
				return gorm.ErrInvalidData
			}
			switch req.Role { // reused as field selector: "muted" | "screen"
			case "muted":
				p.Muted = req.Value
			case "screen":
				p.ScreenSharing = req.Value
			default:
				statusCode, statusMsg = fiber.StatusBadRequest, "Invalid self field"
				return gorm.ErrInvalidData
			}
		default:
			statusCode, statusMsg = fiber.StatusBadRequest, "Unknown action"
			return gorm.ErrInvalidData
		}

		raw, err := encodeMeeting(d)
		if err != nil {
			return err
		}
		return tx.Model(e).Update("data", raw).Error
	})
	if err != nil {
		if statusCode == 0 {
			statusCode, statusMsg = fiber.StatusInternalServerError, "Failed to update meeting"
		}
		return c.Status(statusCode).JSON(fiber.Map{"error": statusMsg})
	}

	broadcastMeetingEvent(workspaceID, "meeting.state", fiber.Map{"meeting_id": c.Params("id"), "action": req.Action})
	return c.JSON(fiber.Map{"status": "ok"})
}

// ─── transcript ──────────────────────────────────────────────────────────────

// AppendMeetingTranscript adds one transcript line. Participants only. This is
// what makes the AI summary real: it summarizes exactly these lines.
func AppendMeetingTranscript(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Workspace context is required"})
	}
	_, userIDStr, ok := requesterIdentity(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Missing user context"})
	}

	var req struct {
		Text string `json:"text"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	text := strings.TrimSpace(req.Text)
	if text == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Empty transcript line"})
	}
	if len(text) > maxTranscriptLineLen {
		text = text[:maxTranscriptLineLen]
	}

	line, statusCode, statusMsg := appendTranscriptLine(database.GetDB(c), workspaceID, c.Params("id"), userIDStr, text)
	if statusCode != 0 {
		return c.Status(statusCode).JSON(fiber.Map{"error": statusMsg})
	}

	broadcastMeetingEvent(workspaceID, "meeting.transcript", fiber.Map{"meeting_id": c.Params("id"), "line": line})
	return c.JSON(line)
}

// appendTranscriptLine is the single write path for transcript lines — used by
// the manual/dictation endpoint and by the server-side STT pipeline.
// Returns (line, 0, "") on success or (zero, httpStatus, message) on failure.
func appendTranscriptLine(db *gorm.DB, workspaceID uuid.UUID, meetingID, speakerID, text string) (meetingTranscriptLine, int, string) {
	var line meetingTranscriptLine
	statusCode, statusMsg := 0, ""
	err := db.Transaction(func(tx *gorm.DB) error {
		e, d, err := loadMeetingForUpdate(tx, workspaceID, meetingID)
		if err != nil {
			statusCode, statusMsg = fiber.StatusNotFound, "Meeting not found"
			return err
		}
		if d.Status != "live" {
			statusCode, statusMsg = fiber.StatusGone, "Meeting has ended"
			return gorm.ErrInvalidData
		}
		p := findParticipant(d, speakerID)
		if p == nil {
			statusCode, statusMsg = fiber.StatusForbidden, "Not a participant"
			return gorm.ErrInvalidData
		}
		if len(d.Transcript) >= maxTranscriptLines {
			statusCode, statusMsg = fiber.StatusRequestEntityTooLarge, "Transcript is full"
			return gorm.ErrInvalidData
		}
		line = meetingTranscriptLine{
			ID:        uuid.New().String(),
			SpeakerID: speakerID,
			Speaker:   p.Name,
			Text:      text,
			Timestamp: time.Now().UTC().Format(time.RFC3339),
		}
		d.Transcript = append(d.Transcript, line)
		raw, err := encodeMeeting(d)
		if err != nil {
			return err
		}
		return tx.Model(e).Update("data", raw).Error
	})
	if err != nil && statusCode == 0 {
		statusCode, statusMsg = fiber.StatusInternalServerError, "Failed to append transcript"
	}
	if err != nil {
		return meetingTranscriptLine{}, statusCode, statusMsg
	}
	return line, 0, ""
}

// ─── invitations & directory ─────────────────────────────────────────────────

// ListMeetingUsers returns a minimal member directory for the invite modal —
// deliberately only id / display name / avatar, nothing sensitive, and only
// for the caller's own workspace.
func ListMeetingUsers(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Workspace context is required"})
	}
	var users []models.User
	if err := database.GetDB(c).Select("id", "email", "job_title", "avatar").
		Where("workspace_id = ?", workspaceID).Limit(200).Find(&users).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch users"})
	}
	out := make([]fiber.Map, 0, len(users))
	for _, u := range users {
		out = append(out, fiber.Map{
			"id":        u.ID.String(),
			"name":      meetingUserDisplay(u),
			"job_title": u.JobTitle,
			"avatar":    u.Avatar,
		})
	}
	return c.JSON(fiber.Map{"users": out})
}

// InviteToMeeting pushes a realtime invitation to one workspace member.
func InviteToMeeting(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Workspace context is required"})
	}
	_, inviterIDStr, ok := requesterIdentity(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Missing user context"})
	}

	var req struct {
		UserID string `json:"user_id"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	targetID := database.ParseUUID(req.UserID)
	if targetID == uuid.Nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid user_id"})
	}

	// The invitee must belong to the same workspace — same boundary the
	// channel-members fix enforced.
	var target models.User
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", targetID, workspaceID).First(&target).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found in this workspace"})
	}

	var e models.Entity
	if err := database.GetDB(c).
		Where("id = ? AND workspace_id = ? AND entity_type = ?", c.Params("id"), workspaceID, meetingEntityType).
		First(&e).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Meeting not found"})
	}
	d, err := decodeMeeting(&e)
	if err != nil || d.Status != "live" {
		return c.Status(fiber.StatusGone).JSON(fiber.Map{"error": "Meeting is not live"})
	}
	if findParticipant(d, inviterIDStr) == nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not a participant"})
	}

	_ = PublishToCentrifugo(UserChannel(targetID), fiber.Map{
		"type":       "meeting.invite",
		"meeting_id": e.ID.String(),
		"title":      d.Title,
		"from":       inviterIDStr,
	})
	return c.JSON(fiber.Map{"status": "invited"})
}

// ─── AI summary ──────────────────────────────────────────────────────────────

// RequestMeetingSummary asks the sidecar to summarize the real transcript.
// target_user_id set → latecomer flow (summary is pushed to that user);
// empty → shared sidebar summary for the whole meeting.
func RequestMeetingSummary(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Workspace context is required"})
	}
	_, userIDStr, ok := requesterIdentity(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Missing user context"})
	}

	var req struct {
		Lang         string `json:"lang"`
		TargetUserID string `json:"target_user_id"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	var e models.Entity
	if err := database.GetDB(c).
		Where("id = ? AND workspace_id = ? AND entity_type = ?", c.Params("id"), workspaceID, meetingEntityType).
		First(&e).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Meeting not found"})
	}
	d, err := decodeMeeting(&e)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Corrupt meeting data"})
	}
	if findParticipant(d, userIDStr) == nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not a participant"})
	}

	payload, _ := json.Marshal(map[string]interface{}{
		"workspace_id":   workspaceID.String(),
		"meeting_id":     e.ID.String(),
		"lang":           req.Lang,
		"requester_id":   userIDStr,
		"target_user_id": req.TargetUserID,
	})
	if err := events.NatsConn.Publish("huddle.summarize", payload); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to dispatch summary request"})
	}
	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{"status": "summarizing"})
}

// ─── internal (sidecar) ──────────────────────────────────────────────────────

// GetMeetingTranscriptInternal serves the transcript to the AI sidecar.
// Mounted under /internal with the internal token + workspace middleware.
func GetMeetingTranscriptInternal(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Workspace context is required"})
	}
	var e models.Entity
	if err := database.GetDB(c).
		Where("id = ? AND workspace_id = ? AND entity_type = ?", c.Params("id"), workspaceID, meetingEntityType).
		First(&e).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Meeting not found"})
	}
	d, err := decodeMeeting(&e)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Corrupt meeting data"})
	}
	return c.JSON(fiber.Map{
		"title":        d.Title,
		"status":       d.Status,
		"participants": d.Participants,
		"transcript":   d.Transcript,
		"summary":      d.Summary,
	})
}

// SaveMeetingSummaryInternal persists the sidecar's summary and fans it out.
// Python never writes to the database — it hands the result back here.
func SaveMeetingSummaryInternal(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Workspace context is required"})
	}
	var req struct {
		Summary      string `json:"summary"`
		Lang         string `json:"lang"`
		RequesterID  string `json:"requester_id"`
		TargetUserID string `json:"target_user_id"`
		NoTranscript bool   `json:"no_transcript"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if strings.TrimSpace(req.Summary) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Empty summary"})
	}

	summary := meetingSummary{
		Text:         req.Summary,
		Lang:         req.Lang,
		CreatedAt:    time.Now().UTC().Format(time.RFC3339),
		TargetUserID: req.TargetUserID,
		NoTranscript: req.NoTranscript,
	}
	err := database.GetDB(c).Transaction(func(tx *gorm.DB) error {
		e, d, err := loadMeetingForUpdate(tx, workspaceID, c.Params("id"))
		if err != nil {
			return err
		}
		// Latecomer summaries are personal; only the shared (untargeted)
		// summary is stored on the meeting itself.
		if req.TargetUserID == "" {
			d.Summary = &summary
		}
		raw, err := encodeMeeting(d)
		if err != nil {
			return err
		}
		return tx.Model(e).Update("data", raw).Error
	})
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Meeting not found"})
	}

	meetingID := c.Params("id")
	if req.TargetUserID != "" {
		// Private latecomer brief → that user's own channel only.
		if targetID := database.ParseUUID(req.TargetUserID); targetID != uuid.Nil {
			_ = PublishToCentrifugo(UserChannel(targetID), fiber.Map{
				"type":       "meeting.summary",
				"meeting_id": meetingID,
				"title":      meetingSummaryTitle(req.Lang),
				"text":       req.Summary,
			})
		}
	} else {
		broadcastMeetingEvent(workspaceID, "meeting.summary", fiber.Map{
			"meeting_id":    meetingID,
			"text":          req.Summary,
			"lang":          req.Lang,
			"no_transcript": req.NoTranscript,
		})
	}
	return c.JSON(fiber.Map{"status": "saved"})
}

func meetingSummaryTitle(lang string) string {
	if lang == "ar" {
		return "موجز الاجتماع"
	}
	return "Meeting Summary"
}

// ─── WebRTC signaling (mesh) ─────────────────────────────────────────────────

// SignalMeeting relays one WebRTC signal (offer/answer/ICE) to one participant
// over their private Centrifugo channel. The server never inspects SDP; it
// only enforces that both ends are participants of the same live meeting in
// the caller's workspace — media stays peer-to-peer.
func SignalMeeting(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Workspace context is required"})
	}
	_, userIDStr, ok := requesterIdentity(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Missing user context"})
	}

	var req struct {
		TargetID string          `json:"target_id"`
		Kind     string          `json:"kind"` // offer | answer | ice
		Payload  json.RawMessage `json:"payload"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if req.Kind != "offer" && req.Kind != "answer" && req.Kind != "ice" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid signal kind"})
	}
	if len(req.Payload) == 0 || len(req.Payload) > 32*1024 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid signal payload size"})
	}
	targetID := database.ParseUUID(req.TargetID)
	if targetID == uuid.Nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid target_id"})
	}

	var e models.Entity
	if err := database.GetDB(c).
		Where("id = ? AND workspace_id = ? AND entity_type = ?", c.Params("id"), workspaceID, meetingEntityType).
		First(&e).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Meeting not found"})
	}
	d, err := decodeMeeting(&e)
	if err != nil || d.Status != "live" {
		return c.Status(fiber.StatusGone).JSON(fiber.Map{"error": "Meeting is not live"})
	}
	if findParticipant(d, userIDStr) == nil || findParticipant(d, req.TargetID) == nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Both peers must be participants"})
	}

	_ = PublishToCentrifugo(UserChannel(targetID), fiber.Map{
		"type":       "meeting.signal",
		"meeting_id": e.ID.String(),
		"from":       userIDStr,
		"kind":       req.Kind,
		"payload":    req.Payload,
	})
	return c.JSON(fiber.Map{"status": "sent"})
}

// ─── Server-side STT ─────────────────────────────────────────────────────────

// MeetingSTT accepts a short audio chunk from one participant's microphone,
// runs it through the same safety pipeline as huddle audio (size cap, file
// signature, ClamAV fail-closed), transcribes it via the local Whisper in the
// sidecar, and appends the text to the shared transcript attributed to the
// speaker. This is what turns "minutes" into an automatic byproduct of talking.
func MeetingSTT(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Workspace context is required"})
	}
	_, userIDStr, ok := requesterIdentity(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Missing user context"})
	}

	file, err := c.FormFile("audio")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "No audio file provided"})
	}
	if file.Size > 15*1024*1024 {
		return c.Status(fiber.StatusRequestEntityTooLarge).JSON(fiber.Map{"error": "audio chunk exceeds 15MB"})
	}
	src, err := file.Open()
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Could not inspect audio file"})
	}
	_, signatureErr := services.ValidateFileSignature(file.Filename, src)
	_ = src.Close()
	if signatureErr != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": signatureErr.Error()})
	}

	uploadDir := filepath.Join(UploadsRoot(), "huddle")
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create upload directory"})
	}
	filename := uuid.New().String() + strings.ToLower(filepath.Ext(file.Filename))
	savePath := filepath.Join(uploadDir, filename)
	if err := c.SaveFile(file, savePath); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save audio file"})
	}
	defer os.Remove(savePath)
	if err := services.ScanFile(savePath); err != nil {
		if errors.Is(err, services.ErrMalwareDetected) {
			return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": "Audio file was rejected by malware scanning"})
		}
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "Audio security scanning is unavailable"})
	}

	sttReq, _ := json.Marshal(map[string]string{
		"file_path":    savePath,
		"workspace_id": workspaceID.String(),
		"lang":         c.FormValue("lang", ""),
	})
	replyBytes, err := events.RequestEvent("meeting.stt", sttReq, 60*time.Second)
	if err != nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "Transcription service timed out"})
	}
	var reply struct {
		Text  string `json:"text"`
		Error string `json:"error"`
	}
	if err := json.Unmarshal(replyBytes, &reply); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Invalid transcription response"})
	}
	if reply.Error != "" {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": reply.Error})
	}
	text := strings.TrimSpace(reply.Text)
	if text == "" {
		// Silence or noise: nothing to record, and that is a success case.
		return c.JSON(fiber.Map{"status": "empty"})
	}
	if len(text) > maxTranscriptLineLen {
		text = text[:maxTranscriptLineLen]
	}

	line, statusCode, statusMsg := appendTranscriptLine(database.GetDB(c), workspaceID, c.Params("id"), userIDStr, text)
	if statusCode != 0 {
		return c.Status(statusCode).JSON(fiber.Map{"error": statusMsg})
	}
	broadcastMeetingEvent(workspaceID, "meeting.transcript", fiber.Map{"meeting_id": c.Params("id"), "line": line})
	return c.JSON(line)
}

// ─── Action-item extraction (HITL) ───────────────────────────────────────────

// ExtractMeetingTasks asks the sidecar to extract action items from the real
// transcript. Extracted items are queued as PendingApprovals — the existing
// human-in-the-loop gate — never created directly.
func ExtractMeetingTasks(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Workspace context is required"})
	}
	_, userIDStr, ok := requesterIdentity(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Missing user context"})
	}

	var req struct {
		Lang      string `json:"lang"`
		ProjectID string `json:"project_id"`
	}
	_ = c.BodyParser(&req)
	if strings.TrimSpace(req.ProjectID) != "" {
		projectID, err := uuid.Parse(strings.TrimSpace(req.ProjectID))
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid project_id"})
		}
		var count int64
		if err := database.GetDB(c).Model(&models.Project{}).Where("id = ? AND workspace_id = ?", projectID, workspaceID).Count(&count).Error; err != nil || count != 1 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Project not found in workspace"})
		}
	}

	var e models.Entity
	if err := database.GetDB(c).
		Where("id = ? AND workspace_id = ? AND entity_type = ?", c.Params("id"), workspaceID, meetingEntityType).
		First(&e).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Meeting not found"})
	}
	d, err := decodeMeeting(&e)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Corrupt meeting data"})
	}
	if findParticipant(d, userIDStr) == nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not a participant"})
	}

	payload, _ := json.Marshal(map[string]interface{}{
		"workspace_id": workspaceID.String(),
		"meeting_id":   e.ID.String(),
		"lang":         req.Lang,
		"requester_id": userIDStr,
		"project_id":   strings.TrimSpace(req.ProjectID),
	})
	if err := events.NatsConn.Publish("meeting.extract_tasks", payload); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to dispatch extraction request"})
	}
	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{"status": "extracting"})
}
