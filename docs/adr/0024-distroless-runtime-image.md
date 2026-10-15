# ADR-0024: Distroless runtime image

- **Status:** Accepted
- **Date:** 2026-10-07
- **Author:** @claude-code
- **Related:** PROJECT_SPEC §52, §76–77; P14-01; D-08 (base image), KI-4

## Context

The image was 425 MB. The parts were: Debian slim (85 MB), Node.js (154 MB), npm/yarn/corepack
(~25 MB, unused at runtime) and production dependencies (66 MB). Of those dependencies, 27 MB
were better-sqlite3 C sources and prebuilt binaries for eight platforms. The image also had a
shell and a package manager, although the server never starts other processes.

## Decision

- Build stage: `node:24-bookworm-slim` (unchanged). Runtime: `gcr.io/distroless/nodejs24-debian12:nonroot`,
  which contains Node.js and Debian 12 glibc, and has no shell and no package manager. The build
  and runtime images use the same glibc family, so the native module built or downloaded in the
  build stage runs unchanged.
- After `pnpm deploy`, the build stage removes better-sqlite3's `deps/` and `src/` folders and every
  prebuilt binary except `linux-<arch>` of the build platform. It also removes dependency type
  definitions, source maps and Markdown files. A build step then opens an in-memory database, so
  a broken native module fails the build.
- The container runs as UID/GID 1000, as before (the `node` user of the old image), so existing
  data volumes stay writable. `/data/content` and `/data/system` are created in the build stage
  and copied with that owner, because the runtime has no shell for `mkdir`/`chown`.
- The healthcheck and command use exec form (`/nodejs/bin/node`). Node runs as PID 1. The server
  already handles SIGTERM/SIGINT (clean shutdown in well under a second). Source maps of the
  server bundle are kept and enabled, so logged stack traces stay readable.
- Dependency layers are cached: `pnpm fetch` runs from the lockfile before the sources are
  copied.
- CI starts the built image and waits for `/api/v1/health`.

## Alternatives considered

- **Keep Debian slim and only remove npm/yarn/corepack and the SQLite sources:** about 375 MB. It
  keeps a shell and apt, which are useful to an attacker and not needed by the app.
- **`node:24-alpine`:** 241 MB before the app, and npm/yarn are included. musl needs a different
  better-sqlite3 binary than the glibc build stage, and Alpine is an experimental platform for
  Node.js.

## Consequences

- The image is 252 MB instead of 425 MB, and there are fewer packages to patch.
- There is no shell inside the container, so `docker exec … sh` does not work. Inspect data on
  the host (the `/data` volume), read logs with `docker logs`, or run Node-based checks with
  `docker exec <container> /nodejs/bin/node -e …`. For deeper debugging, build with the
  `:debug-nonroot` tag of the same base image, which includes busybox.
- The distroless Node.js patch version follows Google's image, not the `node:24` tag. Both are
  Node 24 (≥ 24.7, required by `engines`). Release builds should pin the base images by digest
  (P14-07).
- Multi-architecture builds (amd64/arm64) work, because each platform's build stage keeps its own
  `linux-<arch>` binary.

## Amendment (2026-10-15): Node.js 26 and Debian 13

Owner decision before the next stable release: the runtime moves to **Node.js 26** (LTS from 2026-10-28, supported until 2029-04-30; Node.js 24 enters maintenance on 2026-10-20). Distroless publishes Node.js 26 only on Debian 13, so both stages move together to keep the same glibc: build `node:26-trixie-slim`, runtime `gcr.io/distroless/nodejs26-debian13:nonroot`, both pinned by digest. Node.js 25+ no longer bundles corepack, so the build stage installs the pinned `corepack@0.36.0` from npm before `corepack enable`; CI and the release workflow do the same. better-sqlite3 uses Node-API prebuilds, which load unchanged on Node.js 26. Existing `/data` volumes need no change (UID/GID 1000, same SQLite file format); the upgrade check from `dev0.1.4` verifies this. The image grows from 256 MB to 296 MB; the whole difference is the larger distroless base (243 MB instead of 203 MB), the application layers are unchanged.
