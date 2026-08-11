# Septimus OS - Frontend, UI/UX, and Visuals (NotebookLM Source)

This document is compiled for NotebookLM to understand the visual logic, user experience, and design strictness of Septimus OS.

## 1. Bilingual Parity (RTL / LTR)
The frontend is built in Next.js 15 and Tailwind CSS. It is fully bilingual.
- **Rule**: No hardcoded strings. Everything uses `ar.json` and `en.json` dictionaries.
- **Rule**: Use logical directions (`start-0`, `pe-4`) instead of physical (`left-0`, `pr-4`) so layouts automatically mirror for Arabic (Right-To-Left).

## 2. Centralized Brand Theme (`useThemeStore.ts`)
The appearance of the workspace (Company Name, Logo, Brand Color) is stored centrally using Zustand. Changing the theme dynamically updates the entire application without a reload.

### Image Compression Rule
Logos uploaded in the Settings Modal are strictly intercepted and compressed programmatically (`image/webp`, max 320x320) before being stored in `localStorage` to prevent quota errors.

## 3. Visual Walkthrough (Screenshots)

Below are the live screenshots of the system to provide visual context:

### A. The Main Dashboard
The liquid dashboard where users land after logging in.
![Main Dashboard](/Users/hamzwe/.gemini/antigravity-ide/brain/79d6f8c8-e45d-433b-9f1f-9588982d2256/dashboard_1784589272671.png)

### B. Admin Center
The central hub for managing workspace settings, SaaS billing, and users.
![Admin Center](/Users/hamzwe/.gemini/antigravity-ide/brain/79d6f8c8-e45d-433b-9f1f-9588982d2256/admin_center_1784589329864.png)

### C. Audit Logs
A clean, consolidated table for tracing all system events (login, entity creation, errors). Note that "Activity Logs" and "Audit Logs" share the same interface logic to avoid clutter.
![Audit Logs](/Users/hamzwe/.gemini/antigravity-ide/brain/79d6f8c8-e45d-433b-9f1f-9588982d2256/audit_logs_1784589359612.png)

### D. Settings Modal
The unified overlay where Workspace Admins define their dynamic brand colors and upload the auto-compressing logo.
![Settings Modal](/Users/hamzwe/.gemini/antigravity-ide/brain/79d6f8c8-e45d-433b-9f1f-9588982d2256/settings_modal_1784589378866.png)
