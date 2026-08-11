# Septimus OS Deep Codebase Reference & Analysis

يحتوي هذا المستند على مرجع ومسح تفصيلي لكامل الملفات المصدرية والوحدات والوظائف داخل مشروع **Septimus OS** (الواجهة الخلفية Go، خدمة الذكاء الاصطناعي Python، والواجهة الأمامية Next.js).

---

## 1. محرك الواجهة الخلفية (`/backend-core`)

### ملفات النواة والبيانات والتنبيهات (`Core, Database & Events`)

- [main.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/main.go): نقطة الانطلاق الرئيسية. يُهيئ إطار Fiber، يتصل بقاعدة البيانات وحافلة NATS، ويسجل جميع طبقات الوساطة والمسارات.
- [database/database.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/database/database.go): إدارة الاتصال بـ PostgreSQL عبر GORM، تفعيل امتدادات `ltree` و `vector`، تشغيل `AutoMigrate` لكافة الجداول الـ 29، وزرع أدوار وصلاحيات الـ RBAC الافتراضية.
- [events/nats.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/events/nats.go): اتصال وإدارة NATS JetStream، دالة `PublishEvent` لنشر الأحداث الدقيقة (`entity.created`, `chat.message_sent`).

### طبقات الوساطة (`/middleware`)

- [middleware/jwt.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/middleware/jwt.go): استخراج والتحقق من صحة توقيع الـ JWT من ترويسة `Authorization`، وحقن `user_id` في السياق.
- [middleware/rbac.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/middleware/rbac.go): فحص صلاحيات الدور (`HasPermission`) وحماية المسارات الحساسة.
- [middleware/internal.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/middleware/internal.go): التحقق من رمز `X-Internal-Token` لحماية المسارات الداخلية المتصلة بـ `ai-sidecar`.
- [middleware/apikey.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/middleware/apikey.go): فحص وتوثيق طلبات الـ API عبر المفاتيح البرمجية الخارجية (`APIKeys`).

### نماذج قاعدة البيانات (`/models`)

- [models/models.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/models/models.go): تعريف كيانات `Workspace`, `WorkspaceSetting`, `WorkspaceIntegration`, `User`, `Project`, `Entity`, `WorkDoc`, `Channel`, `Message`, `Department`, `Role`, `Permission`, `RolePermission`, `AuditLog`, `OfficeLocation`, `AttendanceLog`, `Task`, `TaskHistory`, `ChannelMember`, `Workflow`, `WorkflowRun`.
- [models/agent.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/models/agent.go): تعريف كيانات `AIConfig`, `AgentState`, `AgentCollaborationLog`, `PendingApproval`.
- [models/embeddings.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/models/embeddings.go): تعريف كيان `DocumentEmbedding` مع متجه الـ 768 بُعداً لمحرك RAG.
- [models/notification.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/models/notification.go), [models/roles.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/models/roles.go), [models/sprint.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/models/sprint.go), [models/webhook.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/models/webhook.go), [models/workspace_settings.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/models/workspace_settings.go).

### معالجات ومسارات النظام (`/handlers`)

- **التوثيق والحسابات والهيكل التنظيمي:**
  - [auth.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/handlers/auth.go) (`Register`, `Login`, `Profile`)
  - [oauth.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/handlers/oauth.go) (`GoogleLogin`, `GoogleCallback`)
  - [users.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/handlers/users.go) (`SearchUsers`)
  - [org_chart.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/handlers/org_chart.go) (`GetOrgChart`, `CreateDepartment`, `UpdateDepartment`)
  - [admin.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/handlers/admin.go) (`GetRoles`, `AssignRole`, `GetAuditLogs`, `GetPendingUsers`, `ApproveUser`)
- **إدارة المشاريع والمهام والمستندات:**
  - [pm.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/handlers/pm.go) (`GetProjects`, `CreateProject`, `GetTasks`, `CreateTask`, `TransitionTask`)
  - [pm_update.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/handlers/pm_update.go) (`UpdateTask`, `DeleteTask`)
  - [sprint.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/handlers/sprint.go) (`GetSprints`, `CreateSprint`, `UpdateSprint`)
  - [workdocs.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/handlers/workdocs.go) (`GetWorkDocs`, `CreateWorkDoc`, `UpdateWorkDoc`)
  - [documents.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/handlers/documents.go) (`UploadDocument`, `GetDocuments`)
