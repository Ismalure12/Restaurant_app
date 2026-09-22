# Maqaaxi Pos — Digital Menu & Restaurant Ops

A resellable digital-menu and restaurant-operations product. Customers scan a QR code,
browse the menu, build a cart, and pay through Sifalo Pay (EVC/ZAAD/Sahal, eDahab, Premier
Wallet, cards). Staff manage the catalog, orders, inventory, finance and a point-of-sale
register from a protected admin dashboard.

## Two apps, one repo (npm workspaces)
| | `apps/web` | `apps/api` |
|---|---|---|
| What | Next.js 16 frontend (customer menu + admin dashboard) | Express 5 + TypeScript API |
| Talks to | the API only, over `/api/*` | Neon Postgres (Prisma 7), Sifalo, Vercel Blob, email |
| Env | `apps/web/.env` — just `API_ORIGIN`, **no secrets** | `apps/api/.env` — database, JWT, Sifalo, Blob, email |
| Port (dev) | 3100 | 4100 |

The web app never touches the database. It calls relative `/api/...` URLs; in development
Next proxies them to `API_ORIGIN`, and in production nginx routes `/api` to the API.

## Getting started
```bash
npm install                                  # installs both workspaces + generates the Prisma client
cp apps/api/.env.example apps/api/.env       # fill in the real values
cp apps/web/.env.example apps/web/.env
npm run dev                                  # API :4100 + web http://localhost:3100
```

## Scripts (run from the root)
| Command | Purpose |
|---------|---------|
| `npm run dev` | Both apps (`dev:web` / `dev:api` for one) |
| `npm run build` | Build both |
| `npm test` | API integration tests (vitest) |
| `npm run typecheck` | API TypeScript check |
| `npm run test:e2e` | Playwright suite (web) |
| `npm run db:migrate` / `db:deploy` / `db:seed` / `db:generate` | Prisma, run in `apps/api` |

> Next 16 removed `next lint`; lint web files with `npx eslint <files>` from `apps/web`.

## Structure
- `apps/web/src/app/` — routes: public menu (`page.jsx`), admin dashboard (`admin/`)
- `apps/web/src/components/`, `hooks/`, `lib/` — UI, client state, fetch helpers, page access rules
- `apps/api/src/routes/` — one module per endpoint (`table.ts` registers them)
- `apps/api/src/lib/` — auth, Zod validations, pricing, Sifalo payments, email
- `apps/api/prisma/` — schema, migrations, seed

**Never commit a `.env`.** Only `apps/api/.env` holds secrets.
