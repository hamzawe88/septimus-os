# Septimus Company OS - Development Roadmap

## Phase 1: Foundation (Completed)

- Monorepo setup (Go, Python, Next.js).
- Docker infrastructure (Postgres with pgvector, NATS, Redis, Centrifugo).
- Dynamic JSONB Entity schema in Go.
- NATS Event streaming.
- Next.js UI Slack clone.
- LangGraph Python Agent Orchestrator.

## Phase 2: Core Workflows (Next)

- **Authentication**: JWT integration in Go API and Next.js Auth.
- **WebSocket Chat**: Real-time messaging implementation using Centrifugo.
- **AI Memory**: Pushing entity data into pgvector for semantic search.

## Phase 3: Business Modules (In Progress)

- **API Keys & Integrations**: Secure API Key generation UI and `/api/public/v1` routes to ingest external data. (Completed)
- **CRM Module**: Ingesting customer tickets and feedback. AI Agent specialized in drafting email replies. Plugins Dashboard UI implemented.
- **ERP/HR Module**: Ingesting employee records and leave requests. AI Agent specialized in company policy compliance. Plugins Dashboard UI implemented.

## Phase 4: Production

- K3s (Kubernetes) deployment manifests.
- CI/CD Pipelines (GitHub Actions).
- End-to-end security audits.