- **المحادثات والتعاون والغرف الصوتية:**
  - [channels.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/handlers/channels.go) (`GetChannels`, `CreateChannel`, `GetMessages`, `CreateMessage`)
  - [channels_admin.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/handlers/channels_admin.go) (`ArchiveChannel`, `DeleteChannel`)
  - [channel_members.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/handlers/channel_members.go) (`AddMember`, `RemoveMember`, `ToggleMute`)
  - [threads.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/handlers/threads.go) (`GetMessageReplies`)
  - [websocket.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/handlers/websocket.go) (`WebsocketHandler`, `Run Hub`)
  - [centrifugo.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/handlers/centrifugo.go) (`GetCentrifugoToken`)
  - [huddle.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/handlers/huddle.go) (`StartHuddle`, `EndHuddle`)
- **الحضور والموارد البشرية (`HR & Geolocation`):**
  - [attendance.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/handlers/attendance.go) (`CheckIn`, `CheckOut`, `GetAttendance`, `GetOfficeLocations`, `CreateOfficeLocation`)
- **الكيانات المرنة والإعدادات والبحث العالمي:**
  - [entities.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/handlers/entities.go) (`CreateEntity`, `GetEntities`, `UpdateEntity`, `DeleteEntity`)
  - [settings.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/handlers/settings.go) (`GetWorkspaceSettings`, `UpdateWorkspaceSettings`)
  - [apikey.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/handlers/apikey.go) (`GenerateAPIKey`, `ListAPIKeys`, `RevokeAPIKey`)
  - [search.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/handlers/search.go) (`SearchMessages`, `GlobalSearch`)
- **الأتمتة ومسارات العمل التكاملية (`Workflows & Integrations`):**
  - [workflow_handler.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/handlers/workflow_handler.go) (`GetWorkflows`, `CreateWorkflow`, `UpdateWorkflow`, `DeleteWorkflow`, `RunWorkflow`)
  - [workflow_executor.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/handlers/workflow_executor.go) (`ExecuteWorkflowsByTrigger`, `traverseAndExecute`, `executeAIAgentAction`, `executeSlackAction`)
  - [automations.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/handlers/automations.go) (`GetAutomationRules`)
  - [integrations.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/handlers/integrations.go) (`ConnectGoogle`, `ConnectSlack`, `ConnectOdoo`, `SyncSpreadsheets`)
  - [webhook.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/handlers/webhook.go) (`RegisterWebhook`, `TriggerWebhooks`)
  - [slack_features.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/handlers/slack_features.go) (`HandleSlackSlashCommand`, `HandleSlackInteractions`)
- **الذكاء الاصطناعي والمراقبة والتقارير الاستباقية:**
  - [ai_proxy.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/handlers/ai_proxy.go) (`ProxyToSidecar`)
  - [agent_handlers.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/handlers/agent_handlers.go) (`GetAgentConfig`, `UpdateAgentConfig`)
  - [agent_api.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/handlers/agent_api.go) (`GetAgentStates`, `KillAgent`, `GetPendingApprovals`, `ApproveAction`)
  - [proactive.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/handlers/proactive.go) (`GetAgentStatus`, `ApprovePendingApproval`, `RejectPendingApproval`, `TriggerMorningBriefCron`, `aiSystemUserID`)
  - [reports.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/handlers/reports.go) (`GetAIReports`)
  - [feedback.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/handlers/feedback.go) (`SubmitAIFeedback`)
  - [rag_handlers.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/handlers/rag_handlers.go) (`SearchRAG`, `EmbedEntity`)
  - [mcp.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/handlers/mcp.go) (`HandleMCPCommand`)

### الخدمات الداعمة (`/services`)

- [services/agents/runners.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/services/agents/runners.go): تشغيل الوكلاء وإدارة حلقات التعاون.
- [services/crypto/crypto.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/services/crypto/crypto.go): تشفير وفك تشفير إعدادات ومفاتيح الربط باستخدام `SETTINGS_ENC_KEY`.
- [services/embeddings.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/services/embeddings.go), [services/orchestrator.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/services/orchestrator.go), [services/google_service.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/services/google_service.go), [services/odoo_service.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/services/odoo_service.go), [services/zendesk_service.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/services/zendesk_service.go), [services/whatsapp_service.go](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/backend-core/services/whatsapp_service.go).

