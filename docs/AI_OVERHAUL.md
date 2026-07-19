# Septimus OS — AI Overhaul (Phases 0–3)

> [!warning] SUPERSEDED / متجاوَز جزئياً (2026-07-18)
> بعض بنود "still-open" هنا **متأخّرة عن الكود**. تحقّق مصدري في 2026-07-18 أكّد أن مزوّدَي **Anthropic + Ollama** مُنفَّذان (`providers.py:81-95`)، والنماذج جيل 2026 (`MODEL_TIERS`)، والذاكرة الحوارية `AsyncPostgresSaver`، وذاكرة الحقائق المؤسسية — كلها مُطبَّقة. مصدر الحقيقة الحالي: vault wiki `Septimus OS/` (`Comprehensive Review — 2026-07` + `Future Development Plan`).

> Full record of the AI layer rework. Phases 0–3 are **done and live-verified via Docker** (2026-07-10/11). Only realtime voice remains (needs an OpenAI key).
> Nothing here needs re-discovery — this file is the source of truth for what changed and how to verify it.
>
> ⚖️ **إشعار الدستور الإلزامي (Constitutional Mandate)**: تم توثيق الدستور الشامل لقواعد التكافؤ اللغوي المزدوج (`ar/en 1:1 Parity`) وإدارة الهوية وموافقات العميل وإعادة بناء حاويات Docker في ملف الدستور التقني المعتمد: [AI_DEVELOPER_CONSTITUTION.md](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/docs/AI_DEVELOPER_CONSTITUTION.md) وفي مجلد قواعد بيئة العمل [AGENTS.md](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/.agents/AGENTS.md).

---

## 0. Quick map of the AI architecture (after the overhaul)

```text
Browser (frontend)
  └─ /api/v1/*  → Caddy/backend → backend-core (Go)  [JWT]
        ├─ /api/v1/ai/*        → ProxyToAISidecar → ai-sidecar (internal only)   [JWT→internal token]
        ├─ /api/v1/mcp         → MCP JSON-RPC tool server                         [JWT]
        ├─ /api/v1/agents/*    → status / dispatch / approve / audit
        └─ /internal/*         → sidecar-only, token-gated (X-Internal-Token)

ai-sidecar (Python, NOT host-published — reachable only via the backend proxy)
  ├─ config.py       env + internal_headers + Centrifugo cfg
  ├─ i18n.py         Arabic/English agent replies
  ├─ providers.py    LLM/embeddings selection + model tiers (fast/strong)
  ├─ knowledge.py    RAG (thin client → Go unified store)
  ├─ agents_chat.py  ReAct chat agent (+ token streaming, + HITL write tools)
  ├─ realtime.py     Centrifugo publish (token streaming)
  ├─ nats_events.py  durable JetStream consumers + core NATS handlers
  └─ main.py         FastAPI app + endpoints (thin)

Single knowledge store: Postgres `document_embeddings` (Gemini 768-dim) — documents AND entities.
Single provider-key source: encrypted `ai_providers` workspace setting.
```

---

## Phase 0 — Security (DONE, live-verified)

| Change | Where |
| :--- | :--- |
| Sidecar no longer host-published; reachable only via JWT proxy | `docker-compose.yml` (`expose` not `ports`), `backend-core/handlers/ai_proxy.go` (`ProxyToAISidecar`, route `protected.All("/ai/*")`) |
| `/internal/*` gated by shared token | `middleware/internal.go` (`RequireInternalToken`, header `X-Internal-Token` == `INTERNAL_API_TOKEN`; disabled if env unset for dev) |
| Provider API keys encrypted at rest (AES-GCM, `enc:v1:` prefix) | `services/crypto/crypto.go`; `handlers/settings.go` (`SaveSettings` encrypts, `GetSettings` masks for browser, `GetSettingsInternal` decrypts for sidecar) |
| SQL injection fixed in message search ORDER BY | `handlers/search.go` (bound `clause.Expr`) |
| Frontend AI calls go through backend (`AI_BASE_URL = API_BASE_URL`); no keys in `localStorage` | `frontend/src/lib/apiClient.ts`, `components/settings/AISettings.tsx` |

**Verified live:** host `:8000` refused · `/api/v1/ai/chat` no-JWT → 401 · `/internal/*` no-token → 401 / with-token → 200.

**Env (prod):** set `JWT_SECRET`, `SETTINGS_ENC_KEY`, `INTERNAL_API_TOKEN` (compose defaults: `dev-internal-token`, `supersecretkey`).

---

## Phase 1 — Unification (DONE, live-verified)

