# Septimus OS — Phase 0 Remediation Implementation Plan

Date: 2026-08-08  
Status: Implemented and verified

## Objective

Close the highest-confidence readiness gaps found by the repository-wide audit
without changing product behaviour, deleting data, or introducing a new
architecture.

## Scope

1. **Reproducible configuration**
   - Make `.env.example` cover every required development Compose variable.
   - Add an explicit Compose interpolation check to CI with non-production test
     values.
   - Document the preflight command in `README.md`.

2. **Fail-closed Google OAuth configuration**
   - Remove placeholder OAuth credentials and implicit redirect defaults.
   - Return a structured `503` when the integration is not configured.
   - Add focused tests for missing and complete configuration.

3. **Tenant-scoped database access**
   - Replace direct global-database writes in Orbit request paths with the
     request-scoped database handle.
   - Stop ignoring the affected persistence and request-body errors.
   - Add or extend focused tests where practical.

4. **Documentation accuracy**
   - Correct the onboarding statement that all business domains use JSONB;
     document the governed hybrid JSONB/relational model.
   - Record the verified Phase 0 commands and acceptance criteria.

## Explicitly out of scope

- Workflow worker/queue redesign.
- Broad frontend localization or design-token migration.
- Database schema changes or data backfills.
- Production secret rotation, deployment, or destructive Docker operations.

## Verification

- `docker compose config --quiet` using a temporary environment derived from
  `.env.example`.
- `go test ./...` and `go vet ./...` for `backend-core`.
- Relevant frontend checks only if frontend runtime files change.
- Review `git diff --check` and the final scoped diff.

## Acceptance criteria

- A fresh developer configuration has documented values for all required local
  Compose variables.
- Google OAuth cannot emit a consent URL with placeholder credentials.
- The remediated Orbit request path does not write through `database.DB` and
  reports persistence failures.
- CI catches incomplete Compose configuration before starting services.
- Current documentation describes the actual hybrid storage architecture.

## Verification record

- `docker compose --env-file .env.example config --quiet` — passed.
- `go test ./...` — passed.
- `go vet ./...` — passed.
- Backend image rebuilt successfully and the service started with RLS, NATS,
  cron, and HTTP initialization completing normally.
- Scoped `git diff --check` — passed. The repository-wide command still finds
  pre-existing trailing whitespace in unrelated modified frontend files; those
  user changes were intentionally left untouched.

---

## Phase 1A — Localization quality gate

Status: Implemented and verified

1. Make the existing dashboard literal scanner distinguish UI copy from
   technical constants, translation-key fragments, time zones, and keyboard
   keys.
2. Add recursive Arabic/English dictionary parity validation.
3. Make the scanner return a failing exit code in check mode.
4. Wire the check into the frontend lint command and therefore CI.
5. Replace the explicit `any` in the core translation resolver with safe
   `unknown` traversal.
6. Run lint, TypeScript, production build, and rebuild the frontend container.

### Phase 1A/1B verification record

- Dashboard literal scan: 0 unwired UI literals.
- Recursive locale parity: 0 missing Arabic keys and 0 missing English keys.
- Frontend ESLint and design constitution: passed.
- TypeScript `--noEmit`: passed.
- Next.js production build: passed (18 routes).
- Drive and WorkDocs migrated to dictionary-backed UI copy in both languages.
- Core localization callbacks are stable across unrelated provider renders.
- Frontend image rebuilt successfully; Backend and Drive dependencies also
  restarted healthy as part of Compose dependency ordering.

---

## Phase 1C — Frontend dependency security

Status: Implemented and verified

1. Upgrade Next.js and its ESLint configuration to the patched 16.3.0 line.
2. Upgrade Tailwind PostCSS integration and pin patched PostCSS.
3. Upgrade the DOMPurify wrapper to pull the XSS-fixed DOMPurify release.
4. Refresh transitive Socket.IO, Nano ID, JS-YAML, and brace-expansion locks to
   their patched compatible versions.
5. Require both full-tree and production-only npm audits to report zero known
   vulnerabilities.
6. Re-run lint, typecheck, production build, and rebuild the frontend image.

### Phase 1C verification record

