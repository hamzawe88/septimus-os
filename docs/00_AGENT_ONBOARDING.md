# 00. Agent Onboarding Guide (START HERE)

> **CRITICAL DIRECTIVE FOR ALL AI AGENTS**:
> You MUST read this document in its entirety before making any changes, analyzing bugs, or designing new features for Septimus OS. This is your master index.

Welcome to **Septimus OS**, an enterprise-grade, bilingual (Arabic/English) Company Operating System with an integrated AI Sidecar, real-time messaging, dynamic CRM/HR/Finance workflows, and unified database governance.

## 1. Project Overview & Architecture

Septimus OS is built on a clean three-tier architecture:

1. **Frontend (Port 3000)**: Next.js 16, React, Tailwind CSS, Zustand. Strict 1:1 RTL (Arabic) and LTR (English) parity.
2. **Backend Core (Port 4000)**: Go 1.26, Fiber, PostgreSQL. Handles RBAC, HttpOnly sessions, Workspaces, and the core JSONB Entity engine.
3. **AI Sidecar (Port 8000)**: Python FastAPI, LangChain/LangGraph, pgvector. Handles AI agent routing, RAG, and proactive auditing.

For a detailed breakdown of the system components and architecture, read:
👉 **[01_SYSTEM_ARCHITECTURE.md](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/docs/01_SYSTEM_ARCHITECTURE.md)**

## 2. Core Paradigms You MUST Know

### A. Governed hybrid storage (JSONB + relational domains)
Dynamic and administrator-defined business records use the governed JSONB
Entity Pattern: records live in `entities`, while published definitions,
versions, field policy, relations, formulas, audit, and outbox data enforce the
contract. Domains that require strong relational integrity and scheduling or
ledger semantics—currently including HR and Project Management—use dedicated
relational tables. New domain work must choose deliberately between the two
patterns; JSONB is not a blanket replacement for relational modelling.
For details on the schema, storage quotas, and how to write handlers for entities, read:
👉 **[02_DATABASE_AND_ENTITIES.md](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/docs/02_DATABASE_AND_ENTITIES.md)**

### B. Bilingual & Theme Rules (No Hardcoded Strings)
The frontend must support instant switching between RTL (Arabic) and LTR (English). You must NEVER write hardcoded text in components. All strings must go through `ar.json` and `en.json`. Furthermore, themes and logos are managed via a centralized Zustand store (`useThemeStore`).
For frontend styling rules, layout symmetry, and state management, read:
👉 **[03_FRONTEND_AND_UI_RULES.md](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/docs/03_FRONTEND_AND_UI_RULES.md)**

## 3. Development Workflow & Commands

### Docker Rebuild Mandate
Whenever you modify runtime code, rebuild the affected container. Before a handoff spanning services, rebuild the complete stack and wait for health checks.
```bash
# For frontend changes
docker compose up -d --build frontend

# For backend changes
docker compose up -d --build backend-core
```

## 4. Current Status & Roadmap

To understand what has been recently built (e.g., Storage Quotas, Audit Logs) and what is planned for the upcoming sprints, read:
👉 **[04_CURRENT_STATUS_AND_ROADMAP.md](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/docs/04_CURRENT_STATUS_AND_ROADMAP.md)**

## Summary of Your Reading Path:
1. `00_AGENT_ONBOARDING.md` (You are here)
2. `01_SYSTEM_ARCHITECTURE.md`
3. `02_DATABASE_AND_ENTITIES.md`
4. `03_FRONTEND_AND_UI_RULES.md`
5. `04_CURRENT_STATUS_AND_ROADMAP.md`

Now, proceed to `01_SYSTEM_ARCHITECTURE.md` to begin your deep dive.

The `archive`, `notebook_lm`, `nexus-orchestration`, and `superpowers/specs` directories preserve earlier analysis and plans. They are useful context but never override this five-document path or the source code.
