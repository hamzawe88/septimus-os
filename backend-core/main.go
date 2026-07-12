package main

import (
	"encoding/json"
	"log"
	"os"

	"github.com/nats-io/nats.go"
	"github.com/google/uuid"
	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/joho/godotenv"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/events"
	"github.com/septimus-os/backend-core/handlers"
	"github.com/septimus-os/backend-core/middleware"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
	"github.com/septimus-os/backend-core/services/agents"
)

func main() {
	// Load .env file if it exists
	godotenv.Load()

	// A missing signing key must never silently fall back to a known value:
	// every JWT would be forgeable and the provider-key encryption derivable.
	if os.Getenv("JWT_SECRET") == "" {
		log.Fatal("JWT_SECRET is not set — refusing to start without a signing key")
	}

	// Connect to Database
	database.ConnectDB()
	database.SeedDatabase()

	// Connect to NATS
	events.ConnectNATS()

	// Initialize NATS Subscribers
	go initNatsSubscribers()

	// Initialize AI Agents Runtime
	agentRunners := agents.NewAgentRunners(database.DB, events.NatsConn)
	agentRunners.StartAll()

	// Start Workflow Cron Manager
	handlers.StartCronManager()

	// Start the proactive project auditor (stuck-task detection)
	handlers.StartProactiveAuditor()

	// Migrate observability tables (AI message feedback)
	database.DB.AutoMigrate(&handlers.MessageFeedback{})

	// Initialize Fiber app
	app := fiber.New()

	app.Use(logger.New())
	allowedOrigins := os.Getenv("CORS_ALLOW_ORIGINS")
	if allowedOrigins == "" {
		allowedOrigins = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8080"
	}
	app.Use(cors.New(cors.Config{
		AllowOrigins:     allowedOrigins,
		AllowHeaders:     "Origin, Content-Type, Accept, Authorization, X-Requested-With",
		AllowCredentials: true,
	}))

	// Serve static uploads
	app.Static("/uploads", "./uploads")

	// Health check route
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"status":  "success",
			"message": "Septimus OS Backend Core is running",
		})
	})

	// Public routes
	api := app.Group("/api/v1")
	api.Post("/auth/login", handlers.Login)
	api.Post("/auth/register", handlers.Register)

	// Protected routes
	protected := api.Group("/", middleware.JWTMiddleware())
	protected.Post("/upload", handlers.HandleUpload)
	protected.Get("/users/search", handlers.SearchUsers)
	protected.Put("/auth/profile", handlers.UpdateProfile)
	
	// Admin & Org
	adminGroup := protected.Group("/admin", middleware.CheckPermission("admin.manage"))
	adminGroup.Get("/users", handlers.GetUsersAdmin)
	adminGroup.Post("/users", handlers.CreateUserAdmin)
	adminGroup.Put("/users/:id", handlers.UpdateUserAdmin)
	adminGroup.Delete("/users/:id", handlers.DeleteUserAdmin)
	adminGroup.Get("/roles", handlers.GetRoles)
	adminGroup.Post("/roles", handlers.CreateRole)
	adminGroup.Put("/roles/:id", handlers.UpdateRole)
	adminGroup.Delete("/roles/:id", handlers.DeleteRole)
	adminGroup.Get("/departments", handlers.GetDepartments)
	adminGroup.Post("/departments", handlers.CreateDepartment)
	adminGroup.Put("/departments/:id", handlers.UpdateDepartment)
	adminGroup.Delete("/departments/:id", handlers.DeleteDepartment)
	adminGroup.Get("/org-chart", handlers.GetOrgChartGraph)
	adminGroup.Get("/audit-logs", handlers.GetAuditLogs)

	adminGroup.Get("/permissions", handlers.GetPermissions)
	adminGroup.Post("/permissions", handlers.CreatePermission)
	adminGroup.Delete("/permissions/:id", handlers.DeletePermission)
	adminGroup.Get("/role_permissions", handlers.GetRolePermissions)
	adminGroup.Post("/permissions/assign", handlers.AssignPermissionToRole)
	adminGroup.Delete("/roles/:roleId/permissions/:permId", handlers.RemovePermissionFromRole)

	// Automations (n8n Integration)
	protected.Get("/automations/templates", handlers.GetAutomationTemplates)
	protected.Post("/automations/:id/activate", handlers.ActivateAutomation)

	// Integrations
	protected.Get("/integrations", handlers.GetIntegrations)
	protected.Post("/integrations/:id/toggle", handlers.ToggleIntegration)
	protected.Put("/integrations/:id", handlers.ToggleIntegration)
	protected.Post("/integrations/:id/disconnect", handlers.DisconnectIntegration)
	protected.Get("/integrations/:id/config", handlers.GetIntegrationConfig)
	protected.Put("/integrations/:id/config", handlers.SaveIntegrationConfig)
	protected.Post("/integrations/:id/test", handlers.TestIntegrationConnection)
	protected.Post("/integrations/whatsapp/send", handlers.SendWhatsAppMessage)
	protected.Post("/integrations/zendesk/ticket", handlers.CreateZendeskTicket)
	protected.Post("/integrations/odoo/settlement", handlers.PushOdooSettlement)
	protected.Post("/integrations/google/export-tasks", handlers.ExportTasksToSheet)

	// Webhooks
	protected.Post("/workspaces/:workspace_id/webhooks", handlers.CreateWebhook)
	protected.Get("/workspaces/:workspace_id/webhooks", handlers.GetWebhooks)
	protected.Delete("/workspaces/:workspace_id/webhooks/:id", handlers.DeleteWebhook)

	// Auth / OAuth
	api.Get("/auth/google/login", handlers.GoogleLogin)
	api.Get("/auth/google/callback", handlers.GoogleCallback)
	
	// Attendance
	protected.Post("/attendance/check-in", handlers.CheckIn)
	protected.Post("/attendance/check-out", handlers.CheckOut)
	protected.Get("/attendance/offices", handlers.GetOffices)
	protected.Post("/attendance/offices", middleware.CheckPermission("attendance.manage"), handlers.CreateOffice)
	protected.Put("/attendance/offices/:id", middleware.CheckPermission("attendance.manage"), handlers.UpdateOffice)
	protected.Delete("/attendance/offices/:id", middleware.CheckPermission("attendance.manage"), handlers.DeleteOffice)
	protected.Get("/attendance/logs", handlers.GetAttendanceLogs)

	// Documents (RAG)
	protected.Post("/documents/upload", handlers.UploadDocument)
	protected.Get("/documents", handlers.GetDocuments)

	protected.Post("/entities", handlers.CreateEntity)
	protected.Get("/entities", handlers.GetEntities)
	protected.Put("/entities/:id", handlers.UpdateEntity)
	protected.Delete("/entities/:id", handlers.DeleteEntity)
	
	// API Keys — creating/revoking keys grants external data access, so gate on apikeys.manage
	protected.Post("/apikeys", middleware.CheckPermission("apikeys.manage"), handlers.CreateAPIKey)
	protected.Get("/apikeys", handlers.GetAPIKeys)
	protected.Delete("/apikeys/:id", middleware.CheckPermission("apikeys.manage"), handlers.RevokeAPIKey)

	// AI Agents & Config
	protected.Put("/agents/config", handlers.ConfigAI)
	protected.Get("/agents/status", handlers.GetAgentStatus)
	protected.Post("/agents/kill/:name", handlers.KillAgent)
	protected.Post("/agents/approve/:id", handlers.ApprovePendingAction)

	// AI Sidecar proxy — browsers never reach the sidecar directly. Every
	// /api/v1/ai/* call is JWT-authenticated here, then forwarded over the
	// internal network with the shared service token.
	protected.All("/ai/*", handlers.ProxyToAISidecar)

	protected.Post("/channels", handlers.CreateChannel)
	protected.Get("/channels", handlers.GetChannels)

	protected.Get("/channels/:id/messages", handlers.GetMessages)
	protected.Post("/channels/:id/messages", handlers.SendMessage)
	protected.Put("/channels/:id", handlers.UpdateChannel)
	protected.Delete("/channels/:id", handlers.DeleteChannel) // owner/DM-member check enforced inside the handler

	protected.Post("/channels/:id/members/mute", handlers.MuteMember)
	protected.Put("/channels/:id/members/role", handlers.UpdateMemberRole)

	// Messages & Search
	protected.Get("/search/messages", handlers.SearchMessages)
	protected.Get("/messages/:id/replies", handlers.GetMessageReplies)
	protected.Get("/channels/:id/threads", handlers.GetChannelThreads)
	protected.Post("/messages/convert-to-task", handlers.ConvertMessageToTask)
	protected.Put("/messages/:id", handlers.UpdateMessage)
	protected.Delete("/messages/:id", handlers.DeleteMessage)

	// Huddle (Voice AI)
	protected.Post("/huddle/speak", handlers.HandleHuddleSpeak)

	// Centrifugo Token & Typing
	protected.Get("/chat/token", handlers.HandleGetCentrifugoToken)
	protected.Post("/chat/typing", handlers.HandleTypingEvent)

	// Slack Features
	protected.Get("/chat/recap", handlers.RecapChannel)
	protected.Get("/catchup/feed", handlers.GetCatchUpFeed)

	// Reports
	protected.Get("/reports/communication", handlers.GetCommunicationReport)
	protected.Get("/reports/ai", handlers.GetAIReport)
	protected.Get("/reports/finance-forecast", handlers.GetFinanceForecast)

	// Project Management (Agile/Kanban)
	protected.Post("/projects", handlers.CreateProject)
	protected.Get("/projects", handlers.GetProjects)
	protected.Put("/projects/:id", handlers.UpdateProject)
	protected.Delete("/projects/:id", middleware.CheckPermission("projects.delete"), handlers.DeleteProject)
	
	protected.Post("/tasks", handlers.CreateTask)
	protected.Get("/tasks", handlers.GetTasks)
	protected.Get("/tasks/:id/tree", handlers.GetTaskTree)
	protected.Put("/tasks/:id", handlers.UpdateTask)
	protected.Post("/tasks/:id/transition", handlers.TransitionTask)

	// My Orbit (Context-Aware Gamified Productivity Engine)
	orbitGroup := protected.Group("/orbit")
	orbitGroup.Get("/tasks", handlers.GetOrbitTasks)
	orbitGroup.Post("/tasks", handlers.CreateOrbitTask)
	orbitGroup.Put("/tasks/:id", handlers.UpdateOrbitTask)
	orbitGroup.Delete("/tasks/:id", handlers.DeleteOrbitTask)
	orbitGroup.Get("/profile", handlers.GetOrbitProfile)
	orbitGroup.Put("/profile", handlers.UpdateOrbitProfile)
	orbitGroup.Post("/harvest", handlers.GenerateWeeklyHarvest)

	// Sprints
	protected.Post("/sprints", handlers.CreateSprint)
	protected.Get("/sprints", handlers.GetSprints)
	protected.Put("/sprints/:id/start", handlers.StartSprint)
	protected.Put("/sprints/:id/complete", handlers.CompleteSprint)

	// Workflows — mutations/execution gated on workflows.manage (Admin + Manager); reads open to all members
	protected.Post("/workflows", middleware.CheckPermission("workflows.manage"), handlers.SaveWorkflow)
	protected.Get("/workflows", handlers.GetWorkflows)
	protected.Post("/workflows/:id/execute", middleware.CheckPermission("workflows.manage"), handlers.TriggerWorkflowManually)
	protected.Patch("/workflows/:id", middleware.CheckPermission("workflows.manage"), handlers.PatchWorkflow)
	protected.Get("/workflows/:id/runs", handlers.GetWorkflowRuns)

	// Agents
	protected.Get("/agents", handlers.GetAgents)
	protected.Post("/agents", handlers.DeployAgent)
	protected.Post("/agents/dispatch", handlers.DispatchAgentTask)
	protected.Post("/agents/audit", handlers.TriggerProactiveAudit)
	protected.Post("/agents/morning-brief", handlers.TriggerMorningBrief)

	// AI message feedback (👍/👎) + MCP tool server
	protected.Post("/messages/:id/feedback", handlers.SubmitMessageFeedback)
	protected.Post("/mcp", handlers.HandleMCP)
	protected.Put("/agents/:id/status", handlers.UpdateAgentStatus)

	// Search & RAG
	protected.Get("/search/semantic", handlers.SearchSemantic)

	// WorkDocs
	protected.Post("/projects/:projectId/workdocs", handlers.CreateWorkDoc)
	protected.Get("/projects/:projectId/workdocs", handlers.GetWorkDocs)
	protected.Get("/workdocs/:docId", handlers.GetWorkDoc)
	protected.Put("/workdocs/:docId", handlers.UpdateWorkDoc)
	protected.Delete("/workdocs/:docId", handlers.DeleteWorkDoc)

	// Settings (Protected)
	protected.Post("/settings/:key", handlers.SaveSettings)
	protected.Get("/settings/:key", handlers.GetSettings)

	// Public External APIs (Protected by API Key)
	publicAPI := app.Group("/api/public/v1", middleware.RequireAPIKey)
	publicAPI.Post("/entities", handlers.CreateEntity)
	publicAPI.Get("/entities", handlers.GetEntities)

	// Inbound Webhooks (Zendesk & External)
	app.Post("/api/public/v1/webhooks/zendesk", handlers.HandleZendeskWebhook)
	app.Post("/api/v1/webhooks/zendesk", handlers.HandleZendeskWebhook)

	// Internal APIs (for sidecars, strictly within VPC/Docker network).
	// Gated by the shared INTERNAL_API_TOKEN so only trusted services can read
	// decrypted provider keys or mutate entities.
	internal := app.Group("/internal", middleware.RequireInternalToken)
	internal.Get("/settings/:key", handlers.GetSettingsInternal)
	internal.Get("/search/semantic", handlers.SearchSemantic)
	internal.Post("/embeddings", handlers.IngestEmbeddings)
	internal.Post("/pending-approvals", handlers.QueuePendingApproval)
	internal.Post("/entities", handlers.CreateEntity)
	internal.Get("/entities", handlers.GetEntities)
	internal.Put("/entities/:id", handlers.UpdateEntity)
	internal.Post("/system/messages", handlers.InjectSystemMessage)
	internal.Put("/system/tasks/:id", handlers.UpdateTask)

	// WebSockets
	go handlers.WSHub.Run()
	app.Use("/ws", handlers.WSAuthMiddleware)
	app.Get("/ws", websocket.New(handlers.WebsocketHandler))

	port := os.Getenv("PORT")
	if port == "" {
		port = "4000"
	}

	log.Printf("Starting server on port %s", port)
	log.Fatal(app.Listen(":" + port))
}

