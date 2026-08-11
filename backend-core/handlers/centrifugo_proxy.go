package handlers

import (
	"crypto/subtle"
	"os"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/middleware"
	"github.com/septimus-os/backend-core/models"
)

// centrifugoSubscribeRequest is the body Centrifugo POSTs to the subscribe
// proxy. `user` is trustworthy: Centrifugo only proxies a subscription after it
// has validated the connection JWT signed with our HMAC secret, so a client
// cannot forge someone else's user id here.
type centrifugoSubscribeRequest struct {
	Client  string `json:"client"`
	User    string `json:"user"`
	Channel string `json:"channel"`
}

// subscribeAllow / subscribeDeny are the two Centrifugo proxy verdicts.
func subscribeAllow(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"result": fiber.Map{}})
}

func subscribeDeny(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"error": fiber.Map{"code": 403, "message": "permission denied"}})
}

// CentrifugoSubscribe authorizes every client subscription. Centrifugo denies
// all client-side subscriptions by default; this proxy is what re-enables them,
// but per-channel and per-user instead of blanket-open. Membership is enforced
// against the same tables the REST API uses, so the realtime layer can never
// leak a channel a user could not already read over HTTP.
//
// Channel scheme (all in Centrifugo's default namespace — no ":"):
//
//	channel_<channelUUID>  → chat channel / thread; requires channel membership
//	agents_<workspaceUUID> → agent activity;        requires workspace membership
//	workspace_<workspaceUUID> → tenant-wide events;  requires workspace membership
//	user_<userUUID>        → private per-user events; requires that exact user
//	ai_<randomStreamID>    → per-request AI token stream; the id is an
//	                         unguessable capability minted for and returned to
//	                         the requester, so any authenticated user may sub.
func CentrifugoSubscribe(c *fiber.Ctx) error {
	// Only Centrifugo may call this. It is configured to send the shared
	// internal token as a static header; fail closed when the token is absent.
	expected := os.Getenv("INTERNAL_API_TOKEN")
	if expected == "" {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "internal auth is not configured"})
	}
	provided := c.Get(middleware.InternalTokenName)
	if provided == "" || subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) != 1 {
		// A caller that is not Centrifugo has no business here at all.
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	var req centrifugoSubscribeRequest
	if err := c.BodyParser(&req); err != nil {
		return subscribeDeny(c)
	}

	userID, err := uuid.Parse(req.User)
	if err != nil || req.Channel == "" {
		return subscribeDeny(c)
	}

	switch {
	case strings.HasPrefix(req.Channel, "channel_"):
		channelID, err := uuid.Parse(strings.TrimPrefix(req.Channel, "channel_"))
		if err != nil {
			return subscribeDeny(c)
		}
		var member models.ChannelMember
		if err := database.GetDB(c).Where("channel_id = ? AND user_id = ?", channelID, userID).First(&member).Error; err != nil {
			return subscribeDeny(c)
		}
		return subscribeAllow(c)

	case strings.HasPrefix(req.Channel, "agents_"):
		workspaceID, err := uuid.Parse(strings.TrimPrefix(req.Channel, "agents_"))
		if err != nil {
			return subscribeDeny(c)
		}
		var user models.User
		if err := database.GetDB(c).Select("id", "workspace_id").Where("id = ?", userID).First(&user).Error; err != nil {
			return subscribeDeny(c)
		}
		if user.WorkspaceID != workspaceID {
			return subscribeDeny(c)
		}
		return subscribeAllow(c)

	case strings.HasPrefix(req.Channel, "workspace_"):
		workspaceID, err := uuid.Parse(strings.TrimPrefix(req.Channel, "workspace_"))
		if err != nil {
			return subscribeDeny(c)
		}
		var user models.User
		if err := database.GetDB(c).Select("id", "workspace_id").Where("id = ?", userID).First(&user).Error; err != nil || user.WorkspaceID != workspaceID {
			return subscribeDeny(c)
		}
		return subscribeAllow(c)

	case strings.HasPrefix(req.Channel, "user_"):
		targetUserID, err := uuid.Parse(strings.TrimPrefix(req.Channel, "user_"))
		if err != nil || targetUserID != userID {
			return subscribeDeny(c)
		}
		return subscribeAllow(c)

	case strings.HasPrefix(req.Channel, "ai_"):
		// Capability channel: the stream id is a random per-request token the
		// server handed back only to this user. Knowing it is the authorization.
		return subscribeAllow(c)

	default:
		return subscribeDeny(c)
	}
}
