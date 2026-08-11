# Septimus OS

An enterprise-grade, bilingual (Arabic/English) Company Operating System with an integrated **AI Sidecar** (Multi-tier LLM Routing, Proactive Auditor, and Semantic RAG), Slack-like real-time messaging, dynamic CRM/HR/Finance workflows, and unified database governance.

---

## 🏗️ Architecture & Three-Tier Core

Septimus OS is built on a clean three-tier architecture with zero direct external exposure for AI keys or database credentials:

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

### 1. `backend-core/` (Go 1.26 / Fiber)

- **Real-Time & CRUD API**: Handles authentication, workspace management, attendance geofencing (`Haversine distance calculation`), and enterprise RBAC.
- **Dynamic JSONB Entities (`entities.go`)**: Powers zero-migration custom domain objects (`crm_deal`, `invoice`, `leave_request`) with automatic tenant scope resolution (`workspace_id`) and flexible field aliases (`Type` / `entity_type`).
- **Correspondence & Templates Engine (`correspondence.go`)**: Manages enterprise letterheads, layout configurations, and formal correspondences with robust multi-alias struct decoding (`Name`/`TemplateName`, `HeaderHTML`/`CompanyHeaderData`).
- **Workflow Automation (`workflow_executor.go`)**: Executes DAG workflows and custom nodes (`ai_agent`, `send_slack`, `send_chat`) using direct database injection (`InjectSystemMessageDirect`) and `WSHub` real-time broadcasting.
- **Secure AI Proxy (`/api/v1/ai/*`)**: Proxies AI requests to `ai-sidecar` using `INTERNAL_API_TOKEN` and injects the authoritative `X-Workspace-ID` and user-role headers.
- **Tenant-gated storage**: Document downloads, Drive metadata, object streams, and persisted WorkDocs state are all scoped to the authenticated workspace.
- **Encrypted Provider Store**: Stores model provider API keys (`ai_providers` jsonb) encrypted at rest using `SETTINGS_ENC_KEY`.

### 2. `ai-sidecar/` (Python FastAPI / LangChain / LangGraph)

- **Multi-Provider & Tier Routing (`providers.py`)**: Seamlessly routes tasks to `Fast` tier (`gpt-5-mini`, `claude-3-5-haiku`, `gemini-2.5-flash`) or `Strong` tier (`gpt-5`, `claude-sonnet-5`, `gemini-2.5-pro`, Ollama).
- **Semantic RAG (`knowledge.py`)**: Vector retrieval powered by PostgreSQL (`pgvector`) embeddings (`document_embeddings`).
- **Observability & Cost Tracking (`observability.py`)**: Structured JSON logging (`ai.token.consumption`) and estimated dollar-cost tracking per workspace.
- **Proactive Auditor (`proactive.py`)**: Continuously monitors system pulse and surfaces strategic insights.

### 3. `frontend/` (Next.js 16 / React / Tailwind / Lucide)

- **Bilingual & Adaptive UI (AR/EN)**: Complete 1:1 parity between Arabic (RTL) and English (LTR). Dynamic forms and SaaS modals automatically collapse redundant bilingual inputs based on the current interface language for a spacious, uncluttered enterprise experience.
- **Realtime Centrifugo Channels**: The subscription proxy authorizes `channel_`, `workspace_`, `agents_`, `user_`, and ephemeral `ai_` channels before the browser can subscribe.
- **Enterprise Suites**: CRM Kanban, HR & Geofenced Attendance simulators, Financial Invoices, and Workflow Canvas (`React Flow`).
- **Professional SaaS Management**: Clean `max-w-3xl` modals for managing plans, dynamic themes, and integrated billing configurations.

---

## 🚀 Getting Started

### 1. Environment Setup

Copy the production template and set your secure keys:

```bash
cp .env.example .env
```

Ensure you set strong random strings for `JWT_SECRET`, `SETTINGS_ENC_KEY`, `INTERNAL_API_TOKEN`, `CENTRIFUGO_*`, and the MinIO credentials. Production must also set an HTTPS `N8N_WEBHOOK_BASE_URL` if n8n dispatch is enabled.

Validate the local Compose configuration before downloading or starting any
containers:

```bash
docker compose config --quiet
```

`docker-compose.prod.yml` intentionally has no credential fallbacks. Supply its
required image digests, public URLs, database credentials, MinIO credentials,
and Langfuse secrets through the deployment secret manager before validating or
starting the production stack. The deployment gate rejects tags, including
apparently versioned tags, unless every image is pinned to a registry digest:

```bash
make validate-prod-images
docker compose -f docker-compose.prod.yml config --quiet
```

### 2. Launching Infrastructure & Containers

Start the entire stack (PostgreSQL + pgvector, Redis, NATS, Centrifugo, Backend Core, AI Sidecar, and Frontend):

```bash
docker compose up -d --build
```

### 3. Accessing the Application

- **Frontend App**: [http://localhost:3000](http://localhost:3000)
- **Admin Account**: there are no default credentials. Register the first
  account from the login page — it bootstraps as **Admin** automatically;
  every later registration starts as Member and must be promoted from the
  admin panel.
- **Backend health**: `http://localhost:4000/health`
- **Drive health**: `http://localhost:4001/health`

---

## 🧪 Testing & CI/CD

Septimus OS includes automated test suites across all three layers, integrated with GitHub Actions (`.github/workflows/ci.yml`):

### Run Go Tests (`backend-core`)

```bash
cd backend-core
go test ./...
```

### Run Python Unit & Integration Tests (`ai-sidecar`)

```bash
cd ai-sidecar
docker compose run --rm --no-deps \
  -e PYTHONDONTWRITEBYTECODE=1 \
  -v "$PWD:/workspace:ro" ai-sidecar \
  sh -c 'cd /workspace && PYTHONPATH=/workspace pytest tests -q'
```

### Run Frontend Checks and Browser E2E (`frontend`)

```bash
cd frontend
npm run lint
npx tsc --noEmit
npm run test:e2e
```

---

## 📚 Centralized Documentation

Read the current documents in this order: `docs/00_AGENT_ONBOARDING.md`
through `docs/05_OPERATIONS_AND_RECOVERY.md`. The
`docs/COMPREHENSIVE_AUDIT_2026-07-26.md` file preserves the pre-remediation
evidence baseline; the remediation report records verified fixes and residual
risks. The `docs/archive/`, `docs/notebook_lm/`, `docs/nexus-orchestration/`,
and `docs/superpowers/specs/` trees are historical/reference material, not
runtime truth. Code and Compose configuration are authoritative when they
differ.