---

## 2. وكيل الذكاء الاصطناعي (`/ai-sidecar`)

- [main.py](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/ai-sidecar/main.py): نقطة تشغيل FastAPI، التحقق من `X-Internal-Token`، تهيئة NATS، ونقاط اتصال `/v1/ai/*` و `/v1/realtime`.
- [agents_chat.py](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/ai-sidecar/agents_chat.py): عقل `LangGraph` ومخطط الوكلاء المتعددين للرد على استفسارات المشاريع وتحليل الأوامر.
- [nats_events.py](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/ai-sidecar/nats_events.py): مستمع أحداث NATS (`chat.message_sent`, `task.created`) وبث اقتراحات الذكاء عبر `events.chat.ai_proposal`.
- [knowledge.py](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/ai-sidecar/knowledge.py): إدارة قاعدة المعرفة والاتصال بـ `pgvector` للبحث الدلالي.
- [providers.py](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/ai-sidecar/providers.py): دعم تعددية نماذج الذكاء (Gemini 3.1 Pro, OpenAI, Anthropic).
- [voice_realtime.py](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/ai-sidecar/voice_realtime.py) & [realtime.py](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/ai-sidecar/realtime.py): إدارة الجلسات الصوتية التفاعلية عبر الويب سوكت.
- [config.py](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/ai-sidecar/config.py) & [i18n.py](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/ai-sidecar/i18n.py): إعدادات البيئة وتعدد اللغات.

---

## 3. الواجهة الأمامية (`/frontend`)

- **المحاذاة والتنقل والشريط العلوي:**
  - [components/layout/Sidebar.tsx](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/frontend/src/components/layout/Sidebar.tsx) & [TopBar.tsx](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/frontend/src/components/layout/TopBar.tsx) & [ThreadSidebar.tsx](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/frontend/src/components/layout/ThreadSidebar.tsx).
- **إدارة المشاريع الأجايل والمهام:**
  - [components/pm/KanbanBoard.tsx](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/frontend/src/components/pm/KanbanBoard.tsx), [TaskCard.tsx](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/frontend/src/components/pm/TaskCard.tsx), [NewTaskModal.tsx](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/frontend/src/components/pm/NewTaskModal.tsx).
- **الموارد البشرية وتسجيل الحضور المتقدم:**
  - [components/hr/AttendanceView.tsx](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/frontend/src/components/hr/AttendanceView.tsx) (إعدادات الفرع الديناميكية + اعتماد الموقع + محاكي GPS).
- **إدارة علاقات العملاء (`CRM`) والمالية (`Finance`):**
  - [components/crm/CRMDashboard.tsx](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/frontend/src/components/crm/CRMDashboard.tsx), [DealsKanban.tsx](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/frontend/src/components/crm/DealsKanban.tsx), [ChatPanel.tsx](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/frontend/src/components/crm/ChatPanel.tsx) (مع أزرار التقييم 👍/👎)، [AIMetricsCard.tsx](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/frontend/src/components/crm/AIMetricsCard.tsx).
  - [components/finance/FinanceView.tsx](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/frontend/src/components/finance/FinanceView.tsx), [InvoicesList.tsx](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/frontend/src/components/finance/InvoicesList.tsx), [ExpensesList.tsx](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/frontend/src/components/finance/ExpensesList.tsx).
- **سير العمل والأتمتة والإضافات والتقارير:**
  - [components/workflows/WorkflowCanvas.tsx](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/frontend/src/components/workflows/WorkflowCanvas.tsx), [PropertiesPanel.tsx](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/frontend/src/components/workflows/PropertiesPanel.tsx), [CustomNodes.tsx](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/frontend/src/components/workflows/CustomNodes.tsx).
  - [components/plugins/PluginsStore.tsx](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/frontend/src/components/plugins/PluginsStore.tsx), [Employee360Modal.tsx](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/frontend/src/components/plugins/Employee360Modal.tsx).
  - [components/reports/AIReportsDashboard.tsx](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/frontend/src/components/reports/AIReportsDashboard.tsx).
  - [components/admin/AuditLogsView.tsx](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/frontend/src/components/admin/AuditLogsView.tsx), [RolesPermissionsModal.tsx](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/frontend/src/components/admin/RolesPermissionsModal.tsx).
