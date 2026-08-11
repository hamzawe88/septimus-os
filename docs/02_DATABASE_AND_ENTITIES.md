# 02. Database and Entities Architecture

Septimus OS relies on PostgreSQL as its primary data store, but it uses a highly specialized architecture designed for maximum flexibility and multi-tenancy.

## The governed JSONB entity pattern

Business records share the `entities` table, while their contracts, versions,
field policy, relations, forms, views, and migration jobs live in the Schema
Builder registry. JSONB flexibility does not mean schemaless writes.

Septimus OS solves this using the **JSONB Entity Pattern**.

All dynamic business objects are stored in a single table called `entities`:

```go
type Entity struct {
	ID, WorkspaceID uuid.UUID
	DefinitionID    *uuid.UUID // required for governed dynamic records
	EntityType      string     // stable definition key
	SchemaVersion   int        // immutable validation contract used at write time
	RecordVersion   int        // optimistic concurrency token
	Data            datatypes.JSON
}
```

### How it works:
- `EntityType` is the immutable published definition key.
- `DefinitionID` and `SchemaVersion` bind every governed record to its contract.
- `Data` is validated, formula fields are recomputed server-side, relation
  references are tenant-checked, and field policy is enforced before commit.
- Every mutation writes audit and outbox rows in the same transaction.

**Why this is powerful for AI:**
AI, Workflow, n8n, API keys, and browsers use the same schema-aware Record API.
AI proposals remain human-gated; approval does not bypass validation, tenant
relations, audit, or outbox delivery.

## Canonical CRM records

CRM uses eight system-managed, immutable contracts: `crm_account`,
`crm_contact`, `crm_opportunity`, `crm_activity`, `crm_quote`,
`crm_quote_line`, `crm_ticket`, and `crm_ticket_message`. The legacy
`lead`/`ticket`/`crm_quote` rows are migration inputs only and are never read by
the CRM UI, analytics, or AI. See
[CRM_CANONICAL_ARCHITECTURE_2026-08-01.md](CRM_CANONICAL_ARCHITECTURE_2026-08-01.md).

The current system contract is CRM schema version 4. Contact names, email,
phone, ticket customer names, confidential notes/descriptions, and commercial
totals are excluded from implicit AI context. AI receives tenant-resolved
record references projected by Backend Core, never browser-supplied record
objects.

## SaaS Plans and Storage Quotas

Septimus OS includes a multi-tenant SaaS billing engine.

### The `saas_plans` Table
Defines the limits for different subscription tiers.
- `MaxStorageMB`: Total workspace storage limit.
- `MaxFileSizeMB`: Maximum size for a single file upload.

### Storage Enforcement
When a user uploads a file (`UploadDocument` in `backend-core/handlers/documents.go`), the system:
1. Checks the workspace's current active plan.
2. Calculates the current total storage used by all `document` entities in the workspace.
3. Calculates the size of files in the target folder (if applicable).
4. **Rejects** the upload with a `400 Bad Request` if any quota (Workspace Total, Folder Limit, or File Size Limit) is exceeded.

## RAG and Vector Embeddings (`pgvector`)

For the AI Sidecar to perform Semantic Search (RAG), Septimus OS uses the `pgvector` extension inside PostgreSQL.

- **`document_embeddings` table**: Stores chunks of text extracted from uploaded documents alongside their high-dimensional vector representations.
- The Python AI Sidecar queries this table to find semantically similar text when answering user prompts in the chat.

## Files and Collaborative Documents

- **Documents** are stored below the private uploads root. They are served only through authenticated download handlers, not as a public static directory. Upload events are consumed durably and indexing progress is persisted in entity metadata.
- **Septimus Drive** stores object bytes in MinIO and durable metadata in `drive_files`. Object keys are never returned to browsers; a JWT-gated Drive endpoint streams the object only after checking its workspace.
- **WorkDocs** store the latest base64-encoded Yjs state in `work_docs.content`. The collaboration gateway verifies user membership before opening a document and every load/store is re-scoped through its owning project.

---
## Schema migrations and tenant isolation

- GORM `AutoMigrate` remains a compatibility bridge for model-created tables.
- Hand-written DDL, backfills, triggers, and hot-path indexes are versioned in
  `backend-core/database/migrations.go` and recorded in `schema_migrations`.
- PostgreSQL advisory transaction locks serialize migrations across replicas.
- Tenant requests use the non-owner `septimus_app` role inside a transaction
  that sets `app.current_workspace_id`; RLS then enforces matching
  `workspace_id` for both reads and writes.
- Administrative migrations and explicitly cross-tenant workers use the
  privileged connection pool.

**Next Step**: Learn the strict UI and theme rules in
[03_FRONTEND_AND_UI_RULES.md](03_FRONTEND_AND_UI_RULES.md).