- Full dependency tree: `npm audit --audit-level=moderate` — 0 vulnerabilities.
- Production dependency tree: `npm audit --omit=dev --audit-level=moderate` —
  0 vulnerabilities.
- Patched resolutions: Next.js 16.3.0, PostCSS 8.5.26, DOMPurify 3.4.13,
  Socket.IO parser 4.2.7, Nano ID 3.3.18, JS-YAML 4.3.1, and
  brace-expansion 5.0.9 on the affected minimatch 10 branch.
- ESLint completed with no errors; Next.js 16.3 reported four existing internal
  navigation warnings for follow-up.
- TypeScript and the Next.js 16.3 production build passed.

---

## Phase 1D — App Router authentication navigation

Status: Implemented and verified

1. Replace full-page internal redirects with Next.js App Router navigation.
2. Centralize unauthorized-response navigation in a client-side bridge.
3. Await explicit logout requests before clearing the active UI session.
4. Localize the impersonation banner in Arabic and English.
5. Require lint, localization parity, typecheck, production build, and rebuilt
   runtime containers to pass without navigation warnings.

### Phase 1D verification record

- ESLint completed with zero errors and zero warnings.
- Design constitution passed; localization scan found 0 unwired literals and
  Arabic/English parity remained at 0 missing keys in either language.
- TypeScript `--noEmit` and the Next.js 16.3 production build passed (18
  routes).
- Full and production-only npm audits each reported 0 vulnerabilities.
- Frontend image rebuilt successfully; frontend, backend-core, and Drive
  started normally and passed their runtime health checks.

---

## Phase 2 — Repository-wide hardening and knowledge synchronization

Status: In progress

The user authorized comprehensive remediation. Work proceeds in independently
verifiable batches because the working tree contains substantial in-progress
product work that must be preserved.

### Phase 2A — Baseline and confirmed blockers

1. Run the complete available Go, Python, frontend, Drive, and Yjs checks to
   establish the current failure baseline.
2. Re-verify the residual security and operations risks recorded in the living
   roadmap against the current source before changing them.
3. Fix confirmed high-confidence defects without destructive migrations or
   production data changes.
4. Rebuild every runtime service touched and verify health and logs.

### Phase 2B — Second-brain synchronization

1. Correct stale current-state facts such as versions, service counts, locale
   parity counts, model/RLS coverage, and completed remediation phases.
2. Separate historical findings from current open risks so old vulnerabilities
   cannot be retrieved as if they were still active.
3. Update the MOC, architecture canvas, dashboard metadata, and roadmap with a
   clear source-of-truth and verification date.
4. Add a repeatable knowledge-drift check where it can be enforced safely.

### Acceptance criteria

- All available automated checks either pass or have a documented, reproduced
  blocker with a concrete remediation.
- No newly confirmed tenant-isolation, secret-handling, upload-validation, or
  authentication defect remains open in the inspected paths.
- Living Obsidian pages describe the current working tree and clearly label
  historical evidence.
- Scoped diffs pass whitespace validation and all touched runtime containers
  are healthy.

### Phase 2A/2B progress record — 2026-08-09

- Backend: complete Go tests and vet passed.
- Drive: complete Go tests and vet passed.
- AI Sidecar: 182 tests and 7 subtests passed in the official Python 3.12.12
  image. The checked-in workflow remains `uv`/Python 3.12; the developer's old
  untracked `.venv` was identified as Python 3.9 with missing dependencies.
- Yjs: 3/3 Node tests passed.
- Frontend: lint, design constitution, localization scan, TypeScript, and the
  18-route production build passed.
- Re-verified that upload magic-byte validation and atomic quota reservation
  are already implemented; no duplicate remediation was introduced.
- Caddy configuration validated and reloaded with an enforced CSP header; an
  HTTPS request from inside the edge container returned the expected policy.
- Added a verified current-state note and synchronized the MOC, version/service
  counts, database/RLS coverage, historical security headings, Dashboard Base,
  and architecture Canvas.

### Phase 2C — Ordered backlog execution

Status: In progress

The user explicitly authorized executing the remaining backlog in order:

1. Recreate the local AI environment on Python 3.12 while retaining the old
   environment as a recoverable backup.
2. Add and run concurrent storage/quota load tests without using production
   customer data.
