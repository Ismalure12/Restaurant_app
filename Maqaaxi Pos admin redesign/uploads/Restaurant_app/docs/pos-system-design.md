# Maqaaxi Pos — Restaurant POS Expansion (System + DB Design)

## Context
The app today is a customer-facing digital menu with online **delivery/dine-in orders** paid via Waafi pre-auth, plus an admin dashboard for menu/catalog/orders. The owner wants to run the venue as a **full restaurant POS** on the same admin: staff take **walk-in orders manually**, **print the waiter a receipt**, **take payment in person** (cash/card/EVC), keep **inventory**, see a **P&L ("balance sheet")**, and **manage staff** (roles + shifts).

**Constraints:** keep it **minimal**, only a few **new admin pages**, **do not touch the public pages**, reuse existing patterns.

**Confirmed scope:**
- Inventory = **manual stock + movement ledger** (no recipe auto-deduction).
- Receipts = **browser print, 80mm** (works with any OS-installed thermal printer; no ESC/POS integration).
- Staff = **roles + permissions AND shifts + per-staff sales**; roles are **manager, cashier, waiter** only (no kitchen) alongside existing `admin`.
- Finance = **sales + expenses P&L** (not double-entry accounting).

Reuses the existing `Order` model (Json `items` cart-line shape), Waafi flow, `requireAdmin`/JWT auth, admin CRUD route convention, and dashboard layout/nav.

---

## System Design

### Roles & access (extends `AdminUser.role`)

| Role | POS | Orders | Inventory | Finance | Staff/Settings |
|---|---|---|---|---|---|
| `admin` / `manager` | ✅ | ✅ | ✅ edit | ✅ | ✅ |
| `cashier` | ✅ | ✅ | view | — | — |
| `waiter` | ✅ (own orders) | own | — | — | — |

- Add `requireRole(prisma, [roles])` + `requireStaff(prisma)` to `src/lib/auth.js` (mirrors `requireAdmin`). Keep `requireAdmin` for sensitive settings; broaden chosen routes to allow `manager`.
- `middleware.js` keeps gating `/admin` by cookie. Page/route-level role checks do the fine-grained gating; nav filtered client-side from `/api/auth/me`.

### Order lifecycle (POS vs online — one `Order` table)
- **Online (unchanged):** `source=online`, Waafi pre-auth → admin accept captures (`status pending→confirmed`).
- **POS (new):** waiter/cashier builds cart → `POST /api/admin/pos/orders` creates `source=pos`, `status=confirmed`, `paymentStatus=unpaid`, `staffId` from session, optional `tableId`. Payment via `POST /api/admin/orders/[id]/pay` (cash/card/evc) → `paymentStatus=paid` + `paymentMethod` + `amountReceived` (for change). Receipt prints from browser.
- Reuse the **existing cart-line Json shape** for `items` (`{uid,itemId,name,imageUrl,optionName,extras[],notes,unitPrice,quantity}`) so totals math and order rendering are shared with the online flow.

