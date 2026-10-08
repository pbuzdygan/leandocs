# ADR-0004: Monorepo layout and toolchain

- **Status:** Accepted
- **Date:** 2026-10-02
- **Author:** @claude-code
- **Related:** PROJECT_SPEC §55–58, Phase 0

## Context

Phase 0 needs a concrete, boring toolchain that any agent can run without guessing.

## Decision

- **pnpm workspace** (version pinned in `packageManager`, provided via corepack): `apps/server`, `apps/web`, `packages/shared`.
- **Node.js 24 LTS** (`.nvmrc`, `engines`). Everything is ESM (`"type": "module"`).
- **TypeScript** strict, with a shared `tsconfig.base.json`. `packages/shared` is consumed as TypeScript source through workspace `exports`: Vite and Vitest compile it directly, and the server build bundles it.
- **Server:** Fastify 5, run in dev with `tsx watch` and bundled for production with `tsup` into `apps/server/dist`. In production the server also serves the built web app (`apps/web/dist`) as static files, so there is one container and one port.
- **Web:** React + Vite. Plain CSS with design tokens (`src/styles/tokens.css`) per UI_SPEC. No component library has been adopted yet; adding one needs an ADR (done: ADR-0006, Radix headless primitives).
- **Quality:** ESLint (flat config, typescript-eslint, react-hooks), Prettier, Vitest (workspace projects). Playwright is added when the first e2e test is written (Phase 3+).
- **CI:** GitHub Actions running install → lint → typecheck → test → build.

## Alternatives considered

- **npm/yarn workspaces.** The spec chose pnpm.
- **Building `packages/shared` to `dist` with project references.** Rejected for now as extra build steps with no benefit at this size.
- **Jest.** Vitest shares the Vite config and is faster with ESM.

## Consequences

- `pnpm dev` runs both apps. The Vite dev server proxies `/api` to the Fastify server.
- When the shared Markdown parser lands (Phase 4), it must stay runtime-agnostic (browser + Node).