- **Single AI service:** ghost `ai-agents/` marked `DEPRECATED.md` (broken import, ChromaDB, not in compose). All AI flows go through `ai-sidecar/`.
- **`main.py` split** (~810 → thin) into `config/i18n/providers/knowledge/agents_chat/nats_events`.
- **Durable JetStream consumers** for `events.tasks.created` / `events.messages.created` / `events.workflow.trigger` (durables `ai_sidecar_tasks/messages/workflow`, `DeliverPolicy.NEW`). Core NATS kept for `document.uploaded` / `huddle.speak` / `crm.lead.score`.
- **Go agents:** deleted dead `services/agents/orchestrator.go` + `llm_provider.go`; `runners.go` now does real DB work (CRM pipeline summary, task-status breakdown); real trigger `POST /api/v1/agents/dispatch` → `agents.<type>`.
- **Unified knowledge store:** sidecar dropped its own PGVector collection. `knowledge.py` → `retrieve_context` GETs `/internal/search/semantic`; `embed_document` POSTs chunks to new `POST /internal/embeddings` (`handlers.IngestEmbeddings` → `services.StoreEmbedding`). Documents + entities co-searchable.
- **Unified key source:** `services/ai_providers.go` `GetProviderKey(workspaceID, provider)` reads Gemini key from `ai_providers` (was the broken `AIConfig` table query). `embeddings.go` uses it.

**Verified live:** durable consumers exist · `/ai/query` responds · language routing ar/en.

---

## Phase 2 — Streaming, Copilot, HITL (DONE at code level; streaming needs an AI key to see tokens)

- **Human-in-the-loop approvals:** chat write tools (`create_task`, `create_crm_deal`) → `_queue_approval()` → `POST /internal/pending-approvals` (`handlers.QueuePendingApproval`). `ApprovePendingAction` now EXECUTES on approve via shared `createEntityRecord()` (`entities.go`). UI already polls `/agents/status` + Approve/Reject. **Verified live:** queue → status → approve → task created (0→1).
- **Streaming:** sidecar `realtime.py` publishes reply tokens to Centrifugo channel `ai_<streamId>` (`agents_chat._run_streaming`, `stream_mode="messages"`); HTTP `{reply}` stays authoritative. Frontend `AgentChatDrawer` subscribes and accumulates. Env: `CENTRIFUGO_API_URL/KEY` on the sidecar.
- **Unified Copilot:** `components/ai/CopilotLauncher.tsx` (global in `GlobalModals.tsx`, gated on login), floating button + **⌘I / Ctrl+I** (⌘K is global search), opens `AgentChatDrawer` with new `agentType='supervisor'`.

---

## Phase 3 — Creative layer (DONE + live-verified, except voice)

- **Proactive Project Auditor** (`handlers/proactive.go`): deterministic worker (`StartProactiveAuditor`; env `PROACTIVE_AUDIT_INTERVAL`=6h, `STUCK_TASK_DAYS`=3) scans `tasks` for `in_progress/review/blocked` older than threshold, posts one Arabic alert to the workspace general channel. Dedup via `proactive_alerts` table. Manual: `POST /api/v1/agents/audit`. **Verified live** (post + dedup).
- **Model routing (19)** (`providers.py`): `get_active_llm(ws, tier)` + `MODEL_TIERS`. Light tasks (estimation, lead score, subtasks) → `fast`; chat/planning → `strong`.
- **Feedback/observability (18)** (`handlers/feedback.go`): `MessageFeedback` table, `POST /api/v1/messages/:id/feedback {rating:"up"|"down"}`, folded into `GET /api/v1/reports/ai` as `feedback:{up,down,total,score}`. **Verified live.**
- **MCP server (20)** (`handlers/mcp.go`): JSON-RPC 2.0 at `POST /api/v1/mcp` (JWT, workspace-scoped). `initialize` / `tools/list` / `tools/call`. Tools: `search_knowledge`, `list_stuck_tasks`, `list_tasks`, `create_task` (→ HITL approval). **Verified live.**

**Remaining:** Realtime voice (17) — needs OpenAI Realtime + key + browser audio.

---

## Bugs caught by live testing (fixed)

1. **Empty provider key** → client built with `openai_api_key=""` failing mid-generation with "Missing credentials". Fixed: `providers.py` treats an empty key as unconfigured → clean localized "no provider" message.
2. **AI message sender FK** — `messages.sender_id` is NOT NULL + FK. Fixed: `aiSystemUserID(workspaceID)` get-or-creates `ai@septimus.os` (Role `AI_AGENT`), **scoped to a workspace** because `users.workspace_id` is a non-pointer uuid with FK `fk_users_workspace` (zero uuid → violation).
   - ✅ **Now fixed everywhere:** `handlers.InjectSystemMessage` resolves the sender via `aiSystemUserID(channel.WorkspaceID)` and sets `SenderID` (no more FK violation).
3. **AgentState jsonb `Config`** — `runners.checkKillSwitch` created `AgentState{Config: ""}`; an empty string is invalid JSON for the `jsonb` column so the insert failed silently, leaving AI Center counters stuck at 0. Fixed: seed `Config: "{}"`.

---

## Later additions (post-Phase-3)

- **Model selection (per provider):** `AISettings.tsx` adds a model dropdown (`PROVIDER_MODELS` / `selectedModel`); `ai-sidecar/providers.py` `get_active_llm` honors `selectedModel` for **openai + gemini** (falls back to `MODEL_TIERS`). Anthropic + Ollama are **UI-only** — still `# TODO` in the sidecar.
- **AI Center fixes:** de-darkened telemetry bar; "Active Provider" reads real `ai_providers` (shows provider · actual model); quick-run buttons → `POST /agents/dispatch` → real Go agents.
- **Dark mode re-enabled**, **real threads** (`GET /channels/:id/threads`), **attendance duplicate-check-in guard** (409). See `PROJECT_REVIEW.md` for the full current state + error catalogue.

