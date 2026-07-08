# Septimus Company OS Architecture

## System Overview

Septimus OS is designed as an event-driven, microservices-oriented workspace for large enterprises.

### Tech Stack

- **Frontend**: Next.js 15, TailwindCSS v4, Zustand, shadcn/ui. React Flow for Workflows.
- **Backend**: Golang (Fiber framework), GORM for PostgreSQL.
- **Message Broker**: NATS JetStream for Event-Driven inter-process communication.
- **AI Agent Layer**: Python (FastAPI), LangGraph, Langchain.
- **Vector DB**: pgvector (PostgreSQL extension) for RAG embeddings, managed by the `ai-sidecar` service.

## Core Systems & Logic Flow

### 1. Data Flow (JSONB Entity Pattern)

1. **Creation**: When a user creates a new record (e.g., Task, Invoice, CRM Lead) in the Next.js UI, the payload is sent via REST to the Go Backend.
2. **Persistence**: The Go Backend stores this dynamic payload inside a `JSONB` column in PostgreSQL under the `entities` table. This allows infinite flexibility without modifying table schemas.

### 2. Event-Driven AI Integration

1. **Event Emitting**: Go publishes an event to NATS JetStream (e.g., `events.entities.created` or `chat.message_sent`).
2. **AI Consumption**: Python FastAPI, listening to NATS, receives the event.
3. **Processing**: LangGraph triggers specialized AI agents (Analyst, Strategy).
4. **Proposal Delivery**: Python pushes the result back to NATS (`chat.message.ai_reply`), which the Golang backend consumes and broadcasts via WebSockets to alert the user in Next.js.

### 3. Workflow Engine (Automations)

- **Frontend**: Uses `React Flow` to provide a drag-and-drop Node/Edge visual builder.
- **Backend**: Features a Go-based DAG (Directed Acyclic Graph) executor (`workflow_handler.go`) that validates logic, prevents circular dependencies, and executes background tasks synchronously or asynchronously via NATS.

### 4. Advanced Theming

- The UI layer supports advanced deep customization using Zustand (`useThemeStore.ts`) paired with Next-Themes. It allows independent styling of `Topbar`, `Sidebar`, and workspace backgrounds dynamically.
