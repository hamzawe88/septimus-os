# 04. Current Status and Roadmap

This document serves as the live state of the Septimus OS project, helping new AI agents understand what was just completed and what needs to be worked on next.

## Verified baseline (2026-08-09)

- Frontend: Next.js 16.3.0; lint, design constitution, localization parity,
  TypeScript, and production build pass.
- Backend and Drive: complete Go test suites and `go vet` pass.
- AI Sidecar: 182 tests and 7 subtests pass in the official Python 3.12.12
  image. The legacy local `.venv` is Python 3.9 and must be recreated before it
  can be used as a trustworthy developer environment.
- Yjs: all Node authentication/document-ID tests pass.
- Dependency audit: full and production npm trees report zero known
  vulnerabilities after the Next.js 16.3.0 and transitive security upgrades.
- Runtime: frontend, backend-core, and Drive are healthy after rebuild.
- Edge security: the existing Caddy CSP moved from report-only to enforcement;
  migration away from `unsafe-inline`/`unsafe-eval` remains separate work.

## What was recently completed (July–August 2026)

1. **Workflow and tenant-boundary hardening**:
   - Closed cross-workspace manual/direct workflow execution paths and validated chat-channel ownership before system-message injection.
   - Restricted outbound webhook and Slack destinations, protected webhook administration, encrypted webhook secrets at rest, and return a generated secret only once.
   - Moved every tenant-aware AI internal route to the validated `X-Workspace-ID` boundary.

2. **Private storage and collaboration reliability**:
   - Removed public uploads serving; documents and Drive files now use authenticated download paths.
   - Added synchronous fail-closed ClamAV scanning before Drive persistence, rollback on failed registration, and EICAR E2E verification.
   - Drive delegates browser-session checks to backend-core, so logout/revocation is enforced consistently across both services.
   - Persisted Yjs WorkDocs state and scoped both reads and writes to the document's workspace.

3. **Runtime consistency and QA**:
   - Standardized Centrifugo channels and added private `user_<uuid>` events for morning briefs.
   - Replaced browser-token storage with HttpOnly sessions, added real Playwright signup/session E2E coverage, health checks, non-root runtime images, and no-cache rebuild verification.

4. **Storage Quotas & SaaS Limits**:
   - Implemented strict backend interception in `documents.go` (`UploadDocument`).
   - The system now calculates total workspace usage and validates it against the `saas_plans` limits (Total Storage MB, Folder Limit MB, File Size MB).
   - Prevents upload if limits are exceeded.

5. **Admin Center UI Cleanup**:
   - Consolidated "Activity Logs" and "Audit Logs" into a single interface.
   - Removed the cluttering "Audit Logs" link from the main Sidebar.
   - The Admin Dashboard now correctly shows an "Audit Logs" (`سجلات التدقيق`) tab to keep the interface clean and unified.
   - Fixed all Markdown linting errors across documentation.

6. **Docker Rebuild Mandate Enforced**:
   - Rebuilt all application images without cache and recreated the complete Compose stack without deleting named volumes.
   - Verified every configured health check, successful one-shot initializers, HTTP/HTTPS endpoints, Centrifugo health, and 3/3 live Playwright tests.

7. **Runtime Maintenance**:
   - Upgraded the AI sidecar runtime from Python 3.10 to Python 3.12 to stay within the supported range of Google client libraries.
   - Migrated Next.js request protection from the deprecated `middleware` convention to `src/proxy.ts`, with E2E coverage for protected-route redirects and authenticated access.

8. **No-code Schema Builder foundation**:
   - Separated schema definitions and immutable published versions from generic
     JSONB records.
   - Added RLS-protected registry tables, stable technical keys, schema/record
     versions, dedicated RBAC permissions, plan entitlements, and quotas.
   - Generic entity CRUD can no longer create a `schema`; dynamic records must
     match an active published definition.
   - Replaced the placeholder builder with a bilingual draft/validate/publish
     workflow and real drag-and-drop field ordering.
   - Added the schema-aware Record API and allowlisted Query AST.
   - Implemented materialized relation links with tenant-safe delete policies.
   - Implemented a restricted formula parser/AST with cycle detection.
   - Added Transactional Outbox and unified data events for Workflow, n8n,
     Centrifugo, and AI indexing.
   - Added real record forms/grids and E2E coverage for schema publication,
     server-computed formulas, and safe queries.
   - Added immutable field catalog, field-level policy enforcement, strict
     user/file references, atomic record audit, schema diff/impact approval,
     resumable migrations, archive, and restore-to-draft.
   - Completed the modular Schema Studio with bilingual identity, fields,
     relations, data, versions and activity; autosave, Undo/Redo, visible
     conflict resolution, safe server formula previews, and Desktop/Mobile
     previews.

