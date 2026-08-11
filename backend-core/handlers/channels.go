package handlers

import (
	"fmt"
	"log"
	"regexp"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/events"
	"github.com/septimus-os/backend-core/models"
)

type CreateChannelRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	IsPrivate   bool   `json:"is_private"`
	// User IDs for DMs or initial invites
	UserIDs []string `json:"user_ids"`
}

// CreateChannel creates a new Channel or DM
func CreateChannel(c *fiber.Ctx) error {
	workspaceID, _ := c.Locals("workspace_id").(string)
	userID, _ := c.Locals("user_id").(string)
	workspaceUUID := database.ParseUUID(workspaceID)
	creatorUUID := database.ParseUUID(userID)
	if workspaceUUID == uuid.Nil || creatorUUID == uuid.Nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid workspace or user context"})
	}

	var req CreateChannelRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	tx := database.GetDB(c)
	var creator models.User
	if err := tx.Select("id").Where("id = ? AND workspace_id = ?", creatorUUID, workspaceUUID).First(&creator).Error; err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "User is not a workspace member"})
	}

	// Resolve and validate every invite before creating the channel. This keeps
	// a caller from attaching another tenant's user to a private channel and
	// avoids committing a half-created channel if one invite is invalid.
	invitees := make([]uuid.UUID, 0, len(req.UserIDs))
	seen := map[uuid.UUID]bool{creatorUUID: true}
	for _, idStr := range req.UserIDs {
		inviteeID, err := uuid.Parse(strings.TrimSpace(idStr))
		if err != nil || inviteeID == uuid.Nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid invited user ID"})
		}
		if seen[inviteeID] {
			continue
		}
		var invitee models.User
		if err := tx.Select("id").Where("id = ? AND workspace_id = ?", inviteeID, workspaceUUID).First(&invitee).Error; err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invited user is not a workspace member"})
		}
		seen[inviteeID] = true
		invitees = append(invitees, inviteeID)
	}

	chanType := "PUBLIC"
	if req.IsPrivate {
		chanType = "PRIVATE"
	}
	if len(req.UserIDs) > 0 && req.Name == "" {
		chanType = "DM"
	}

	// The request already runs inside a transaction opened by TenantEnforcer
	// (which also sets the RLS workspace GUC on it). Opening a nested one here
	// and committing it detached the outer transaction and every write failed
	// with "sql: transaction has already been committed or rolled back", so use
	// the request-scoped handle directly and let the middleware commit.
	channel := models.Channel{
		WorkspaceID: workspaceUUID,
		Name:        req.Name,
		Type:        chanType,
	}

	if err := tx.Create(&channel).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Could not create channel"})
	}

	// Add creator
	if err := tx.Create(&models.ChannelMember{
		ChannelID: channel.ID,
		UserID:    creatorUUID,
		Role:      "OWNER",
	}).Error; err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Could not add channel owner")
	}

	// Add other users if provided (for DMs or private groups)
	for _, inviteeID := range invitees {
		if err := tx.Create(&models.ChannelMember{
			ChannelID: channel.ID,
			UserID:    inviteeID,
			Role:      "MEMBER",
		}).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Could not add channel member")
		}
	}

	return c.Status(fiber.StatusCreated).JSON(channel)
}

// GetChannels returns channels the user is part of
func GetChannels(c *fiber.Ctx) error {
	userID, _ := c.Locals("user_id").(string)
	workspaceID, _ := c.Locals("workspace_id").(string)

	var channels []models.Channel

	// Fetch PUBLIC channels in the workspace, PLUS any PRIVATE/DM channels the user is a member of.
	err := database.GetDB(c).Distinct("channels.*").
		Joins("LEFT JOIN channel_members ON channel_members.channel_id = channels.id").
		Where("channels.workspace_id = ?", workspaceID).
		Where("channels.type = 'PUBLIC' OR channel_members.user_id = ?", userID).
		Preload("Members.User").
		Find(&channels).Error

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Could not fetch channels"})
	}

	for i := range channels {
		if channels[i].Type == "DM" && channels[i].Name == "" {
			for _, m := range channels[i].Members {
				if m.UserID.String() != userID && m.User.Email != "" {
					channels[i].Name = m.User.Email
					break
				}
			}
		}
	}

	return c.JSON(channels)
}

