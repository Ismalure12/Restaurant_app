# Maqaaxi Pos

## Stack
npm workspaces: **`apps/web`** — Next.js 16 (App Router, Turbopack) · React 19 · JavaScript (JSX) · Tailwind — no database, no secrets; **`apps/api`** — Express 5 + TypeScript · Prisma 7 · Neon Postgres · Zod — owns the DB, auth, payments and every secret. One root `.env` (template `.env.example`) for both apps — the API/Prisma/compose read it; the web app is only ever given `API_ORIGIN`. `docker compose up -d --build` runs postgres + api + web (local host ports `API_HOST_PORT`/`WEB_HOST_PORT` = 4300/3300). `npm run dev` (root) starts both: web :3100 proxies `/api/*` to the API :4100 (`API_ORIGIN`); in production nginx routes `/api` → api, `/` → web.

## What This Is
Maqaaxi Pos — a **single-restaurant** digital menu + POS (the multi-tenant SaaS version was reverted in `991011c`; there is no `Restaurant` model, no subdomains, no superadmin). Customers scan a QR code → browse categories with option groups + extras + tags → build a cart → check out via Sifalo Pay hosted checkout → see confirmation. Staff run the Register, Orders, customer accounts, expenses, inventory, payroll and reports from `/admin/dashboard`. Roles: `admin` (legacy, same rights as manager) · `manager` · `cashier` (also takes the manual delivery orders) · `waiter`.

**Where the system is:** `docs/system-blueprint.md` is the agreed design (sidebar, which page owns which number, money accounts + cash book, day/month/year close, order lines, tables). Round 4 built all five phases (API + UI); progress and what is still unverified is in `.claude/task/todo.md`. Owner decisions: no promotions, no banners, no recipes/automatic stock deduction, no clock-in/shifts; staff collection accounts (A/c, E/D, My cash) are handed over to the business automatically; only the business has a card (Mastercard); one payment method per sale — no split tender in the UI (the API still reads old split sales). Nobody picks "Collected by": the server credits the table's waiter, else the signed-in person (the cashier on a delivery).

## Database Schema (Prisma, `apps/api/prisma/schema.prisma`)
- Menu: `Category`, `MenuItem`, `OptionGroup` + `ItemOption`, `ItemExtra`, `Tag` + `ItemTag`, `SocialLink`
- Sales: `Order` (cart lines in `items` JSON; `closedAt`, daily `receiptNo`/`receiptDay`, `paymentAccount` snapshot), `PaymentSession` (online checkout + reconciler columns `initiatedAt/lastCheckedAt/checkCount/lastResult`), `ReceiptCounter`, `Customer` (back-office account/owing customers only), `OnlineClient` (Sifalo payers: phone, name, address — `Order.clientId`; no sign-up, the wallet PIN is the check), `Invoice` + `InvoicePayment` (On account)
- Back office: `InventoryItem` + `StockMovement`, `Expense` + `ExpenseCategory` (kind), `Supplier` + `SupplierPayment`, `StockCount`, `SalaryRate` + `SalaryPayment`, `AdminUser` (role is a string), `Setting` (key/value)
- Money: `MoneyAccount` (business accounts), `StaffAccount` (a waiter's/cashier's own wallet numbers), `AccountEntry` (the cash book), `DayClose`/`DayCloseLine`, `PeriodClose` (month `2026-09` / year `FY2026`), `AuditLog`. Order lines: `OrderItem` (next to `Order.items`), `DiningTable`.
- **Held drops:** `apps/api/prisma/held/*.sql` are migrations that would break the currently deployed build (dropping `banners`, `shifts`, `categories.period`). The code no longer uses them; apply only after the owner deploys. The live DB is the only DB — apply only backward-compatible migrations (new tables, nullable columns, indexes) with `npm run db:deploy`; write migration SQL with `prisma migrate diff --from-schema … --to-schema … --script`, never `migrate dev` (it would reset the live DB on drift).

