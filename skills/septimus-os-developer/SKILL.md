---
name: septimus-os-developer
description: Core guidelines, architectural rules, deep codebase analysis, and development roadmap for the Septimus Company OS project. Trigger this skill whenever modifying Septimus OS, adding features, fixing bugs, or analyzing the architecture.
---

# Septimus Company OS - Developer Master Skill

This skill document serves as the ultimate source of truth for developing the Septimus Company OS. It provides deep architectural analysis, strict coding rules, and a clear roadmap for future development.

## 1. Deep Architecture & Logic Analysis

Septimus OS is an event-driven enterprise workspace built with a Golang (Fiber) core, a Python (FastAPI/LangGraph) AI sidecar, and a Next.js 15 frontend.

### 1.1 Backend Core (`/backend-core`)

- **Primary Pattern**: Event-Driven Monolith.
- **Data Model ("JSONB Entity Pattern")**: Instead of creating rigid PostgreSQL tables for every new business requirement (Invoices, Leads, Pos_Terminals), use the generic `Entity` struct in `models/models.go`. Store specialized fields in the `data` (JSONB) column. This keeps the schema lightweight.
- **Event Bus (NATS JetStream)**: The Golang backend is the only service that writes to PostgreSQL. Upon mutation (e.g., message sent, entity created), Golang publishes an event to NATS.
- **Key Modules**:
  - `database/database.go`: GORM auto-migrations and connections.
  - `handlers/pm.go`, `handlers/channels.go`, `handlers/entities.go`: HTTP endpoints managing domain logic.

### 1.2 AI Agent Layer (`/ai-agents`)

- **Role**: Asynchronous, stateful logic processing via LangGraph.
- **Workflow**:
  1. The AI service listens to NATS (`events.chat.message_sent`).
  2. It invokes a LangGraph `StateGraph` (Orchestrator, Analyst, Strategy agents).
  3. It publishes proposals back to NATS (`events.chat.ai_proposal`).
- **Strict Rule**: The Python service NEVER writes to PostgreSQL directly.

### 1.3 Frontend (`/frontend`)

- **Stack**: Next.js 15 (App Router), Tailwind CSS v4, shadcn/ui, Zustand.
- **Key Constraints**:
  - Use `Zustand` (`store/useAppStore.ts`) for global state (e.g., Websocket connection, active user).
  - Use Tailwind v4 `@variant dark` for dark mode compatibility with `next-themes`.
  - Maintain a highly responsive, "Slack-like" UI using `ResizablePanel`.
  - Avoid inline styles; use CSS variables defined in `globals.css` or Tailwind utility classes.

---

## 2. Professional Development Roadmap

### Phase 1: Administration & RBAC

- Implement full backend APIs (`handlers/admin.go`) for Users, Roles, Permissions, and Departments.
- Finalize the Attendance Module using Geofencing (Haversine formula on the Golang backend) and OpenStreetMap (Leaflet) on the frontend.
- Build the `/admin` Dashboard in Next.js.

### Phase 2: Workflow Automation & AI Intelligence

- Build a Visual Node Builder for internal workflows.
- Integrate Document Intelligence (RAG) using pgvector.

### Phase 3: Marketplace & External APIs

- Build a public REST API secured by API Keys.
- Add enterprise plugins (HR, CRM, Finance) using the `Entity` JSONB model.

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

## Conclusion

By following these guidelines, you ensure that Septimus OS remains a robust, scalable, and highly professional enterprise application. Always prioritize the "JSONB Entity Pattern" for flexibility and rely on NATS for cross-service communication.
