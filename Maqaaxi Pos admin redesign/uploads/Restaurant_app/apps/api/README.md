# Maqaaxi Pos API (Express + TypeScript)

This is the application's API. It replaced the old Next.js route handlers (`src/app/api`, now deleted; see git history) and kept their paths, methods, status codes, JSON bodies, cookies, auth rules and Zod validation. 

## Layout (layer-based)
```
src/
  index.ts, app.ts   boot (server, reconciler, SSE heartbeat) · Express setup (middleware order)
  config/            env loading
  routes/            URL → controller: one Router per area (auth, public, catalog, users, admin/{sell,money,backOffice,insights}),
                     each path registered with defineRoute (405 + Allow, OPTIONS 204); mounted under /api in routes/index.ts
  controllers/       request handlers per resource (admin/*, catalog/*, …): auth check → Zod → lib → response
  middleware/        request context (503 DB_UNAVAILABLE), rate limits, business-day refresh, orders SSE nudge, 404 + error handler
  validations/       Zod schemas per domain (*.validation.ts)
  lib/               business logic by domain: db, auth, time, orders, payments, money, closing, inventory, reports
  utils/             small HTTP/helpers: readJson, searchParams, errCode, httpError, slugify, stopwatch
  types/             shared HTTP types
```
New endpoint: add the handler to the resource controller, add one `defineRoute` line in its area router (fixed paths before `:param` siblings).

## Run
```bash
# from the repo root (npm workspaces)
npm run dev:api          # :4100 — reads apps/api/.env only
npm test                 # vitest
npm run db:migrate       # schema changes (apps/api/prisma)
```
The API owns the database: `apps/api/prisma/` holds the schema, migrations and seed, and
`apps/api/.env` holds every secret. The web app reaches this API only over HTTP (`/api/*`).

## Checks
| Command | What it proves |
|---|---|
| `npm run typecheck` | strict TS across routes, libs, tests |
| `npm test` | 73 integration tests (supertest; Prisma, Sifalo and Blob are mocked, no DB needed): auth 401/403, cookie attributes, request parsing, checkout repricing, Sifalo client, every payment finalize rule (amount, currency, replayed sid, order_id binding, pending/unreachable, races), accept/decline-refund, settings, public menu, upload rules |

## Deploy (VPS / container)
```bash
docker build -f apps/api/Dockerfile -t maqaaxi-api .      # from the repo root (workspace lockfile)
docker run --env-file api.docker.env -p 4000:4000 maqaaxi-api  # unquoted KEY=value file
docker stop -t 130 <container>                             # lets in-flight requests finish
```
Required env: `DATABASE_URL` (the Docker Postgres from the root `docker-compose.yml`, or a pooled Neon URL), `JWT_SECRET` (the **same** value the Next app uses), `BLOB_READ_WRITE_TOKEN`, `EMAIL_USER`, `EMAIL_APP_PASSWORD`, `SIFALO_API_USER`, `SIFALO_API_KEY`, `PUBLIC_APP_URL`, and optionally `PORT`. The process refuses to start without `JWT_SECRET` or `DATABASE_URL`, and in production also without the Sifalo credentials or `PUBLIC_APP_URL`.

Keep the container on a private network or behind the reverse proxy, and let the browser reach it only through the Next proxy. Sifalo calls time out at 110s (Sifalo asks for up to 120s; staying under keeps any ~120s proxy in front from cutting first).

## Online payments safety net (Sifalo has no webhook)
- `src/lib/payments/paymentReconciler.ts` runs every 60 s **in production** (off in development unless `PAYMENT_RECONCILER=on`; `PAYMENT_RECONCILER=off` disables it anywhere). It asks Sifalo (by our order_id) about every checkout the customer was sent to pay, with backoff 1→2→5→10→30→60 min for 48 h, so a customer who paid and lost signal still gets their order. Every checkout is asked at least once; one older than 48 h that turns out paid is flagged `paid_late` for staff instead of becoming an order unattended.
- Cleanup: never-initiated checkouts after 24 h; "not paid" ones after 48 h. Anything Sifalo reported but we couldn't accept (amount/currency/sid mismatch, `paid_late`) is kept until a manager dismisses it.
- Staff view: Orders › Online payments (`GET /api/admin/online-payments`, `POST …/:id/recheck`, `POST …/:id/dismiss` manager + reason + audit log). Badge: `stuckPayments` in `GET /api/admin/orders/counts`.
- `FIXED_CHARGE_USD` in `src/lib/payments/sifalo.ts` is the temporary test charge — set it to `null` at go-live.

## Live updates (SSE) and nginx
`GET /api/admin/events` streams `event: orders` nudges (no data) to back-office screens; they refetch, and keep a slow poll as fallback. It sends `X-Accel-Buffering: no`; nginx must also not time it out:
```nginx
location /api/admin/events {
  proxy_pass http://api:4000;
  proxy_http_version 1.1;
  proxy_set_header Connection "";
  proxy_buffering off;
  proxy_read_timeout 1h;
}
```
Subscribers live in process memory — correct for one API container.

## Rate limits and the proxy
`/api/checkout` and `/api/payment/initiate`: 30 per 10 min per IP; `/api/payment/status`: 60 per min (`src/middleware/rateLimit.ts`, in memory, per container). Behind nginx set `TRUST_PROXY=1` (the production default) so the real client IP is used; set `TRUST_PROXY=0` if the API is ever exposed directly.

## Database on Lightsail (Docker)
`docker compose --env-file .env.docker up -d postgres` (root `docker-compose.yml`, Postgres 18, 127.0.0.1:5433). One-off copy from Neon: `bash scripts/copy-neon-to-docker.sh` (Neon is only read; it refuses to restore over a non-empty DB and diffs row counts). Then `npm run db:deploy`. Backups: `bash scripts/backup-db.sh` nightly from cron, copied off the box.
