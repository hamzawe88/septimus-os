# Septimus OS - Core Architecture & Backend (NotebookLM Source)

This document is compiled for NotebookLM to understand the underlying infrastructure and backend logic of Septimus OS.

## 1. The Three-Tier Architecture
Septimus OS operates on a secure 3-tier architecture:
- **Frontend (Next.js 15, Port 3000)**: Stateless, dynamic, RTL/LTR unified interface. Communicates only with the Go backend via HTTP and WebSocket (Centrifugo).
- **Backend-Core (Golang 1.23, Port 4000)**: Handles all authentication, Workspace isolation (RBAC), and JSONB entity logic. Proxies AI requests securely.
- **AI-Sidecar (Python FastAPI, Port 8000)**: Completely isolated from the internet. Handles Multi-tier LLM routing and Semantic Search (RAG).

## 2. Zero-Migration JSONB Entity Pattern
The defining feature of Septimus OS is its ability to bypass standard SQL migrations. All dynamic records (CRM deals, invoices, support tickets, HR leaves) are stored in a single PostgreSQL table named `entities`.

### Structure of `entities` table:
```go
type Entity struct {
	ID          uuid.UUID      `gorm:"type:uuid;primaryKey"`
	WorkspaceID uuid.UUID      `gorm:"type:uuid;not null;index"`
	Type        string         `gorm:"type:varchar(50);not null;index"`
	Status      string         `gorm:"type:varchar(50);index"`
	Tags        pq.StringArray `gorm:"type:text[]"`
	Data        datatypes.JSON `gorm:"type:jsonb"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}
```

By mapping the highly flexible `Data` column (JSONB) to specific Go structs at runtime, new features can be added instantly without modifying the PostgreSQL schema.

## 3. Storage Quotas and SaaS Engine
The Go backend intercepts upload requests to enforce SaaS billing plans.

- Workspaces have an assigned `saas_plan` dictating `MaxStorageMB` and `MaxFileSizeMB`.
- The `UploadDocument` handler queries the database to calculate current consumption across all `document` type entities.
- If the limit is exceeded, a `400 Bad Request` is returned before any data touches the object storage.
