package handlers

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
)

// MessageFeedback records a 👍/👎 on an AI-generated message. One row per
// (message, user); re-rating updates it. This is the observability foundation:
// a labelled signal of which AI replies land, feeding future eval sets.
type MessageFeedback struct {
	ID        uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	MessageID uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_feedback_msg_user" json:"message_id"`
	UserID    uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_feedback_msg_user" json:"user_id"`
	Rating    int       `gorm:"type:int;not null" json:"rating"` // +1 up, -1 down
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// SubmitMessageFeedback upserts a thumbs up/down on an AI message.
func SubmitMessageFeedback(c *fiber.Ctx) error {
	msgID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid message id"})
	}

	var input struct {
		Rating string `json:"rating"` // "up" | "down"
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid input"})
	}

	rating := 0
	switch input.Rating {
	case "up":
		rating = 1
	case "down":
		rating = -1
	default:
		return c.Status(400).JSON(fiber.Map{"error": "rating must be 'up' or 'down'"})
	}

	userIDStr, _ := c.Locals("user_id").(string)
	userID := database.ParseUUID(userIDStr)
	if userID == uuid.Nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthenticated"})
	}

	var msg models.Message
	if err := database.GetDB(c).First(&msg, "id = ?", msgID).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "message not found"})
	}

	var fb MessageFeedback
	database.GetDB(c).
		Where(MessageFeedback{MessageID: msgID, UserID: userID}).
		Assign(MessageFeedback{Rating: rating}).
		FirstOrCreate(&fb)

	return c.JSON(fiber.Map{"message": "feedback recorded", "rating": rating})
}

// AIFeedbackSummary is the aggregate up/down signal for AI replies.
type AIFeedbackSummary struct {
	Up    int64   `json:"up"`
	Down  int64   `json:"down"`
	Total int64   `json:"total"`
	Score float64 `json:"score"` // up / total, 0..1
}

func aiFeedbackSummary() AIFeedbackSummary {
	var s AIFeedbackSummary
	database.DB.Model(&MessageFeedback{}).Where("rating = ?", 1).Count(&s.Up)
	database.DB.Model(&MessageFeedback{}).Where("rating = ?", -1).Count(&s.Down)
	s.Total = s.Up + s.Down
	if s.Total > 0 {
		s.Score = float64(s.Up) / float64(s.Total)
	}
	return s
}
