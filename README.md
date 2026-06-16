# Hotel Jazeera — Digital Menu & Restaurant Ops

A digital menu and restaurant-operations app for Hotel Jazeera. Customers scan a QR
code, browse the menu, build a cart, and pay via Waafi/EVC; staff manage the catalog,
orders, inventory, finance, and a point-of-sale register through a protected admin
dashboard.

## Stack
- **Next.js 14** (App Router) · **JavaScript/JSX** (no TypeScript)
- **Tailwind CSS** (public menu + admin dashboard)
- **Neon Postgres** + **Prisma ORM**
- **Vercel** (hosting + Blob storage for images)
- **Waafi/EVC** payment gateway

## Getting started
```bash
npm install
cp .env.example .env   # then fill in real values
npx prisma generate
npm run dev            # http://localhost:3000
```

## Scripts
| Command | Purpose |
|---------|---------|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run lint` | Lint (see note below) |

> Next 16 removed `next lint`; lint changed files directly with `npx eslint <files>`.

## Seeding
```bash
# Catalog (categories, items, options, extras, tags, banners)
source <(grep -v '^#' .env | sed 's/^/export /') && node prisma/seed-royal.js

# Staff logins (admin/manager/cashier)
node scripts/seed-staff.mjs
```

## Structure (high level)
- `src/app/` — routes: public menu (`page.jsx`), admin dashboard (`admin/`), API (`api/`)
- `src/components/` — UI: `ui/` primitives, `menu/` customer menu, `admin/` dashboard
- `src/hooks/` — client state/interaction hooks
- `src/lib/` — services & utils (Prisma, auth, Zod validations, Waafi, email, slug)
- `src/styles/` — global styles + design tokens (`tailwind.config.js`)
- `prisma/` — schema + seed scripts

## Environment variables
See `.env.example` for the full list. **Never commit `.env`** — it holds database,
JWT, payment, and email secrets.
