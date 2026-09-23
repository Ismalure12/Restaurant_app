# Maqaaxi Pos API. Build from the REPO ROOT — it is an npm workspace, and the
# single lockfile lives there:
#   docker build -f apps/api/Dockerfile -t maqaaxi-api .
#   docker run --env-file apps/api/.env.docker -p 4000:4000 maqaaxi-api
# Migrations run from this package too (`npm run db:deploy`), never on boot.

FROM node:22-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# postinstall runs `prisma generate`, which needs the schema and config.
COPY apps/api/prisma.config.ts apps/api/
COPY apps/api/prisma apps/api/prisma
RUN npm ci --workspace apps/api --include-workspace-root

FROM deps AS build
COPY apps/api/tsconfig.json apps/api/tsconfig.build.json apps/api/
COPY apps/api/src apps/api/src
RUN npm run build --workspace apps/api

FROM base AS runtime
ENV NODE_ENV=production PORT=4000
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/prisma ./apps/api/prisma
COPY --from=build --chown=node:node /app/apps/api/prisma.config.ts ./apps/api/prisma.config.ts
# The API's own package.json carries "type": "module"; node reads the nearest one.
WORKDIR /app/apps/api
USER node
EXPOSE 4000
# GET /api/health is public and does not touch the database, so polling it is
# free. node:22-bookworm-slim has no curl, hence node's own fetch.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# SIGTERM drains in-flight requests before exit — give it time:
#   docker stop -t 130 <container>
CMD ["node", "dist/index.js"]
