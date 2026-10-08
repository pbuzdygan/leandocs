# ADR-0006: Radix UI as headless primitives for the web app

- **Status:** Accepted
- **Date:** 2026-10-02
- **Author:** @claude-code
- **Related:** UI_SPEC §118–123, §97 (accessibility), ADR-0004, task P3-06

## Context

Phase 3 needs dialogs, dropdown menus, context menus, toasts and tooltips. These must be accessible (focus trapping, focus return, keyboard navigation, ARIA roles, screen reader announcements: UI_SPEC §97, WCAG AA). Writing them by hand is a large and error-prone job. ADR-0004 says that adopting a component library needs an ADR.

## Decision

- Use **Radix UI primitives** (the `radix-ui` package): Dialog, DropdownMenu, ContextMenu, Toast, Tooltip.
- They are **headless and unstyled**. All visual styling stays in our CSS with the design tokens (UI_SPEC §5, §142), and Technical Minimal is not affected.
- They are wrapped once in `apps/web/src/components/ui/*` (`Dialog`, `DropdownMenuButton`, `ContextMenuArea`, `ToastProvider`, `IconButton`). Feature code uses these wrappers, never Radix directly (UI_SPEC §164).
- Icons came from **lucide-react** (UI_SPEC §13); superseded by Tabler Icons, see the amendment below. Fonts are self-hosted via `@fontsource-variable/*` (PROJECT_SPEC §53).
- Routing uses **react-router** (declarative mode). Server state uses **@tanstack/react-query** (UI_SPEC §141).

## Alternatives considered

- **Hand-written primitives.** Rejected: high a11y risk and a lot of code without product value.
- **A styled component library** (MUI, Mantine, shadcn copy-paste). Rejected: it imposes its own visual language (UI_SPEC §1 forbids Material etc.) or brings Tailwind, which is not in our stack.
- **Headless UI / Ariakit.** These are similar options. Radix has the widest primitive coverage (ContextMenu, Toast) in one package.

## Consequences

- The dependency surface is a single package with tree-shaken imports.
- jsdom tests need small stubs (ResizeObserver, pointer capture), which live in `apps/web/src/test/setup.ts`.
- Radix duplicates toast text into a visually hidden live region. Tests must use exact text matching.

## Amendment (2026-10-02, owner decision, recorded by @claude-code)

Icons come from **Tabler Icons** (`@tabler/icons-react`, MIT, pinned), the owner's final choice after comparing sets side by side; lucide-react (and a short Hugeicons trial) were removed. All icons go through the named components in `apps/web/src/components/icons.tsx` (decorative by default, Tabler's default stroke 2), so the library is referenced in one file only (D-43, UI_SPEC §13).
