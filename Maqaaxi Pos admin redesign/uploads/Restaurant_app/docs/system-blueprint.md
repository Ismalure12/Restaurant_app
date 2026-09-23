# Maqaaxi Pos — System Blueprint (final draft v3)

_Draft v3 · 2026-09-19 · supersedes the scope parts of `docs/pos-system-design.md`_

This blueprint covers how the system is **organized**: which pages exist, which page owns which number, how money is tracked from the moment a customer pays to the end of the year, what the schema and API need, and the order to build it in. It is not about visual design.

**Owner decisions reflected here:**
- No Promotions module. **Banners are removed** (they come from the old system).
- **No recipes and no automatic stock deduction.** The menu can't be matched to stock, so inventory stays manual.
- **Day, month and year closing.**
- **Staff collection accounts.** Waiters and cashiers (cashiers take the manual delivery orders) each have an **A/c (EVC)**, an **E/D (eDahab)** and **My cash**. Customers pay into these, so the numbers are printed on the bill. They are *not* restaurant accounts: everything collected is handed over to the business account at the end of the day, **automatically**. There is no manual handover step.
- **Only the restaurant has a card:** one Mastercard account. Staff never take card payments into their own accounts.
- **No clock-in, no shifts, no "My shift" page.** What a person collected today is shown in **My performance**.

---

## 1. Principles

1. **Live work vs history.** Pages for doing work now (Register, Orders, Day close) are kept apart from pages that record what happened (Sales history, Cash book, Reports).
2. **One number, one place.** Every number has exactly one page that owns it. Other pages show a summary and link to that page (see §4).
3. **Follow the money.** Sale → **who collected it and through which of their accounts** → the business account it ends up in → day close → month close → year close.
4. **A POS, not an accounting system.** We track money with a **cash book** (single entry, with balances) plus **day, month and year closes**. We do NOT build double entry, a chart of accounts, journals, depreciation, accruals or tax filing.
5. **The past doesn't change.** A closed day, month or year is locked. A later correction is recorded as a new entry in the current open day.

---

## 2. Sidebar (final)

```
Overview
SELL         Register · Orders (live, badge) · Tables (phase 4)
MONEY        Sales history · Cash & accounts · Customers · Expenses
MENU         Items · Categories
BACK OFFICE  Inventory · Staff
INSIGHTS     Reports
Settings
—
My performance   (cashier / waiter)
```

