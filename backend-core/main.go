package main

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	fiberLimiter "github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/google/uuid"
	"github.com/joho/godotenv"
	"github.com/nats-io/nats.go"
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
	if err := services.EnsureAllWorkspaceCRMDefinitions(database.DB); err != nil {
		log.Fatalf("CRM system schema bootstrap failed: %v", err)
	}
	if report, err := services.MigrateAllLegacyCRM(database.DB); err != nil {
		log.Fatalf("legacy CRM migration failed: %v", err)
	} else if report.Sources > 0 {
		log.Printf("legacy CRM migration complete: sources=%d migrated=%d skipped=%d", report.Sources, report.Migrated, report.Skipped)
	}
	if report, err := services.MigrateAllLegacyPM(database.DB); err != nil {
		log.Fatalf("legacy PM migration failed: %v", err)
	} else if report.Sources > 0 {
		log.Printf("legacy PM migration complete: sources=%d migrated=%d skipped=%d", report.Sources, report.Migrated, report.Skipped)
	}
	if err := handlers.EnsureIntegrationCredentialsEncrypted(database.DB); err != nil {
		log.Fatalf("integration credential migration failed: %v", err)
	}
	if err := handlers.EnsurePaymentGatewayCredentialsEncrypted(database.DB); err != nil {
		log.Fatalf("payment credential migration failed: %v", err)
	}
	if err := services.EnsureWorkflowNodesEncrypted(database.DB); err != nil {
		log.Fatalf("workflow node encryption migration failed: %v", err)
	}
	database.SeedDatabase()
	services.SeedSaaSPlans(database.DB) // baseline plans + entitlements (idempotent)

	// Connect to NATS
	events.ConnectNATS()
	services.StartOutboxDispatcher(database.DB)
	services.StartSchemaMigrationWorker(database.DB)
	services.StartCRMSLAWorker(database.DB)

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

	// Initialize Fiber app with increased body limit for large images/payloads
	app := fiber.New(fiber.Config{
		BodyLimit: 50 * 1024 * 1024, // 50MB
	})

	app.Use(logger.New())

	// CORS: credentials are enabled, so the origin check must never be a
	// blanket "return true" — that lets ANY website fire authenticated
	// requests with the user's cookies/headers. Origins come from
	// CORS_ALLOW_ORIGINS (comma-separated). When unset (local dev), any
	// localhost / 127.0.0.1 origin is accepted on any port — something a
	// remote attacker's site can never claim as its origin.
	corsAllowlist := map[string]bool{}
	for _, o := range strings.Split(os.Getenv("CORS_ALLOW_ORIGINS"), ",") {
		if o = strings.TrimRight(strings.TrimSpace(o), "/"); o != "" {
			corsAllowlist[o] = true
		}
	}
	app.Use(cors.New(cors.Config{
		AllowOriginsFunc: func(origin string) bool {
			return corsOriginAllowed(corsAllowlist, origin)
		},
		AllowHeaders:     "Origin, Content-Type, Accept, Authorization, X-Requested-With, X-Workspace-ID",
		AllowCredentials: true,
	}))
	// SameSite=Strict is the primary CSRF boundary for browser sessions. This
	// Origin guard is an independent fail-closed check on state-changing
	// requests that carry the browser session cookie.
	app.Use(func(c *fiber.Ctx) error {
		if !csrfRequestAllowed(c.Method(), c.Cookies("septimus_session"), c.Get("Origin"), corsAllowlist) {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "request origin is not allowed"})
		}
		return c.Next()
	})

	// Health check route
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"status":  "success",
			"message": "Septimus OS Backend Core is running",
		})
	})

	// Public routes
	api := app.Group("/api/v1")
	authLimiter := fiberLimiter.New(fiberLimiter.Config{
		Max:        10,
		Expiration: 5 * time.Minute,
		KeyGenerator: func(c *fiber.Ctx) string {
			return authRateLimitKey(c.IP(), c.Body())
		},
		LimitReached: func(c *fiber.Ctx) error {
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{"error": "too many authentication attempts"})
		},
	})
	api.Post("/auth/login", authLimiter, handlers.Login)
	api.Post("/auth/register", authLimiter, handlers.Register)
	api.Post("/auth/signup-workspace", authLimiter, handlers.SignupWorkspace)
	api.Post("/auth/logout", middleware.JWTMiddleware(), handlers.Logout)
	api.Get("/auth/session", middleware.JWTMiddleware(), handlers.GetSession)
	api.Get("/auth/realtime-token", middleware.JWTMiddleware(), handlers.GetRealtimeToken)
	api.Post("/webhooks/stripe", handlers.StripeWebhook)
	// Google redirects the browser here with no Authorization header, so this
	// must sit above the protected group — registered after it, the JWT
	// middleware matched the /api/v1/ prefix and the callback could never
	// complete. It authenticates the signed OAuth state instead of a session.
	api.Get("/auth/google/callback", handlers.GoogleCallback)

	// Protected routes (Protected by JWT and Multi-Tenant RLS isolation enforcer)
	protected := api.Group("/", middleware.JWTMiddleware(), middleware.TenantEnforcerMiddleware())

	// Billing & Subscription Management
	billingGroup := protected.Group("/billing")
	billingGroup.Post("/checkout", handlers.CreateCheckoutSession)
	billingGroup.Post("/portal", handlers.CreatePortalSession)
	billingGroup.Get("/status", handlers.GetBillingStatus)
	billingGroup.Get("/entitlements", handlers.GetEntitlements)
	billingGroup.Get("/plans", handlers.GetSaaSPlans)
	billingGroup.Get("/gateways", handlers.GetActivePaymentGateways)

	protected.Post("/upload", handlers.HandleUpload)
	protected.Delete("/files/:id", handlers.DeleteFile)
	protected.Get("/files/:id/download", handlers.DownloadFile)
	protected.Get("/users/search", handlers.SearchUsers)
	protected.Put("/auth/profile", handlers.UpdateProfile)

	// Admin & Org
	adminGroup := protected.Group("/admin", middleware.CheckPermission("admin.manage"))
	adminGroup.Get("/users", handlers.GetUsersAdmin)
	adminGroup.Post("/users", middleware.QuotaEnforcerMiddleware("users"), handlers.CreateUserAdmin)
	adminGroup.Put("/users/:id", handlers.UpdateUserAdmin)
	adminGroup.Delete("/users/:id", handlers.DeleteUserAdmin)
	// Roles, permissions, plans, and payment gateways are global control-plane
	// resources. A tenant admin must not be able to rewrite authorization for
	// every workspace merely because the route was behind admin.manage.
	adminGroup.Get("/roles", middleware.RequireRole("super_admin"), handlers.GetRoles)
	adminGroup.Post("/roles", middleware.RequireRole("super_admin"), handlers.CreateRole)
	adminGroup.Put("/roles/:id", middleware.RequireRole("super_admin"), handlers.UpdateRole)
	adminGroup.Delete("/roles/:id", middleware.RequireRole("super_admin"), handlers.DeleteRole)

	// Super Admin Impersonation
	adminGroup.Post("/impersonate", handlers.ImpersonateUser)
	adminGroup.Get("/departments", handlers.GetDepartments)
	adminGroup.Post("/departments", handlers.CreateDepartment)
	adminGroup.Put("/departments/:id", handlers.UpdateDepartment)
	adminGroup.Delete("/departments/:id", handlers.DeleteDepartment)
	adminGroup.Get("/org-chart", handlers.GetOrgChartGraph)
	adminGroup.Get("/audit-logs", handlers.GetAuditLogs)

	// Admin: SaaS Plans Management
	adminGroup.Get("/entitlement-catalog", middleware.RequireRole("super_admin"), handlers.GetEntitlementCatalog)
	adminGroup.Get("/plans", middleware.RequireRole("super_admin"), handlers.GetAllSaaSPlans)
	adminGroup.Post("/plans", middleware.RequireRole("super_admin"), handlers.CreateSaaSPlan)
	adminGroup.Put("/plans/:id", middleware.RequireRole("super_admin"), handlers.UpdateSaaSPlan)
	adminGroup.Delete("/plans/:id", middleware.RequireRole("super_admin"), handlers.DeleteSaaSPlan)

	// Admin: Payment Gateways Management
	adminGroup.Get("/payment-gateways", middleware.RequireRole("super_admin"), handlers.GetPaymentGateways)
	adminGroup.Put("/payment-gateways/:id", middleware.RequireRole("super_admin"), handlers.UpdatePaymentGateway)

	adminGroup.Get("/permissions", middleware.RequireRole("super_admin"), handlers.GetPermissions)
	adminGroup.Post("/permissions", middleware.RequireRole("super_admin"), handlers.CreatePermission)
	adminGroup.Delete("/permissions/:id", middleware.RequireRole("super_admin"), handlers.DeletePermission)
	adminGroup.Get("/role_permissions", middleware.RequireRole("super_admin"), handlers.GetRolePermissions)
	adminGroup.Post("/permissions/assign", middleware.RequireRole("super_admin"), handlers.AssignPermissionToRole)
	adminGroup.Delete("/roles/:roleId/permissions/:permId", middleware.RequireRole("super_admin"), handlers.RemovePermissionFromRole)

	// Automations (n8n Integration)
	protected.Get("/automations/templates", handlers.GetAutomationTemplates)
	protected.Post("/automations/:id/activate", handlers.ActivateAutomation)

	// Integrations
	protected.Get("/integrations", handlers.GetIntegrations)
	protected.Post("/integrations/:id/toggle", middleware.RequireRole("admin", "owner"), handlers.ToggleIntegration)
	protected.Put("/integrations/:id", middleware.RequireRole("admin", "owner"), handlers.ToggleIntegration)
	protected.Post("/integrations/:id/disconnect", middleware.RequireRole("admin", "owner"), handlers.DisconnectIntegration)
	protected.Get("/integrations/:id/config", middleware.RequireRole("admin", "owner"), handlers.GetIntegrationConfig)
	protected.Put("/integrations/:id/config", middleware.RequireRole("admin", "owner"), handlers.SaveIntegrationConfig)
	protected.Post("/integrations/:id/test", middleware.RequireRole("admin", "owner"), handlers.TestIntegrationConnection)
	protected.Post("/integrations/whatsapp/send", middleware.RequireRole("admin", "owner"), handlers.SendWhatsAppMessage)
	protected.Post("/integrations/zendesk/ticket", middleware.RequireRole("admin", "owner"), handlers.CreateZendeskTicket)
	protected.Post("/integrations/odoo/settlement", middleware.RequireRole("admin", "owner"), handlers.PushOdooSettlement)
	protected.Post("/integrations/google/export-tasks", middleware.RequireRole("admin", "owner"), handlers.ExportTasksToSheet)
	// Starting a Google connect flow requires a session: the consent URL embeds a
	// signed state naming the caller's workspace. The old unauthenticated
	// GET /auth/google/login took the tenant from ?workspace_id= and is gone.
	protected.Get("/integrations/google/auth-url", middleware.RequireRole("admin", "owner"), handlers.GoogleAuthURL)

	// Webhooks
	protected.Post("/workspaces/:workspace_id/webhooks", middleware.RequireRole("admin", "owner"), handlers.CreateWebhook)
	protected.Get("/workspaces/:workspace_id/webhooks", handlers.GetWebhooks)
	protected.Delete("/workspaces/:workspace_id/webhooks/:id", middleware.RequireRole("admin", "owner"), handlers.DeleteWebhook)

	// Attendance
	protected.Post("/attendance/check-in", handlers.CheckIn)
	protected.Post("/attendance/check-out", handlers.CheckOut)
	protected.Get("/attendance/offices", handlers.GetOffices)
	protected.Post("/attendance/offices", middleware.CheckPermission("attendance.manage"), handlers.CreateOffice)
	protected.Put("/attendance/offices/:id", middleware.CheckPermission("attendance.manage"), handlers.UpdateOffice)
	protected.Delete("/attendance/offices/:id", middleware.CheckPermission("attendance.manage"), handlers.DeleteOffice)
	protected.Get("/attendance/logs", handlers.GetAttendanceLogs)
	protected.Get("/attendance/summary", handlers.GetAttendanceSummary)

	// Employees — relational HR directory (replaces hr_employee JSONB entities).
	// Gated by the same records.* permissions the entity routes used, so the
	// existing HR roles keep their access with no new seeding.
	protected.Get("/employees", middleware.CheckPermission("records.read"), handlers.GetEmployees)
	// Static path must precede /employees/:id so it isn't captured as an id.
	protected.Get("/employees/expiring-documents", middleware.CheckPermission("records.read"), handlers.GetExpiringDocuments)
	protected.Get("/employees/:id", middleware.CheckPermission("records.read"), handlers.GetEmployee)
	protected.Post("/employees", middleware.CheckPermission("records.create"), handlers.CreateEmployee)
	protected.Put("/employees/:id", middleware.CheckPermission("records.update"), handlers.UpdateEmployee)
	protected.Delete("/employees/:id", middleware.CheckPermission("records.delete"), handlers.DeleteEmployee)
	protected.Get("/employees/:id/eosb", middleware.CheckPermission("records.read"), handlers.GetEmployeeEOSB)

	// Leave balances — statutory accrual engine (Saudi labour law).
	protected.Get("/leave-balances", middleware.CheckPermission("records.read"), handlers.GetLeaveBalances)
	protected.Post("/leave-balances/accrue", middleware.CheckPermission("records.create"), handlers.AccrueLeaveBalances)
	protected.Put("/leave-balances/:id", middleware.CheckPermission("records.update"), handlers.UpdateLeaveBalance)

	// Leave requests — relational; approval deducts from the balance atomically.
	protected.Get("/leave-requests", middleware.CheckPermission("records.read"), handlers.GetLeaveRequests)
	protected.Post("/leave-requests", middleware.CheckPermission("records.create"), handlers.CreateLeaveRequest)
	protected.Post("/leave-requests/:id/decision", middleware.CheckPermission("records.update"), handlers.DecideLeaveRequest)

	// Employee self-service (ESS) — scoped to the caller from their JWT, so no
	// records.* permission is required to read/act on one's own HR data.
	protected.Get("/me/employee", handlers.GetMyEmployee)
	protected.Put("/me/employee", handlers.UpdateMyEmployee)
	protected.Get("/me/leave-balances", handlers.GetMyLeaveBalances)
	protected.Get("/me/leave-requests", handlers.GetMyLeaveRequests)
	protected.Post("/me/leave-requests", handlers.CreateMyLeaveRequest)
	protected.Get("/me/payslips", handlers.GetMyPayslips)
	protected.Get("/me/goals", handlers.GetMyGoals)
	protected.Get("/me/reviews", handlers.GetMyReviews)
	protected.Post("/me/reviews/:id/acknowledge", handlers.AcknowledgeMyReview)

	// Performance goals / OKRs (M3) — HR/manager managed.
	protected.Get("/goals", middleware.CheckPermission("records.read"), handlers.GetGoals)
	protected.Post("/goals", middleware.CheckPermission("records.create"), handlers.CreateGoal)
	protected.Put("/goals/:id", middleware.CheckPermission("records.update"), handlers.UpdateGoal)
	protected.Delete("/goals/:id", middleware.CheckPermission("records.delete"), handlers.DeleteGoal)

	// Performance reviews (M3) — HR/manager managed.
	protected.Get("/hr/analytics", middleware.CheckPermission("records.read"), handlers.GetHRAnalytics)
	protected.Get("/hr/attrition-risk", middleware.CheckPermission("records.read"), handlers.GetAttritionRisk)

	// Recruitment / ATS (M3).
	protected.Get("/candidates", middleware.CheckPermission("records.read"), handlers.GetCandidates)
	protected.Post("/candidates", middleware.CheckPermission("records.create"), handlers.CreateCandidate)
	protected.Put("/candidates/:id", middleware.CheckPermission("records.update"), handlers.UpdateCandidate)
	protected.Delete("/candidates/:id", middleware.CheckPermission("records.delete"), handlers.DeleteCandidate)
	protected.Post("/candidates/:id/hire", middleware.CheckPermission("records.create"), handlers.HireCandidate)
	protected.Get("/reviews", middleware.CheckPermission("records.read"), handlers.GetReviews)
	protected.Post("/reviews", middleware.CheckPermission("records.create"), handlers.CreateReview)
	protected.Put("/reviews/:id", middleware.CheckPermission("records.update"), handlers.UpdateReview)
	protected.Delete("/reviews/:id", middleware.CheckPermission("records.delete"), handlers.DeleteReview)

	// Payroll — server-side engine with statutory GOSI (M1).
	protected.Get("/payroll/runs", middleware.CheckPermission("records.read"), handlers.GetPayrollRuns)
	protected.Get("/payroll/runs/:id", middleware.CheckPermission("records.read"), handlers.GetPayrollRun)
	protected.Get("/payroll/runs/:id/wps", middleware.CheckPermission("records.read"), handlers.ExportPayrollWPS)
	protected.Post("/payroll/runs", middleware.CheckPermission("records.create"), handlers.CreatePayrollRun)
	protected.Post("/payroll/runs/:id/post", middleware.CheckPermission("records.update"), handlers.PostPayrollRun)

	// Documents (RAG & Drive)
	protected.Get("/documents/folders", handlers.GetFolders)
	protected.Put("/documents/folders/:id", middleware.RequireRole("admin", "owner"), handlers.UpdateFolder)
	protected.Post("/documents/upload", handlers.UploadDocument)
	protected.Post("/documents/import-drive", middleware.CheckPermission("records.create"), handlers.ImportDocumentFromDrive)
	protected.Get("/documents/:id/download", handlers.DownloadDocument)
	protected.Get("/documents", handlers.GetDocuments)
	protected.Get("/drive/files", handlers.ListDriveFiles)

	protected.Post("/entities", middleware.CheckPermission("records.create"), handlers.CreateEntity)
	protected.Get("/entities", middleware.CheckPermission("records.read"), handlers.GetEntities)
	protected.Put("/entities/:id", middleware.CheckPermission("records.update"), handlers.UpdateEntity)
	protected.Delete("/entities/:id", middleware.CheckPermission("records.delete"), handlers.DeleteEntity)
	protected.Post(
		"/crm/quotes/convert-to-invoice",
		middleware.CheckPermission(string(models.PermCRMConvertInvoice)),
		handlers.ConvertCRMQuoteToInvoice,
	)
	protected.Patch(
		"/crm/opportunities/:id/stage",
		middleware.CheckPermission(string(models.PermCRMManagePipeline)),
		handlers.MoveCRMOpportunityStage,
	)
	protected.Get("/crm/opportunities", middleware.CheckPermission("records.read"), handlers.ListCRMOpportunities)
	protected.Get("/crm/dashboard", middleware.CheckPermission("records.read"), handlers.GetCRMDashboard)
	protected.Get("/crm/forecast", middleware.CheckPermission("records.read"), handlers.GetCRMForecast)
	protected.Get("/crm/velocity", middleware.CheckPermission("records.read"), handlers.GetCRMVelocity)
	protected.Post("/crm/accounts", middleware.CheckPermission("records.create"), handlers.CreateCRMAccount)
	protected.Post("/crm/opportunities", middleware.CheckPermission("records.create"), handlers.CreateCRMOpportunity)
	protected.Post("/crm/quotes", middleware.CheckPermission("records.create"), handlers.CreateCRMQuote)
	protected.Get("/crm/opportunities/:id/customer-360", middleware.CheckPermission("records.read"), handlers.GetCRMCustomer360)
	protected.Post("/crm/opportunities/:id/activities", middleware.CheckPermission("records.create"), handlers.CreateCRMActivity)
	protected.Get("/crm/tickets", middleware.CheckPermission("records.read"), handlers.ListCRMTickets)
	protected.Post("/crm/tickets", middleware.CheckPermission("records.create"), handlers.CreateCRMTicket)
	protected.Patch("/crm/tickets/:id", middleware.CheckPermission("records.update"), handlers.UpdateCRMTicket)
	protected.Get("/crm/tickets/:id/messages", middleware.CheckPermission("records.read"), handlers.ListCRMTicketMessages)
	protected.Post("/crm/tickets/:id/messages", middleware.CheckPermission("records.create"), handlers.CreateCRMTicketMessage)

	// No-code data model registry. Definitions are deliberately isolated from
	// generic entity CRUD so API keys, webhooks, and agents cannot publish
	// executable schemas by pretending they are ordinary records.
	schemaDefinitions := protected.Group("/schema-definitions", middleware.RequireFeature(services.FeatDataBuilder))
	schemaDefinitions.Get("/", middleware.CheckPermission("schemas.view"), handlers.ListSchemaDefinitions)
	schemaDefinitions.Post("/", middleware.CheckPermission("schemas.manage"), handlers.CreateSchemaDefinition)
	schemaDefinitions.Get("/:id", middleware.CheckPermission("schemas.view"), handlers.GetSchemaDefinition)
	schemaDefinitions.Patch("/:id/draft", middleware.CheckPermission("schemas.manage"), handlers.UpdateSchemaDefinitionDraft)
	schemaDefinitions.Post("/:id/validate", middleware.CheckPermission("schemas.manage"), handlers.ValidateSchemaDefinition)
	schemaDefinitions.Post("/:id/formula-preview", middleware.CheckPermission("schemas.manage"), handlers.PreviewSchemaFormula)
	schemaDefinitions.Post("/:id/impact", middleware.CheckPermission("schemas.manage"), handlers.AnalyzeSchemaDefinitionImpact)
	schemaDefinitions.Post("/:id/publish", middleware.CheckPermission("schemas.publish"), handlers.PublishSchemaDefinition)
	schemaDefinitions.Get("/:id/versions", middleware.CheckPermission("schemas.view"), handlers.ListSchemaVersions)
	schemaDefinitions.Get("/:id/activity", middleware.CheckPermission("schemas.view"), handlers.ListSchemaActivity)
	schemaDefinitions.Get("/:id/forms", middleware.CheckPermission("schemas.view"), handlers.ListSchemaForms)
	schemaDefinitions.Post("/:id/forms", middleware.CheckPermission("schemas.manage"), handlers.CreateSchemaForm)
	schemaDefinitions.Patch("/:id/forms/:formId", middleware.CheckPermission("schemas.manage"), handlers.UpdateSchemaForm)
	schemaDefinitions.Delete("/:id/forms/:formId", middleware.CheckPermission("schemas.manage"), handlers.DeleteSchemaForm)
	schemaDefinitions.Get("/:id/views", middleware.CheckPermission("schemas.view"), handlers.ListSchemaViews)
	schemaDefinitions.Post("/:id/views", middleware.CheckPermission("schemas.manage"), handlers.CreateSchemaView)
	schemaDefinitions.Patch("/:id/views/:viewId", middleware.CheckPermission("schemas.manage"), handlers.UpdateSchemaView)
	schemaDefinitions.Delete("/:id/views/:viewId", middleware.CheckPermission("schemas.manage"), handlers.DeleteSchemaView)
	schemaDefinitions.Post("/:id/versions/:version/restore", middleware.CheckPermission("schemas.publish"), handlers.RestoreSchemaVersionToDraft)
	schemaDefinitions.Post("/:id/archive", middleware.CheckPermission("schemas.publish"), handlers.ArchiveSchemaDefinition)
	schemaDefinitions.Post("/:id/restore", middleware.CheckPermission("schemas.publish"), handlers.RestoreSchemaDefinition)
	schemaDefinitions.Get("/:id/change-jobs", middleware.CheckPermission("schemas.view"), handlers.ListSchemaChangeJobs)
	schemaDefinitions.Post("/:id/change-jobs/:jobId/approve", middleware.CheckPermission("schemas.publish"), handlers.ApproveSchemaChangeJob)
	schemaDefinitions.Post("/:id/change-jobs/:jobId/pause", middleware.CheckPermission("schemas.publish"), handlers.PauseSchemaChangeJob)
	schemaDefinitions.Post("/:id/change-jobs/:jobId/resume", middleware.CheckPermission("schemas.publish"), handlers.ResumeSchemaChangeJob)

	// Versioned, schema-aware record API. Complex filters are accepted only as
	// the allowlisted Query AST handled by RecordService.
	dynamicData := protected.Group("/data", middleware.RequireFeature(services.FeatDataBuilder))
	dynamicData.Post("/:definitionKey/records", middleware.CheckPermission("records.create"), handlers.CreateDynamicRecord)
	dynamicData.Post("/:definitionKey/records/query", middleware.CheckPermission("records.read"), handlers.QueryDynamicRecords)
	dynamicData.Get("/:definitionKey/records/:id", middleware.CheckPermission("records.read"), handlers.GetDynamicRecord)
	dynamicData.Patch("/:definitionKey/records/:id", middleware.CheckPermission("records.update"), handlers.UpdateDynamicRecord)
	dynamicData.Delete("/:definitionKey/records/:id", middleware.CheckPermission("records.delete"), handlers.DeleteDynamicRecord)

	// API Keys — creating/revoking keys grants external data access, so gate on apikeys.manage
	protected.Post("/apikeys", middleware.CheckPermission("apikeys.manage"), handlers.CreateAPIKey)
	protected.Get("/apikeys", handlers.GetAPIKeys)
	protected.Delete("/apikeys/:id", middleware.CheckPermission("apikeys.manage"), handlers.RevokeAPIKey)

	// AI Agents & Config
	protected.Put("/agents/config", middleware.CheckPermission("ai.configure"), handlers.ConfigAI)
	protected.Get("/agents/status", middleware.CheckPermission("agents.view"), handlers.GetAgentStatus)
	protected.Post("/agents/kill/:name", middleware.CheckPermission("agents.manage"), handlers.KillAgent)
	protected.Get("/agents/pending-approvals", middleware.CheckPermission("agents.approve"), handlers.GetPendingApprovals)
	// Approving a HITL action executes it, so the approver must outrank the
	// member the agent deferred to — otherwise a plain member rubber-stamps the
	// very action the human-in-the-loop queue exists to hold back.
	protected.Post("/agents/approve/:id", middleware.CheckPermission("agents.approve"), handlers.ApprovePendingAction)

	// AI Orchestrator Core Brain
	aiLimiter := fiberLimiter.New(fiberLimiter.Config{
		Max:        60,
		Expiration: time.Minute,
		KeyGenerator: func(c *fiber.Ctx) string {
			if userID, ok := c.Locals("user_id").(string); ok && userID != "" {
				return userID
			}
			return c.IP()
		},
		LimitReached: func(c *fiber.Ctx) error {
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{"error": "AI request rate limit exceeded"})
		},
	})
	protected.Post("/ai/orchestrator/query", middleware.CheckPermission("ai.orchestrate"), aiLimiter, handlers.HandleOrchestratorQuery)

	// AI Sidecar proxy — browsers never reach the sidecar directly. Every
	// /api/v1/ai/* call is JWT-authenticated here, then forwarded over the
	// internal network with the shared service token. Gated to business tier & above.
	protected.All("/ai/*", middleware.RequireFeature("ai.chat"), aiLimiter, handlers.ProxyToAISidecar)

	protected.Post("/channels", handlers.CreateChannel)
	protected.Get("/channels", handlers.GetChannels)

	protected.Get("/channels/:id/messages", handlers.GetMessages)
	protected.Post("/channels/:id/messages", handlers.SendMessage)
	protected.Put("/channels/:id", handlers.UpdateChannel)
	protected.Delete("/channels/:id", handlers.DeleteChannel) // owner/DM-member check enforced inside the handler

	protected.Get("/channels/:id/members", handlers.GetChannelMembers)
	protected.Post("/channels/:id/members", handlers.AddChannelMember)
	protected.Post("/channels/:id/members/mute", handlers.MuteMember)
	protected.Put("/channels/:id/members/role", handlers.UpdateMemberRole)

	// Messages & Search
	protected.Get("/search/messages", handlers.SearchMessages)
	protected.Get("/search/omni", handlers.SearchOmni)
	protected.Get("/messages/:id/replies", handlers.GetMessageReplies)
	protected.Get("/channels/:id/threads", handlers.GetChannelThreads)

	// Pinned Tasks
	protected.Post("/channels/:channelId/pinned_tasks", handlers.CreatePinnedTask)
	protected.Get("/channels/:channelId/pinned_tasks", handlers.GetPinnedTasks)
	protected.Put("/channels/:channelId/pinned_tasks/:taskId", handlers.UpdatePinnedTask)
	protected.Delete("/channels/:channelId/pinned_tasks/:taskId", handlers.DeletePinnedTask)
	protected.Get("/my_pinned_tasks", handlers.GetMyPinnedTasks)
	protected.Post("/messages/convert-to-task", handlers.ConvertMessageToTask)
	protected.Put("/messages/:id", handlers.UpdateMessage)
	protected.Delete("/messages/:id", handlers.DeleteMessage)

	// Huddle (Voice AI)
	protected.Post("/huddle/speak", handlers.HandleHuddleSpeak)
	protected.Post("/huddle/summarize", handlers.HandleHuddleSummarize)

	// Meetings (real sessions, Centrifugo-synced, AI summary over real transcript)
	protected.Post("/meetings/start", handlers.StartMeeting)
	protected.Get("/meetings/active", handlers.GetActiveMeeting)
	protected.Get("/meetings/users", handlers.ListMeetingUsers)
	protected.Post("/meetings/:id/join", handlers.JoinMeeting)
	protected.Post("/meetings/:id/leave", handlers.LeaveMeeting)
	protected.Post("/meetings/:id/end", handlers.EndMeeting)
	protected.Post("/meetings/:id/state", handlers.UpdateMeetingState)
	protected.Post("/meetings/:id/transcript", handlers.AppendMeetingTranscript)
	protected.Post("/meetings/:id/invite", handlers.InviteToMeeting)
	protected.Post("/meetings/:id/summarize", handlers.RequestMeetingSummary)
	protected.Post("/meetings/:id/signal", handlers.SignalMeeting)
	protected.Post("/meetings/:id/stt", handlers.MeetingSTT)
	protected.Post("/meetings/:id/extract-tasks", handlers.ExtractMeetingTasks)

	// Centrifugo Token & Typing
	protected.Get("/chat/token", handlers.HandleGetCentrifugoToken)
	protected.Post("/chat/typing", handlers.HandleTypingEvent)

	// Slack Features
	protected.Get("/chat/recap", handlers.RecapChannel)
	protected.Get("/catchup/feed", handlers.GetCatchUpFeed)

	// Reports (AI & Finance forecasts require Enterprise plan)
	protected.Get("/reports/communication", handlers.GetCommunicationReport)
	protected.Get("/reports/ai", middleware.RequireFeature("reports.ai"), handlers.GetAIReport)
	protected.Get("/reports/ai/cost", handlers.GetAICostReport)
	protected.Get("/reports/finance-forecast", middleware.RequireFeature("reports.finance_forecast"), handlers.GetFinanceForecast)

	// Project Management (Agile/Kanban)
	protected.Get("/pm/dashboard", handlers.GetPMDashboard)
	// Delivery analytics — velocity, burndown, cycle time.
	protected.Get("/pm/velocity", handlers.GetPMVelocity)
	protected.Get("/pm/cycle-time", handlers.GetPMCycleTime)
	protected.Get("/pm/sprints/:id/burndown", handlers.GetPMBurndown)
	protected.Get("/pm/planning", handlers.GetPMPlanning)
	protected.Get("/pm/portfolio", handlers.GetPMPortfolio)
	protected.Post("/pm/plan-sprint", middleware.CheckPermission("sprints.manage"), handlers.PlanPMSprint)
	protected.Post("/pm/dependencies", middleware.CheckPermission("tasks.update"), handlers.CreateTaskDependency)
	protected.Delete("/pm/dependencies/:id", middleware.CheckPermission("tasks.update"), handlers.DeleteTaskDependency)
	protected.Post("/projects", middleware.CheckPermission("projects.create"), handlers.CreateProject)
	protected.Get("/projects", handlers.GetProjects)
	protected.Put("/projects/:id", middleware.CheckPermission("projects.update"), handlers.UpdateProject)
	protected.Delete("/projects/:id", middleware.CheckPermission("projects.delete"), handlers.DeleteProject)

	protected.Post("/tasks", middleware.CheckPermission("tasks.create"), handlers.CreateTask)
	protected.Get("/tasks", handlers.GetTasks)
	protected.Get("/tasks/:id/tree", handlers.GetTaskTree)
	protected.Put("/tasks/:id", middleware.CheckPermission("tasks.update"), handlers.UpdateTask)
	protected.Post("/tasks/:id/transition", middleware.CheckPermission("tasks.update"), handlers.TransitionTask)

	// Subtasks (Relational JSONB Entity)
	protected.Post("/tasks/:parent_task_id/subtasks", middleware.CheckPermission("tasks.create"), handlers.CreateSubtask)
	protected.Get("/tasks/:parent_task_id/subtasks", handlers.GetSubtasks)
	protected.Put("/subtasks/:id/status", middleware.CheckPermission("tasks.update"), handlers.UpdateSubtaskStatus)

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
	protected.Post("/sprints", middleware.CheckPermission("sprints.manage"), handlers.CreateSprint)
	protected.Get("/sprints", handlers.GetSprints)
	protected.Put("/sprints/:id", middleware.CheckPermission("sprints.manage"), handlers.UpdateSprint)
	protected.Delete("/sprints/:id", middleware.CheckPermission("sprints.manage"), handlers.DeleteSprint)
	protected.Put("/sprints/:id/start", middleware.CheckPermission("sprints.manage"), handlers.StartSprint)
	protected.Put("/sprints/:id/complete", middleware.CheckPermission("sprints.manage"), handlers.CompleteSprint)

	// Workflows — mutations/execution gated on workflows.manage (Admin + Manager); reads open to all members
	protected.Post("/workflows", middleware.CheckPermission("workflows.manage"), handlers.SaveWorkflow)
	protected.Post("/workflows/generate", middleware.CheckPermission("workflows.manage"), handlers.GenerateWorkflow)
	protected.Get("/workflows", middleware.CheckPermission("workflows.manage"), handlers.GetWorkflows)
	protected.Post("/workflows/:id/execute", middleware.CheckPermission("workflows.manage"), handlers.TriggerWorkflowManually)
	protected.Patch("/workflows/:id", middleware.CheckPermission("workflows.manage"), handlers.PatchWorkflow)
	protected.Get("/workflows/:id/runs", middleware.CheckPermission("workflows.manage"), handlers.GetWorkflowRuns)

	// Agents
	protected.Get("/agents", middleware.CheckPermission("agents.view"), handlers.GetAgents)
	protected.Post("/agents", middleware.CheckPermission("agents.manage"), handlers.DeployAgent)
	protected.Post("/agents/dispatch", middleware.CheckPermission("agents.execute"), handlers.DispatchAgentTask)
	protected.Post("/agents/audit", middleware.CheckPermission("agents.execute"), handlers.TriggerProactiveAudit)
	protected.Post("/agents/morning-brief", middleware.CheckPermission("agents.execute"), handlers.TriggerMorningBrief)

	// AI message feedback (👍/👎) + MCP tool server
	protected.Post("/messages/:id/feedback", handlers.SubmitMessageFeedback)
	protected.Post("/mcp", handlers.HandleMCP)
	protected.Put("/agents/:id/status", middleware.CheckPermission("agents.manage"), handlers.UpdateAgentStatus)

	// Search & RAG & Analytics
	protected.Get("/search/semantic", handlers.SearchSemantic)
	protected.Get("/facts", handlers.GetInstitutionalFacts)
	protected.Post("/facts", middleware.CheckPermission("facts.manage"), handlers.SaveInstitutionalFact)
	protected.Delete("/facts/:id", middleware.CheckPermission("facts.manage"), handlers.DeleteInstitutionalFact)
	protected.Post("/analytics/mine_patterns", middleware.CheckPermission("analytics.mine"), handlers.MineOrganizationalPatterns)

	// WorkDocs
	protected.Post("/projects/:projectId/workdocs", handlers.CreateWorkDoc)
	protected.Get("/projects/:projectId/workdocs", handlers.GetWorkDocs)
	protected.Get("/workdocs", handlers.GetAllWorkDocs)
	protected.Get("/workdocs/:docId", handlers.GetWorkDoc)
	protected.Put("/workdocs/:docId", handlers.UpdateWorkDoc)
	protected.Delete("/workdocs/:docId", handlers.DeleteWorkDoc)

	// Correspondence Templates & Institutional Registry
	protected.Post("/correspondence-templates", middleware.CheckPermission("correspondence.create"), handlers.CreateTemplate)
	protected.Get("/correspondence-templates", handlers.GetTemplates)
	protected.Put("/correspondence-templates/:id", middleware.CheckPermission("correspondence.create"), handlers.UpdateTemplate)
	protected.Delete("/correspondence-templates/:id", middleware.CheckPermission("correspondence.create"), handlers.DeleteTemplate)

	// Official Correspondence
	protected.Post("/correspondences", middleware.CheckPermission("correspondence.create"), handlers.CreateCorrespondence)
	protected.Get("/correspondences", handlers.GetCorrespondences)
	protected.Get("/correspondences/:id", handlers.GetCorrespondenceByID)
	protected.Put("/correspondences/:id", middleware.CheckPermission("correspondence.create"), handlers.UpdateCorrespondence)
	protected.Post("/correspondences/:id/forward", middleware.CheckPermission("correspondence.forward"), handlers.ForwardCorrespondence)
	protected.Post("/correspondences/:id/sign", middleware.CheckPermission("correspondence.sign"), handlers.SignCorrespondence)
	protected.Post("/correspondences/:id/archive", middleware.CheckPermission("correspondence.archive"), handlers.ArchiveCorrespondence)

	// Settings (Protected)
	// Workspace branding (logo + legal identity) — the server-side source every
	// document renderer stamps onto letterheads, invoices and payslips.
	// Read is open to members; writes are admin/owner only.
	protected.Get("/workspace/branding", handlers.GetWorkspaceBranding)
	protected.Put("/workspace/branding", middleware.RequireRole("admin", "owner"), handlers.SaveWorkspaceBranding)

	protected.Post("/settings/:key", middleware.RequireRole("admin", "owner"), handlers.SaveSettings)
	protected.Get("/settings/:key", middleware.RequireRole("admin", "owner"), handlers.GetSettings)

	// Public External APIs (Protected by API Key)
	publicAPI := app.Group("/api/public/v1", middleware.RequireAPIKey)
	publicAPI.Post("/entities", middleware.RequireAPIKeyScope("write:entities"), handlers.CreateEntity)
	publicAPI.Get("/entities", middleware.RequireAPIKeyScope("read:entities"), handlers.GetEntities)
	publicAPI.Post("/data/:definitionKey/records", middleware.RequireAPIKeyScope("write:entities"), handlers.CreateDynamicRecord)
	publicAPI.Post("/data/:definitionKey/records/query", middleware.RequireAPIKeyScope("read:entities"), handlers.QueryDynamicRecords)
	publicAPI.Patch("/data/:definitionKey/records/:id", middleware.RequireAPIKeyScope("write:entities"), handlers.UpdateDynamicRecord)
	// Lets an automation (n8n) run an agent. RequireAPIKey stamps the key's
	// workspace onto Locals, which is exactly what the handler scopes to — so a
	// workflow can never dispatch outside the workspace its key belongs to.
	publicAPI.Post("/agents/dispatch", middleware.RequireAPIKeyScope("agents:dispatch"), handlers.DispatchAgentTask)

	// Inbound Webhooks (Zendesk & External)
	// Public ingress requires both a workspace API key and the HMAC secret of
	// that workspace's webhook subscription. The body can no longer select an
	// arbitrary tenant by itself.
	app.Post("/api/public/v1/webhooks/zendesk", middleware.RequireAPIKey, middleware.RequireAPIKeyScope("webhooks:zendesk"), handlers.HandleZendeskWebhook)
	app.Post("/api/v1/webhooks/zendesk", middleware.RequireAPIKey, middleware.RequireAPIKeyScope("webhooks:zendesk"), handlers.HandleZendeskWebhook)
	app.Post("/api/public/v1/webhooks/external", middleware.RequireAPIKey, handlers.HandleExternalWebhook)
	app.Post("/api/v1/webhooks/external", middleware.RequireAPIKey, handlers.HandleExternalWebhook)

	// Centrifugo subscribe proxy: Centrifugo calls this to authorize every
	// client subscription against real channel/workspace membership. It carries
	// its own auth (the static INTERNAL_API_TOKEN header Centrifugo is
	// configured to send), so it sits outside the JWT-gated groups.
	app.Post("/centrifugo/subscribe", handlers.CentrifugoSubscribe)

	// Internal APIs (for sidecars, strictly within VPC/Docker network).
	// Gated by the shared INTERNAL_API_TOKEN so only trusted services can read
	// decrypted provider keys or mutate entities.
	internal := app.Group("/internal", middleware.RequireInternalToken)
	internal.Get("/auth/session", middleware.JWTMiddleware(), handlers.GetInternalSession)
	internal.Get("/workspaces/default", handlers.GetDefaultWorkspaceInternal)
	internal.Post("/webhooks/external", handlers.HandleExternalWebhook)
	internal.Get("/workdocs/:id/access", handlers.CheckWorkDocAccess)
	internalWorkspace := internal.Group("/", middleware.RequireInternalWorkspace())
	internalWorkspace.Get("/settings/:key", handlers.GetSettingsInternal)
	internalWorkspace.Get("/search/semantic", handlers.SearchSemantic)
	internalWorkspace.Post("/embeddings", handlers.IngestEmbeddings)
	internalWorkspace.Get("/pending-approvals", handlers.GetPendingApprovals)
	internalWorkspace.Get("/hr/leave-balance", handlers.GetLeaveBalanceInternal)
	internalWorkspace.Post("/hr/leave-decision", handlers.DecideLeaveRequestInternal)
	internalWorkspace.Get("/crm/pipeline", handlers.GetCRMPipelineInternal)
	internalWorkspace.Post("/crm/advance-opportunity", handlers.AdvanceCRMOpportunityInternal)
	internalWorkspace.Get("/workdocs/:id/state", handlers.GetWorkDocStateInternal)
	internalWorkspace.Put("/workdocs/:id/state", handlers.SaveWorkDocStateInternal)
	internalWorkspace.Get("/channels/:id/access", handlers.CheckChannelAccess)
	internalWorkspace.Post("/pending-approvals", handlers.QueuePendingApproval)
	internalWorkspace.Post("/drive/files", handlers.CreateDriveFileInternal)
	internalWorkspace.Get("/drive/files/:id", handlers.GetDriveFileInternal)
	internalWorkspace.Patch("/drive/files/:id", handlers.UpdateDriveFileInternal)
	internalWorkspace.Put("/documents/:id/index-status", handlers.UpdateDocumentIndexStatusInternal)
	internalWorkspace.Get("/meetings/:id/transcript", handlers.GetMeetingTranscriptInternal)
	internalWorkspace.Post("/meetings/:id/summary", handlers.SaveMeetingSummaryInternal)
	internalWorkspace.Get("/pm/projects", handlers.GetProjects)
	internalWorkspace.Get("/pm/tasks", handlers.GetTasks)
	internalWorkspace.Post("/pm/tasks", handlers.CreatePMTaskInternal)
	internalWorkspace.Put("/pm/tasks/:id", handlers.UpdateTask)
	internalWorkspace.Post("/pm/tasks/:id/transition", handlers.TransitionTask)
	internalWorkspace.Post("/entities", handlers.CreateEntity)
	internalWorkspace.Get("/entities", handlers.GetEntities)
	internalWorkspace.Put("/entities/:id", handlers.UpdateEntity)
	internalWorkspace.Post("/data/:definitionKey/records/query", handlers.QueryDynamicRecords)
	internalWorkspace.Post("/ai/data/:definitionKey/records/query", handlers.QueryAIDynamicRecords)
	internalWorkspace.Get("/data/:definitionKey/records/:id", handlers.GetDynamicRecord)
	internalWorkspace.Post("/system/messages", handlers.InjectSystemMessage)
	// Deprecated compatibility alias. New sidecars use /internal/pm/tasks/:id.
	internalWorkspace.Put("/system/tasks/:id", handlers.UpdateTask)
	internalWorkspace.Get("/facts", handlers.GetInstitutionalFacts)
	internalWorkspace.Post("/facts", handlers.SaveInstitutionalFact)
	internalWorkspace.Delete("/facts/:id", handlers.DeleteInstitutionalFact)
	internalWorkspace.Post("/ai/usage", handlers.IngestAITokenUsage)
	internalWorkspace.Post("/analytics/mine", handlers.MineOrganizationalPatterns)
	internal.Post("/ai/orchestrator/query", handlers.HandleInternalOrchestratorQuery)

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

	// No-code records use one canonical event family. The same tenant-stamped
	// event drives AI indexing, Workflow (including signed n8n actions), and the
	// authorized workspace Centrifugo channel.
	dataEventHandler := func(msg *nats.Msg) {
		var payload map[string]interface{}
		if err := json.Unmarshal(msg.Data, &payload); err != nil {
			log.Printf("Failed to decode %s: %v", msg.Subject, err)
			return
		}
		workspaceID, err := uuid.Parse(fmt.Sprint(payload["workspace_id"]))
		if err != nil {
			log.Printf("Rejected %s without valid workspace_id", msg.Subject)
			return
		}
		eventType := fmt.Sprint(payload["event"])
		if eventType == "" {
			eventType = strings.TrimPrefix(msg.Subject, "events.")
		}
		// Expose record fields to condition/template nodes while preserving all
		// authoritative envelope keys (workspace, definition, versions).
		if recordData, ok := payload["data"].(map[string]interface{}); ok {
			for key, value := range recordData {
				if _, reserved := payload[key]; !reserved {
					payload[key] = value
				}
			}
		}
		if recordID, parseErr := uuid.Parse(fmt.Sprint(payload["record_id"])); parseErr == nil &&
			(eventType == "data.record.created" || eventType == "data.record.updated" || eventType == "data.record.migrated") {
			go services.HandleEntityChange(recordID)
		}
		handlers.ExecuteWorkflowsByTrigger(workspaceID, eventType, payload)
		if err := handlers.PublishToCentrifugo(handlers.WorkspaceChannel(workspaceID), map[string]interface{}{
			"type": eventType, "payload": payload,
		}); err != nil {
			log.Printf("Centrifugo publish failed for %s: %v", eventType, err)
		}
	}
	if _, err := events.NatsConn.Subscribe("events.data.record.*", dataEventHandler); err != nil {
		log.Printf("Failed to subscribe to data record events: %v", err)
	}
	if _, err := events.NatsConn.Subscribe("events.data.schema.>", dataEventHandler); err != nil {
		log.Printf("Failed to subscribe to data schema events: %v", err)
	}
	if _, err := events.NatsConn.Subscribe("events.crm.>", dataEventHandler); err != nil {
		log.Printf("Failed to subscribe to CRM domain events: %v", err)
	}

	_, err := events.NatsConn.Subscribe("chat.message.ai_reply", func(msg *nats.Msg) {
		var payload struct {
			Content     string `json:"content"`
			ChannelID   string `json:"channel_id"`
			WorkspaceID string `json:"workspace_id"`
		}
		if err := json.Unmarshal(msg.Data, &payload); err != nil {
			log.Printf("Failed to unmarshal ai_reply: %v", err)
			return
		}

		if payload.ChannelID == "" || payload.WorkspaceID == "" {
			log.Println("Received AI reply without channel or workspace ID")
			return
		}
		workspaceID := database.ParseUUID(payload.WorkspaceID)
		chanUUID := database.ParseUUID(payload.ChannelID)
		if workspaceID == uuid.Nil || chanUUID == uuid.Nil {
			return
		}
		var channel models.Channel
		if err := database.DB.Where("id = ? AND workspace_id = ?", chanUUID, workspaceID).First(&channel).Error; err != nil {
			log.Printf("Rejected AI reply for channel %s outside workspace %s", payload.ChannelID, payload.WorkspaceID)
			return
		}

		// Find or Create an AI system user (sender)
		var aiUser models.User
		aiEmail := fmt.Sprintf("ai+%s@septimus.os", workspaceID.String())
		if err := database.DB.Where("email = ? AND workspace_id = ?", aiEmail, workspaceID).First(&aiUser).Error; err != nil {
			aiUser = models.User{
				Email:        aiEmail,
				PasswordHash: "none",
				Role:         "AI_AGENT",
				WorkspaceID:  workspaceID,
			}
			database.DB.Create(&aiUser)
		}

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
		handlers.PublishToCentrifugo(handlers.ChannelChannel(chanUUID), wsPayload)
	})

	if err != nil {
		log.Printf("Failed to subscribe to chat.message.ai_reply: %v", err)
	} else {
		log.Println("Subscribed to chat.message.ai_reply")
	}

	_, err = events.NatsConn.Subscribe("events.workflow.generated", func(msg *nats.Msg) {
		var payload struct {
			WorkspaceID     string                 `json:"workspace_id"`
			GeneratedEntity map[string]interface{} `json:"generated_entity"`
		}
		if err := json.Unmarshal(msg.Data, &payload); err != nil {
			log.Printf("Failed to decode events.workflow.generated: %v", err)
			return
		}
		wsPayload := map[string]interface{}{
			"type":    "septimus_workflow_generated",
			"payload": payload.GeneratedEntity,
		}
		workspaceID, parseErr := uuid.Parse(payload.WorkspaceID)
		if parseErr != nil {
			log.Printf("events.workflow.generated has invalid workspace id: %v", parseErr)
			return
		}
		handlers.PublishToCentrifugo(handlers.WorkspaceChannel(workspaceID), wsPayload)
	})
	if err != nil {
		log.Printf("Failed to subscribe to events.workflow.generated: %v", err)
	} else {
		log.Println("Subscribed to events.workflow.generated")
	}
}

