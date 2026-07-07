# Maqaaxi Pos

## Stack
Next.js 16 (App Router, Turbopack) · React 19 · JavaScript (JSX, no TypeScript) · Tailwind CSS (public + admin) · Neon Postgres · Prisma ORM · Vercel

## What This Is
Maqaaxi Pos — a resellable digital menu + POS for restaurants (placeholder brand uses Goodir company assets). Customer scans a QR code → browses categories with option groups + extras + tags → builds a cart → checks out via Waafi/EVC payment → sees confirmation. Admins manage categories, items, option groups, extras, tags, banners, social links, and orders via a protected dashboard.

## Database Schema (Prisma)
- `AdminUser` — admin accounts with JWT auth
- `Category` — name, slug, kicker, headline (HTML w/ `<em>`), sub, coverUrl, period (`morning`/`midday`/`evening`/`any`)
- `MenuItem` — name, description, price, imageUrl, kcal, prepTime, pairing
- `OptionGroup` — radio-style option title per item (e.g. *Bread*); `cascade` on item delete
- `ItemOption` — one row per radio choice with `priceAdd`
- `ItemExtra` — optional checkbox add-ons with `priceAdd`
- `Tag` + `ItemTag` — curated tag catalog (slug, label, variant: `default`/`green`/`spicy`)
- `Banner` — one row per service (`morning`/`midday`/`evening`) with tagLabel, headline, body, image, CTA, 3 meta stats
- `Customer`, `PaymentSession`, `Order` — checkout + payment + order persistence
- `SocialLink` — platform/value pairs

## Key Architecture
- Public menu: `src/app/page.jsx` (server, Prisma) → `src/components/menu/MenuApp.jsx` (client, driven by `useMenuController`) which mounts Home, Category, Detail, and Cart screens in a phone shell.
- Design tokens are in `tailwind.config.js` (colors, fonts, shadows, easings, keyframes). Component classes (`.shell`, `.topbar`, `.banner`, `.show-more`, `.cart-fab`, `.icon-btn`, `.detail-*`, `.cart-*`, etc.) are defined as `@layer components` in `src/styles/globals.css` using `@apply` + raw CSS. Palette: **monochrome maroon** (Goodir brand) — primary `#850D33`, CTA `#A31743`, deep `#6E0B2A`, cream `#FAFAF8`. The `blue`/`green` token names are kept (map to maroon) so existing utility classes still resolve. Fonts: Cormorant Garamond (display) + Inter (UI).
- Admin dashboard: `src/app/admin/dashboard/` — protected by `middleware.js` checking JWT cookie. Pages: categories, menu-items, tags, banners, orders, social-links, users.
- Cart flow: `MenuApp` → "Proceed to checkout" → `/checkout` (themed form) → `/api/checkout` → `/api/payment/initiate` (Waafi/EVC) → `/order-confirmed?ref=...`
- Cart line shape: `{ uid, itemId, name, imageUrl, optionName, extras: [{name, priceAdd}], notes, unitPrice, quantity }`. The legacy `kfg_cart` localStorage key is still written for compatibility with the checkout page.
- API routes: `src/app/api/` — all use Prisma + Zod validation.

## Workflow Orchestration
- Enter plan mode for non-trivial work (3+ steps).
- Run `npx eslint <changed files>` after each meaningful change. (Next 16 removed the `next lint` subcommand; the `npm run lint` script still points at the old command and fails — use `eslint` directly.)
- Verify work end-to-end before marking done.
- **Design-change loop:** After any UI/CSS change, launch the dev server and open the browser to manually test the affected pages. Check for bugs, responsiveness (mobile / tablet / desktop / in-between widths), missing design, and inconsistency. Iterate (fix → retest) until the result is 100% accurate before marking the task done.

## Core Principles
- **Simplicity first** — minimal code impact, no over-engineering.
- **No laziness** — fix root causes, never paper over.
- **Mobile-first** — most traffic is phone-scanned QR.

## Key Rules
- Use **Prisma** for all DB queries — never raw SQL, never `$queryRaw`.
- Validate inputs server-side with **Zod** (`src/lib/validations.js`).
- JWT auth in httpOnly cookie, protected by `middleware.js`.
- Use `next/image` where possible; the menu's inline `<img>` is intentional (with a placeholder fallback).
- Public menu uses **Tailwind via `@layer components`** in `globals.css` (design tokens in `tailwind.config.js`). Admin pages use **Tailwind utility classes** directly in JSX. Responsiveness lives in `globals.css` `@media` blocks for `≤340px`, `≤380px`, `≥760px` (phone-shell floats), `≥1024px`, and landscape.
- iOS mobile: any `<input>` must have `font-size ≥ 16px` or iOS Safari will zoom in.
- Item totals are calculated from `unitPrice = basePrice + selectedOption.priceAdd + sum(extras.priceAdd)`.

## Seeding
```bash
source <(grep -v '^#' .env | sed 's/^/export /') && node prisma/seed-royal.js
```
Seed script uses the `PrismaPg` adapter and reseeds categories, tags, items, option groups, extras, and banners from the design's dataset.

## Environment Variables
```
DATABASE_URL, JWT_SECRET, BLOB_READ_WRITE_TOKEN, ADMIN_EMAIL, ADMIN_PASSWORD,
WAAFI_MERCHANT_UID, WAAFI_API_USER_ID, WAAFI_API_KEY
```

## Do NOT
- Reintroduce `SubItem` — it has been replaced by `OptionGroup` + `ItemOption`.
- Add service-charge or VAT rows in the cart total (decision: dropped).
- Reintroduce `src/components/public/royalStyles.js` (replaced by `tailwind.config.js` + `globals.css` `@layer components`).
- Use Drizzle ORM.
- Use `$queryRaw` or raw SQL.
- Set `font-size < 16px` on any `<input>`.
