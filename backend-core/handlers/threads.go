package handlers

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
)

// ThreadSummary is one row of the channel's thread list: a parent message that
// has at least one reply, plus its reply count.
type ThreadSummary struct {
	ID            uuid.UUID `json:"id"`
	Content       string    `json:"content"`
	CreatedAt     time.Time `json:"created_at"`
	Author        string    `json:"author"`
	IsAIGenerated bool      `json:"is_ai_generated"`
	ReplyCount    int64     `json:"reply_count"`
}

// GetChannelThreads returns the real threads of a channel — messages that have
// replies — ordered by the parent's recency, with reply counts. Replaces the
// old client-side mock thread list.
func GetChannelThreads(c *fiber.Ctx) error {
	channelID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.JSON(fiber.Map{"threads": []ThreadSummary{}})
	}

	// 1. Reply counts grouped by parent, scoped to this channel.
	type rc struct {
		ParentID uuid.UUID
		Count    int64
	}
	var counts []rc
	database.DB.Model(&models.Message{}).
		Select("parent_id, count(*) as count").
		Where("channel_id = ? AND parent_id IS NOT NULL", channelID).
		Group("parent_id").
		Scan(&counts)

	if len(counts) == 0 {
		return c.JSON(fiber.Map{"threads": []ThreadSummary{}})
	}

	countMap := make(map[uuid.UUID]int64, len(counts))
	ids := make([]uuid.UUID, 0, len(counts))
	for _, r := range counts {
		countMap[r.ParentID] = r.Count
		ids = append(ids, r.ParentID)
	}

	// 2. Fetch the parent messages (thread roots) with their author.
	var parents []models.Message
	database.DB.Preload("User").
		Where("id IN ?", ids).
		Order("created_at DESC").
		Find(&parents)

	out := make([]ThreadSummary, 0, len(parents))
	for _, m := range parents {
		author := ""
		if m.User != nil {
			author = m.User.Email
		}
		if m.IsAIGenerated && m.AIAgentRole != "" {
			author = m.AIAgentRole
		}
		out = append(out, ThreadSummary{
			ID:            m.ID,
			Content:       m.Content,
			CreatedAt:     m.CreatedAt,
			Author:        author,
			IsAIGenerated: m.IsAIGenerated,
			ReplyCount:    countMap[m.ID],
		})
	}
	return c.JSON(fiber.Map{"threads": out})
}

// GetMessageReplies fetches all replies for a specific message ID
func GetMessageReplies(c *fiber.Ctx) error {
	messageID := c.Params("id")

	// The id must be a UUID. A non-UUID (e.g. a client-side placeholder/mock
	// thread id like "thread-2") would make Postgres throw an invalid-uuid
	// error; return an empty thread instead of a 500.
	if _, err := uuid.Parse(messageID); err != nil {
		return c.JSON(fiber.Map{"replies": []models.Message{}})
	}

	var replies []models.Message
	
	// Preload the User so we know who sent the reply
	result := database.DB.Preload("User").
		Where("parent_id = ?", messageID).
		Order("created_at ASC").
		Find(&replies)

	if result.Error != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to fetch replies",
		})
	}

	return c.JSON(fiber.Map{
		"replies": replies,
	})
}
