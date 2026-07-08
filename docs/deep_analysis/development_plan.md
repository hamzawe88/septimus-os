# Septimus OS - Detailed Development Plan & Roadmap

## Overview

This development plan outlines the strategic roadmap for scaling Septimus OS from its current foundation (Core Messaging, PM, and Base Infrastructure) into a fully-fledged Enterprise Operating System.

## Phase 1: Core Administration & RBAC (Immediate Next Steps)

**Objective**: Build a robust permissions system and organizational hierarchy.

### 1. Security & RBAC Maturity

- **Strict Middleware Integration** (In Progress ✅): `middleware.CheckPermission` is enforced on the `/admin` group, attendance office management (`attendance.manage`), and project deletion (`projects.delete`). Registration no longer trusts a client-supplied role — the first user becomes Admin (bootstrap), everyone else starts as Member. Remaining: extend permission checks to finance/API-key mutations.
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