// corsOriginAllowed decides whether a browser origin may make credentialed
// requests. Explicit entries in the allowlist always win; when the allowlist
// is empty (local dev, CORS_ALLOW_ORIGINS unset) only loopback origins are
// accepted — an origin no external website can present. Never widen this to
// a blanket "true": AllowCredentials is enabled.
func corsOriginAllowed(allowlist map[string]bool, origin string) bool {
	if allowlist[strings.TrimRight(origin, "/")] {
		return true
	}
	if len(allowlist) == 0 {
		u, err := url.Parse(origin)
		if err != nil {
			return false
		}
		host := u.Hostname()
		return host == "localhost" || host == "127.0.0.1"
	}
	return false
}

func csrfRequestAllowed(method, sessionCookie, origin string, allowlist map[string]bool) bool {
	switch method {
	case fiber.MethodGet, fiber.MethodHead, fiber.MethodOptions:
		return true
	}
	// API clients authenticate explicitly and do not rely on ambient browser
	// cookies, so they are not vulnerable to cross-site request forgery.
	if sessionCookie == "" {
		return true
	}
	// Modern browsers attach Origin to unsafe fetch/form requests. Missing
	// Origin on a cookie-authenticated mutation fails closed.
	return origin != "" && corsOriginAllowed(allowlist, origin)
}

func authRateLimitKey(clientIP string, body []byte) string {
	var identity struct {
		Email      string `json:"email"`
		AdminEmail string `json:"admin_email"`
	}
	_ = json.Unmarshal(body, &identity)
	email := strings.ToLower(strings.TrimSpace(identity.Email))
	if email == "" {
		email = strings.ToLower(strings.TrimSpace(identity.AdminEmail))
	}
	// Hash account identifiers so rate-limiter storage cannot become another
	// plaintext email inventory.
	sum := sha256.Sum256([]byte(email))
	return fmt.Sprintf("%s:%x", clientIP, sum[:12])
}
