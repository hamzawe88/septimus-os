# Septimus OS - Detailed Development Plan & Roadmap

## Overview

This development plan outlines the strategic roadmap for scaling Septimus OS from its current foundation (Core Messaging, PM, and Base Infrastructure) into a fully-fledged Enterprise Operating System.

## Phase 1: Core Administration & RBAC (Immediate Next Steps)

**Objective**: Build a robust permissions system and organizational hierarchy.

### 1. Security & RBAC Maturity

- **Strict Middleware Integration** (Implemented ✅): `middleware.CheckPermission` is enforced on the `/admin` group, attendance office management (`attendance.manage`), project deletion (`projects.delete`), API-key create/revoke (`apikeys.manage`), and workflow create/execute/patch (`workflows.manage`). Registration no longer trusts a client-supplied role — the first user becomes Admin (bootstrap), everyone else starts as Member. Note: finance mutations flow through the shared generic `/entities` endpoint (also used by CRM/HR), so they cannot be gated at route level without breaking those modules; they are covered by audit logging on `entity.delete` instead. A future refinement could check permissions by `entity_type` inside the handler.
- **Audit Logs** (Implemented ✅): `AuditLogs` table + `services.LogEvent` tracking auth logins/registrations, settings, workflows, integrations, and entity deletions; exposed at `/admin/audit-logs`.
- **WebSocket Security** (Implemented ✅): Centrifugo connections use short-lived (5-minute) JWTs from `/chat/token`; the frontend passes `getToken` to centrifuge-js so tokens refresh transparently and the socket stays alive.

### 2. Frontend Implementation (Next.js)

- **Admin Dashboard (`/admin`)**: A new protected route featuring:
  - User Directory: Table of employees with their Departments and Roles.
  - Org Chart: Visual tree of departments.
  - Permissions Matrix: Interactive table to assign permissions to roles.
- **Attendance Module**: Finalize the Map Leaflet logic to restrict the "Check In" button based on distance from the target office location.

---

## Phase 2: Workflow Engine Expansion & Enterprise AI

**Objective**: Take the newly built React Flow workflow builder and AI agents to the next tier of autonomy.

### 1. Workflow Builder Enhancements

- **Cron Jobs Manager**: Allow backend to execute scheduled workflows based on time triggers (e.g., end-of-day reports) using `robfig/cron`.
- **Webhooks Outbound**: Add native nodes in the React Flow builder that fire outbound HTTP requests to connect with external ERPs or Payment Gateways.

### 2. Document Intelligence (RAG)

- Integrate a Vector Database: pgvector (implemented — see `backend-core/handlers/rag_handlers.go` and `ai-sidecar/main.py`).
- Allow users to upload PDFs and Docs to `WorkDocs` or Channels.
- Connect the Python AI sidecar to process these files, extract text, generate embeddings, and answer queries based on internal company knowledge.
- **Voice & Huddles**: Activate the `handlers.HandleHuddleSpeak` for Whisper Voice-to-Text to let AI immediately summarize active meetings.

---

## Phase 3: External Integrations & Marketplace (In Progress)

**Objective**: Connect Septimus OS to the outside world.

### 1. Open API & Webhooks (Implemented)

- Expose a public REST API for Septimus OS. ✅
- Allow users to generate API Keys with specific scopes. (Backend and Frontend UI completed) ✅
- Add incoming and outgoing webhooks to channels. (Webhooks UI completed) ✅

### 1.5 Outbound Actions on Connected Integrations (New)

- The App Store hub previously only stored credentials and tested connectivity — nothing actually *did* anything with a connected integration outside of the existing Google Drive/Calendar/Sheets auto-sync hooks.
- **WhatsApp send (Implemented ✅)**: `POST /integrations/whatsapp/send` (`backend-core/services/whatsapp_service.go` + `handlers.SendWhatsAppMessage`) sends a real message via the Meta Graph API using the workspace's connected `phone_number_id`/access token. Wired into the CRM `Customer360Modal` as an "Send WhatsApp" quick action next to the AI email-draft button. Verified live: blocked with a clear error when not connected, and correctly rejected by Meta's real API when given an invalid token (502, ~580ms round-trip — proof it is a live network call, not a stub).
- **Zendesk ticket create (Implemented ✅)**: `POST /integrations/zendesk/ticket` (`services/zendesk_service.go`) creates a real ticket via the Zendesk Tickets API (Basic auth `{email}/token:{api_token}`). Wired into the CRM `Customer360Modal` as a "Create Zendesk ticket" action using the lead's name/email as requester. Verified live: reaches Zendesk's real API (404 for an unknown subdomain, ~0.4s round-trip).
- **Odoo settlement push (Implemented ✅)**: `POST /integrations/odoo/settlement` (`services/odoo_service.go`) authenticates over JSON-RPC and creates a draft `account.move` journal entry carrying the settlement reference. Wired into the Finance `InvoicesTable` per-row as a "Push to Odoo" action. Verified live: reaches the real Odoo JSON-RPC endpoint (~0.4s round-trip).
- **Google Sheets Kanban export (Implemented ✅)**: `POST /integrations/google/export-tasks?project_id=...` (`handlers.ExportTasksToSheet`) loads a project's tasks, creates a fresh spreadsheet via the connected Google account (OAuth, direct Sheets API — same path as the attendance export), writes a header + one row per task, and returns the sheet URL. Wired into the Kanban board header as an "Export to Sheets" button that opens the new sheet. This is the on-demand counterpart to the existing per-task completion sync (which routes through n8n). Verified live: guards + validation return clear errors, and with a fake token the export reaches Google's real Sheets API (genuine 401 Invalid Credentials, ~1.4s) — proving a live call, not a stub. Note: real use requires GOOGLE_CLIENT_ID/SECRET env vars (placeholders in dev) so a user can complete the OAuth consent.
- Google Drive (project folders) / Calendar (sprint & deadline sync) already fire automatically on domain events when connected; the auto-sync hooks live in pm.go, sprint.go, attendance.go, pm_update.go.
- Remaining outbound actions to wire the same way: Slack-style notifications.

### 2. Enterprise Plugins (Partially Implemented)

- Using the `Entity` JSONB model, build native plugins:
  - **CRM**: Track leads, deals, and clients. (Dashboard and Create Modals UI completed) ✅
  - **HR**: Payroll summaries, leave requests, and evaluations. (Dashboard and Create Modals UI completed) ✅
  - **Finance**: Invoices, expenses, and budget tracking. (Dashboard and Create Modals UI completed) ✅

---

## Development Standards (Professional Workflow)

1. **Always use the "JSONB Entity Pattern"** for new modules to keep the backend lightweight and flexible.
2. **Never write to DB from Python**. All state mutations must go through Golang HTTP APIs or NATS.
3. **Use the `septimus-os-developer` Skill** as the ultimate source of truth for architectural constraints.
4. **Enforce Accessibility (a11y)**: All UI components must have `aria-label` or equivalent titles.
5. **Typesafety**: Ensure `any` is strictly avoided in TypeScript, utilizing generic interfaces.