func initNatsSubscribers() {
	if events.NatsConn == nil {
		log.Println("NATS connection not initialized. Skipping subscribers.")
		return
	}

	// Entity Events for RAG and Orchestrator
	entityHandler := func(msg *nats.Msg) {
		var payload struct {
			Event    string `json:"event"`
			EntityID string `json:"entity_id"`
		}
		if err := json.Unmarshal(msg.Data, &payload); err == nil && payload.EntityID != "" {
			uid, err := uuid.Parse(payload.EntityID)
			if err == nil {
				go services.HandleEntityChange(uid)
			}
		}
	}
	events.NatsConn.Subscribe("events.entities.created", entityHandler)
	events.NatsConn.Subscribe("events.entities.updated", entityHandler)

	_, err := events.NatsConn.Subscribe("chat.message.ai_reply", func(msg *nats.Msg) {
		var payload struct {
			Content   string `json:"content"`
			ChannelID string `json:"channel_id"`
		}
		if err := json.Unmarshal(msg.Data, &payload); err != nil {
			log.Printf("Failed to unmarshal ai_reply: %v", err)
			return
		}

		if payload.ChannelID == "" {
			log.Println("Received AI reply without channel ID")
			return
		}

		// Find or Create an AI system user (sender)
		var aiUser models.User
		if err := database.DB.Where("email = ?", "ai@septimus.os").First(&aiUser).Error; err != nil {
			aiUser = models.User{
				Email:        "ai@septimus.os",
				PasswordHash: "none",
				Role:         "AI_AGENT",
			}
			database.DB.Create(&aiUser)
		}

		chanUUID := database.ParseUUID(payload.ChannelID)
		
		dbMsg := models.Message{
			ChannelID:     chanUUID,
			SenderID:      aiUser.ID,
			Content:       payload.Content,
			IsAIGenerated: true,
			AIAgentRole:   "AI Assistant",
		}

		if err := database.DB.Create(&dbMsg).Error; err != nil {
			log.Printf("Failed to save AI reply: %v", err)
			return
		}

		database.DB.Preload("User").First(&dbMsg, dbMsg.ID)

		wsPayload := map[string]interface{}{
			"type":    "chat_message",
			"message": dbMsg,
		}
		handlers.PublishToCentrifugo(payload.ChannelID, wsPayload)
	})

	if err != nil {
		log.Printf("Failed to subscribe to chat.message.ai_reply: %v", err)
	} else {
		log.Println("Subscribed to chat.message.ai_reply")
	}
}
