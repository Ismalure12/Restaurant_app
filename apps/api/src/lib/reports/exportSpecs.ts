// What each export looks like: the title, the key figures and the tables
// (typed columns) of every Excel/CSV download. Controllers fetch the data and
// hand it here; lib/reports/export.ts writes the file.
import type { Db } from '../db/prisma.js';
import type { Cell, Column, Report, SummaryRow, Table } from './export.js';
import { accountLabel, CHANNEL_LABEL, round2, type SalesFilters } from './common.js';
import type { salesReport } from './sales.js';
import type { menuReport } from './menu.js';
import type { inventoryReport, movementRow } from './inventory.js';
import type { financialReport } from './financial.js';
import type { employeesReport } from './employees.js';

type SalesReport = Awaited<ReturnType<typeof salesReport>>;
type MenuReport = Awaited<ReturnType<typeof menuReport>>;
type InventoryReport = Awaited<ReturnType<typeof inventoryReport>>;
type FinancialReport = Awaited<ReturnType<typeof financialReport>>;
type EmployeesReport = Awaited<ReturnType<typeof employeesReport>>;

const MENU_VALUE_NOTE = 'Menu value = dish prices on the sales lines, before any order discount or delivery fee.';
const share = (part: number, whole: number) => (whole > 0 ? round2((part / whole) * 100) : 0);

// ── Filters, in words ───────────────────────────────────────────────────
/** "Served by Salman", "Account Cash"… for the line under a report's title. One query for the staff names. */
export async function describeSalesFilters(db: Db, f: SalesFilters): Promise<[string, string][]> {
  const ids = [f.staffId, f.waiterId, f.personId].filter((x): x is number => !!x);
  const users = ids.length ? (await db.adminUser.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } })) ?? [] : [];
  const nameOf = (id: number) => { const u = users.find((x) => x.id === id); return u ? u.name?.trim() || u.email : `staff #${id}`; };
  const out: [string, string][] = [];
  if (f.staffId) out.push(['Cashier', nameOf(f.staffId)]);
  if (f.waiterId) out.push(['Served by', nameOf(f.waiterId)]);
  if (f.personId) out.push(['Staff member', nameOf(f.personId)]);
  if (f.account) out.push(['Account', accountLabel(f.account)]);
  if (f.channel) out.push(['Channel', CHANNEL_LABEL[f.channel]]);
  if (f.source) out.push(['Source', f.source === 'online' ? 'Online' : 'Counter']);
  if (f.orderType) out.push(['Service', f.orderType === 'delivery' ? 'Delivery' : 'Dine-in']);
  return out;
}

// ── Sales ledger (Sales history, year statement) ────────────────────────
export interface LedgerLike {
  code: string; receiptNo: string | null; closedAt: Date | null; source: string | null; orderType: string | null;
  tableNumber: string | null; customer: string | null; cashier: string | null; waiter: string | null;
  accountLabel: string; discount: number; total: number; status: string; paymentStatus: string | null; paymentMethod: string | null;
}
const isOff = (r: LedgerLike) => r.status === 'voided' || r.status === 'declined';
/** Same words as the Orders/Sales history chip: Paid · On account · Refunded · Voided · Declined. */
export function saleStatus(r: LedgerLike) {
  if (r.status === 'voided') return 'Voided';
  if (r.status === 'declined') return r.paymentStatus === 'refunded' ? 'Declined · refunded' : 'Declined';
  if (r.paymentStatus === 'refunded') return 'Refunded';
  if (r.paymentStatus === 'paid') return 'Paid';
  return r.paymentMethod === 'invoice' ? 'On account' : 'Unpaid';
}
const channelWord = (r: LedgerLike) => (r.source === 'online' ? 'Online' : r.orderType === 'delivery' ? 'Delivery' : 'Dine-in');

export const LEDGER_COLUMNS: Column[] = [
  { header: 'Order ID' }, { header: 'Receipt #' }, { header: 'Closed', type: 'datetime' }, { header: 'Channel' },
  { header: 'Table' }, { header: 'Customer' }, { header: 'Cashier' }, { header: 'Served by' }, { header: 'Account' },
  { header: 'Status' }, { header: 'Discount', type: 'money', total: true }, { header: 'Total', type: 'money', total: true },
];
export const ledgerCells = (r: LedgerLike): Cell[] => [
  r.code, r.receiptNo, r.closedAt, channelWord(r), r.tableNumber, r.customer, r.cashier, r.waiter, r.accountLabel,
  saleStatus(r), r.discount, r.total,
];

