# Septimus OS

An enterprise-grade, bilingual (Arabic/English) Company Operating System with an integrated **AI Sidecar** (Multi-tier LLM Routing, Proactive Auditor, and Semantic RAG), Slack-like real-time messaging, dynamic CRM/HR/Finance workflows, and unified database governance.

---

## 🏗️ Architecture & Three-Tier Core

Septimus OS is built on a clean three-tier architecture with zero direct external exposure for AI keys or database credentials:

```
┌────────────────────────────────────────────────────────┐
│             Next.js 15 Frontend (Port 3000)            │
│       RTL/LTR Dynamic Themes, Liquid Dashboard         │
└──────────────────────────┬─────────────────────────────┘
                           │ HTTP / Centrifugo WS
┌──────────────────────────▼─────────────────────────────┐
│          Golang Backend-Core (Port 4000)               │
│   Auth, JWT Proxy (/api/v1/ai/*), Settings & NATS      │
└──────────────────────────┬─────────────────────────────┘
                           │ Internal Proxy + Token
┌──────────────────────────▼─────────────────────────────┐
│          Python AI-Sidecar (Port 8000 Internal)        │
│   Fast/Strong Tier Routing, Semantic RAG, Auditor      │
└────────────────────────────────────────────────────────┘
```

### 1. `backend-core/` (Golang 1.23 / Fiber)
- **Real-Time & CRUD API**: Handles authentication, workspace management, attendance geofencing, and entity permissions.
- **Secure AI Proxy (`/api/v1/ai/*`)**: Proxies AI requests to `ai-sidecar` using `INTERNAL_API_TOKEN` and injects workspace identity (`X-Septimus-Workspace`).
- **Encrypted Provider Store**: Stores model provider API keys (`ai_providers` jsonb) encrypted at rest using `SETTINGS_ENC_KEY`.

### 2. `ai-sidecar/` (Python FastAPI / LangChain / LangGraph)
- **Multi-Provider & Tier Routing (`providers.py`)**: Seamlessly routes tasks to `Fast` tier (`gpt-5-mini`, `claude-3-5-haiku`, `gemini-2.5-flash`) or `Strong` tier (`gpt-5`, `claude-sonnet-5`, `gemini-2.5-pro`, Ollama).
- **Semantic RAG (`knowledge.py`)**: Vector retrieval powered by PostgreSQL (`pgvector`) embeddings.
- **Observability & Cost Tracking (`observability.py`)**: Structured JSON logging (`ai.token.consumption`) and estimated dollar-cost tracking per workspace.
- **Proactive Auditor (`proactive.py`)**: Continuously monitors system pulse and surfaces strategic insights.

### 3. `frontend/` (Next.js 15 / React / Tailwind / Lucide)
- **Bilingual UI (AR/EN)**: Complete 1:1 parity between Arabic (RTL) and English (LTR) across all widgets and modals (`i18n_scan.py` verified).
- **Realtime Centrifugo Channels**: Instant messaging, huddle updates, and live agent token streaming.

---

## 🚀 Getting Started

### 1. Environment Setup
Copy the production template and set your secure keys:
```bash
cp .env.example .env
```
Ensure you set strong random strings for `JWT_SECRET`, `SETTINGS_ENC_KEY`, `INTERNAL_API_TOKEN`, and `CENTRIFUGO_*`.

### 2. Launching Infrastructure & Containers
Start the entire stack (PostgreSQL + pgvector, Redis, NATS, Centrifugo, Backend Core, AI Sidecar, and Frontend):
```bash
docker-compose up -d --build
```

### 3. Accessing the Application
- **Frontend App**: [http://localhost:3000](http://localhost:3000)
- **Admin Account**: there are no default credentials. Register the first
  account from the login page — it bootstraps as **Admin** automatically;
  every later registration starts as Member and must be promoted from the
  admin panel.
- **Backend API Docs / Health**: `http://localhost:4000/api/v1/system/health`

---

## 🧪 Testing & CI/CD

Septimus OS includes automated test suites across all three layers, integrated with GitHub Actions (`.github/workflows/ci.yml`):

### Run Go Unit Tests (`backend-core`)
```bash
cd backend-core
go test -v ./handlers/...
```

### Run Python Unit & Integration Tests (`ai-sidecar`)
```bash
cd ai-sidecar
./.venv/bin/pytest tests/test_core_modules.py -v
```

### Run Playwright Smoke Tests (`frontend`)
```bash
cd frontend
npm test
```

---

## 📚 Centralized Documentation
For comprehensive engineering analysis, schema references, and the single source of truth development review, consult:
- `docs/PROJECT_REVIEW.md`: Master architectural review and health matrix.
- `docs/AI_OVERHAUL.md`: Multi-tier AI architecture and proxy security specifications.
- `docs/database_schema.md`: Full relational and JSONB database schema.
