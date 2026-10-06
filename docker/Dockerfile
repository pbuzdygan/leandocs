# LeanDocs — single-container image (PROJECT_SPEC §76–77).
# Build from the repository root:  docker build -f docker/Dockerfile -t leandocs .

FROM node:24-bookworm-slim AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build
# Self-contained production install of the server (workspace deps resolved).
RUN pnpm --filter @leandocs/server deploy --prod --legacy /out/server

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    DATA_DIR=/data \
    WEB_DIST_DIR=/app/web
WORKDIR /app/server
COPY --from=build /out/server/node_modules ./node_modules
COPY --from=build /out/server/package.json ./package.json
COPY --from=build /repo/apps/server/dist ./dist
COPY --from=build /repo/apps/web/dist /app/web
RUN mkdir -p /data/content /data/system && chown -R node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