export function ledgerTable(rows: LedgerLike[], title = 'Every sale'): Table {
  // The Total row counts sales only: a voided/declined sale is listed (so it can be found) but not added up.
  const kept = rows.filter((r) => !isOff(r));
  const anyOff = kept.length !== rows.length;
  return {
    key: 'sales', sheet: 'Sales', title, columns: LEDGER_COLUMNS, rows: rows.map(ledgerCells),
    totalsRow: rows.length ? ['Total', ...Array(9).fill(null), round2(kept.reduce((s, r) => s + r.discount, 0)), round2(kept.reduce((s, r) => s + r.total, 0))] : undefined,
    note: anyOff ? 'Voided and declined sales are listed but not included in the Total.' : undefined,
  };
}

export function salesHistoryExport(rows: LedgerLike[], period: { from: string; to: string }, filters: [string, string][], summary?: {
  sales: { count: number; total: number }; onAccount: { count: number; total: number }; voided: { count: number; total: number }; itemsSold: number; dishes: number;
}): Report {
  return {
    title: 'Sales history', file: 'Sales history', period, filters,
    summary: summary ? [
      ['Sales', summary.sales.count, 'int'],
      ['Sales total', summary.sales.total, 'money'],
      ['Billed on account (sales)', summary.onAccount.count, 'int'],
      ['Billed on account (amount)', summary.onAccount.total, 'money'],
      ['Items sold', summary.itemsSold, 'qty'],
      ['Different dishes', summary.dishes, 'int'],
      ['Voided sales', summary.voided.count, 'int'],
      ['Voided amount', summary.voided.total, 'money'],
    ] : undefined,
    tables: [ledgerTable(rows)],
  };
}

export function itemsSoldExport(items: { name: string; qty: number; total: number }[], period: { from: string; to: string }, filters: [string, string][]): Report {
  const total = items.reduce((s, i) => s + i.total, 0);
  return {
    title: 'Items sold', file: 'Items sold', period, filters,
    tables: [{
      key: 'items', sheet: 'Items sold', title: 'Items sold',
      columns: [{ header: 'Item' }, { header: 'Qty', type: 'qty', total: true }, { header: 'Sales', type: 'money', total: true }, { header: 'Share of sales', type: 'percent' }],
      rows: items.map((i) => [i.name, i.qty, i.total, share(i.total, total)]),
      note: MENU_VALUE_NOTE,
    }],
  };
}

// ── Menu tables (Sales report + Menu report) ────────────────────────────
function menuTables(m: MenuReport | SalesReport['items']): Table[] {
  return [
    {
      key: 'categories', sheet: 'Categories', title: 'Sales by menu category',
      columns: [{ header: 'Category' }, { header: 'Dishes sold', type: 'int' }, { header: 'Qty', type: 'qty', total: true }, { header: 'Menu value', type: 'money', total: true }, { header: 'Share', type: 'percent' }],
      rows: m.categories.map((c) => [c.category, c.dishes, c.quantity, c.revenue, c.share]),
      note: MENU_VALUE_NOTE,
    },
    {
      key: 'items', sheet: 'Dishes', title: 'Every dish sold',
      columns: [{ header: 'Dish' }, { header: 'Category' }, { header: 'Qty sold', type: 'qty', total: true }, { header: 'Menu value', type: 'money', total: true }, { header: 'Share', type: 'percent' }],
      rows: m.items.map((i) => [i.name, i.category, i.quantity, i.revenue, i.share]),
      note: MENU_VALUE_NOTE,
    },
    {
      key: 'never', sheet: 'Never sold', title: 'Dishes on the menu that did not sell',
      columns: [{ header: 'Dish' }, { header: 'Category' }],
      rows: m.neverSold.map((d) => [d.name, d.category]),
    },
  ];
}

export function menuReportExport(r: MenuReport, category?: string): Report {
  return {
    title: 'Menu report', file: 'Menu report', period: { from: r.from, to: r.to },
    filters: category ? [['Category', category]] : [],
    tables: menuTables(r),
  };
}