### Receipt printing
- A `ReceiptDoc` client component (hotel header, order #, table, lines with options/extras, totals, payment + change, cashier name, timestamp, footer); `window.print()` triggers it.
- An `@media print` block sized to **80mm** (`@page { size: 80mm auto; margin: 0 }`) hides dashboard chrome and shows only the receipt. Reachable from POS (after placing/paying) and from order detail.


### Inventory (manual)
- `InventoryItem` holds current `quantity`; every change is a `StockMovement` row (`purchase | usage | adjustment | waste`) applied **inside a Prisma transaction** that also updates `InventoryItem.quantity`. Low-stock = `quantity ≤ reorderLevel`. Purchases with `unitCost` can also create a matching `Expense` (category `purchases`).

### Finance (P&L, computed — no ledger table)
- `GET /api/admin/finance/summary?from=&to=` aggregates: revenue = paid orders in range (grouped by `paymentMethod`), expenses grouped by `Expense.category`, **net = revenue − expenses**, order count, and **sales-by-staff** (group `Order.staffId`).

### Shifts & per-staff sales
- `Shift` records clock-in/out + optional cash float. Per-staff sales come from `Order.staffId` joined over a date range.

---

## DB Design (`prisma/schema.prisma`)

**Extend `AdminUser`** — add `name String?`, `phone String?`, `isActive Boolean @default(true)`; roles `admin|manager|cashier|waiter|user`; relations `ordersTaken Order[] @relation("OrderStaff")`, `shifts Shift[]`, `stockMovements StockMovement[]`, `expenses Expense[]`.

**Extend `Order`** — make `customerId Int?` + `customer Customer? @relation(...)`; add:
- `source String @default("online")` // online | pos
- `staffId Int?` + `staff AdminUser? @relation("OrderStaff", ...)`
- `tableId Int?` + `table RestaurantTable? @relation(...)`
- `paymentMethod String?` // cash | card | evc | waafi
- `paymentStatus String @default("unpaid")` // unpaid | paid | refunded
- `amountReceived Decimal? @db.Decimal(10,2)`
- keep `status`, `tableNumber`, `reference` for compatibility.

**New models** (existing conventions: `@map` snake_case, `Decimal`, `created_at`):

```
RestaurantTable  id, label @unique, seats Int?, area String?, isActive, sortOrder, createdAt → orders Order[]
InventoryItem    id, name, unit, quantity Decimal(12,3) @default(0), reorderLevel Decimal(12,3)?,
                 costPerUnit Decimal(10,2)?, supplier String?, isActive, createdAt, updatedAt → movements StockMovement[]
StockMovement    id, inventoryItemId(→cascade), type, quantity Decimal(12,3) (signed delta),
                 unitCost Decimal(10,2)?, note String?, staffId Int?(→AdminUser), createdAt
Expense          id, category, amount Decimal(10,2), note String?, staffId Int?(→AdminUser),
                 incurredAt @default(now()), createdAt
Shift            id, staffId(→AdminUser), clockIn @default(now()), clockOut DateTime?,
                 openingFloat Decimal(10,2)?, closingCash Decimal(10,2)?, note String?, createdAt   @@index([staffId])
```

Apply with `npx prisma db push` (Neon, matches current adapter setup), then regenerate client.

---

## New / changed admin pages & nav
Nav additions in `src/app/admin/dashboard/layout.jsx` (role-filtered): **POS**, **Inventory**, **Finance**; rename **Users → Staff**.

1. `dashboard/pos/page.jsx` — order builder (reuse `/api/menu-items` + `/api/categories`, option/extra selection, qty/notes, table picker), live total, **Place order** → **Take payment** (method, amount tendered, change) → **Print receipt**.
2. `dashboard/inventory/page.jsx` — stock list with low-stock badges; create/edit items; movement drawer (purchase/usage/adjust/waste).
3. `dashboard/finance/page.jsx` — date-range P&L: revenue by method, expenses by category, net, orders count, sales-by-staff; inline **Add expense** form.
4. `dashboard/users/page.jsx` (extend) — manage `name/phone/role/isActive`; show shifts / per-staff sales.
5. **Tables** — lightweight manager as a section/tab inside POS (or small `dashboard/tables`) for `RestaurantTable` CRUD.
6. **Receipt** — `ReceiptDoc` component + print styles; reachable from POS and `dashboard/orders/[id]`.

## New API routes (each: `requireRole/requireStaff` → Prisma → Zod)
- `POST /api/admin/pos/orders` — create POS order.
- `POST /api/admin/orders/[id]/pay` — record payment.
- `GET/POST /api/admin/tables`, `PATCH/DELETE /api/admin/tables/[id]`.
- `GET/POST /api/admin/inventory`, `PATCH/DELETE /api/admin/inventory/[id]`, `POST /api/admin/inventory/[id]/movements` (transactional), `GET /api/admin/stock-movements?itemId=`.
- `GET/POST /api/admin/expenses`, `PATCH/DELETE /api/admin/expenses/[id]`.
- `POST /api/admin/shifts/clock-in`, `POST /api/admin/shifts/clock-out`, `GET /api/admin/shifts`.
- `GET /api/admin/finance/summary?from=&to=`.
- Extend `/api/users` (+ `[id]`) for staff fields/roles.

## Validation (`src/lib/validations.js`)
Add Zod schemas: `posOrderSchema`, `paymentSchema`, `inventoryItemSchema`, `stockMovementSchema`, `expenseSchema`, `tableSchema`, `shiftSchema`, and extend the user/staff schema with `name/phone/role/isActive`.

---

## Suggested build order
1. Schema changes + `prisma db push` + client regen.
2. `auth.js` role helpers; nav role-filtering.
3. Inventory → API + page (self-contained, easy to verify).
4. POS order create + payment API → POS page → `ReceiptDoc` + print styles.
5. Expenses + Finance summary API → Finance page.
6. Staff (extend Users) + Shifts.
7. Tables manager.

## Verification
- `npx next lint` after each change; `npx prisma validate`/`db push` succeeds.
- **POS:** build order, place, take cash payment with tendered amount, confirm change correct and `Order` is `source=pos, paymentStatus=paid`; verify 80mm receipt prints with correct lines/totals/cashier.
- **Online flow unchanged:** place a delivery order, confirm Waafi pre-auth/accept still works (regression on nullable `customerId` + new fields).
- **Inventory:** create item, add movements, confirm `quantity` updates transactionally and low-stock badge appears.
- **Finance:** add expenses, set date range, verify revenue-by-method / expenses-by-category / net / sales-by-staff add up.
- **Staff/shifts:** create a waiter, restrict a manager-only page, clock in/out, confirm per-staff sales attribute correctly.
- Check responsiveness; confirm **no public page / `globals.css` public classes changed**.
