# CRM Module Upgrade & Quote-to-Invoice Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Septimus OS CRM module (`/crm`) into a state-of-the-art SME Sales Suite featuring a 6-stage Kanban board with revenue forecasting, an instant Quotation Generator, a 1-click Quote-to-Invoice Bridge (connecting CRM to Finance), and an AI Sales Copilot assistant.

**Architecture:** Built using Next.js 15 App Router, Tailwind CSS v4, shadcn/ui principles, and Zustand. All domain data (`crm_lead`, `crm_quote`, `finance_invoice`) adheres strictly to the JSONB Entity Pattern via Golang Fiber backend (`POST/PUT /api/v1/entities`). Zero database schema changes are required.

**Tech Stack:** Next.js 15, TypeScript (strict, zero `any`), Tailwind CSS v4, `@hello-pangea/dnd` (Kanban drag & drop), Lucide React icons, Docker Compose.

---

## Task Structure

### Task 1: Kanban Pipeline Enhancement & Revenue Forecasting Widget

**Files:**

- Modify: `/Users/hamzwe/Desktop/LPC-BRAIN CORE/septimus-os/frontend/src/components/plugins/CRMLeadsView.tsx`

- [ ] **Step 1: Write the updated Kanban columns and forecasting math**
  - In `CRMLeadsView.tsx`, expand `COLUMNS` array to include 6 stages:

    ```typescript
    const COLUMNS = [
      { id: "new", title: "New Lead 🆕", probability: 0.1 },
      { id: "contacted", title: "Contacted 📞", probability: 0.3 },
      { id: "quote_sent", title: "Quote Sent 📑", probability: 0.6 },
      { id: "negotiation", title: "Negotiating 🤝", probability: 0.8 },
      { id: "closed_won", title: "Closed Won 🎉", probability: 1.0 },
      { id: "closed_lost", title: "Closed Lost ❌", probability: 0.0 },
    ];
    ```

  - Add a **Pipeline Forecasting Summary Bar** above the search box:
    - Total Leads Count.
    - Total Pipeline Value ($) across all active leads.
    - Weighted Expected Revenue ($) calculated as: `sum(lead.value * stage.probability)`.
    - Win Rate % calculated as: `Closed Won / (Closed Won + Closed Lost) * 100`.
  - Add an **"Add Quote 📑"** action button on each lead card in the Kanban board.

- [ ] **Step 2: Run TypeScript check to verify type safety**
  Run: `npx tsc --noEmit` in `/Users/hamzwe/Desktop/LPC-BRAIN CORE/septimus-os/frontend`
  Expected: PASS (zero type errors, zero `any` types).

- [ ] **Step 3: Rebuild Docker container to deploy changes**
  Run: `docker compose up -d --build frontend` in `/Users/hamzwe/Desktop/LPC-BRAIN CORE/septimus-os`
  Expected: Container `septimus-os-frontend-1` recreated and started successfully.

- [ ] **Step 4: Commit changes**
  Run: `git add frontend/src/components/plugins/CRMLeadsView.tsx && git commit -m "feat(crm): expand kanban stages to 6 columns and add weighted revenue forecasting widget"`

---

### Task 2: Quotation Generator Modal & Quote-to-Invoice Bridge

**Files:**

- Create: `/Users/hamzwe/Desktop/LPC-BRAIN CORE/septimus-os/frontend/src/components/plugins/AddQuoteModal.tsx`
- Modify: `/Users/hamzwe/Desktop/LPC-BRAIN CORE/septimus-os/frontend/src/components/plugins/CRMLeadsView.tsx`
- Modify: `/Users/hamzwe/Desktop/LPC-BRAIN CORE/septimus-os/frontend/src/components/plugins/LeadDetailsModal.tsx`

- [ ] **Step 1: Create `AddQuoteModal.tsx` with Quote-to-Invoice Bridge**
  - Create `/Users/hamzwe/Desktop/LPC-BRAIN CORE/septimus-os/frontend/src/components/plugins/AddQuoteModal.tsx`.
  - Props: `lead?: LeadEntity | null; onClose: () => void; onSuccess: () => void;`.
  - Form Fields: Client Company Name, Contact Person, Email, Phone, Quotation Number (auto-generated e.g., `QT-2026-XXXX`), Issue Date, Valid Until Date.
  - Line Items Table: Description, Quantity, Unit Price, VAT 15%, Discount ($), calculating row total, subtotal, total VAT amount, and Net Total payable.
  - **Save Quote Action**: Sends `POST /api/v1/entities` with `type: "crm_quote"` and `data: { ...quoteData }`.
  - **Quote-to-Invoice Bridge Button**: **"🚀 Convert to Tax Invoice (ZATCA)"**!
    - When clicked, calls `POST /api/v1/entities` with `type: "finance_invoice"` and payload data matching the structure required by our Finance Invoicing Engine (`clientName`, `clientCompany`, `invoiceNumber: QT-XXXX-INV`, `items`, `subtotal`, `vatTotal`, `totalAmount`, `status: "issued"`).
    - Automatically updates the lead status to `closed_won`.
    - Shows success alert: `"🎉 Quotation converted to ZATCA Tax Invoice successfully! Available in Finance module."`

