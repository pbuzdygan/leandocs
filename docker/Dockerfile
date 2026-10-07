# syntax=docker/dockerfile:1
# LeanDocs — single-container image (PROJECT_SPEC §76–77, ADR-0024).
# Build from the repository root:  docker build -f docker/Dockerfile -t leandocs .

# ---- build: install, compile and assemble a production server folder -------------------------
FROM node:24-bookworm-slim AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo
# Dependencies first, so source changes reuse the cached download layer.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
# Local fixes to dependencies (pnpm patchedDependencies), applied on install.
COPY patches ./patches
RUN pnpm fetch
COPY . .
RUN pnpm install --frozen-lockfile --offline
# Version the image reports (health, logs, Settings › About); the release workflow sets it, e.g.
# `1.2.0` or `dev1.2.0` (the release workflow passes the release tag). Empty: the root package.json version.
ARG LEANDOCS_VERSION=
RUN pnpm build
# Self-contained production install of the server (workspace deps resolved).
RUN pnpm --filter @leandocs/server deploy --prod --legacy /out/server
# better-sqlite3 ships C sources and binaries for every platform; keep only this image's
# binary (the runtime has the same glibc). Type definitions, source maps and docs of
# dependencies are not used at runtime.
RUN set -eu; \
    sqlite="$(echo /out/server/node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3)"; \
    arch="$(node -p process.arch)"; \
    test -f "$sqlite/prebuilds/linux-$arch.node"; \
    rm -rf "$sqlite/deps" "$sqlite/src" "$sqlite/binding.gyp"; \
    find "$sqlite/prebuilds" -type f ! -name "linux-$arch.node" -delete; \
    find /out/server/node_modules -type f \( -name '*.d.ts' -o -name '*.d.mts' -o -name '*.d.cts' \
      -o -name '*.map' -o -name '*.md' -o -name '*.markdown' \) -delete; \
    cp -r /repo/apps/server/dist /out/server/dist; \
    rm -rf /out/server/src /out/server/tsconfig*.json /out/server/tsup.config.* /out/server/vitest.config.*; \
    mkdir -p /out/data/content /out/data/system
# Fail the build if the trimmed native module cannot be loaded.
RUN cd /out/server && node -e "new (require('better-sqlite3'))(':memory:').prepare('select 1').get()"

# ---- runtime: Node.js only — no shell, no package manager ---------------------------------------
FROM gcr.io/distroless/nodejs24-debian12:nonroot AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    DATA_DIR=/data \
    WEB_DIST_DIR=/app/web
WORKDIR /app/server
COPY --from=build /out/server ./
COPY --from=build /repo/apps/web/dist /app/web
# UID/GID 1000 as in earlier images, so existing data volumes stay writable.
COPY --from=build --chown=1000:1000 /out/data /data
USER 1000:1000
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
# The image's entrypoint is node. Source maps keep server stack traces readable in logs.
CMD ["--enable-source-maps", "dist/main.js"]
