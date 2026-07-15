# Septimus OS - SME Business Modules Suite Design Specification

**Date:** 2026-07-05
**Status:** Proposed / Pending Approval
**Target Audience:** Small & Medium Enterprises (SMEs)

## 1. Executive Summary

This design specification outlines the architectural upgrade and feature expansion for the three core Business Modules in Septimus OS: **CRM (`/crm`)**, **HR & ERP (`/hr`)**, and **Finance (`/finance`)**.
Building on the successful implementation of the **SME Smart Invoicing Engine**, this suite interconnects all modules via an event-driven architecture using NATS JetStream and the JSONB Entity Pattern.

---

## 2. Architectural Pillars & Constraints

1. **JSONB Entity Pattern (`models/models.go`)**:
   - All domain objects (`crm_deal`, `crm_quote`, `hr_employee`, `hr_payroll`, `finance_expense`) are stored as rows in the `entities` PostgreSQL table with payload data inside `data (JSONB)`.
   - This ensures zero SQL schema migrations while allowing rich, flexible business properties.
2. **Go/Python Responsibility Split**:
   - **Golang (`/backend-core`)**: Sole authority for database mutations, REST/HTTP APIs, and NATS event emission.
   - **Python (`/ai-agents`)**: LangGraph asynchronous sidecar. Listens to NATS events (e.g., receipt image upload, lead scoring request) and emits AI proposal payloads back to NATS. NEVER connects directly to PostgreSQL.
3. **Frontend Implementation Standards (`/frontend`)**:
   - Built with Next.js 15 App Router, Tailwind CSS v4, shadcn/ui, and Zustand.
   - Strict TypeScript adherence (zero `any` types).
   - Mandatory accessibility: all interactive elements must define `aria-label` or `title`.
   - Dark/Light theme support via `useThemeStore` and `@variant dark`.
4. **Docker Rebuild Rule**:
   - After any frontend or backend code modification, `docker compose up -d --build <service>` must be executed to propagate changes.

---

## 3. Module Specifications

### 3.1 CRM Module (`/crm`)

- **Deals Kanban Pipeline (`DealsPipelineView.tsx`)**:
  - Interactive drag-and-drop board (using `@hello-pangea/dnd` or HTML5 drag-drop) representing sales stages: `Lead`, `Contacted`, `Proposal/Quote`, `Negotiation`, `Closed Won`, `Closed Lost`.
  - Automatic calculation of stage value and weighted pipeline forecasting.
- **Quotation Generator (`AddQuoteModal.tsx`)**:
  - Generates formal quotation documents formatted similarly to ZATCA tax invoices.
  - **Quote-to-Invoice Bridge**: Includes a 1-click action that maps quotation line items and client data directly into a new `finance_invoice` entity.
- **LangGraph Sales Copilot**:
  - Analyzes communication logs stored in JSONB, suggests automated email/WhatsApp replies, and calculates lead priority scores.

### 3.2 HR & ERP Module (`/hr`)

- **Employee 360 & Compliance (`Employee360Modal.tsx`)**:
  - Manages contracts, salaries, IBANs, and critical Saudi SME compliance alerts (National ID / Iqama / Medical Insurance expiration dates).
- **Smart Geofenced Attendance (`AttendanceView.tsx`)**:
  - Enhances existing Leaflet/Haversine GPS check-in with dynamic Office QR Code scanning for desk check-ins and remote work logging.
- **Payroll & WPS Automator (`PayrollView.tsx`)**:
  - Aggregates base salary, allowances, overtime, and attendance deductions.
  - Exports Wage Protection System (WPS) bank files and includes a 1-click **"Post to Finance Expenses"** action that creates a corresponding `finance_expense` entity.
- **HR Compliance Copilot**:
  - Automates leave request validation against PTO balances and labor laws via chat.

### 3.3 Finance Module (`/finance`)

- **SME Smart Invoicing Engine (Completed)**:
  - ZATCA QR code generation, real-time VAT 15% calculation, and professional print/PDF layouts (`print:hidden`).
- **AI Receipt OCR & Expense Tracker (`AddExpenseModal.tsx`)**:
  - Allows receipt/invoice photo uploads. Python LangGraph Vision sidecar extracts vendor name, VAT ID, date, and amount, populating an expense entity.
- **VAT 15% Tax Return Engine (`VATReturnView.tsx`)**:
  - Automatically calculates Net VAT Payable:
    $$\text{Net VAT Payable} = \sum \text{Output VAT (Invoices)} - \sum \text{Input VAT (Expenses)}$$
- **Financial KPI Dashboard**:
  - Real-time visualization of cash flow, burn rate, and accounts receivable aging.

---

## 4. Cross-Module Workflows (Smart Business Bridge)

1. **Quote-to-Cash Flow**:
   `CRM Lead` -> `CRM Deal` -> `CRM Quotation` -> (1-Click Convert) -> `Finance Tax Invoice` -> `ZATCA QR Print / PDF`.
2. **Attendance-to-Payroll Flow**:
   `GPS/QR Check-in` -> `Attendance Log` -> `Monthly Payroll Calculation` -> `WPS File Export` -> (1-Click Post) -> `Finance Expense Record`.

---

## 5. Verification Plan

1. **TypeScript & Linting**: Execute `npx tsc --noEmit` and `npm run lint` in `/frontend` to verify strict type safety.
2. **Docker Deployment**: Rebuild containers via `docker compose up -d --build frontend backend-core`.
3. **Manual UI/UX Validation**: Test Quote-to-Invoice conversion, real-time VAT calculation, and Kanban drag-and-drop interactions in browser.
