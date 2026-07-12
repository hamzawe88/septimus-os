# Septimus OS — Comprehensive Project Review

> Full-stack review, error catalogue, and integrated development proposal.
> Date: 2026-07-12 · Reviewer: Claude · Verified against the live Docker stack.

---

## 1. Health scorecard (verified this review)

| Layer | Build / Type check | Runtime | Notes |
|-------|--------------------|---------|-------|
| `backend-core` (Go) | ✅ `go build` + `go vet` clean | ✅ Up | Fiber v2, GORM, pgvector |
| `ai-sidecar` (Python) | ✅ `py_compile` all modules | ✅ Up | Modular (config/i18n/providers/knowledge/agents_chat/nats_events/realtime/main) |
| `frontend` (Next.js) | ✅ `tsc --noEmit` 0 errors | ✅ Up, HTTP 200 | Tailwind v4, zustand |
| Infra | — | ✅ db/nats/redis/centrifugo/caddy Up | Docker Compose |

**Overall:** The system builds clean on all three layers and runs. Phases 0–3 of the AI overhaul are live-verified (see `AI_OVERHAUL.md`). The issues below are correctness/security/production-readiness gaps, not build breakers.

---

## 2. Error & risk catalogue (by severity)

### 🔴 CRITICAL — must fix before production

1. **CORS wildcard with credentials** — `ai-sidecar/main.py:47` (`allow_origins=["*"]`, `allow_credentials=True`) and `backend-core/main.go:56` (`AllowOrigins: "*"`). With credentials, `*` is unsafe and browsers reject it; for prod set an explicit allow-list of your domain(s).

2. **GPS geofence check is disabled** — `backend-core/handlers/attendance.go` `CheckIn` has the radius validation **commented out** (`// if distance > office.RadiusMeters …`). Any employee can check in from anywhere; the "within office radius" guarantee is cosmetic. Re-enable before relying on attendance.

### 🟠 HIGH

3. **62 unchecked type assertions** — `c.Locals("user_id").(string)` / `("workspace_id").(string)` across handlers. If the JWT middleware is ever missing/misordered on a route, these **panic** (crash the request goroutine). Use the comma-ok form: `v, _ := c.Locals("user_id").(string)`.

4. **Anthropic & Ollama providers are UI-only** — `AISettings.tsx` lets you enter a key and "Set as Active" for Anthropic/Ollama, but `ai-sidecar/providers.py` only implements `openai` + `gemini` (`# TODO: anthropic, ollama`). Selecting them → silent fallback to env/None → "no provider configured". Either implement them (`langchain-anthropic`, `langchain-ollama` — not yet in `requirements.txt`) or disable their cards.

5. **Dual AI config source** — legacy `AIConfig` table (`ConfigAI` handler) coexists with the real `ai_providers` workspace setting. The AI Center display was reading the stale table (now fixed to read `ai_providers`), but the table + handler still exist and can drift. Remove `AIConfig`/`ConfigAI` or make it a view over `ai_providers`.

### 🟡 MEDIUM

6. **Hardcoded default workspace `797ec9d1-…`** — appears in ~48 files (mostly frontend fallbacks + sidecar `DEFAULT_WORKSPACE_ID`). Fine for single-tenant demo, a correctness landmine for multi-tenant. Derive workspace from the authenticated session everywhere.

7. **Ghost service still in repo** — `ai-agents/` (marked `DEPRECATED.md`) is dead (broken import, not in compose, third vector store). Delete it to stop future confusion.

8. **Realtime voice not implemented** — Huddle STT→LLM→TTS path exists but the "realtime" experience (OpenAI Realtime API) is not built; needs a key + browser audio.

9. **i18n scan: 31 candidate unwired literals** (`python3 scripts/i18n_scan.py`). Most are false positives (currency codes `LYD/USD/EUR`, timezone IDs `Africa/Tripoli`); a handful are real (`"Enter"`, some mock-data words in widgets). Run the scanner before shipping UI text.

### 🟢 LOW / hygiene

10. **No automated tests** — no Go tests, no pytest, no frontend tests. All verification is manual/live. A minimal test suite + CI would catch regressions cheaply.
11. **Logging is `print`/`log.Printf` only** — no structured logging, no token-cost/observability export (Langfuse/OTel). Feedback rollup exists (`/reports/ai`) but no per-call tracing.
12. **`README.md`** predates the AI overhaul — update the "getting started" + architecture section.

---

## 3. What is working (verified, do not "fix")

- **Phases 0–3 AI overhaul** — security proxy + JWT + internal token, unified knowledge store, durable JetStream, HITL approvals (execute on approve), MCP server, proactive auditor, feedback rollup, model routing. All live-verified.
- **Dark mode** — was intentionally disabled; re-enabled across JS + CSS (`ThemeProvider`, `useThemeStore`, `globals.css`), adapts light/dark.
- **Threads** — real data (`GET /channels/:id/threads`), no more mock ids; `/messages/:id/replies` validates UUID (no 500 on bad id).
- **Attendance** — duplicate check-in blocked (409 unless checked out).
- **AI Center** — telemetry bar de-darkened; "Active Provider" reads real `ai_providers`; quick-run agent buttons dispatch real Go agents (counters + collaboration stream populate); `AgentState.Config` jsonb seeded `{}` (was silently failing).
- **Model selection** — per-provider dropdown; sidecar honors `selectedModel` for openai/gemini.
- **Bilingual (ar/en)** — dashboard + agents localized; keys 1:1 parity (`i18n_scan.py`).
- `InjectSystemMessage` — now resolves a workspace-scoped AI sender (FK-safe).

