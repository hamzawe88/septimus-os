# 01. System Architecture

This document outlines the high-level architecture of Septimus OS, detailing the interaction between its distinct layers and external dependencies.

## The Three-Tier Architecture

Septimus OS is designed with strict separation of concerns to maximize security, scalability, and ease of deployment.

```text
┌────────────────────────────────────────────────────────┐
│             Next.js 16 Frontend (Port 3000)            │
│       RTL/LTR Dynamic Themes, Liquid Dashboard         │
└──────────────────────────┬─────────────────────────────┘
                           │ HTTP / Centrifugo WS
┌──────────────────────────▼─────────────────────────────┐
│          Golang Backend-Core (Port 4000)               │
│ HttpOnly sessions, AI proxy, settings, NATS & metadata │
└──────────────────────────┬─────────────────────────────┘
                           │ Internal Proxy + Token
┌──────────────────────────▼─────────────────────────────┐
│          Python AI-Sidecar (Port 8000 Internal)        │
│   Fast/Strong Tier Routing, Semantic RAG, Auditor      │
└────────────────────────────────────────────────────────┘
```

### 1. Frontend: Next.js 16 (Port 3000)
- **Framework**: Next.js 16 (App Router), React, Tailwind CSS, Lucide Icons.
- **Role**: Renders the user interface. It communicates exclusively with the Go backend over HTTP/REST and connects to Centrifugo for real-time WebSocket events.
- **Key Characteristics**: Completely stateless. Configuration (themes, branding) is loaded dynamically via the backend. Fully bilingual (AR/EN).

### 2. Backend-Core: Go 1.26 (Port 4000)
- **Framework**: Go Fiber.
- **Role**: The central nervous system. It handles all authentication, RBAC, database migrations (GORM), entity CRUD operations, and proxying.
- **AI Proxy**: The frontend NEVER talks directly to the AI sidecar or external LLM providers. All AI requests go to `/api/v1/ai/*` on the Go backend, which attaches `X-Workspace-ID`, `X-User-Id`, `X-User-Role`, and a secure `INTERNAL_API_TOKEN`.
- **Data Governance**: Enforces SaaS limits and Storage Quotas at the API boundary before any data hits the database or object storage.

### 3. AI-Sidecar: Python FastAPI (Port 8000 - Internal Only)
- **Framework**: FastAPI, LangChain, LangGraph.
- **Role**: Specialized for heavy AI workloads. It is entirely isolated from the internet (no public ports exposed).
- **Functions**: Multi-tier LLM routing (Fast/Strong tiers), Semantic RAG using pgvector, and running proactive auditor agents.

## Core Services & Infrastructure

The ecosystem relies on several infrastructure containers orchestrated via `docker-compose`:

- **PostgreSQL 16 + pgvector**: The single source of truth for all structured data (JSONB entities) and unstructured vector embeddings for RAG.
- **Redis**: Used for high-speed caching, rate limiting, and temporary state (e.g., locking concurrent operations).
- **NATS**: The central event bus. Used heavily by the Go backend to queue asynchronous tasks (like AI processing queues) and broadcast events.
- **Centrifugo**: The WebSocket server. Handles real-time messaging, notifications, and streams. The Go backend publishes events to Centrifugo channels, which push them to the Next.js frontend.

## Security Boundaries

1. **API Keys**: All external API keys (OpenAI, Anthropic, etc.) are stored in the database (`settings` table) and encrypted at rest using `SETTINGS_ENC_KEY`.
2. **Internal Proxy**: The Python AI Sidecar rejects any request that lacks the `INTERNAL_API_TOKEN` header, preventing unauthorized local access.
3. **Workspace Isolation**: Browser authentication uses a `Secure` (in production), `HttpOnly`, `SameSite=Strict` session cookie. The JWT middleware derives `workspace_id` from that signed session (or a supported Bearer token); tenant queries never trust a browser-supplied workspace identifier.
4. **Internal Isolation**: Tenant-scoped `/internal/*` routes additionally require `X-Internal-Token` and the validated `X-Workspace-ID` header. JSON bodies and query strings cannot select another tenant.
5. **Realtime Isolation**: Centrifugo subscriptions are authorized server-side. Valid channel forms are `channel_<uuid>`, `workspace_<uuid>`, `agents_<uuid>`, `user_<uuid>`, and random `ai_<stream-id>`.

---
**Next Step**: Learn how data is stored in the flexible database by reading 👉 **[02_DATABASE_AND_ENTITIES.md](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/docs/02_DATABASE_AND_ENTITIES.md)**
