# Septimus OS Remediation Report — 2026-07-26

## Scope and evidence

This report records remediation performed after the repository-wide review in
[`COMPREHENSIVE_AUDIT_2026-07-26.md`](COMPREHENSIVE_AUDIT_2026-07-26.md).
The audit remains the immutable pre-remediation evidence baseline. This document
describes implemented controls, verification results, and residual risks.

The review covered the current Markdown documentation, application source,
Go/Python/TypeScript/JavaScript dependencies, Docker and Caddy configuration,
database models and migrations, CI, and browser E2E.

## Executive result

- The two P0 workflow/tenant authorization paths are closed.
- Browser authentication uses revocable server-side sessions in HttpOnly,
  SameSite=Strict cookies with exact JWT validation and CSRF Origin checks.
- Upload, document, huddle audio, and Drive paths fail closed through ClamAV
  before persistence or AI processing.
- Webhooks, n8n actions, Odoo destinations, payment settings, OAuth tokens,
  integration verification tokens, provider settings, and workflow node
  credentials have explicit validation or encryption boundaries.
- Tenant-aware request queries use a least-privilege PostgreSQL role with RLS.
- Hand-written DDL/backfills are versioned and serialized across replicas.
- Python 3.12, Go, Next.js, Drive, and Yjs quality gates are green.
- Production dependency audits report zero known vulnerabilities. The only npm
  findings are development-only transitive packages in the current
  Next/ESLint plugin chain; see Residual risks.

## Critical and P0 remediation

### Workflow authorization and execution

Affected areas:

- `backend-core/main.go`
- `backend-core/handlers/workflow_handler.go`
- `backend-core/handlers/workflow_executor.go`
- `backend-core/engine/workflow_engine.go`
- `backend-core/services/workflow_config.go`

Implemented controls:

- All workflow mutation, generation, execution, and run-history routes require
  `workflows.manage`.
- Every workflow read/update/execute query is scoped to the JWT-derived
  workspace, with RLS as a second boundary.
- Execution contexts stamp the owning workspace server-side.
- Chat/system-message actions verify that the destination channel belongs to
  that workspace.
- Graphs are cycle-checked and size-limited.
- Entire workflow node graphs are AES-GCM encrypted at rest.
- API responses redact tokens, passwords, signing secrets, custom
  authorization headers, and credential-bearing action/webhook URLs.
- Redacted placeholders are merged with existing encrypted values by stable
  node ID, including after graph reordering.

### AI and fact permissions

Affected areas:

- `backend-core/main.go`
- `backend-core/handlers/ai_proxy.go`
- `backend-core/handlers/fact_handlers.go`
- `backend-core/middleware/internal*.go`
- `ai-sidecar/agent_rbac.py`
- `ai-sidecar/main.py`

Implemented controls:

- Browser AI requests terminate at authenticated backend routes.
- Internal AI requests require the shared internal token and authoritative,
  validated workspace/user headers.
- User-provided tenant headers cannot override server identity.
- AI configuration, orchestration, agent management, approvals, and fact
  mutations have explicit permission checks.
- AI requests are rate-limited per authenticated user.

## Authentication, sessions, and browser security

Affected areas:

- `backend-core/handlers/auth.go`
- `backend-core/middleware/jwt.go`
- `backend-core/models/auth_session.go`
- `backend-core/main.go`
- `frontend/src/proxy.ts`
- `Caddyfile`
- `Caddyfile.prod`

Implemented controls:

- JWT accepts HS256 only and validates issuer, audience, expiry, and JTI.
- Every session has an `auth_sessions` row; logout and revocation are enforced
  server-side.
- Drive delegates browser-session validation to backend-core over the protected
  internal API, so a signed token cannot bypass logout/revocation at the storage
  service boundary.
- Impersonation sessions are short-lived and explicitly represented.
- Cookies are HttpOnly, Secure in production, SameSite=Strict, and scoped to `/`.
- Unsafe cookie-authenticated requests require an allowed Origin.
- Authentication endpoints are rate-limited by IP plus a hashed normalized
  account identifier.
- Next.js 16 `proxy.ts` protects all current internal route families.
- CORS credentials use an exact allowlist; development fallback accepts only
  loopback origins.
- Billing/portal return URLs and OAuth completion redirects are constrained to
  `FRONTEND_PUBLIC_URL`.
- Caddy adds framing, content sniffing, opener/resource policy, and
  report-only CSP headers.

Operational note: cookies created before this session-store migration are not
valid server sessions; users must sign in again.

## Tenant isolation and database

Affected areas:

- `backend-core/database/database.go`
- `backend-core/database/migrations.go`
- `backend-core/middleware/tenant_guard.go`
- tenant hooks and scoped handlers throughout `backend-core`