// ── Sales report ────────────────────────────────────────────────────────
export function salesReportExport(r: SalesReport, filters: [string, string][]): Report {
  const s = r.summary;
  const oneDay = r.from === r.to;
  const byAccountTotal = r.byAccount.reduce((n, a) => n + a.total, 0);
  const byChannelTotal = r.byChannel.reduce((n, c) => n + c.total, 0);
  const summary: SummaryRow[] = [
    ['Sales (orders)', s.orders, 'int'],
    ['Net sales', s.netSales, 'money'],
    ['Gross sales (before discounts)', s.grossSales, 'money'],
    ['Discounts given', s.discounts, 'money'],
    ['Delivery fees', s.deliveryFees, 'money'],
    ['Average ticket', s.avgTicket, 'money'],
    ['Items sold', s.itemsSold, 'qty'],
    ['Different dishes sold', s.dishesSold, 'int'],
    ['Billed on account (sales)', s.onAccount.orders, 'int'],
    ['Billed on account (amount)', s.onAccount.total, 'money'],
    ['Voided sales', s.voids.count, 'int'],
    ['Voided amount', s.voids.total, 'money'],
    ['Still owed by customers (all time)', s.receivable.owed, 'money'],
  ];
  const time: Table = oneDay
    ? {
      key: 'days', sheet: 'By hour', title: 'Sales by hour',
      columns: [{ header: 'Hour' }, { header: 'Orders', type: 'int', total: true }, { header: 'Sales', type: 'money', total: true }],
      rows: r.byHour.map((h) => [`${String(h.hour).padStart(2, '0')}:00–${String((h.hour + 1) % 24).padStart(2, '0')}:00`, h.orders, h.total]),
    }
    : {
      key: 'days', sheet: 'By day', title: 'Sales by day',
      columns: [{ header: 'Date', type: 'date' }, { header: 'Orders', type: 'int', total: true }, { header: 'Sales', type: 'money', total: true }],
      rows: r.byDay.map((d) => [d.day, d.orders, d.total]),
    };
  return {
    title: 'Sales report', file: 'Sales report', period: { from: r.from, to: r.to }, filters, summary,
    tables: [
      time,
      {
        key: 'accounts', sheet: 'By account', title: 'Where the money went',
        columns: [{ header: 'Account' }, { header: 'Orders', type: 'int', total: true }, { header: 'Sales', type: 'money', total: true }, { header: 'Share', type: 'percent' }],
        rows: r.byAccount.map((a) => [a.label, a.orders, a.total, share(a.total, byAccountTotal)]),
      },
      {
        key: 'channels', sheet: 'By channel', title: 'Dine-in, delivery and online',
        columns: [{ header: 'Channel' }, { header: 'Orders', type: 'int', total: true }, { header: 'Sales', type: 'money', total: true }, { header: 'Share', type: 'percent' }],
        rows: r.byChannel.map((c) => [c.label, c.orders, c.total, share(c.total, byChannelTotal)]),
      },
      ...menuTables(r.items),
    ],
  };
}

// ── Inventory ───────────────────────────────────────────────────────────
const STOCK_STATUS: Record<string, string> = { ok: 'OK', low: 'Low', out: 'Out of stock' };
export const MOVEMENT_LABEL: Record<string, string> = { purchase: 'Purchase', usage: 'Usage', waste: 'Waste', adjustment: 'Adjustment' };