---

## Key endpoints added/changed

```text
POST /api/v1/ai/*                      → proxied to sidecar (JWT)
POST /api/v1/agents/dispatch           → dispatch task to crm|task|comm agent
POST /api/v1/agents/audit              → run proactive auditor now
POST /api/v1/messages/:id/feedback     → {rating:"up"|"down"}
POST /api/v1/mcp                       → MCP JSON-RPC (initialize|tools/list|tools/call)
GET  /api/v1/reports/ai                → now includes feedback:{up,down,total,score}
POST /internal/embeddings              → batch-embed chunks (sidecar → unified store)  [token]
POST /internal/pending-approvals       → queue HITL approval                            [token]
GET  /internal/settings/:key           → decrypted settings for sidecar                 [token]
```

---

## How to run & verify (Docker)

```bash
cd septimus-os
docker compose up -d --build          # rebuild all after code changes (project rule)
docker compose logs -f ai-sidecar     # expect: "listening (durable: events.*; core: ...)"
```

**Verification recipe (no browser needed):** mint a test JWT with the container's `JWT_SECRET`
(HS256, claims `sub`/`workspace_id`/`role`/`exp`), then curl the endpoints above. Full worked
examples are in the session memory. Users: seed `*.septimus.local` have literal `123456`
hashes (can't log in); `admin@septimus.os` (ws `dab3d9c9-…`) is registered normally.

**To enable real generation + streaming + Copilot in the browser:** add a Gemini or OpenAI key in
**Settings → AI Providers** (stored encrypted now). No code change needed — the "no provider" path
flips to real replies, and token streaming activates.

---

## LLM tracing — self-hosted Langfuse (optional)

Per-call traces for the chat agent: prompts, completions, tool calls, latency and token
counts, grouped per workspace. Self-hosted — no data leaves the stack.

**This is additive.** The existing `log_event` / `track_llm_usage` structured logs and the
budget guardrails are unchanged and remain authoritative. With no keys configured — the
default — `get_langfuse_handler()` returns `None`, no callback is attached, and the agent
path behaves exactly as it did before. A Langfuse that is down, unconfigured, or missing
from the image degrades to "no tracing" and logs once; it never raises into inference.

| Piece | Where |
|---|---|
| `langfuse` + `langfuse-db` (own Postgres + volume) | `docker-compose.yml`, `docker-compose.prod.yml` |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_HOST` | `ai-sidecar/config.py` |
| `get_langfuse_handler(workspace_id, user_id, session_id, tags)` | `ai-sidecar/observability.py` |
| `config["callbacks"] = [handler]` (only when not None) | `ai-sidecar/agents_chat.py` |

Server is `langfuse/langfuse:2`, matched by the v2 Python SDK (`langfuse>=2.60.10,<3`) —
the v3 SDK speaks a different API and will not work against a v2 server. The v2 SDK caps
`packaging<25.0`, so `packaging` is held at `24.2` in `ai-sidecar/requirements.txt`.

Langfuse gets its **own** Postgres (`langfuse-db`, host port `5434`): it owns and migrates
its schema, so it must never share the app `db`. The UI is on host port **3001** (3000 is
the frontend), loopback-bound like the other data stores. Nothing depends on `langfuse`,
so it can be stopped at any time without touching the rest of the stack.

### Turning it on

```bash
docker compose up -d langfuse langfuse-db
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3001   # → 200
```

1. Open <http://localhost:3001>, create an account (first user is local to your instance),
   then create an organization + project.
2. **Project → Settings → API Keys → Create** — the keys only exist once Langfuse is
   running, which is why `.env.example` ships them commented out.
3. Paste both into `.env`:
   ```bash
   LANGFUSE_PUBLIC_KEY=pk-lf-...
   LANGFUSE_SECRET_KEY=sk-lf-...
   ```
4. `docker compose restart ai-sidecar` — traces appear under the project on the next chat
   call, tagged `workspace:<id>`, `agent:<type>`, `lang:<ar|en>`, and grouped into sessions
   by `thread_id`.

In production every Langfuse secret is required up front (`${VAR:?}`) — see the
`LANGFUSE_*` block in `.env.example`. The prod service is **not** published on a host port,
since the UI exposes prompt and completion content; add a reverse-proxy route behind auth
or tunnel to it deliberately.

---

## Still-open (future)

- Realtime voice (OpenAI Realtime API) — needs a key.
- LLM-generated "morning brief" (deterministic proactive digest partly covered by the auditor).
- Fix `InjectSystemMessage` sender-FK latent bug.
- Workspace-filter the pending-approvals list in `GetAgentStatus` (payload already carries workspace_id).
- Optional: consolidate the legacy `AIConfig` table (now only feeds the "active model" display).