9. **Canonical CRM on Schema Builder contracts (August 2026)**:
   - Published versioned account, contact, opportunity, activity, quote,
     quote-line, ticket, and ticket-message contracts.
   - Added an idempotent migration ledger and dependency-ordered conversion of
     legacy `lead`, `ticket`, embedded ticket messages, and `crm_quote` rows.
   - Moved CRM UI, analytics, proactive summaries, Go agents, and AI tools to
     canonical records only.
   - Completed Customer 360 relations, notes/timeline, atomic quote conversion,
     standalone ticket messages, optimistic ticket updates, SLA state, and
     automatic escalation.
   - Published `crm.*` outbox events to Workflow/n8n and authorized workspace
     Centrifugo channels while retaining generic data events for indexing.
   - Added migration, idempotency, tenant-isolation, SLA, API lifecycle,
     Arabic/English, and mobile visual regressions.

10. **Project Management contract and P0 stabilization (August 2026)**:
   - Declared relational projects, tasks, task histories, and sprints as the
     canonical scheduling source and froze one first-party HTTP contract.
   - Added granular PM RBAC, strict project/task/sprint validation, cross-project
     reference guards, bounded pagination, and optimistic record versions.
   - Routed HTTP and Workflow status changes through one transactional state
     machine that commits the task, history, version, and outbox event together.
   - Enforced one active sprint per project, implemented sprint update/delete,
     and returned unfinished work to the backlog when a sprint completes.
   - Replaced fabricated PM dashboard metrics with tenant-scoped database
     aggregates and introduced a persistent bilingual project selector without
     read-triggered data creation.
   - Added PM unit/API lifecycle E2E coverage and refreshed Arabic/English
     desktop/mobile visual baselines against canonical project data.
   - Completed Phase 2 legacy `task/sub_task` migration with a retry-safe,
     tenant-scoped ledger and an explicit unique PM Inbox fallback.
   - Replaced JSONB subtasks with relational hierarchy and moved AI, meeting
     extraction, MCP, proactive briefs, project agents, and global quick-create
     onto canonical PM commands and queries.
   - Closed generic entity reads and writes for retired PM types while keeping
     channel pins and Orbit tasks as intentionally separate domains.

11. **Configuration, localization, and session navigation hardening (August 2026)**:
   - Made Google OAuth fail closed when credentials are absent and removed
     placeholder runtime credentials.
   - Moved Orbit XP persistence to the request-scoped tenant database.
   - Added recursive Arabic/English parity and dashboard-literal checks to the
     frontend lint gate; Drive and WorkDocs now use dictionary-backed copy.
   - Upgraded affected frontend dependencies to patched releases and reduced
     both npm audit modes to zero known vulnerabilities.
   - Replaced full-page internal redirects with App Router navigation and a
     centralized unauthorized-session bridge.

## Current Backlog / Roadmap (What needs to be done next)

*Agents reading this should verify with the user before starting work on these items, as priorities may shift.*

1. **AI Sidecar Integration (Phase 2)**:
   - Enhance the semantic search (`pgvector`) queries in the `ai-sidecar` to be more context-aware of the `JSONB` entities.
   - Build out the Proactive Auditor agent to automatically scan the `entities` table for anomalies (e.g., unpaid invoices older than 30 days) and send alerts to the Centrifugo real-time bus.

2. **Testing & QA**:
   - Execute heavy concurrent upload tests (for example, 100 simultaneous
     uploads) to validate the existing atomic quota reservation under real load.
   - Continue expanding mobile snapshots beyond the covered core modules and CRM.
   - Recreate the local AI virtual environment on Python 3.12; use `make test-ai`
     or the official image until then.

3. **Knowledge Base (Training)**:
   - Integrate the Knowledge Base UI so users can select specific high-quality documents from their "Septimus Drive" and push them to the AI's training queue (`pgvector` embeddings) with a single button click.

4. **No-code Schema Builder (completion program)**:
   - Build Forms, saved Views, interactive ERD, and a virtualized record grid
     on top of the completed Schema Studio.
   - Add Lookup/Rollup, import/export jobs, Workflow/n8n actions, and guarded AI
     draft/query assistance.
   - Follow the phased plan in
     `SCHEMA_BUILDER_EXECUTION_PLAN_2026-07-28.md`.

5. **Project Management planning experience (Phase 3)**:
   - Build Gantt and dependency scheduling on the relational hierarchy with
     guarded date propagation and critical-path analysis.
   - Add portfolio capacity, evidence-backed AI sprint planning, and forecasting
     only after the canonical PM telemetry has accumulated enough real history.

6. **Production supply chain and recovery evidence**:
   - Require deployment-provided Compose image variables to use immutable
     digests and retain the previous immutable image set for rollback.
   - Perform and record an isolated restore drill with measured RPO/RTO.
   - Remove CSP `unsafe-inline` and `unsafe-eval` through a nonce/hash migration
     backed by browser regression tests.

---
**End of Agent Onboarding.** 
You are now ready to begin development. Always follow the documentation reading
order in the root `README.md`, including the audit, remediation, and operations
documents.