export function inventoryReportExport(r: InventoryReport, filters: [string, string][]): Report {
  const s = r.summary;
  return {
    title: 'Inventory report', file: 'Inventory report', period: { from: r.from, to: r.to }, filters,
    summary: [
      ['Stock items', s.items, 'int'],
      ['Stock value now', s.stockValue, 'money'],
      ['Low on stock', s.lowStock, 'int'],
      ['Out of stock', s.outOfStock, 'int'],
      ['Purchases in the period', s.purchases, 'money'],
      ['Used in the period (value)', s.usageValue, 'money'],
      ['Wasted in the period (value)', s.wasteValue, 'money'],
    ],
    tables: [
      {
        key: 'stock', sheet: 'Stock', title: 'Stock on hand and movements in the period',
        columns: [
          { header: 'Item' }, { header: 'Unit' }, { header: 'On hand', type: 'qty' }, { header: 'Reorder level', type: 'qty' }, { header: 'Status' },
          { header: 'Unit cost', type: 'money' }, { header: 'Stock value', type: 'money', total: true }, { header: 'Bought', type: 'qty' },
          { header: 'Purchase cost', type: 'money', total: true }, { header: 'Used', type: 'qty' }, { header: 'Wasted', type: 'qty' },
          { header: 'Adjusted', type: 'qty' }, { header: 'Supplier' },
        ],
        rows: r.items.map((i) => [
          i.name, i.unit, i.quantity, i.reorderLevel, STOCK_STATUS[i.status] ?? i.status, i.unitCost, i.value,
          i.purchasedQty, i.purchaseCost, i.usedQty, i.wastedQty, i.adjustedQty, i.supplier,
        ]),
      },
      {
        key: 'suppliers', sheet: 'Suppliers', title: 'Purchases by supplier',
        columns: [{ header: 'Supplier' }, { header: 'Items bought', type: 'int' }, { header: 'Purchase cost', type: 'money', total: true }],
        rows: r.bySupplier.map((x) => [x.supplier, x.items, x.cost]),
      },
    ],
  };
}

export function movementsExport(rows: ReturnType<typeof movementRow>[], period: { from: string; to: string }, filters: [string, string][]): Report {
  return {
    title: 'Stock movements', file: 'Stock movements', period, filters,
    tables: [{
      key: 'movements', sheet: 'Movements', title: 'Every stock movement',
      columns: [
        { header: 'When', type: 'datetime' }, { header: 'Item' }, { header: 'Type' }, { header: 'Quantity', type: 'qty' }, { header: 'Unit' },
        { header: 'Total cost', type: 'money', total: true }, { header: 'Supplier' }, { header: 'On credit' }, { header: 'Recorded by' }, { header: 'Note' },
      ],
      rows: rows.map((m) => [m.createdAt, m.item, MOVEMENT_LABEL[m.type] ?? m.type, m.quantity, m.unit, m.totalCost, m.supplier, m.onCredit ? 'Yes' : '', m.staff, m.note]),
    }],
  };
}

// ── Financial ───────────────────────────────────────────────────────────
export function financialExport(r: FinancialReport): Report {
  const p = r.pnl;
  const k = p.expensesByKind;
  const lines: [string, Cell, boolean?][] = [
    ['Sales paid (till + online)', p.paidSales],
    ['Sales billed on account', p.billedOnAccount],
    ['Total sales', p.totalSales, true],
    ...(p.taxRate > 0 ? [[`   of which tax included (${p.taxRate}%)`, p.includedTax] as [string, Cell]] : []),
    ['Stock purchases', -k.stock_purchase],
    ['Operating expenses', -k.operating],
    ['Payroll', -k.payroll],
    ['Total expenses', -p.expenses, true],
    ['Net profit', p.netProfit, true],
  ];
  return {
    title: 'Financial report', file: 'Financial report', period: { from: r.from, to: r.to },
    summary: [
      ['Total sales', p.totalSales, 'money'],
      ['Total expenses', p.expenses, 'money'],
      ['Net profit', p.netProfit, 'money'],
      ['Profit margin', p.margin, 'percent'],
      ['Sales (orders)', p.orders, 'int'],
      ['Expenses recorded', p.expenseCount, 'int'],
      ['Days that lost money', r.lossDays.length, 'int'],
    ],
    tables: [
      {
        key: 'pnl', sheet: 'Profit & loss', title: 'Profit & loss',
        columns: [{ header: 'Line' }, { header: 'Amount', type: 'money' }],
        rows: lines.map(([l, v]) => [l, v]),
        boldRows: lines.flatMap(([, , b], i) => (b ? [i] : [])),
        note: 'Expenses are shown as negative amounts. Sales count on the day they were paid or billed.',
      },
      {
        key: 'byday', sheet: 'By day', title: 'Sales and expenses by day',
        columns: [{ header: 'Date', type: 'date' }, { header: 'Sales', type: 'money', total: true }, { header: 'Expenses', type: 'money', total: true }, { header: 'Net', type: 'money', total: true }],
        rows: r.byDay.map((d) => [d.day, d.sales, d.expenses, d.net]),
      },
      {
        key: 'days', sheet: 'Loss days', title: 'Days that lost money (worst first)',
        columns: [{ header: 'Date', type: 'date' }, { header: 'Sales', type: 'money', total: true }, { header: 'Expenses', type: 'money', total: true }, { header: 'Net', type: 'money', total: true }],
        rows: r.lossDays.map((d) => [d.day, d.sales, d.expenses, d.net]),
      },
    ],
  };
}