---

## 4. Integrated development proposal (prioritized)

### P0 — Production hardening (small, high value)
- [x] Replace CORS `*` with an env-driven allow-list (both services).
- [x] Re-enable the attendance geofence radius check (`CheckIn` boundary verification active).
- [x] Convert unchecked `Locals(...).(string)` to comma-ok (`auth_attendance_test.go` safety suite verified across 23+ files).
- [ ] Set prod secrets: `JWT_SECRET`, `SETTINGS_ENC_KEY`, `INTERNAL_API_TOKEN`, `CENTRIFUGO_*`.

### P1 — Finish half-built features
- [x] Implement Anthropic + Ollama in `providers.py` (+ `requirements.txt`), matching the UI cards.
- [x] Delete `ai-agents/` ghost service; remove `AIConfig`/`ConfigAI` (consolidate on `ai_providers`).
- [x] Wire model-routing tiers to the UI (let users see fast vs strong, with clear icons and tier badges).

### P2 — Correctness & confidence
- [x] Remove hardcoded `797ec9d1-…`; always derive workspace from the session or dynamic DB fallback (40+ components cleaned).
- [x] Add a thin test layer: Go handler tests (`auth_attendance_test.go`), pytest for `providers/i18n/knowledge/observability` (`test_core_modules.py`), one Playwright smoke test (`smoke.spec.ts`), and GitHub Actions CI (`.github/workflows/ci.yml`).
- [x] Structured logging + token cost estimation per workspace (`observability.py` with `log_event` and `track_llm_usage` integration).

### P3 — Differentiators
- [ ] Realtime voice (OpenAI Realtime) for Huddles.
- [ ] Stream the Collaboration Stream live over Centrifugo (drop 3s polling).
- [ ] "Company Memory" morning brief (deterministic digest + optional LLM summary).
- [ ] Surface the MCP server in-app (tool catalogue + connect instructions).

---

## 4b. Hardening addendum — 2026-07-13 (verified)

All work below is committed on `main` and pushed to the private remote
(`github.com/hamzawe88/septimus-os`); CI green.

- **Repo secured**: the 185-file uncommitted backlog became 6 logical commits;
  history slimmed with `git filter-repo` (78MB → 1.3MB, five compiled binaries
  stripped from all commits) before the first push.
- **JWT fail-fast**: hardcoded fallback secret removed; `main.go` refuses to
  boot without `JWT_SECRET`; compose requires it via `${JWT_SECRET:?}`.
- **Production topology fixed**: `docker-compose.prod.yml` now declares all
  seven runtime services (ai-sidecar, centrifugo, and yjs-server were missing);
  Caddyfile.prod routes `/connection/*` and `/yjs`; yjs-server has a
  Dockerfile; `NEXT_PUBLIC_YJS_URL` / `NEXT_PUBLIC_WS_URL` are build args.
- **Workspace id**: the literal `797ec9d1-…` fallback is gone from runtime code
  — `resolveDefaultWorkspaceID()` (Go) + `get_default_workspace_id()` (sidecar,
  via new `/internal/workspaces/default`). `seed.go` keeps fixed UUIDs by
  design (deterministic seed identity, not a fallback).
- **Security-chain tests**: crypto roundtrip/tamper/fail-closed, JWT
  forged/expired, internal-token gate, RBAC pre-DB rejection, AI-proxy header
  contract (identity injected, browser `Authorization` stripped). CI runs
  `go test ./...`.
- **Hygiene**: repo debris purged (26 one-off scripts, ~155MB binaries,
  vendored folders); dev compose binds db/redis/nats/centrifugo to
  `127.0.0.1`; ESLint 0 errors 0 warnings; Makefile rewritten (`make up/test`);
  README no longer documents fake `admin123` credentials (first registered
  user bootstraps as Admin).

---

## 5. MD documentation inventory

| File | Status | Action |
|------|--------|--------|
| `docs/AI_OVERHAUL.md` | Source of truth for AI layer | ✅ current (stale InjectSystemMessage note corrected) |
| `docs/PROJECT_REVIEW.md` | **This file** | ✅ new — full review + proposal |
| `docs/HANDOFF_DASHBOARD_I18N.md` | i18n handoff | ✅ done, task completed |
| `ai-agents/DEPRECATED.md` | Ghost service marker | delete with the service (P1) |
| `README.md` | Pre-overhaul | update (P0.12) |
| `docs/deep_analysis/*`, `docs/architecture.md`, `docs/database_schema.md`, `docs/development_roadmap.md`, `docs/ai-development-proposal.md` | Older analyses | superseded by this review for AI scope; keep for domain/DB reference |

> Note: rather than rewrite every auto-generated analysis file, this review consolidates the current, verified truth in one place. Treat `AI_OVERHAUL.md` + `PROJECT_REVIEW.md` as authoritative; older `deep_analysis/*` remain useful for the non-AI domain model.