Implemented controls:

- Request transactions use the non-owner, non-BYPASSRLS `septimus_app` role.
- Production requires a distinct `APP_DB_PASSWORD`.
- RLS policies fail closed when `app.current_workspace_id` is unset and apply
  `USING` plus `WITH CHECK`.
- Direct and parent-derived tenant keys were added/backfilled for sensitive
  rows.
- Pinned tasks, subtasks, WorkDocs, Drive, channels, messages, and semantic
  result enrichment were changed to workspace-scoped operations.
- Manual DDL, full-text triggers, legacy backfills, and hot-path indexes are
  versioned in `schema_migrations`.
- PostgreSQL transaction advisory locks serialize migrations across replicas.
- Legacy duplicate slugs/empty employee IDs are normalized before unique
  indexes are created.
- Message, task, Drive, workflow, session, webhook, file, JSONB, FTS, BRIN, and
  vector retrieval indexes cover principal hot paths.
- Document quota updates use row locks/savepoints and atomic accounting.

`AutoMigrate` remains temporarily as a compatibility bridge for model-created
tables. New hand-written schema work must use the versioned migration ledger.

## Files, Drive, and WorkDocs

Affected areas:

- `backend-core/handlers/upload.go`
- `backend-core/handlers/documents.go`
- `backend-core/handlers/huddle.go`
- `backend-core/services/file_policy.go`
- `backend-core/services/virus_scan.go`
- `septimus-drive/main.go`
- `septimus-drive/virus_scan.go`
- `yjs-server/auth.js`
- `yjs-server/server.js`

Implemented controls:

- Public static uploads serving was removed.
- Downloads require authentication, workspace ownership, and file ACL checks.
- Paths are rooted/canonicalized and cannot traverse outside private storage.
- MIME is determined from file signatures, not browser declarations.
- Executable/polyglot mismatches and unsupported audio signatures are rejected.
- Quotas and file-size limits are enforced before durable acceptance.
- ClamAV INSTREAM scanning is synchronous and fail closed.
- Failed scans create no metadata and do not trigger AI processing.
- Drive metadata reaches `ready` only after `malware_scan_passed`; downloads
  reject any other state.
- MinIO object keys are not returned to browsers.
- WorkDocs WebSocket authentication validates exact document IDs and JWT
  identity; load/store access is rechecked against the owning workspace.
- Hocuspocus uses Node 22 and a supported 4.x runtime.

The local Compose image uses official multi-architecture
`clamav/clamav:1.5.3-debian`; production requires a reviewed digest.

## Webhooks, integrations, and secrets

Affected areas:

- `backend-core/handlers/webhook.go`
- `backend-core/handlers/stripe_webhook.go`
- `backend-core/services/webhooks.go`
- `backend-core/services/url_policy.go`
- `backend-core/services/odoo_service.go`
- `backend-core/handlers/payment_settings.go`
- `backend-core/handlers/integrations.go`
- `backend-core/handlers/oauth*.go`

Implemented controls:

- Incoming webhook signatures are constant-time verified with bounded timestamp
  windows and durable delivery-ID replay protection.
- Outgoing webhooks carry timestamp, delivery ID, and body signature.
- Webhook secrets are generated server-side, encrypted at rest, returned once,
  and redacted thereafter.
- n8n/webhook/Odoo/Slack destinations pass DNS/IP-aware SSRF policy checks and
  safe HTTP clients that reject redirect-based policy bypass.
- Workflow execution status records failure truthfully.
- Payment credentials, OAuth access/refresh tokens, integration API tokens,
  WhatsApp verification tokens, provider keys, and workflow credentials are
  encrypted with AES-GCM.
- Startup migrations upgrade legacy plaintext values and fail startup on error.
- Audit logs record changed integration field names, never submitted secrets.
- OAuth state is signed, short-lived, and binds workspace plus initiating user.

## Dependencies and support warnings

- Next.js and `eslint-config-next`: `16.2.12`.
- Request protection uses `src/proxy.ts`; deprecated `middleware.ts` is gone.
- Frontend local fonts replace runtime Google Fonts fetching.
- Google Go integration uses `google.golang.org/genai`.
- Python uses `google-genai` and current LangChain/LangGraph package paths.
- Sunset `langchain-community` and its Redis LLM cache adapter were removed.
- Python runtime is 3.12 and every requirement is pinned.
- Drive and backend Go modules were upgraded and scanned.
- Hocuspocus was upgraded to 4.4 on Node 22.
- Frontend production image uses Node 22, multi-stage standalone output, and a
  non-root runtime.
- The Linux AI image installs the official PyTorch 2.13 CPU wheel before the
  locked requirements, avoiding unused CUDA runtime packages.