// ── Employees ───────────────────────────────────────────────────────────
const ROLE_WORD: Record<string, string> = { admin: 'Admin', manager: 'Manager', cashier: 'Cashier', waiter: 'Waiter' };

export function employeesExport(r: EmployeesReport, role?: string): Report {
  return {
    title: 'Employees report', file: 'Employees report', period: { from: r.from, to: r.to },
    filters: role ? [['Role', ROLE_WORD[role] ?? role]] : [],
    tables: [{
      key: 'staff', sheet: 'Employees', title: 'Performance per staff member',
      columns: [
        { header: 'Name' }, { header: 'Role' }, { header: 'Active' },
        { header: 'Orders taken', type: 'int', total: true }, { header: 'Sales taken', type: 'money', total: true }, { header: 'Average ticket', type: 'money' },
        { header: 'Orders served', type: 'int', total: true }, { header: 'Sales served', type: 'money', total: true },
        { header: 'Discounts given', type: 'money', total: true }, { header: 'Voids', type: 'int', total: true }, { header: 'Voided value', type: 'money', total: true },
        { header: 'Edits', type: 'int', total: true }, { header: 'Account payments collected', type: 'money', total: true },
      ],
      rows: r.rows.map((e) => [
        e.name, ROLE_WORD[e.role] ?? e.role, e.isActive ? 'Yes' : 'No', e.taken.orders, e.taken.total, e.taken.avgTicket,
        e.served.orders, e.served.total, e.discounts, e.voids.count, e.voids.total, e.edits, e.invoiceCollected,
      ]),
      note: 'Taken = rang up / took the money (cashier). Served = the waiter on the table.',
    }],
  };
}

// ── Expenses ────────────────────────────────────────────────────────────
export function expensesExport(rows: { incurredAt: Date; category: string; note: string | null; paidFrom: string | null; recordedBy: string | null; amount: number }[], period: { from?: string; to?: string }, filters: [string, string][]): Report {
  return {
    title: 'Expenses', file: 'Expenses',
    period: period.from && period.to ? { from: period.from, to: period.to } : undefined,
    filters: [...(period.from && !period.to ? [['From', period.from] as [string, string]] : []), ...(period.to && !period.from ? [['Until', period.to] as [string, string]] : []), ...filters],
    tables: [{
      key: 'expenses', sheet: 'Expenses', title: 'Every expense',
      columns: [{ header: 'Date', type: 'date' }, { header: 'Category' }, { header: 'Note' }, { header: 'Paid from' }, { header: 'Recorded by' }, { header: 'Amount', type: 'money', total: true }],
      rows: rows.map((e) => [e.incurredAt, e.category, e.note, e.paidFrom, e.recordedBy, e.amount]),
    }],
  };
}

// ── Cash book ───────────────────────────────────────────────────────────
export const ENTRY_KIND_LABEL: Record<string, string> = {
  sale: 'Sale', invoice_payment: 'Account payment', refund: 'Refund', adjustment: 'Sale correction', expense: 'Expense',
  salary: 'Salary', supplier_payment: 'Supplier payment', transfer: 'Transfer', owner_in: 'Owner put in', owner_out: 'Owner took out',
  over_short: 'Count difference',
};
const kindWord = (k: string) => ENTRY_KIND_LABEL[k] ?? k;
const inOut = (amount: number): [Cell, Cell] => (amount >= 0 ? [amount, null] : [null, -amount]);

