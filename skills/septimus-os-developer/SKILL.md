---
name: septimus-os-developer
description: Core guidelines, architectural rules, deep codebase analysis, and development roadmap for the Septimus Company OS project. Trigger this skill whenever modifying Septimus OS, adding features, fixing bugs, or analyzing the architecture.
---

# Septimus Company OS - Developer Master Skill

Architectural orientation and coding conventions for Septimus OS.

> [!IMPORTANT] This file is orientation, not the source of truth.
> The living knowledge base is the Obsidian vault at `Septimus OS/` — enter via
> `Septimus OS/Septimus OS — MOC.md`. When this file and the vault disagree, the
> vault wins; when the vault and the code disagree, **the code wins**. Verify any
> path, function, or NATS subject against the source before relying on it.
>
> Read before touching the AI layer:
> - `Septimus OS/AI Reasoning Constitution.md` — the runtime constitution every agent is bound by
> - `Septimus OS/Security & Multi-Tenancy.md` — trust boundaries and open blockers
> - `Septimus OS/AI Layer Audit — 2026-07-22.md` — current defect catalogue

## 1. Deep Architecture & Logic Analysis

Septimus OS is an event-driven enterprise workspace built with a Golang (Fiber) core, a Python (FastAPI/LangGraph) AI sidecar, and a Next.js 16 frontend.

### 1.1 Backend Core (`/backend-core`)

- **Primary Pattern**: Event-Driven Monolith.
- **Data Model ("JSONB Entity Pattern")**: Instead of creating rigid PostgreSQL tables for every new business requirement (Invoices, Leads, Pos_Terminals), use the generic `Entity` struct in `models/models.go`. Store specialized fields in the `data` (JSONB) column. This keeps the schema lightweight.
- **Event Bus (NATS JetStream)**: The Golang backend is the only service that writes to PostgreSQL. Upon mutation (e.g., message sent, entity created), Golang publishes an event to NATS.
- **Key Modules**:
  - `database/database.go`: GORM auto-migrations and connections.
  - `handlers/pm.go`, `handlers/channels.go`, `handlers/entities.go`: HTTP endpoints managing domain logic.

### 1.2 AI Sidecar (`/ai-sidecar`)

> Corrected 2026-07-22. This section previously named a `/ai-agents` directory,
> NATS subjects, and an agent topology that do not exist in the codebase.

- **Role**: Asynchronous and request/response reasoning via LangGraph + LangChain.
  22 modules, ~4,100 lines. Reachable only through the Go proxy — never published
  on a host port.
- **Entry points**: 12 HTTP routes in `main.py` + 14 NATS handlers in `nats_events.py`.
- **Chat workflow** (`agents_chat.py`):
  1. Go proxies `POST /api/v1/ai/chat` with `X-Workspace-Id` / `X-User-Role`.
  2. `create_react_agent` (LangGraph prebuilt — *not* a hand-rolled `StateGraph`)
     runs a Supervisor that delegates to HR / CRM / Tasks / Correspondence specialists.
  3. Reply tokens stream to Centrifugo; the HTTP body stays authoritative.
- **Event workflow**: consumes `events.messages.created` (durable JetStream) and
  publishes replies on `chat.message.ai_reply`.
- **Every agent** is bound by `reasoning_manual.py`. Any new inference path must
  inject the reasoning directives, the validation gate, and — if it can see
  document/entity/webhook content — the injection-defense prompt plus
  `knowledge.wrap_untrusted_context`.

- **Rule: Go owns PostgreSQL writes.** Business data is mutated only by the Go
  backend; Python calls `/internal/*` and never issues business-domain SQL.
  **Documented exception**: LangGraph conversation checkpoints. `agents_chat.py:410`
  and `nats_events.py:229` open `AsyncPostgresSaver.from_conn_string(DB_DSN)` and
  write directly to the checkpoint tables. That is the only sanctioned direct
  write — do not extend it to business tables.

### 1.3 Frontend (`/frontend`)

- **Stack**: Next.js 16 (App Router and `src/proxy.ts`), Tailwind CSS v4, Base UI components, Zustand.
- **Key Constraints**:
  - Use `Zustand` (`store/useAppStore.ts`) for global state (e.g., Websocket connection, active user).
  - Use Tailwind v4 `@variant dark` for dark mode compatibility with `next-themes`.
  - Maintain a highly responsive, "Slack-like" UI using `ResizablePanel`.
  - Avoid inline styles; use CSS variables defined in `globals.css` or Tailwind utility classes.

---

## 2. Roadmap

Phases 1–3 that used to be listed here (admin/RBAC APIs, geofenced attendance,
visual workflow builder, pgvector RAG, API-key-secured public REST, HR/CRM/Finance
plugins) all shipped. Keeping them here made the skill read as a to-do list for
work already done.

**The live roadmap is `Septimus OS/Future Development Plan.md`.** Do not plan from
this file.

---

## 3. Strict Coding Conventions

### A. TypeScript & Next.js

1. **No `any` Types**: Always define proper interfaces or use `unknown` and type guards.
2. **Accessibility (a11y)**: Buttons and inputs MUST have `aria-label` or `title` attributes.
3. **Avoid Cascading Renders**: Do not call `setState` synchronously within a `useEffect` without proper dependencies. Use refs or derived state where appropriate.
4. **Image Optimization**: Use `next/image` (`<Image>`) instead of standard `<img>` tags.

### B. Golang

1. **Error Handling**: Always return structured JSON errors using Fiber's `c.Status(..).JSON(fiber.Map{"error": "..."})`.
2. **Context**: Ensure the JWT middleware injects `userID`, `roleID`, and `departmentID` into the Fiber locals for robust RBAC verification.
3. **Transactions**: Use GORM transactions (`db.Transaction(func(tx *gorm.DB) error)`) for operations involving multiple tables.

### C. Python AI

1. **Modularity**: Keep LangGraph nodes small and focused.
2. **Resilience**: The NATS listener must handle network disconnects gracefully and retry.
3. **Trust boundary**: Derive `workspace_id` and `user_role` **only** from the
   `X-Workspace-Id` / `X-User-Role` headers the Go proxy stamps from the JWT.
   Never read them from the request body or query string — not even as a fallback.
4. **Constitution**: Every new inference path gets `get_reasoning_directives` +
   `get_validation_gate_prompt`. Paths that see retrieved or externally-sourced
   content also get `get_injection_defense_prompt` and must pass that content
   through `knowledge.wrap_untrusted_context`.
5. **Never swallow silently**: a bare `except` around an LLM call hides broken
   features indefinitely — four shipped features were dead this way. Log with the
   exception type, and let genuinely unexpected errors surface.
6. **No async-blocking I/O**: use `aiohttp` (`http_client.get_session()`) inside
   `async def`, never the synchronous `requests` — it freezes the whole event loop.
7. **Bilingual**: no hardcoded Arabic or English strings. Follow the `_AR`/`_EN`
   pattern in `reasoning_manual.py` and the `SYS_PROMPTS` tables in `i18n.py`.

## Conclusion

By following these guidelines, you ensure that Septimus OS remains a robust, scalable, and highly professional enterprise application. Always prioritize the "JSONB Entity Pattern" for flexibility and rely on NATS for cross-service communication.