## Key Architecture
- Public menu: `apps/web/src/app/page.jsx` (thin shell) → `MenuApp.jsx` loads `GET /api/menu` (+ `GET /api/order?ref=` for a confirmation link) in the browser via `hooks/menu/useMenuData.js`, then mounts `MenuProvider` (`useMenuController`) with Home, Category, Detail and Cart screens in a phone shell. The web app never queries the database.
- Design tokens are in `tailwind.config.js` (colors, fonts, shadows, easings, keyframes). Component classes (`.shell`, `.topbar`, `.show-more`, `.cart-fab`, `.icon-btn`, `.detail-*`, `.cart-*`, etc.) are defined as `@layer components` in `src/styles/globals.css` using `@apply` + raw CSS. Palette: **monochrome maroon** (Goodir brand) — primary `#850D33`, CTA `#A31743`, deep `#6E0B2A`, cream `#FAFAF8`. The `blue`/`green` token names are kept (map to maroon) so existing utility classes still resolve. Fonts: Cormorant Garamond (display) + Inter (UI).
- Admin dashboard: `apps/web/src/app/admin/dashboard/` — `src/proxy.js` only checks a login cookie EXISTS (no secret, no verification); the dashboard layout asks `/api/auth/me` (role + `permissions` `{page: none|view|act}`) and applies the page rules in `src/lib/adminAccess.js` (401 → login, no access → first allowed page); pages read `hooks/useAccess.js` / `components/admin/IfCan.jsx` to hide write buttons. The API authorizes every request itself. Sidebar (`layout.jsx` `NAV`; Sell/Money/Menu/Back office groups collapse, open state per viewer in localStorage `mq-nav-groups`; 60px icon rail on tablet/narrow, drawer on phone; badges + bell from `GET /api/admin/nav-counts` via `hooks/useNavCounts.js`, each count only for pages the caller can view): **Home** Overview (manager) / My Performance (cashier, waiter) · **Sell** Register, Orders (badge from `GET /api/admin/orders/counts`), Tables · **Money** Sales history, Cash & accounts (Balances · Cash book · Collections · Transfers & owner · Day close), Customers, Expenses (Expenses | Suppliers) · **Menu** Menu Items, Categories & tags (Tags card follows the `tags` permission) · **Back office** Inventory (Stock · Purchases · Usage & waste · Counts), Staff (Team | Payroll tabs, `?tab=payroll`) · **Insights** Reports (own tabs: Sales · Menu · Inventory · Financial · Employees · Statements · Day closes) · **System** Settings — one link; its sections are a left menu inside the page (`settings/layout.jsx`), each with one sticky Discard/Save bar: General (receipt/business, delivery, social links) · Money (accounts & tax, calendar, opening balances) · Staff access · Audit log (`settings/{general,money,access,audit}`, sections in `components/admin/settings/*`; `/settings` redirects). Invoices live inside Customers (created only at the Register, On account). Topbar `GlobalSearch` → `GET /api/admin/search` (role-gated groups; Ctrl/⌘K).
- **Orders is live work only** (`GET /api/admin/orders`, `liveWhere`): pending online orders, unpaid dine-in orders, and anything created/closed/voided today (business day), capped at 500. History is Sales history.
- **Sale lifecycle (current, single-tenant):** Register sale = Pay now (closes immediately) or, dine-in only, **Pay later** (`status:'open'` internally, shown as **Unpaid**; no receipt #). A dine-in order needs a waiter (API 400 otherwise). Unpaid orders wait in Orders, where a cashier/manager adds items (`POST /api/admin/orders/:id/items`, staff only, server-priced, append-only, auto-prints an ADDED kitchen ticket) and takes payment (`POST /api/admin/orders/:id/pay`, `lib/orders/closeSale.ts`, no auto-print). Closing a sale (till, On account, or online `finalizePayment`) stamps `closedAt`, `paymentAccount` (Settings account label for evc) and the **daily receipt #** (`lib/orders/receiptNo.ts`: `ReceiptCounter` atomic upsert, resets at local midnight of `BUSINESS_TZ`). Every report counts a sale on its `closedAt` local day (`lib/time/businessTime.ts`, `lib/reports/common.ts` `salesWhere`).
- **Money model (`lib/money/cashBook.ts`, `lib/money/moneyReads.ts`):** money lives in business `MoneyAccount`s. Every path that moves money writes ONE signed `AccountEntry` per account in the same transaction (sale, invoice_payment, refund, adjustment, expense, salary, supplier_payment, transfer, owner_in/out, over_short). Only wallets with `MoneyAccount.staffNumbers` on (Settings › Money "Show in staff accounts") take staff numbers (`StaffAccount`, Staff › Team) and print them on bills (`orderSerialize` `payToOf`); off hides them without deleting. A waiter/cashier never holds a balance: money paid to their A/C number is written straight into the business wallet, tagged `collectedById` (card/online are never tagged to staff). Balance = `openingBalance` + rows from the opening date (Setting `opening_date`).
- **Closing & locks (`lib/closing/dayClose.ts`, `lib/closing/periodClose.ts`, `lib/closing/yearClose.ts`):** a day closes only after it ended (counted vs expected per account → `over_short` row, frozen Z-report); a month closes when every day is closed + stock counted (P&L with COGS = opening stock + purchases − counted closing stock, cash flow, position with a reconciliation check); a year closes when all its months are closed. Every write that takes a date calls `assertOpenDay` → 409 `PERIOD_CLOSED`; a void of an old sale refunds TODAY. Reopen = reason + audited + newest first. Day/month/year figures use `lib/closing/salesFigures.ts` (sale on the day it closed, void = refund on the void day).
- **Business day end hour** (Setting `business_day_end_hour`, 0–6) is read by `lib/time/businessTime.ts` (`dayKey`/`startOfDay` shift by it; refreshed by middleware in `app.ts`). Never compute a "day" with raw `Date` methods.
- **Order lines:** `lib/orders/orderItems.ts` writes `OrderItem` rows wherever an order is created/edited/appended (Register, online finalize, Add items, manager edit); Reports › Menu reads them. **Tables:** once any `DiningTable` exists, the Register and manager edit must pick one (`lib/orders/tables.ts` canonicalises "T5"/"Table 5"/"5"); with none, free text still works.
- **Order IDs:** `KFG-YYMMDD-NNNN` = Settings `order_prefix` + local creation date + `Order.id` (running count, never resets) — derived on read (`lib/orders/orderCode.ts`, `serializeOrder(o, prefix)`), never stored. `Order.reference` stays the random Sifalo order_id / public `/?ref=` token — never show or search it in staff UI.
- **One number, one place.** Sales report = one page, no tabs: KPIs, by day (by hour for one day), which account, channel, top 5, then menu value by category + every dish + never sold (`category` narrows only the dish part) (no per-person cards — Employees report; no ledger — Sales history); Financial = P&L only (no by-account, no expenses-by-category — Expenses page; no receivables — Customers › Owing); Inventory report = purchases/usage/waste in range (stock on hand, value & low stock — Inventory page only). Day charts only show for ranges longer than one day. Before adding a widget, check no other page already shows it.
- **Overview** (`dashboard/page.jsx`) = `GET /api/admin/overview` (manager): today vs yesterday, 7-day bars, unpaid/awaiting/low-stock/salaries-to-pay, recent sales — same `salesWhere` rules, nothing computed in the browser.
- **Sales history** (`/admin/dashboard/sales`, everyone on the Register; waiters see only sales they served/rang up, forced in `historyQuery`, and can't open `/sales/[id]`) = `GET /api/admin/sales` (`requirePos`), plus `GET /api/admin/sales/items` (Items sold view, `?view=items`, same query via `historyQuery`): every closed sale, `q` search (order code/id, receipt #, customer/contact name/phone, table), `status=completed|voided`, report filters, cursor paging; managers also get `summary {count,total}` (first page) and CSV. A sale opens `/sales/[id]` (OrderDetailView, `?back=` keeps filters). The Sales report links here with the same filters.
- **Reports API** (`apps/api/src/lib/reports/*`, routes `/api/admin/reports/{sales,inventory,inventory/movements,financial,employees,employees/:id}`): manager tier, `from`/`to` local days (≤366), exports via `?format=xlsx` (formatted Excel workbook: Summary sheet + one sheet per table, title/period/filters, typed $/%/date cells, Total rows) or `?format=csv&table=<key>` (one table; BOM + formula guard). Every export is described once in `lib/reports/exportSpecs.ts` and written by `lib/reports/export.ts` (`sendReport`, exceljs streaming) — never hand-build a CSV/XLSX in a controller. Money-account keys (`cash`, `card`, `invoice`, `acct:<label>`, `evc`, `online:<gateway>`) come from `accountKey`/`accountWhere`.
- Receipt (`components/admin/ReceiptDoc.jsx`, 80mm): shop name → Served by · Order ID · Receipt # · Pay to (every wallet number, 2–3 a line, the collector's own number where they have one, never their name; no Account row) · Date → Qty/Item/Price → TOTAL → footer. Pay to accounts are packed into lines by characters (`payToLines`, monospace) and sit on the right like the other values, wrapped lines under the first account. Font: self-hosted `public/fonts/receipt-mono.woff` (Geist Mono) — `printHtml` waits up to 1.5 s for it. **Subtotal only when a discount, delivery fee or tax line exists.** Kinds: `customer`, `bill` (unpaid order, NOT PAID), `kitchen` (with `addedLines` → ADDED ticket), `invoice` (80mm customer invoice). **Printing goes through a hidden iframe** (`printShared.printHtml`, CSS in `receiptCss.js`) so the preview never lays out the page or loads its images. For instant printing, run the register PC's Chrome with `--kiosk-printing`.
- **Role permissions (Settings › Staff access):** `lib/auth/permissions.ts` — per role (manager/cashier/waiter) and page (`PAGES`: overview, pos, orders, tables, sales, cash, customers, expenses, menu, categories, tags, inventory, staff, payroll, reports, settings) a level none/view/act; stored as the `role_permissions` Setting (only differences from `DEFAULTS`, which equal the old role lists); admin always act; read on every request (no re-login). `GET/PUT /api/admin/permissions` (admin + manager; manager edits cashier/waiter rows only, never above own level; audited). Fixed, outside the matrix: void/edit a closed sale = manager; Staff access + Audit log = admin + manager; only admin makes admins; nobody manages an account above their own role (`users.controller.ts` rank check); My Performance = cashier/waiter.
- **Audit log (Settings › Audit log):** `GET /api/admin/audit-log` (admin + manager; from/to, entity, actorId, q, cursor paging ≤100). `entity` is the Prisma model name (`Order`, `AdminUser`, `Setting`…). Staff account create/update/delete and permission changes are audited too.
- **Order detail:** one component, `components/admin/orders/OrderDetailView.jsx` (with Edit/Void/AddItems modals beside it), used by the Orders side panel, `/orders/[id]` and `/sales/[id]` (Sales history).
- **Payroll / salary history:** `SalaryRate {staffId, amount, fromMonth}` — the salary for month M is the rate with the greatest `fromMonth` ≤ M (`lib/money/salary.ts`), so a raise applies from its month on and earlier months keep theirs; a change can't start in the past; only a not-yet-started change can be deleted. `SalaryPayment` (unique per staff+month) links to an `Expense` (category "Salaries", cascade on delete = undo). API (manager): `GET/POST /api/admin/payroll` (POST pays one or many in one transaction, 409 if anyone is already paid), `POST /api/admin/payroll/rates` (set / +$ / +% for some or all incl. the manager; `dryRun` = preview), `DELETE /api/admin/payroll/rates/:id`, `GET /api/admin/payroll/staff/:id` (history), `DELETE /api/admin/payroll/:id` (undo); `/api/admin/me/salary` (own). New staff can get a first salary on create; `PUT /api/users/:id` never changes salary. UI: `components/admin/payroll/*` (Staff › Payroll tab); My Performance salary line.
- **DB connection drops** (Neon suspends idle compute → TLS resets / terminated sockets): `lib/db/prisma.ts` pool settings + `lib/db/dbRetry.ts` retry via a query extension — reads retry on any connection error, writes only on connect-phase errors (never a write that may have committed).
- **React Query keys have ONE shape.** Shared lists go through a hook (`hooks/useStaffList.js` → `['staff-list']`); never cache a different shape under a key another page reads.
- Cart flow: `MenuApp` → "Proceed to checkout" → checkout form → `POST /api/checkout` (server reprices, creates `PaymentSession`) → `POST /api/payment/initiate` (Sifalo hosted-checkout key/token → `checkoutUrl`) → browser goes to Sifalo → `GET /api/payment/return?order_id&sid` → `finalizePayment` (`apps/api/src/lib/payments/payments.ts`: verify success/601 + exact amount + USD + sid bound to order_id + sid unique → Order `paymentStatus:'paid', status:'pending'`) → `/?ref=...` confirmation (`?pay=pending` polls `POST /api/payment/status`, `?pay=failed` reopens checkout). Accept = status only; Decline = Sifalo refund first, then `declined`/`refunded`.
- **Online payment safety net** (Sifalo has no webhook): `lib/payments/paymentReconciler.ts` asks Sifalo by order_id about every initiated checkout (backoff, 48 h, each at least once; >48 h + paid → `paid_late` for staff, never an unattended order). **On only in production** (`PAYMENT_RECONCILER=on|off`) — the dev API usually points at the real DB. `finalizePayment` records every non-paid outcome in `lastResult`. Staff: stuck payments sit at the top of Orders › **Needs a decision** (`?tab=payments` opens the first; detail in `components/admin/orders/OnlinePaymentsPanel.jsx`; recheck = staff, dismiss = manager + reason, audited, asks Sifalo first). Badge = `pending + stuckPayments` (`hooks/useOrderCounts.js`, key `['order-counts']`). Rate limits on checkout/initiate/status (`middleware/rateLimit.ts`, in memory; `TRUST_PROXY`).
- **Live updates:** `GET /api/admin/events` (SSE, `lib/orders/orderEvents.ts`) sends data-less `orders` nudges after Register/Orders writes and online payments; `hooks/useLiveOrders.js` (layout) refetches `orders-all`, counts, `tables-status`, `online-payments`. Polling (30–60 s) stays as the fallback. nginx block for SSE in `apps/api/README.md`.
- **Online ordering switch** (Settings › General, `settings` act = manager): Setting `online_ordering` (`on`/`off`, missing = on) + `online_ordering_message` (`lib/orders/onlineOrdering.ts`). Off → `GET /api/menu` sends `onlineOrdering {enabled:false, message}`, the basket shows the message and disables checkout; `POST /api/checkout` and `/api/payment/initiate` answer 409 `{error: message, code:'ONLINE_ORDERING_OFF'}`. `payment/return`/`status` are never blocked (someone who already paid must finish).
- **Image uploads:** `POST /api/upload` → sharp → three WebP widths `menu/<base>/{320,640,1200}.webp` in S3 (`lib/storage/imageVariants.ts`, `lib/storage/s3.ts`, public URL `https://<bucket>.s3.<region>.amazonaws.com/…` or `S3_PUBLIC_URL`); the DB stores only the 1200 URL. The menu derives `srcset` from it (`apps/web/src/lib/menu/imageSrc.js` — keep the two in step) via `ImgWithFallback` `sizes`/`priority` (first screen eager/high, rest lazy; srcset fails → plain URL → placeholder); `useMenuData` preconnects to the image origin (localStorage `mq-img-origin`). No Next image optimizer, no CDN yet (owner). Older flat/Blob/Pexels URLs load as before; `apps/api/src/cli/resizeImages.ts` converts them once (dry run default, `--apply`; DEPLOYMENT.md F).
- Payments: `apps/api/src/lib/payments/sifalo.ts`. Live gateway only (no staging). `FIXED_CHARGE_USD` (`'0.01'`) in that file is a temporary test charge sent to Sifalo instead of the order total (and used for the verify check + refund amount via `chargedAmount()`); the OWNER sets it to `null` at deploy — never change it unasked.
- Cart line shape: `{ uid, itemId, name, imageUrl, optionName, extras: [{name, priceAdd}], notes, unitPrice, quantity }`. The legacy `kfg_cart` localStorage key is still written for compatibility with the checkout page.
- API: `apps/api` (layer-based: `src/routes/*.routes.ts` map URLs → `src/controllers/**` handlers via `defineRoute`; `src/middleware/`, `src/validations/`, business logic in `src/lib/<domain>/`, helpers in `src/utils/`) — all use Prisma + Zod validation. Schema, migrations and seed live in `apps/api/prisma/`. See `apps/api/README.md`.

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
- Validate inputs server-side with **Zod** (`apps/api/src/validations/*.validation.ts`).
- JWT auth in an httpOnly cookie, signed and verified ONLY by the API (`apps/api/src/lib/auth/auth.ts`). The web app must never hold `JWT_SECRET`, `DATABASE_URL` or any other secret, and must never import Prisma. `apps/web/src/proxy.js` (Next 16 proxy convention — must live in `src/`) is a cookie-present check only.
- **Authorization lives in the API**: every route calls `requirePage(page, 'view'|'act')` (role permissions, below) or `requireRole`/`requirePos` for fixed rules (`apps/api/src/lib/auth/auth.ts`), and anything a person may only see for themselves (a waiter's sales, own salary) is scoped in the `where` from the session, never from a request parameter.
- Use `next/image` where possible; the menu's inline `<img>` is intentional (with a placeholder fallback).
- Public menu uses **Tailwind via `@layer components`** in `globals.css` (design tokens in `tailwind.config.js`). Admin pages follow **`docs/admin-design-system.md`** (design source `docs/design/*.dc.html`): Tailwind `mq-*` tokens (`tailwind.config.js`) + the shared kit `components/admin/ui/*` (Button, Card, Kpi, Table + LoadMoreBar, Modal, Drawer, Chip, Segmented/Tabs, Field controls) — build from the kit, never hand-roll; light theme only. The old `jazeera.css` / `.adm-*` admin CSS is gone — don't reintroduce page CSS for admin. Responsiveness lives in `globals.css` `@media` blocks for `≤340px`, `≤380px`, `≥760px` (phone-shell floats), `≥1024px`, and landscape.
- iOS mobile: any `<input>` must have `font-size ≥ 16px` or iOS Safari will zoom in.
- Item totals are calculated from `unitPrice = basePrice + selectedOption.priceAdd + sum(extras.priceAdd)`.

## Seeding
```bash
npm run db:seed      # runs apps/api/prisma/seed.cjs via apps/api/prisma.config.ts; migrations: npm run db:deploy (see "Held drops" above)
```
Creates the admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD` and optional manager/cashier/waiter accounts from `MANAGER_*`, `CASHIER_*`, `WAITER_*`, plus the demo menu. **Never run it against the live DB** — it deletes and recreates the menu. `npm run db:seed:staff` (`--staff-only`) creates only the logins (upsert, never resets a password) — the one mode safe on the live DB; production starts from an empty DB with `db:deploy` + `db:seed:staff` (`DEPLOYMENT.md` A.5). Public host is `menu.kfggalkacyo.com` only (no `www.`; `deploy/nginx`).

## Environment Variables
Root `.env` (see `.env.example`): `PORT`, `NODE_ENV`, `DATABASE_URL` (Docker Postgres `docker-compose.yml` :5433 on Lightsail; Neon until the move — `scripts/copy-neon-to-docker.sh`, backups `scripts/backup-db.sh` — local dump + private encrypted copy to S3 `backups/` via `apps/api/src/cli/uploadBackup.ts` in the api image; optional `BACKUP_S3_BUCKET`), `PAYMENT_RECONCILER`, `TRUST_PROXY`, `JWT_SECRET`, `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_REGION`/`S3_BUCKET_NAME` (+ optional `S3_PUBLIC_URL`; menu images, `lib/storage/s3.ts`), `EMAIL_USER`, `EMAIL_APP_PASSWORD`, `SIFALO_API_USER`, `SIFALO_API_KEY`, `PUBLIC_APP_URL`, `BUSINESS_TZ` (IANA zone, default Africa/Mogadishu), seed accounts, `API_ORIGIN` (web), `POSTGRES_PASSWORD`/`API_HOST_PORT`/`WEB_HOST_PORT`/`API_IMAGE`/`WEB_IMAGE` (compose).

## Do NOT
- Reintroduce `SubItem` — it has been replaced by `OptionGroup` + `ItemOption`.
- Add service-charge or VAT rows in the cart total (decision: dropped).
- Reintroduce `src/components/public/royalStyles.js` (replaced by `tailwind.config.js` + `globals.css` `@layer components`).
- Use Drizzle ORM.
- Use `$queryRaw` or raw SQL.
- Set `font-size < 16px` on any `<input>`.
- Reintroduce banners, `Category.period`, clock-in/shifts, promotions or recipe-based stock deduction (owner decisions, Round 4).
- Move `apps/web/src/proxy.js` out of `src/` (Next silently ignores it when `src/app` exists).
- Import Prisma, or read `DATABASE_URL`/`JWT_SECRET`, anywhere in `apps/web` — data goes through the API.