// GetMessages returns paginated message history for a channel
// Query params: ?limit=50&before=<message_id> (cursor-based pagination)
func GetMessages(c *fiber.Ctx) error {
	channelID := c.Params("id")
	userID, _ := c.Locals("user_id").(string)
	workspaceID := CurrentWorkspaceID(c)

	var channel models.Channel
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", channelID, workspaceID).First(&channel).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Channel not found"})
	}

	// Check membership
	var memberCount int64
	database.GetDB(c).Model(&models.ChannelMember{}).
		Where("channel_id = ? AND user_id = ?", channelID, userID).
		Count(&memberCount)

	if memberCount == 0 {
		if channel.Type != "PUBLIC" {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not a member of this private channel"})
		}
	}

	// Pagination: limit + cursor (before=<uuid>)
	limit := c.QueryInt("limit", 50)
	if limit > 200 {
		limit = 200
	}
	beforeMsgID := c.Query("before") // cursor: load messages before this ID

	query := database.GetDB(c).Preload("User").
		Where("channel_id = ? AND workspace_id = ? AND parent_id IS NULL", channelID, workspaceID).
		Order("created_at DESC").
		Limit(limit)

	if beforeMsgID != "" {
		// Cursor pagination: get messages older than the cursor message's timestamp
		var cursor models.Message
		if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", beforeMsgID, workspaceID).First(&cursor).Error; err == nil {
			query = query.Where("created_at < ?", cursor.CreatedAt)
		}
	}

	var messages []models.Message
	if err := query.Find(&messages).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Could not fetch messages"})
	}

	// Reverse to chronological order (we fetched DESC for cursor efficiency)
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}

	// Build next cursor for client
	var nextCursor string
	hasMore := len(messages) == limit
	if hasMore && len(messages) > 0 {
		nextCursor = messages[0].ID.String() // oldest message in this page = next cursor
	}

	return c.JSON(fiber.Map{
		"messages":    messages,
		"has_more":    hasMore,
		"next_cursor": nextCursor,
		"count":       len(messages),
	})
}

type SendMessageRequest struct {
	Content        string  `json:"content"`
	ParentID       *string `json:"parent_id,omitempty"`
	AttachmentURL  string  `json:"AttachmentURL,omitempty"`
	AttachmentType string  `json:"AttachmentType,omitempty"`
}

// SendMessage handles HTTP POST for sending a chat message, saves it, and pushes to Centrifugo
func SendMessage(c *fiber.Ctx) error {
	channelID := c.Params("id")
	userID, _ := c.Locals("user_id").(string)
	workspaceID := CurrentWorkspaceID(c)

	var req SendMessageRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}
	if req.Content == "" && req.AttachmentURL == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Empty message"})
	}
	var channel models.Channel
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", channelID, workspaceID).First(&channel).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Channel not found"})
	}

	var member models.ChannelMember
	if err := database.GetDB(c).Where("channel_id = ? AND user_id = ?", channelID, userID).First(&member).Error; err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "You are not a member of this channel"})
	}
	if member.IsMuted {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "You are muted in this channel"})
	}

	userUUID := database.ParseUUID(userID)
	channelUUID := database.ParseUUID(channelID)

	var parentUUID *uuid.UUID
	if req.ParentID != nil {
		pu := database.ParseUUID(*req.ParentID)
		var parent models.Message
		if pu == uuid.Nil || database.GetDB(c).Where("id = ? AND channel_id = ? AND workspace_id = ?", pu, channelUUID, workspaceID).First(&parent).Error != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid parent message"})
		}
		parentUUID = &pu
	}

	dbMsg := models.Message{
		ChannelID:      channelUUID,
		SenderID:       userUUID,
		ParentID:       parentUUID,
		Content:        req.Content,
		AttachmentURL:  req.AttachmentURL,
		AttachmentType: req.AttachmentType,
	}

	if err := database.GetDB(c).Create(&dbMsg).Error; err != nil {
		log.Printf("Failed to save message: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save"})
	}

	// Preload User
	database.GetDB(c).Preload("User").First(&dbMsg, dbMsg.ID)

	// Publish to Centrifugo
	wsPayload := map[string]interface{}{
		"type":    "chat_message",
		"message": dbMsg,
	}
	PublishToCentrifugo(ChannelChannel(channelUUID), wsPayload)

	// --- Mention Parsing & Notification ---
	mentionRegex := regexp.MustCompile(`(?:^|\s)@([\p{L}\p{N}_.-]+)`)
	matches := mentionRegex.FindAllStringSubmatch(req.Content, -1)
	if len(matches) > 0 {
		var uniqueDisplayNames []string
		seen := make(map[string]bool)
		for _, match := range matches {
			if len(match) > 1 {
				name := match[1]
				if !seen[name] {
					seen[name] = true
					uniqueDisplayNames = append(uniqueDisplayNames, name)
				}
			}
		}

		if len(uniqueDisplayNames) > 0 {
			var mentionedUsers []models.User
			for _, name := range uniqueDisplayNames {
				var users []models.User
				// Attempt to match the mention to the beginning of the email (e.g. @ahmed matches ahmed@domain.com)
				database.GetDB(c).Where("workspace_id = ? AND LOWER(email) LIKE ?", workspaceID, strings.ToLower(name)+"%").Find(&users)
				mentionedUsers = append(mentionedUsers, users...)
			}

			for _, mu := range mentionedUsers {
				if mu.ID == userUUID {
					continue
				}

				// Safely format the sender name from their email prefix
				senderName := "Unknown"
				if dbMsg.User != nil {
					senderName = strings.Split(dbMsg.User.Email, "@")[0]
				}

				notification := models.Notification{
					UserID:  mu.ID.String(),
					Type:    "mention",
					Title:   "Mention in chat",
					Message: fmt.Sprintf("%s mentioned you in a message.", senderName),
					Link:    "/chat/" + channelID,
				}
				if err := database.GetDB(c).Create(&notification).Error; err == nil {
					notifPayload := map[string]interface{}{
						"type":         "notification",
						"notification": notification,
					}
					PublishToCentrifugo(UserChannel(mu.ID), notifPayload)
				}
			}
		}
	}
	// --------------------------------------

	// Trigger AI workflow via NATS
	if events.NatsConn != nil {
		// Tenant from the persisted row — see the websocket publisher.
		if err := events.PublishTenantEvent("events.messages.created", dbMsg.WorkspaceID, map[string]interface{}{
			"event":      "events.messages.created",
			"message_id": dbMsg.ID,
			"channel_id": dbMsg.ChannelID,
			"content":    dbMsg.Content,
			"sender_id":  dbMsg.SenderID,
		}); err != nil {
			log.Printf("events.messages.created not published for message %s: %v", dbMsg.ID, err)
		}
	}

	go ExecuteWorkflowsByTrigger(dbMsg.WorkspaceID, "message.created", map[string]interface{}{
		"message_id": dbMsg.ID.String(),
		"channel_id": dbMsg.ChannelID.String(),
		"content":    dbMsg.Content,
		"sender_id":  dbMsg.SenderID.String(),
	})

	return c.Status(fiber.StatusCreated).JSON(dbMsg)
}