## Verification evidence

Pre-Docker gates:

- Backend: `go test ./...` — pass.
- Backend: `go vet ./...` — pass.
- Backend: `govulncheck ./...` — zero reachable vulnerabilities.
- Drive: `go test ./...` and `go vet ./...` — pass.
- Drive: `govulncheck ./...` — zero reachable vulnerabilities.
- Python 3.12: `177 passed`.
- Python: `pip-audit` — no known vulnerabilities.
- Frontend: ESLint — pass.
- Frontend: TypeScript `--noEmit` — pass.
- Frontend: Next.js production build — pass.
- Frontend: `npm audit --omit=dev` — zero vulnerabilities.
- Yjs: 3 authentication/document-ID tests — pass.
- Yjs: production npm audit — zero vulnerabilities.
- Compose development and production interpolation checks — pass.
- Git whitespace/error check — pass.
- CI workflow parses as valid YAML.
- Playwright discovers three browser tests covering login rendering,
  unauthenticated route protection, signup/session/starter billing/Drive,
  malware rejection, CSRF rejection, logout, and revoked-session behavior.

## Residual risks

### High — development tooling only

The full frontend `npm audit` reports 9 High findings in
`brace-expansion/minimatch` below ESLint's Next/React plugins. Production audit
is zero and these packages are not copied into the standalone runtime image.
ESLint 10.8 removes part of the vulnerable chain but is currently incompatible
with the plugin APIs and fails lint (`react/display-name`). Retain ESLint
9.39.4 until the Next plugin chain publishes compatible patched versions; CI
must continue auditing production dependencies and this exception should be
reviewed on each dependency update.

### Medium — operating validation still required

- Perform a real concurrent upload/load test at the target deployment size.
- Execute a monthly encrypted backup restore drill and measure RPO/RTO.
- Run a third-party penetration test before exposing a production tenant.
- Validate CSP in report-only telemetry, then enforce it after legitimate
  endpoints are enumerated.
- Replace all production image examples with reviewed immutable digests.
- Plan a controlled PostgreSQL/pgvector major upgrade; never attach an existing
  volume to a different PostgreSQL major image directly.

### Low — upstream warning

The Python suite emits one Starlette warning that its current TestClient/httpx
bridge will transition to httpx2. Project code has no deprecated Google client
imports. Track the FastAPI/Starlette transition in the normal dependency cycle.

## Deleted non-production artifacts

The review removed exact, untracked scratch targets that contained direct
database mutation helpers, a hard-coded workspace UUID, a token placeholder,
source-rewrite scripts, and an empty patch file. No customer data, source
module, Git history, or Docker volume was deleted.

## Docker rebuild and functional verification

Status: complete.

- Pulled all non-buildable infrastructure images and rebuilt every application
  image without cache: backend-core, Septimus Drive, AI sidecar, frontend, and
  Yjs/Hocuspocus.
- Recreated the complete Compose stack with named volumes preserved. No
  `down -v`, volume deletion, or database reset was performed.
- ClamAV uses the multi-architecture `1.5.3-debian` image, updated its databases
  at startup, loaded 3,627,980 signatures, and became healthy before backend and
  Drive startup.
- Backend migrations completed and the API started normally. Compose ordering
  now waits for backend-core health before starting Drive because Drive
  delegates revocable-session validation to it.
- All configured long-running health checks finished healthy: PostgreSQL,
  Langfuse PostgreSQL, Redis, NATS, MinIO, ClamAV, backend-core, Drive, AI
  sidecar, frontend, Yjs, and Centrifugo. The two one-shot storage/bucket
  initializers exited successfully with code 0.
- Direct HTTP checks returned 200 for frontend, backend, Drive, Centrifugo,
  Langfuse, and Caddy HTTPS. Caddy HTTP returned the expected 308 redirect.
- Playwright against the rebuilt live stack: `3 passed`.
- The authenticated browser flow verified HttpOnly/SameSite=Strict session
  creation, starter-tier onboarding, exact Drive list routing, protected admin
  access, hostile-Origin logout rejection (403), successful logout, and
  server-side revocation (401).
- The EICAR antivirus test signature was rejected synchronously by Drive with
  422, and the Drive log confirms no successful upload. A Drive request carrying
  the just-revoked session was rejected with 401.

## Upstream runtime references

- [ClamAV official Docker documentation](https://docs.clamav.net/manual/Installing/Docker.html)
- [ClamAV official image tags](https://hub.docker.com/r/clamav/clamav/tags)
- [PyTorch CPU installation guidance](https://docs.pytorch.org/get-started/locally/)
- [Centrifugo v5 health endpoint configuration](https://centrifugal.dev/docs/5/server/configuration#health-check-endpoint)
