# Maqaaxi Pos web (Next.js). Build from the REPO ROOT — it is an npm workspace,
# and the single lockfile lives there:
#   docker build -f apps/web/Dockerfile --build-arg API_ORIGIN=http://api:4000 -t maqaaxi-web .
#   docker run -e PORT=3100 -p 3100:3100 maqaaxi-web
# The web app holds NO secrets: it never imports Prisma and never reads
# DATABASE_URL or JWT_SECRET. Its only config is API_ORIGIN.

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
# The API package's postinstall runs `prisma generate`; copy what it needs so
# the install can never fail on a missing schema, even though only apps/web is
# being installed here.
COPY apps/api/prisma.config.ts apps/api/
COPY apps/api/prisma apps/api/prisma
# The npm cache survives between builds (a flaky network resumes instead of
# starting over); retries ride out dropped connections to the registry.
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --workspace apps/web --include-workspace-root --prefer-offline \
      --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000

FROM deps AS build
# next.config.mjs bakes the /api rewrite destination at BUILD time and throws
# when it is empty in production — so this is an ARG, not just runtime env.
# http://api:4000 is the compose service name: in production nginx routes /api
# straight to the API, and this rewrite is only the backstop.
ARG API_ORIGIN=http://api:4000
ENV API_ORIGIN=$API_ORIGIN NODE_ENV=production
COPY apps/web/ apps/web/
RUN npm run build --workspace apps/web

FROM base AS runtime
ENV NODE_ENV=production PORT=3100 HOSTNAME=0.0.0.0
# `output: 'standalone'` traces from the repo root (outputFileTracingRoot), so
# the bundle mirrors the workspace: server.js under apps/web, node_modules at
# the root. Static assets and public/ are NOT included — copy them separately.
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3100)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
