# Septimus OS Design-System Implementation Plan

## Status and authority

This plan implements the approved **Diwan / Institutional Calm** direction.
It is subordinate to `00_AGENT_ONBOARDING.md` through
`05_OPERATIONS_AND_RECOVERY.md` and does not change backend contracts.

## Product decisions

- Identity: sovereign warm neutrals with an institutional indigo accent.
- Market: Arabic-first typography with complete Arabic/English parity.
- Density: operational density with explicit hierarchy and generous reading
  surfaces.
- Meetings: the meeting is treated as a document; outcomes and provenance
  lead, video supports.
- Review surface: an authenticated internal design-system gallery before
  introducing Storybook.

## Delivery sequence

### A. Foundation

1. Define one semantic token contract for color, type, spacing, radius,
   elevation, motion, and focus.
2. Make every theme color application content surfaces as well as navigation.
3. Add design-constitution checks to CI and local lint.
4. Preserve existing compatibility variables while features migrate.

Acceptance:

- At most twelve authored hexadecimal colors in the controlled palette.
- Exactly two surface radii and two elevation levels.
- Six type sizes and three supported weights.
- Arabic text uses a calibrated line height and no tracking.
- A theme switch visibly changes navigation, canvas, surfaces, text, and
  borders.

### B. Primitives

Build reusable surfaces, panels, separators, empty states, skeletons, status
tags, alerts, progress, statistics, form fields, switches, and pagination on
the semantic contract. Existing primitives are migrated to the same contract.

Acceptance:

- New feature surfaces are composed from primitives.
- Every primitive supports RTL/LTR, keyboard focus, dark mode, and disabled
  states where applicable.
- The internal gallery presents both languages and all themes.

### C. Application shell

Migrate the top bar, sidebar, administration layout, menus, search, and status
surfaces away from raw slate/gray colors and physical positioning.

Acceptance:

- The Diwan identity is visible on first paint.
- Top-bar contrast is driven by `--tb-text`.
- Shell additions contain no physical directional utility or hard-coded user
  text.

### D. Feature migration

Migrate in this order: dashboard, chat, projects, CRM/finance, meetings,
correspondence, schema studio, AI surfaces, then long-tail administration.
Large components must be split before visual migration.

### E. Provenance and completion

Introduce a common AI provenance primitive for verified, recalled, assumed,
and speculative content. Complete the remaining localization and logical-RTL
debt, then add visual regression coverage for Arabic/English and light/dark.

## Verification

For every delivery:

1. Run ESLint including the design constitution.
2. Run TypeScript without emitting.
3. Build the Next.js production bundle.
4. Run Playwright coverage relevant to the changed surface.
5. Rebuild the frontend container.
6. Verify Compose health, frontend HTTP response, and error logs.

No named volume is deleted during this work.