export function cashBookExport(
  account: { label: string },
  rows: { day: string; at: Date; kind: string; amount: number; order?: { code: string } | null; collectedBy?: string | null; by?: string | null; note?: string | null }[],
  period: { from: string; to: string },
  totals: { opening: number; moneyIn: number; moneyOut: number; closing: number } | null,
): Report {
  return {
    title: `Cash book · ${account.label}`, file: `Cash book ${account.label}`, period,
    summary: totals ? [
      ['Opening balance', totals.opening, 'money'],
      ['Money in', totals.moneyIn, 'money'],
      ['Money out', totals.moneyOut, 'money'],
      ['Closing balance', totals.closing, 'money'],
    ] : undefined,
    tables: [{
      key: 'entries', sheet: 'Entries', title: 'Every movement, oldest first',
      columns: [
        { header: 'Day', type: 'date' }, { header: 'Time', type: 'datetime' }, { header: 'What' },
        { header: 'Money in', type: 'money', total: true }, { header: 'Money out', type: 'money', total: true },
        { header: 'Order ID' }, { header: 'Collected by' }, { header: 'Recorded by' }, { header: 'Note' },
      ],
      rows: rows.map((r) => [r.day, r.at, kindWord(r.kind), ...inOut(r.amount), r.order?.code, r.collectedBy, r.by, r.note]),
      note: totals ? `Opening balance ${totals.opening.toFixed(2)} · closing balance ${totals.closing.toFixed(2)}.` : undefined,
    }],
  };
}

// ── Year statement datasets ─────────────────────────────────────────────
export function yearCashBookTable(rows: { day: string; at: Date; account: string; kind: string; amount: number; orderCode: string; collectedBy: string; note: string | null }[]): Table {
  return {
    key: 'cashbook', sheet: 'Cash book', title: 'Every money movement, all accounts',
    columns: [
      { header: 'Day', type: 'date' }, { header: 'Time', type: 'datetime' }, { header: 'Account' }, { header: 'What' },
      { header: 'Money in', type: 'money', total: true }, { header: 'Money out', type: 'money', total: true },
      { header: 'Order ID' }, { header: 'Collected by' }, { header: 'Note' },
    ],
    rows: rows.map((r) => [r.day, r.at, r.account, kindWord(r.kind), ...inOut(r.amount), r.orderCode, r.collectedBy, r.note]),
  };
}
export function yearExpensesTable(rows: { at: Date; category: string; amount: number; paidFrom: string; note: string | null }[]): Table {
  return {
    key: 'expenses', sheet: 'Expenses', title: 'Every expense',
    columns: [{ header: 'Date', type: 'date' }, { header: 'Category' }, { header: 'Amount', type: 'money', total: true }, { header: 'Paid from' }, { header: 'Note' }],
    rows: rows.map((r) => [r.at, r.category, r.amount, r.paidFrom, r.note]),
  };
}
export function yearPayrollTable(rows: { month: string; staff: string; amount: number; paidAt: Date; note: string | null }[]): Table {
  return {
    key: 'payroll', sheet: 'Payroll', title: 'Salaries paid',
    columns: [{ header: 'Month' }, { header: 'Staff' }, { header: 'Amount', type: 'money', total: true }, { header: 'Paid on', type: 'datetime' }, { header: 'Note' }],
    rows: rows.map((r) => [r.month, r.staff, r.amount, r.paidAt, r.note]),
  };
}
export function yearStockCountsTable(rows: { day: string; item: string; unit: string; system: number; counted: number; unitCost: number | null }[]): Table {
  return {
    key: 'stockcounts', sheet: 'Stock counts', title: 'Posted stock counts',
    columns: [
      { header: 'Count date', type: 'date' }, { header: 'Item' }, { header: 'Unit' }, { header: 'System qty', type: 'qty' },
      { header: 'Counted qty', type: 'qty' }, { header: 'Difference', type: 'qty' }, { header: 'Unit cost', type: 'money' }, { header: 'Value', type: 'money', total: true },
    ],
    rows: rows.map((r) => [r.day, r.item, r.unit, r.system, r.counted, round2(r.counted - r.system), r.unitCost, r.unitCost == null ? null : round2(r.counted * r.unitCost)]),
  };
}
const DATASET_TITLE: Record<string, string> = { sales: 'Sales', cashbook: 'Cash book', expenses: 'Expenses', payroll: 'Payroll', stockcounts: 'Stock counts' };
export function yearStatementExport(fy: string, dataset: string, table: Table, period: { from: string; to: string }): Report {
  return { title: `${fy} · ${DATASET_TITLE[dataset] ?? dataset}`, file: `${fy} ${DATASET_TITLE[dataset] ?? dataset}`, period, tables: [table] };
}