| Page | Tabs / contents | Who |
|---|---|---|
| **Overview** | Today vs yesterday, 7-day bars, needs-attention list, today's collections per person, recent sales, and a **"Close today"** prompt after the cutoff time | manager |
| **Register** | Sell. Adds split payment, a **"Collected by"** choice (which staff member and which of their accounts), and a manual "86" (sold-out) toggle | all |
| **Orders** | **Live only:** online orders waiting to be accepted, unpaid tabs, today's closed orders. Never older history | cashier+ |
| **Sales history** | **Sales \| Items sold** views over the same filters. Every closed sale: search, reprint, CSV, filter by collector and account. No charts. Waiters see only their own sales and can't open one | all (waiter: own) |
| **Cash & accounts** *(new)* | **Balances** (each business account now) · **Cash book** (every movement, with opening/closing balance) · **Collections** (today per person: A/c, E/D, cash) · **Transfers & owner** · **Day close** | manager |
| **Customers** | Accounts & balances owed (+ phase 5: visits, spend, last order) | cashier+ |
| **Expenses** | **Expenses** (each one says which account paid it) · **Suppliers** (purchases on credit, supplier payments) | manager |
| **Items / Categories** | Menu. **Tags** move here from Settings | cashier+ |
| **Inventory** | **Stock** · **Purchases** · **Usage & waste** (logged by hand) · **Counts** (stocktake) | cashier+ (counts: manager) |
| **Staff** | **Team** (including each person's A/c and E/D numbers) · **Payroll** | manager |
| **Reports** | **Sales** · **Menu** (qty and revenue per dish and category, dishes that never sell) · **Inventory** · **Staff** · **Statements** (month and year: P&L, cash flow, position; close month / close year) · **Day closes** (Z-report archive) | manager |
| **Settings** | **Business** (name, receipt details, and the **business calendar**, §3.9) · Tax · Business accounts (EVC, eDahab, Cash, Mastercard, Bank, Sifalo) · Online menu (delivery fee, social links) | manager |
| **My performance** | Own sales · **Today I collected:** A/c $x · E/D $y · Cash $z (all handed over to the business at the day's end) · Salary | cashier, waiter |

**Removed:**
- The "Point of sale" dropdown. Register and Orders become one-click links.
- Redirect-only pages: `/insights*`, `/invoices`, `/reports/sales/orders/[id]`.
- The "Latest sales" table in the Sales report.
- The busy-hours chart in Sales history. It moves to the Sales report.
- The on-hand, status and value columns in the Inventory report.
- **Banners everywhere** (§7.1).
- **Clock-in/out, shifts and hours:** the Staff › Team button, the Employee report "Hours" and "Shifts" columns, and the shift routes (§7.2).

---

## 3. Money: from the customer to the year-end

### 3.1 Two kinds of account

| | **Business accounts** (real money) | **Staff collection accounts** (where a customer pays) |
|---|---|---|
| What | Cash (office/safe) · EVC · eDahab · **Mastercard** · Bank · Sifalo (online) | Each waiter and cashier: **A/c** (EVC number), **E/D** (eDahab number), **My cash** |
| Holds a balance? | Yes: opening, in, out, closing | **No.** Each one is a label that points to a business account |
| Where it's set up | Settings › Business accounts | Staff › Team (per person) |
| Used for | Balances, closes, statements | Printing the number on the bill, and "who collected what" |

Each collection account points to one business account:
- **A/c → business EVC**
- **E/D → business eDahab**
- **My cash → business Cash**

A sale collected on Amina's A/c is recorded **directly in the business EVC account**, tagged "collected by Amina via A/c".

This models "everything they got is handed over automatically": staff never hold a balance in the system, and there is no handover step. **Card is business-only:** a card sale goes straight to Mastercard, whoever rang it up.

### 3.2 Cash book — one row per money movement (business accounts only)
Every path that moves money writes **exactly one signed row, in the same transaction** as the thing that caused it:

| Kind | Sign | Written by |
|---|---|---|
| `sale` | + | a sale being paid. Tagged with `collectedById` + `collectedVia` (A/c, E/D, cash) when a staff member collected it. A split payment writes 2 rows |
| `invoice_payment` | + | a customer paying off their account (also tagged with who collected it) |
| `transfer` | −/+ | business → business (cash → bank, Sifalo payout → bank, Mastercard settlement → bank). Two rows share one `transferId` |
| `refund` | − | voiding a paid sale or declining an online order (you pick which account the refund comes from) |
| `expense` / `supplier_payment` / `salary` | − | money paid out, from the chosen account |
| `owner_in` / `owner_out` | +/− | owner capital in / owner drawings (**not** expenses) |
| `over_short` | ± | the difference between counted and expected money at a day close |

- **Balance** = opening balance + the sum of rows. Nothing is ever deleted. A correction is a reversing row.
- Selling **on account** is not money yet, so it writes no row.
- Each row stores `businessDay` (local day, with the cutoff hour applied).

### 3.3 Taking payment ("Collected by")
- The Register and Orders › Pay ask **who collected the money and how**:
  - **Dine-in:** it defaults to the table's waiter.
  - **Delivery / counter:** it defaults to the signed-in cashier.
- **Choices:** that person's **A/c**, **E/D** or **Cash**, plus the business **Card (Mastercard)** and **On account**.
- A waiter can only pick themselves.
- **Printing:**
  - An **unpaid bill** (dine-in) prints the **table's waiter's A/c and E/D numbers**.
  - A **delivery receipt** prints the **cashier's** numbers.
  - A paid receipt shows how it was paid ("E/D · Amina").
- This replaces the current restaurant-wide account list in Settings and the Cash / Card / EVC chips.

### 3.4 Day close / Z-report (manager, once per business day)
1. **Checks before closing:** unpaid tabs (carry them over or block the close), pending online orders.
2. **Collections per person:** A/c, E/D, cash and total for each waiter and cashier. This is what each of them handed over.
3. **Per business account:** opening, money in, money out, expected closing. Then:
   - For **Cash**, enter the counted amount.
   - For **EVC, eDahab, Mastercard and Bank**, enter the **balance shown in the app or on the statement**.

   Any difference becomes an `over_short` row. The per-person breakdown shows **whose** money is missing, e.g. EVC is short $20 and Amina's A/c collections were $140.
4. **Sales summary:** gross, discounts, refunds, net; per account and per person; billed on account; voids with reasons.
5. **Closing locks the day.** A manager can reopen it, but must give a reason, and the reopen is recorded in the audit log. Prints on 80mm and A4. Stored as a snapshot.

> **Fixes a real bug:** today, voiding or editing a sale changes the day it was sold, so last month's report changes when you void something today (`salesWhere` drops `voided` orders from their original `closedAt` day). After this change, voiding a sale from a closed day records a **refund today**.

### 3.5 Month close (manager)
1. **Stock count:** a count sheet for every item → the differences are posted as `adjustment` movements → **closing stock value** (quantity × weighted-average cost). This works without recipes: it measures what was actually used.
2. **Statements**, frozen as a snapshot:
   - **Profit & loss:** net sales (gross − discounts − refunds) − **cost of goods (opening stock + purchases − closing stock)** = gross profit and **food cost %** − operating expenses by category − payroll = **net profit**. Stock purchases stop counting as an expense on the day you buy them.
   - **Cash flow:** per business account: opening, money in by kind, money out by kind, closing. Plus a total across all accounts.
   - **Business position:** business money + stock value + what customers owe − what suppliers are owed − salaries unpaid − refunds owed = **net position**.
     - Checked against last month: *change = profit + owner in − owner out*.
     - Any mismatch is shown as "unexplained".
3. The month is **locked**. Its closing balances become next month's opening balances.

### 3.6 Year close (manager, once a year)
- Allowed only when **all 12 months are closed**. The financial year starts in the month set in Settings, January by default. The year's final month close includes its **year-end stock count**.
- **Annual statements**, frozen:
  - **Profit & loss for the year**, with one column per month and a total.
  - **Cash flow per account for the year:** opening on day 1, in and out by kind, closing on the last day.
  - **Position at year end**, compared with the start of the year.
  - **Owner summary:** profit for the year, owner capital in, drawings out, and the result carried forward.
- **Locks the year.** Year-end closing balances become next year's opening balances.
- **Year pack export:** PDF of the statements plus CSVs (sales, cash book, expenses, payroll, stock counts) for the accountant or tax office.

### 3.7 Opening balances (once, at go-live)
A setup screen:
- the counted or statement balance of each **business** account
- an opening stock count
- customers who already owe money (entered as "Opening balance" invoices with no order)
- suppliers you already owe

The cash book starts from this **cut-over date**. Older sales stay in reports.

### 3.8 Small changes that make it work
- **Expense:** add `paidFromAccountId` (required unless bought on credit) and a `kind`: `operating` | `payroll` | `stock_purchase`. Expense categories become a table (no more free-text `'purchases'` / `'Salaries'`).
- **Suppliers:** a `Supplier` table. A purchase is either paid now from an account or **on credit**. Paying the supplier writes a `supplier_payment` row.
- **Payroll pay** and **refunds** ask which business account the money comes from.

### 3.9 Business calendar (Settings › Business)
Three settings the restaurant chooses itself. The system never hard-codes them.

| Setting | What it controls | Default | Rules |
|---|---|---|---|
| **Business day ends at** (hour, 00:00–06:00) | Which day a sale, expense or cash-book row belongs to; when the receipt # resets to 0001; when "Close today" appears | 00:00 (today's behaviour) | A change applies from the **next open day**. A closed day is never re-sorted. Example: at 04:00, a sale at 01:30 on the 12th belongs to the 11th. |
| **Financial year starts in** (month) | Which 12 months a year close covers; the "This year" range in reports | January | Can't be changed once any year has been closed. |
| **Opening balances date** (a date) | The cut-over day: the cash book, day closes and statements start here; the first stock count and account balances are entered for this date | Set in the **Opening balances** setup (§3.7) | Must be today or earlier. Locked after the first day close. Sales before it stay in the sales reports but are not in the cash book. |

- **Where these are read:** `lib/businessTime.ts` reads the cutoff hour, so `dayKey`, `receiptNo` and `salesWhere` all follow it. `Setting` rows: `business_day_end_hour`, `fiscal_year_start_month`, `opening_date`.
- **Until the opening date is set**, Cash & accounts and Statements show a "Set opening balances" prompt instead of empty numbers.

---

## 4. Which page owns which number

| Number | Owned by | Others just link |
|---|---|---|
| Today's sales / count / average ticket | Overview | — |
| Sales by day, hour, account, person, channel, category | Reports › Sales | Overview (7-day bars) |
| Every single sale | Sales history | Overview (recent 8), Sales report (link) |
| Items sold in a filtered view (qty, value) | Sales history › Items sold | — (the Sales report's items table moves to Reports › Menu) |
| Qty and revenue per dish over time, by category, dishes that never sell | Reports › Menu | — |
| Money in each business account now | Cash & accounts › Balances | Overview tile |
| Today's collections per person (A/c, E/D, cash) | Cash & accounts › Collections | Overview (summary), My performance (own) |
| Every money movement | Cash & accounts › Cash book | — |
| Day totals, expected vs counted | Reports › Day closes | — |
| Stock on hand, low stock, stock value now | Inventory › Stock | Overview (low stock alert) |
| Purchases / usage / waste in a range | Reports › Inventory | — |
| Month / year P&L, cash flow, position | Reports › Statements | — |
| What customers owe | Customers | Statements (position line) |
| What we owe suppliers | Expenses › Suppliers | Statements (position line) |
| Per-person sales, collections, voids, discounts | Reports › Staff | My performance (own) |
| Salaries paid / due | Staff › Payroll | Overview alert |

---

## 5. Other gaps, by priority

- **P1 (daily operation):**
  - split payment (comes with the cash book)
  - discount reason + a cap for cashiers
  - an **audit log** (voids, edits, discounts, price changes, reopening a closed day or month, settings)
- **P2 (links between records):**
  - an **`OrderItem` table** instead of the JSON `items`, so reports stop grouping by name, the Menu report can show categories, and single lines can be voided
  - a **Tables** list: today "5", "T5" and "Table 5" count as different tables
- **P3 (later):**
  - customer history (visits, spend, last order)
  - a kitchen display and a "ready" status for online orders

**Out of scope, by decision:** promotions/campaigns, banners, recipes and deducting stock from menu sales, food cost per dish, clock-in/shifts/hours, manual handovers.

---

## 6. Schema (sketch)

```prisma
model MoneyAccount {                          // business accounts only
  id             Int      @id @default(autoincrement())
  kind           AccountKind @unique          // cash | evc | edahab | card | bank | gateway
  label          String                       // "Cash", "EVC", "eDahab", "Mastercard", "Bank", "Sifalo"
  number         String?
  isActive       Boolean  @default(true)
  openingBalance Decimal  @default(0) @db.Decimal(12, 2)
  openedOn       String                       // YYYY-MM-DD cut-over day
  entries        AccountEntry[]
}

model StaffAccount {                          // where a customer pays a staff member
  id        Int      @id @default(autoincrement())
  staffId   Int
  via       CollectVia                        // evc (A/c) | edahab (E/D) | cash (My cash)
  number    String?                           // printed on the bill; null for cash
  isActive  Boolean  @default(true)
  staff     AdminUser @relation(fields: [staffId], references: [id], onDelete: Cascade)
  @@unique([staffId, via])
  @@index([staffId])
}
// A/c→EVC, E/D→eDahab and My cash→Cash are fixed in code (via → AccountKind): no join table needed.

model AccountEntry {                          // the cash book
  id           Int       @id @default(autoincrement())
  accountId    Int                            // always a business account
  amount       Decimal   @db.Decimal(12, 2)   // signed
  kind         EntryKind                      // sale | invoice_payment | transfer | refund | expense | supplier_payment | salary | owner_in | owner_out | over_short
  businessDay  String                         // YYYY-MM-DD after cutoff
  occurredAt   DateTime  @default(now())
  collectedById Int?                          // the waiter/cashier who took the money
  collectedVia CollectVia?                    // their A/c, E/D or cash
  orderId      Int?
  invoicePaymentId Int?  @unique
  expenseId    Int?      @unique
  supplierPaymentId Int? @unique
  transferId   String?
  reversesId   Int?      @unique
  note         String?
  createdById  Int?
  @@index([accountId, businessDay])
  @@index([businessDay, collectedById])
  @@index([orderId])
}

model DayClose     { businessDay String @id; closedAt DateTime @default(now()); closedById Int; snapshot Json; reopenedAt DateTime?; reopenReason String?; lines DayCloseLine[] }
model DayCloseLine { id Int @id @default(autoincrement()); businessDay String; accountId Int; opening Decimal; moneyIn Decimal; moneyOut Decimal; expected Decimal; counted Decimal?; @@unique([businessDay, accountId]) }

model PeriodClose {                           // month and year closes
  period       String   @id                   // "2026-09" or "FY2026"
  kind         PeriodKind                     // month | year
  closedAt     DateTime @default(now())
  closedById   Int
  snapshot     Json                           // P&L, cash flow, position (+ monthly columns for a year)
  reopenedAt   DateTime?
  reopenReason String?
}

model StockCount      { id Int @id @default(autoincrement()); countedOn String; status CountStatus; lines StockCountLine[] }
model StockCountLine  { id Int @id @default(autoincrement()); countId Int; itemId Int; systemQty Decimal; countedQty Decimal; unitCost Decimal? }
model Supplier        { id Int @id @default(autoincrement()); name String @unique; phone String? }
model SupplierPayment { id Int @id @default(autoincrement()); supplierId Int; amount Decimal; paidAt DateTime }
model ExpenseCategory { id Int @id @default(autoincrement()); name String @unique; kind ExpenseKind }
model AuditLog        { id Int @id @default(autoincrement()); actorId Int?; action String; entity String; entityId String?; meta Json?; at DateTime @default(now()); @@index([entity, entityId]) @@index([at]) }
```

**Changes to existing models:**
- `Order`: add `collectedById`; `paymentMethod` becomes derived (`split` when there is more than one entry); `paymentAccount` is kept only as a label snapshot on old rows.
- `Expense`: add `paidFromAccountId`, `categoryId`, `supplierId?`.
- `StockMovement`: add `supplierId?`, `paidFromAccountId?`.
- **Drop `Banner`** (§7.1) and **drop `Shift`** (§7.2). Both follow the two-step removal: stop using, deploy, then drop.

**Schema hygiene:**
- **Enums** instead of text for role, order status, `paymentStatus`, `paymentMethod`, `source`, `orderType`, movement type, invoice status.
- **Missing foreign-key indexes:** `Order.customerId`, `MenuItem.categoryId`, `OptionGroup.menuItemId`, `ItemOption.optionGroupId`, `ItemExtra.menuItemId`, `ItemTag.tagId`, `Expense.staffId`, `StockMovement.staffId`, `StockMovement(inventoryItemId, createdAt)`.
- **Roles:** merge `admin` into `manager`, and remove the dead `user` role.
- **`PaymentSession`:** add `status`, `orderId` and an expiry.
- **Stale comments:** remove the one on `Invoice`.

---

## 7. API and cleanup

### 7.1 Removing banners
1. **Stop using them. Ship this step alone and deploy it.**
   - Remove the hero banner from `components/menu/screens/HomeScreen.jsx`, and the `banner` / `banners` state from `hooks/menu/useMenuController.js`, `MenuProvider.jsx` and `MenuApp.jsx`.
   - Remove `banners` from `GET /api/menu`.
   - Delete `routes/banners/**`, their entries in `routes/table.ts`, the banner schemas in `validations.ts`, and the banner rows in `seed.cjs`.
2. **Once that is deployed,** a migration drops the `banners` table.
3. **Question:** `Category.period` (morning / midday / evening) is also from the old system. Remove it too (§9 decision 1)?

### 7.2 Removing clock-in and shifts
1. **Stop using them. Ship this step alone and deploy it.**
   - Remove the Clock in/out button and the `my-shifts` query from `app/admin/dashboard/users/page.jsx`.
   - Remove the Shifts card from `reports/employees/[id]/page.jsx`.
   - Remove the "Hours" column and the "Hours on shift" KPI from `reports/employees/page.jsx`, and the matching code in `lib/reports/employees.ts`.
   - Delete `routes/admin/shifts/**` and their entries in `routes/table.ts`.
2. **Once that is deployed,** a migration drops the `shifts` table.

### 7.3 Routes
- **Namespaces:**
  - Public: `/api/menu`, `/api/order`, `/api/checkout`, `/api/payment/*`, `/api/customer/me`.
  - Staff: everything else under `/api/admin/*`. Move the admin write routes for `/api/menu-items`, `/api/categories`, `/api/tags`, `/api/users`, `/api/upload`, `/api/social-links`.
- **One error format.** Today 243 responses return `{ error: 'string' }`, and none use `{ error: { code, message } }`. Pick one, and make the rule file and the code match.
- **Fixes:**
  - `GET /api/admin/orders` becomes live-only and bounded; add `GET /api/admin/orders/counts` for the sidebar badge.
  - Delete `/api/admin/stock-movements` (nothing calls it).
  - Merge the three stock-movement endpoints into one.
- **New endpoints:**
  - `/api/admin/accounts` (business accounts, with balances) and `/api/admin/accounts/:id/entries` (cash book, cursor paging, CSV)
  - `/api/admin/staff/:id/accounts` (a person's A/c, E/D numbers)
  - `/api/admin/collections?day=` (per person, per channel)
  - `/api/admin/me/performance` gains today's own collections
  - `/api/admin/transfers`, `/api/admin/owner-entries`
  - `/api/admin/day-close/:day`: `GET` preview, `POST` close, `POST reopen`
  - `/api/admin/stock-counts`
  - `/api/admin/statements/month/:month` and `/api/admin/statements/year/:year`: `GET` live or frozen, `POST close`, `GET ?format=pack`
  - `/api/admin/suppliers`, `/api/admin/suppliers/:id/payments`
  - `/api/admin/audit`
- **Rules:**
  - **Closed-period guard:** one shared helper, `assertOpenDay(db, businessDay)`, is called by every write that takes a date. If the day, month or year is closed it returns 409 `PERIOD_CLOSED`.
  - **Who collected is checked by the API:** a waiter is always recorded as collecting their own sales (session, never the request). A cashier or manager can name any active staff member. Card is never tagged to staff.

---

## 8. Build order

| Phase | Scope | Done when |
|---|---|---|
| **0 — Cleanup** | Rewrite CLAUDE.md to match the single-tenant reality · **remove banners** (§7.1) · **remove clock-in/shifts** (§7.2) · Orders live-only and bounded · remove duplicate widgets (§2) · delete dead routes and pages · indexes · enums · roles | Orders payload stays flat as history grows; no number appears on two pages; the menu works with no banner; nothing references `Shift` |
| **1 — Money foundation** | Business accounts (Cash, EVC, eDahab, Mastercard, Bank, Sifalo) · staff A/c, E/D numbers · "Collected by" on the Register and in Orders › Pay · bill/receipt prints the collector's numbers · `AccountEntry` written by every money path · split payment · account chosen on expenses, payroll and refunds · transfers, owner in/out · business calendar settings (§3.9) + opening balances · `AuditLog` · My performance shows today's collections | For any day: sum of `sale` rows = paid sales; each person's collections by channel = their sales by payment |
| **2 — Day close** | Collections view · Day close + Z-report (counted vs expected per business account, per-person breakdown) · closed-day lock · voiding after close = refund today | Voiding a sale from a closed day leaves that day unchanged; writing into a closed day returns 409 |
| **3 — Month close** | Suppliers and purchases on credit · expense categories with kind · stock counts · month statements (P&L with cost of goods, cash flow, position) · close month | COGS = opening stock + purchases − closing stock; position change is explained by profit ± owner entries |
| **4 — Year close and order lines** | Year close + annual statements + year pack export · financial-year start setting · `OrderItem` table (with backfill) · Menu report · Tables | A year can't close with an open month; next year opens with this year's closing balances |
| **5 — Later** | Customer history · kitchen display / ready status | — |

**Tests to write first (Rule 06):**
- The cash book ties out against sales for a day.
- The sum of per-person collections = the business EVC, eDahab and Cash sale rows.
- A card sale is never tagged to staff.
- A waiter can't record a collection for someone else.
- A closed day, month or year can't be changed.
- Voiding after close only affects today.
- A split payment sums to the order total.
- The COGS formula.
- A year can't close while a month is open.

## 9. Decisions still open
_Cutoff hour, financial-year start and opening date are now settings the business chooses itself (§3.9)._

1. **`Category.period`** (morning / midday / evening) is from the old system like banners. Remove it too?
2. **Suppliers on credit:** do you buy on credit? If not, suppliers stay simple (paid now only).
3. **Bank:** does the restaurant have a bank account besides EVC, eDahab and Mastercard, and where do Mastercard and Sifalo payouts land?