3. Expand critical frontend authentication, CRM, PM, HR, and Drive coverage.
4. Implement and execute an isolated backup/restore drill with measured RPO/RTO.
5. Enforce immutable production image references.
6. Migrate CSP away from unsafe inline/eval allowances with browser validation.
7. Complete Drive-to-RAG Knowledge Base ingestion.
8. Deliver PM Phase 3 planning depth.
9. Make semantic search schema/JSONB aware.
10. Expand proactive finance and CRM anomaly detection.
11. Complete payslip PDF and advanced HR analytics.
12. Add repeatable second-brain drift detection and synchronization.

#### Ordered backlog progress

- Task 1 complete: replaced the stale local Python 3.9 environment with a
  Python 3.12.13 environment, installed all 141 locked requirements, and passed
  182 tests plus 7 subtests locally. The prior environment remains recoverable
  at `/private/tmp/septimus-ai-venv-py39-20260809`.
- Task 2 complete at the quota-reservation layer: extracted the production
  atomic workspace reservation into `services.ReserveWorkspaceStorage`, added
  a PostgreSQL-only 100-worker integration test, and proved that exactly 10 of
  100 simultaneous 1 KiB requests can consume a 10 KiB quota with no
  over-counting, under-counting, or unexpected errors. Added
  `make test-storage-load` for repeatability.
- Task 3 complete: added focused Playwright contracts for the relational HR
  employee → statutory balance → leave request → approval flow, server-side
  session revocation across auth and Drive, and Drive magic-byte rejection for
  a disguised PDF. Both tests passed; lint, localization/design checks,
  TypeScript, and the 18-route production build passed. Rebuilt the frontend,
  backend, and Drive images and verified normal healthy startup logs.
- Task 4 complete: added repeatable, isolated PostgreSQL and MinIO restore
  drills plus Make targets. PostgreSQL restored a 6,940,055-byte custom dump
  into a temporary database and matched all 72 public-table counts (measured
  RTO 8.109s). MinIO restored 25 Drive objects into a fresh temporary server
  with test-only credentials and matched key, size, and ETag (measured RTO
  2.203s). Controlled-drill RPO was 0s; all temporary resources were removed.
- Task 5 complete: production already required all image values externally;
  added a fail-closed deployment policy that validates all 16 runtime images as
  lowercase `image@sha256:<64 hex>` references and rejects tags or missing
  values. Added `make validate-prod-images` and made it an explicit documented
  pre-deployment gate. Negative and positive policy tests passed.
- Task 6 complete: replaced the static broad CSP with a per-request Next.js
  nonce policy. Production scripts use `nonce` + `strict-dynamic`, with no
  `unsafe-eval` or script `unsafe-inline`; stylesheets are nonce-scoped while
  the unavoidable React/chart geometry exception is isolated to
  `style-src-attr`. Forced dynamic rendering so framework scripts receive the
  nonce, passed it explicitly to `next-themes`, removed the conflicting Caddy
  policies, rebuilt the runtime, and proved in Chrome that normal hydration has
  no CSP errors while an untrusted inline event handler is blocked.
- Task 7 complete and strengthened: verified the existing private Drive →
  tenant-scoped NATS → sidecar temporary extraction → unified embeddings flow,
  then added an E2E contract that refuses to pass until the Knowledge Base
  document reaches `ready` with indexed chunks and is retrievable by its unique
  content marker. The live flow completed in 2.4s.
- Task 8 implementation complete; final runtime rebuild is pending an external
  Codex usage-limit reset. Added the canonical `task_dependencies` relation with
  tenant RLS and guarded create/delete APIs; dependencies cannot be self,
  cross-project, cross-tenant, duplicated, or cyclic. Added `/pm/planning` with
  forward/backward scheduling, lag, duration, slack, and critical-path output.
  Unit tests and the live PM lifecycle E2E passed. Added a bilingual Gantt UI,
  portfolio capacity/forecasting based only on completed-sprint velocity, and
  evidence-backed sprint proposals that fail closed with insufficient history
  and require human approval. Go tests/vet, frontend lint, locale parity, and
  TypeScript passed. The final Docker rebuild and updated end-to-end run were
  blocked on 2026-08-09 by the external Codex usage limit; task 9 must not start
  until that runtime verification completes.
