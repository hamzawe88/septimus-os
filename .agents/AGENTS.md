# Septimus OS Project Rules

## 1. MANDATORY FIRST STEP: Agent Onboarding

**STOP AND READ:**
Before you do ANYTHING else in this project, you MUST read the master onboarding document:
👉 **[docs/00_AGENT_ONBOARDING.md](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/docs/00_AGENT_ONBOARDING.md)**

It contains the architecture overview, the JSONB entity pattern rules, and the strict frontend localization requirements.

## 2. Bilingual Parity & RTL/LTR Symmetry Constitution

- **1:1 Parity**: Every change in the Arabic UI (`ar.json` or components) MUST be immediately matched in the English UI (`en.json`).
- **No Hardcoded Strings**: You are strictly forbidden from writing hardcoded Arabic or English text inside React/TSX components. Always use the `useLocalization()` hook and `t("key")`.
- **RTL/LTR Layout Symmetry**: All layouts and buttons must work perfectly in both directions:
  - Use logical Tailwind classes like `start-0`, `end-0`, `me-2`, and `ms-2` instead of `left` / `right`.
  - Add `shrink-0`, `truncate`, and `gap-2.5` to sidebars and buttons to prevent text overlap when switching languages.

## 3. User Approval Mandate

- **No modifications without prior permission**: Do not make any code changes or architectural shifts before presenting a clear `implementation_plan.md` and getting explicit approval from the user.

## 4. Brand & Theme Architecture

- **Single Source of Truth**: The theme (Company Name, Logo, Colors, Fonts) is managed exclusively by the Zustand store in `frontend/src/store/useThemeStore.ts`.
- **Live Event Dispatch**: Updating the theme in `SettingsModal.tsx` saves to `localStorage` and dispatches a `septimus_brand_updated` event to update the `TopBar.tsx` instantly without reloading.
- **Image Compression Rule**: Due to `localStorage` limits (~5MB), raw full-size logos MUST NOT be saved. They must pass through the programmatic compression handler (`processAndCompressLogo`) to be converted to `WEBP` (max 320x320, 85% quality).
- **TopBar Contrast Rule**: All buttons and icons in the top header must rely on the contrast variable `color: var(--tb-text, #ffffff)` in `globals.css` to ensure visibility on both dark and light themes.

## 5. Docker Rebuild Rule

**MANDATORY STEP AFTER CODE MODIFICATIONS**:
Whenever you modify frontend (`frontend/src/...`) or backend-core (`backend-core/...`) code, you MUST rebuild the corresponding Docker containers to ensure the user can see the changes.

- Command: `docker-compose up -d --build frontend` (or `backend-core`)
- Verify success via `docker logs`.

## 6. Obsidian Second Brain Usage

- The root workspace is an Obsidian Vault.
- Key architectural documents are located in `septimus-os/docs/`.
- Start with `docs/00_AGENT_ONBOARDING.md` and follow the references from there.
