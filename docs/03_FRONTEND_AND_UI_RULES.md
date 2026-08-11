# 03. Frontend and UI Rules

Septimus OS uses Next.js 16, React, and Tailwind CSS. The frontend is extremely strict about localization and branding. **Any AI agent modifying the frontend MUST obey these rules.**

## 1. Absolute Bilingual Parity (RTL / LTR)

Septimus OS is designed for the Middle East and Global markets. It must look perfect in both Arabic (Right-to-Left) and English (Left-to-Right).

- **NO Hardcoded Strings**: You must NEVER write raw text in a `.tsx` file.
  - ❌ *Wrong*: `<div>Welcome to Dashboard</div>`
  - ✅ *Correct*: `<div>{t("dashboard.welcome")}</div>`
- **Synchronized Dictionaries**: Every time you add a key to `frontend/src/locales/ar.json`, you MUST immediately add the exact same key to `frontend/src/locales/en.json`.
- **Logical Tailwind Classes**: Never use physical directions (`left-`, `right-`, `ml-`, `pr-`). Always use logical directions that flip automatically based on the language direction.
  - ❌ *Wrong*: `ml-4` (margin-left), `pl-2`, `left-0`
  - ✅ *Correct*: `ms-4` (margin-start), `ps-2`, `start-0`
- **Flexbox Safety**: When adding text next to icons, always use `shrink-0` on the icon and `truncate` on the text to prevent layout breaking when switching between Arabic and English text lengths.

## 2. Centralized Brand Identity (`useThemeStore.ts`)

The system allows Workspace Admins to customize their SaaS interface (Company Name, Logo, Colors).

- **Single Source of Truth**: All theme data is managed by the Zustand store located at `frontend/src/store/useThemeStore.ts`.
- **Live Updating**: When a user changes the theme in `SettingsModal.tsx`, the app DOES NOT reload. It saves to `localStorage` and broadcasts a global event (`septimus_brand_updated`).
- **Logo Compression**: Browsers limit `localStorage` to ~5MB. You must NEVER save raw, high-res images to local storage. Any logo upload must be intercepted, drawn to an HTML `<canvas>`, resized to max 320x320, and exported as a highly compressed `image/webp` (under 20KB) before saving.
- **TopBar Contrast**: The top navigation bar (`TopBar.tsx`) uses dynamic colors. To ensure icons and text are always visible regardless of the background color the admin chooses, you must use the CSS variable `var(--tb-text)` for all text and icons inside the TopBar.

## 3. UI/UX Philosophy

- **Clean and Uncluttered**: Prefer empty space. Avoid aggressive borders.
- **Consolidated Navigation**: Do not create redundant sidebar links. If a feature conceptually belongs inside another module (e.g., Audit Logs belongs inside the Admin Center), nest it there as a tab, rather than cluttering the main Sidebar.
- **Glassmorphism & Micro-animations**: Use subtle transitions (`transition-all duration-200`) on hover states.

---
**Next Step**: Learn what the team is currently working on by reading 👉 **[04_CURRENT_STATUS_AND_ROADMAP.md](04_CURRENT_STATUS_AND_ROADMAP.md)**