type UpdateMessageRequest struct {
	Content string `json:"content"`
}

// UpdateMessage handles HTTP PUT for editing an existing chat message
func UpdateMessage(c *fiber.Ctx) error {
	messageID := c.Params("id")
	userID, _ := c.Locals("user_id").(string)

	var req UpdateMessageRequest
	if err := c.BodyParser(&req); err != nil || strings.TrimSpace(req.Content) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid content"})
	}

	var dbMsg models.Message
	if err := database.GetDB(c).Preload("User").Where("id = ? AND workspace_id = ?", messageID, CurrentWorkspaceID(c)).First(&dbMsg).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Message not found"})
	}

	// Verify ownership or admin
	if dbMsg.SenderID.String() != userID {
		var user models.User
		if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", userID, CurrentWorkspaceID(c)).First(&user).Error; err == nil {
			if user.Role != "ADMIN" && user.Role != "admin" {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not authorized to edit this message"})
			}
		} else {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not authorized"})
		}
	}

	dbMsg.Content = req.Content
	if err := database.GetDB(c).Save(&dbMsg).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update message"})
	}

	// Broadcast update to Centrifugo
	wsPayload := map[string]interface{}{
		"type":    "message_updated",
		"message": dbMsg,
	}
	PublishToCentrifugo(ChannelChannel(dbMsg.ChannelID), wsPayload)

	return c.JSON(dbMsg)
}

// DeleteMessage handles HTTP DELETE for removing an existing chat message
func DeleteMessage(c *fiber.Ctx) error {
	messageID := c.Params("id")
	userID, _ := c.Locals("user_id").(string)

	var dbMsg models.Message
	if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", messageID, CurrentWorkspaceID(c)).First(&dbMsg).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Message not found"})
	}

	// Verify ownership or admin
	if dbMsg.SenderID.String() != userID {
		var user models.User
		if err := database.GetDB(c).Where("id = ? AND workspace_id = ?", userID, CurrentWorkspaceID(c)).First(&user).Error; err == nil {
			if user.Role != "ADMIN" && user.Role != "admin" {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not authorized to delete this message"})
			}
		} else {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not authorized"})
		}
	}

	channelID := dbMsg.ChannelID.String()
	msgUUID := dbMsg.ID.String()

	if err := database.GetDB(c).Delete(&dbMsg).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete message"})
	}

	// Broadcast deletion to Centrifugo
	wsPayload := map[string]interface{}{
		"type":       "message_deleted",
		"message_id": msgUUID,
		"channel_id": channelID,
	}
	PublishToCentrifugo(ChannelChannel(dbMsg.ChannelID), wsPayload)

	return c.JSON(fiber.Map{"status": "deleted", "id": msgUUID})
}