- [ ] **Step 2: Integrate `AddQuoteModal` into `CRMLeadsView` and `LeadDetailsModal`**
  - In `CRMLeadsView.tsx`: Add state `isAddQuoteOpen: boolean` and `quoteLeadTarget: LeadEntity | null`. Connect the "Add Quote 📑" card button to open this modal.
  - In `LeadDetailsModal.tsx`: Add a **"Create Quotation 📝"** button in the modal header/footer that triggers the quote generator for that lead.

- [ ] **Step 3: Run TypeScript check and ESLint**
  Run: `npx tsc --noEmit && npm run lint` in `/Users/hamzwe/Desktop/LPC-BRAIN CORE/septimus-os/frontend`
  Expected: PASS without warnings or errors.

- [ ] **Step 4: Rebuild Docker container**
  Run: `docker compose up -d --build frontend` in `/Users/hamzwe/Desktop/LPC-BRAIN CORE/septimus-os`
  Expected: Successfully compiled and container restarted.

- [ ] **Step 5: Commit changes**
  Run: `git add frontend/src/components/plugins/AddQuoteModal.tsx frontend/src/components/plugins/CRMLeadsView.tsx frontend/src/components/plugins/LeadDetailsModal.tsx && git commit -m "feat(crm): add quotation generator modal and 1-click quote-to-invoice zatca bridge"`

---

### Task 3: LangGraph AI Sales Copilot Assistant UI

**Files:**

- Modify: `/Users/hamzwe/Desktop/LPC-BRAIN CORE/septimus-os/frontend/src/components/plugins/LeadDetailsModal.tsx`

- [ ] **Step 1: Implement AI Sales Copilot tab/section in `LeadDetailsModal.tsx`**
  - Add an interactive section or tab: **"AI Sales Copilot 🤖"**.
  - Calculate or fetch real-time AI insights based on the lead's status, estimated value, and communication notes:
    - **Lead Priority Badge**:
      - 🔥 High Priority ($10,000+ or status `negotiation` / `quote_sent`).
      - ⚡ Medium Priority ($1,000 - $10,000 or status `contacted`).
      - ❄️ Low Priority (<$1,000 or status `new`).
    - **Smart Recommendation Box**: Suggests next actionable sales steps (e.g., "Send formal quotation with 5% closing discount before end of week", "Follow up via WhatsApp Business").
    - **One-Click Draft WhatsApp & Email Replies**: Generates bilingual (Arabic/English) professional sales follow-up messages ready to copy or launch directly via `https://wa.me/{phone}?text={encodedMessage}`!

- [ ] **Step 2: Run TypeScript check and ESLint**
  Run: `npx tsc --noEmit && npm run lint` in `/Users/hamzwe/Desktop/LPC-BRAIN CORE/septimus-os/frontend`
  Expected: PASS.

- [ ] **Step 3: Rebuild Docker container**
  Run: `docker compose up -d --build frontend` in `/Users/hamzwe/Desktop/LPC-BRAIN CORE/septimus-os`
  Expected: Successfully rebuilt and deployed.

- [ ] **Step 4: Commit changes**
  Run: `git add frontend/src/components/plugins/LeadDetailsModal.tsx && git commit -m "feat(crm): implement ai sales copilot assistant with lead priority scoring and whatsapp bilingual reply generator"`

---

## Verification Plan

### Automated Verification

- `npx tsc --noEmit` in `/frontend` to verify 100% type safety without `any`.
- `npm run lint` in `/frontend` to ensure ESLint compliance.
- `docker compose up -d --build frontend` to verify successful production bundle compilation.

### Manual Verification

1. Open browser to `http://localhost:3000/crm`.
2. Verify the 6-stage Kanban board is visible with the new **Pipeline Forecasting Summary Bar** showing real-time weighted revenue calculations.
3. Drag a lead from `New Lead` to `Quote Sent` or `Negotiating` and observe the weighted expected revenue update dynamically.
4. Click **"Add Quote 📑"** on any lead card; verify `AddQuoteModal` opens with pre-filled client details.
5. Add 2 line items with VAT 15%, click **"🚀 Convert to Tax Invoice (ZATCA)"**, and verify the success notification.
6. Open `/finance` and verify the newly generated invoice appears in the Invoices Table with ZATCA QR code support!
7. Open any lead card in `LeadDetailsModal` and test the **"AI Sales Copilot 🤖"** WhatsApp reply generator.
