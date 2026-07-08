# Septimus OS - Deep Architecture & Logic Analysis

## 1. Backend Core (`/backend-core`)

The backend is written in Golang using the Fiber framework, designed as an event-driven monolith. It serves as the primary source of truth.

### Key Modules & Files

- **`main.go`**: The entry point. Initializes Fiber, connects to PostgreSQL via GORM, sets up NATS JetStream, and registers all HTTP routes (Auth, PM, Chat, AI).
- **`database/database.go`**: Handles PostgreSQL connections and auto-migrations. Key logical operation: mapping Go structs (`User`, `Entity`, `Message`) to SQL tables.
- **`models/models.go`**: Contains the core Data Transfer Objects (DTOs) and ORM models. Uses the **"JSONB Entity Pattern"** where a generic `Entity` struct holds dynamic business data (e.g., tasks, invoices, POS data) inside a JSONB column, avoiding rigid table schemas. Added models for `Role`, `Department`, `Permission`, `AttendanceLog`, `OfficeLocation`, `Workflow`, and `WorkflowRun`.
- **`events/nats.go`**: The event bus layer. Uses NATS JetStream to publish domain events (`entity.created`, `chat.message_sent`) and subscribe to AI responses.
- **`middleware/jwt.go`**: Extracts and validates JWT tokens from the `Authorization` header, injecting the `userID` into the Fiber context.

### Handlers (`/handlers`)

- **`auth.go`**: Handles user Registration, Login (generates JWT tokens), and Profile management.
- **`pm.go`**: Project Management endpoints. Creates Agile projects, Kanban columns, and Tasks. Translates tasks into the generic `Entity` model.
- **`channels.go` / `threads.go`**: Chat system. Channels act as rooms, Messages belong to channels, and Threads are nested replies.
- **`entities.go`**: Generic CRUD for `Entity` model (JSONB data).
- **`search.go`**: Implements global search across messages and entities.
- **`workflow_handler.go`**: Manages CRUD and execution logic for node-based automation workflows using a custom DAG algorithm.
- **`system.go`**: Handles system configuration and health checks.

---

## 2. AI Agent Layer (`/ai-agents`)

Written in Python, utilizing `LangGraph` and `FastAPI` (or pure NATS listener). It acts as an asynchronous sidecar to the Golang backend.

### Backend Key Modules

- **`main.py`**: Initializes the AI environment, loading OpenAI/Anthropic keys.
- **`agents/orchestrator.py`**: The LangGraph state graph. Defines a team of agents (e.g., Strategy, Analyst, Executive) that collaborate to solve complex queries or analyze chat messages.
- **`events/nats_listener.py`**: Subscribes to the NATS JetStream server. Listens to `chat.message_sent` or `ai.task_requested`. When triggered, invokes the `orchestrator`, then publishes the result back to NATS (e.g., `events.chat.ai_proposal`).

---

## 3. Frontend Application (`/frontend`)

Written in Next.js 15 (App Router), styled with Tailwind CSS v4, and utilizing `shadcn/ui`.

### Frontend Key Modules

- **`app/layout.tsx` & `app/globals.css`**: The root layout. Configures `next-themes` for Dark/Light mode using Tailwind v4's `@variant dark`.
- **`store/useAppStore.ts`**: Zustand state management. Holds current user, active channel, channels list, and websocket connection.
- **`store/useThemeStore.ts`**: Zustand state management for advanced UI customization (Sidebar bg, Topbar bg, Text colors).
- **`components/automations/WorkflowBuilder.tsx`**: Uses `React Flow` to provide a drag-and-drop interface for enterprise automation rules.
- **`components/layout/Sidebar.tsx`**: The main navigation sidebar (Slack-style). Lists DM channels, System channels, and Apps.
- **`components/layout/TopBar.tsx`**: Global search, notifications, attendance trigger, and user profile/settings.
- **`components/shared/MessageInput.tsx`**: A highly interactive Rich Text input for sending messages, uploading files, and triggering AI commands (`/ai`).
- **`components/pm/KanbanBoard.tsx` & `TaskCard.tsx`**: The agile project management view, featuring drag-and-drop powered by `@hello-pangea/dnd`.

### Logic Flow (Frontend -> Backend)

1. User types message in `MessageInput.tsx` and hits Send.
2. Frontend sends POST request to `/api/v1/channels/:id/messages`.
3. Golang backend saves message to PostgreSQL and publishes `chat.message_sent` to NATS.
4. Python AI listener catches event (if mentioned or relevant), processes via LangGraph, and publishes `chat.ai_proposal`.
5. Golang catches proposal, saves as a special message, and broadcasts via WebSocket.
6. Frontend updates Zustand store and displays the AI proposal card.
