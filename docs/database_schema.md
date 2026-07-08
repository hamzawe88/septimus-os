# Septimus Company OS - Database Schema

The core database uses PostgreSQL with highly normalized structural tables and dynamic `JSONB` for payload data.

## Core Tables

### 1. Workspaces

- `id` (UUID, Primary Key)
- `name` (String, e.g., "LPC-Brain Core")
- `created_at` (Timestamp)

### 2. Users

- `id` (UUID, Primary Key)
- `workspace_id` (UUID, Foreign Key)
- `username` (String)
- `email` (String)

### 3. Channels

- `id` (UUID, Primary Key)
- `workspace_id` (UUID, Foreign Key)
- `name` (String, e.g., "general", "project-septimus")

### 4. Entities (The Dynamic Core)

- `id` (UUID, Primary Key)
- `workspace_id` (UUID, Foreign Key)
- `type` (String, e.g., "pos_terminal", "invoice", "crm_ticket")
- `data` (JSONB)
- `created_at` (Timestamp)

**Why JSONB?**
Instead of creating a new database table every time a new feature is added (e.g., POS terminal details), we store the structured data as a JSONB object inside `Entities.data`. The Go backend remains blazingly fast and schema-agnostic, while the Python AI parses the JSONB to understand the business context.
