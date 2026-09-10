# Maqaaxi Pos

## Stack
Next.js 16 (App Router, Turbopack) · React 19 · JavaScript (JSX, no TypeScript) · Tailwind CSS (public + admin) · Neon Postgres · Prisma ORM · Vercel

## What This Is
Maqaaxi Pos — a **multi-tenant SaaS** digital menu + POS for restaurants on `maqaaxipos.com`. Each restaurant lives on its own subdomain (`demo.maqaaxipos.com`). Customer scans a QR code → browses categories with option groups + extras + tags → builds a cart → checks out via Waafi/EVC payment → sees confirmation. Hierarchy: **SUPERADMIN** (platform owner, `/superadmin`) creates/suspends **MANAGER** accounts → a manager owns 1..n **Restaurants** (each with subdomain + its own encrypted Waafi credentials) and manages them from `/admin/dashboard` with a restaurant switcher (or "All restaurants" combined stats) → managers create **CASHIER**/**WAITER** staff, each pinned to one restaurant.

## Database Schema (Prisma)
- `Restaurant` — the tenant: ownerId (MANAGER), name, `subdomain` (unique, reserved-list checked), logoUrl, brandColor, status (`ACTIVE`/`SUSPENDED`), `waafiCredsEnc` (AES-256-GCM blob `v1.<iv>.<tag>.<ct>`, write-only via API)
- `ActivityLog` — relation-less platform audit trail (actorId, restaurantId?, action, entity, meta)
- `AdminUser` — role enum `SUPERADMIN|MANAGER|CASHIER|WAITER`; staff have `restaurantId`, managers/superadmin null; email globally unique
- Tenant-scoped (all carry required `restaurantId` + index): `Category` (unique `[restaurantId, slug]`), `MenuItem` (restaurantId denormalized for one-hop pricing), `Tag` (`[restaurantId, slug]`), `Banner` (`[restaurantId, service]`), `Customer` (`[restaurantId, phone]`), `PaymentSession`, `Order`, `InventoryItem`, `StockMovement`, `Expense`, `Shift`, `SocialLink` (`[restaurantId, platform]`), `Setting` (`[restaurantId, key]`)
- Parent-scoped (no restaurantId; reached via ownership-checked MenuItem): `OptionGroup`, `ItemOption`, `ItemExtra`, `ItemTag`
- Globally unique on purpose: `Order.reference`, `PaymentSession.reference` (random; Waafi refs can't collide), `AdminUser.email`

## Key Architecture
- **Host routing** (`src/proxy.js` — Next 16 renamed middleware to proxy; must sit in `src/`, same level as `app/`): tenant subdomains rewrite to internal `/r/[subdomain]` (which keys ISR per tenant — ISR caches by pathname, not host); apex serves the landing page + all admin surfaces; `www` → apex; direct `/r/*` hits redirect to the canonical subdomain. Role gates for `/admin/dashboard/*` + `/superadmin/*` also live here.
- **Tenant resolution** (`src/lib/tenant.js`): public APIs → `resolveRestaurantFromHost` (host header, never the body); admin APIs → `requireTenantRole(prisma, request, ROLES)` from `auth.js` (staff pinned to their restaurant; managers ownership-checked via the `x-restaurant-id` header the dashboard sends — `'all'` widens aggregates to every owned restaurant via `resolveTenantScope`). Scoping pattern: every list gets `restaurantId` in where; by-id reads `findFirst({ id, restaurantId })` → 404; writes `updateMany/deleteMany` + count 0 → 404; creates set restaurantId from the resolved tenant, never the body.
- **Per-restaurant Waafi creds**: encrypted with `CREDS_ENCRYPTION_KEY` (`src/lib/crypto.js`); `getWaafiCreds(restaurant)` in `waafi.js` decrypts, env-var fallback is DEV-ONLY; missing creds in prod → 503 `PAYMENTS_NOT_CONFIGURED`. All waafi calls take `creds` as first arg.
- Public menu: `src/app/r/[subdomain]/page.jsx` (server, Prisma, `revalidate=300` + `revalidateTenantMenu` on catalog mutations) → `src/components/menu/MenuApp.jsx` (client, driven by `useMenuController`) which mounts Home, Category, Detail, and Cart screens in a phone shell. `src/app/page.jsx` is the apex landing page.
- Admin fetches: all dashboard pages go through `fetchJson`/`withTenantHeaders` (`src/lib/apiError.js`) which injects `x-restaurant-id` from localStorage (`mx_restaurant`); the switcher lives in `src/app/admin/dashboard/layout.jsx`.
- Superadmin: `/superadmin` pages + `/api/superadmin/*` (`requireSuperadmin`) — platform aggregates only, never tenant order/customer data. Design spec for SaaS surfaces: `designmmmmmmmm.md`.
- Design tokens are in `tailwind.config.js` (colors, fonts, shadows, easings, keyframes). Component classes (`.shell`, `.topbar`, `.banner`, `.show-more`, `.cart-fab`, `.icon-btn`, `.detail-*`, `.cart-*`, etc.) are defined as `@layer components` in `src/styles/globals.css` using `@apply` + raw CSS. Palette: **monochrome maroon** (Goodir brand) — primary `#850D33`, CTA `#A31743`, deep `#6E0B2A`, cream `#FAFAF8`. The `blue`/`green` token names are kept (map to maroon) so existing utility classes still resolve. Fonts: Cormorant Garamond (display) + Inter (UI).
- Admin dashboard: `src/app/admin/dashboard/` — protected by `src/proxy.js` checking JWT cookie + role. Pages: overview, pos, orders, insights, performance, inventory, users, menu-items, categories, settings, restaurants.
- Cart flow: `MenuApp` → "Proceed to checkout" → `/checkout` (themed form) → `/api/checkout` → `/api/payment/initiate` (Waafi/EVC) → `/order-confirmed?ref=...`
- Cart line shape: `{ uid, itemId, name, imageUrl, optionName, extras: [{name, priceAdd}], notes, unitPrice, quantity }`. The legacy `kfg_cart` localStorage key is still written for compatibility with the checkout page.
- API routes: `src/app/api/` — all use Prisma + Zod validation.

## Rules (read BEFORE touching code)
Detailed engineering rules live in `.claude/rules/`. Before starting any task, read the rule file(s) that match the work — they are binding, not suggestions:

| If the task touches… | Read first |
|---|---|
| Any diff review / accepting generated code | `.claude/rules/01-ai-review.md` |
| New endpoints, API shapes, architecture decisions | `.claude/rules/02-system-design.md` |
| Prisma schema, queries, migrations, performance | `.claude/rules/03-database.md` |
| API route logic, validation, errors, checkout/payment | `.claude/rules/04-backend-robustness.md` |
| Auth, admin routes, tokens, secrets, user input rendering | `.claude/rules/05-security.md` |
| Tests, verification, marking work done | `.claude/rules/06-testing.md` |

Always run the `01-ai-review.md` five-question check on every diff before marking a task complete.

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions).
- If something goes sideways, STOP and re-plan immediately — don't keep pushing.
- Use plan mode for verification steps, not just building.
- Write detailed specs upfront to reduce ambiguity.

### 2. Subagent Strategy
- Use subagents liberally to keep the main context window clean.
- Offload research, exploration, and parallel analysis to subagents.
- For complex problems, throw more compute at it via subagents.
- One task per subagent for focused execution.

### 3. Self-Improvement Loop
- After ANY correction from the user: update `.claude/task/lessons.md` with the pattern.
- Write rules for yourself that prevent the same mistake.
- Ruthlessly iterate on these lessons until the mistake rate drops.
- Review lessons at session start for the relevant project.

### 4. Verification Before Done
- Never mark a task complete without proving it works.
- Diff behavior between main and your changes when relevant.
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness.
- Run `npx eslint <changed files>` after each meaningful change. (Next 16 removed the `next lint` subcommand; the `npm run lint` script still points at the old command and fails — use `eslint` directly.)
- **Design-change loop:** After any UI/CSS change, launch the dev server and open the browser to manually test the affected pages. Check for bugs, responsiveness (mobile / tablet / desktop / in-between widths), missing design, and inconsistency. Iterate (fix → retest) until the result is 100% accurate before marking the task done.

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution."
- Skip this for simple, obvious fixes — don't over-engineer.
- Challenge your own work before presenting it.

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding.
- Point at logs, errors, failing tests — then resolve them.
- Zero context switching required from the user.
- Go fix failing CI tests without being told how.

## Task Management
1. **Plan First**: Write plan to `.claude/task/todo.md` with checkable items.
2. **Verify Plan**: Check in before starting implementation.
3. **Track Progress**: Mark items complete as you go.
4. **Explain Changes**: High-level summary at each step.
5. **Document Results**: Add review section to `.claude/task/todo.md`.
6. **Capture Lessons**: Update `.claude/task/lessons.md` after corrections.

## Core Principles
- **Simplicity First** — make every change as simple as possible; impact minimal code.
- **No Laziness** — find root causes; no temporary fixes; senior developer standards.
- **Minimal Impact** — changes should only touch what's necessary; avoid introducing bugs.
- **Mobile-First** — most traffic is phone-scanned QR.

## Key Rules
- Use **Prisma** for all DB queries — never raw SQL, never `$queryRaw`.
- Validate inputs server-side with **Zod** (`src/lib/validations.js`).
- JWT auth in httpOnly cookie, protected by `src/proxy.js` (Next 16 proxy convention — file must live in `src/`, exports default `proxy`).
- **Tenant scoping is law**: no Prisma call on a tenant model without `restaurantId` in the where (or an ownership-checked parent). `restaurantId` never comes from a request body.
- Use `next/image` where possible; the menu's inline `<img>` is intentional (with a placeholder fallback).
- Public menu uses **Tailwind via `@layer components`** in `globals.css` (design tokens in `tailwind.config.js`). Admin pages use **Tailwind utility classes** directly in JSX. Responsiveness lives in `globals.css` `@media` blocks for `≤340px`, `≤380px`, `≥760px` (phone-shell floats), `≥1024px`, and landscape.
- iOS mobile: any `<input>` must have `font-size ≥ 16px` or iOS Safari will zoom in.
- Item totals are calculated from `unitPrice = basePrice + selectedOption.priceAdd + sum(extras.priceAdd)`.

## Seeding
```bash
npx prisma db seed   # seed command lives in prisma.config.ts (Prisma 7), runs prisma/seed.js
```
Creates the superadmin from `SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD` (required). With `SEED_DEMO=1` + `SEED_DEMO_PASSWORD` also seeds a demo tenant at `demo.localhost:3000` (manager@demo.test, cashier@demo.test, waiter@demo.test) with a small menu.

## Environment Variables
```
DATABASE_URL, JWT_SECRET, CREDS_ENCRYPTION_KEY (32-byte base64 master key),
ROOT_DOMAIN (maqaaxipos.com in prod, localhost:3000 in dev),
SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, SEED_DEMO, SEED_DEMO_PASSWORD,
BLOB_READ_WRITE_TOKEN, EMAIL_USER, EMAIL_APP_PASSWORD,
WAAFI_MERCHANT_UID, WAAFI_API_USER_ID, WAAFI_API_KEY  # dev-only fallback creds
```
Vercel: add apex + wildcard `*.maqaaxipos.com` domains (wildcard requires Vercel nameservers).

## Do NOT
- Reintroduce `SubItem` — it has been replaced by `OptionGroup` + `ItemOption`.
- Add service-charge or VAT rows in the cart total (decision: dropped).
- Reintroduce `src/components/public/royalStyles.js` (replaced by `tailwind.config.js` + `globals.css` `@layer components`).
- Use Drizzle ORM.
- Use `$queryRaw` or raw SQL.
- Set `font-size < 16px` on any `<input>`.
- Return decrypted Waafi credentials from any API (write-only; reads expose `hasWaafiCreds` only).
- Trust `x-restaurant-id` beyond an ownership check, or accept `restaurantId` in a request body.
- Move `src/proxy.js` back to the repo root (Next silently ignores it there when `src/app` exists).
