import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import prisma from '../../lib/db/prisma.js';
import { requirePage } from '../../lib/auth/auth.js';
import { searchParams } from '../../utils/query.js';
import { parseRange, parseSalesFilters, sendCsv, localStamp } from '../../lib/reports/common.js';
import { salesReport } from '../../lib/reports/sales.js';
import { inventoryReport, MOVEMENT_TYPES, type InventoryFilters, type MovementType, MOVEMENT_SELECT, movementRow } from '../../lib/reports/inventory.js';
import { env } from '../../config/env.js';
import { financialReport } from '../../lib/reports/financial.js';
import { employeesReport, STAFF_REPORT_ROLES, employeeDetail } from '../../lib/reports/employees.js';
import { menuReport } from '../../lib/reports/menu.js';

// GET /api/admin/reports/sales?from&to&waiterId&staffId&account&source&orderType
//   JSON: summary, by day/hour/weekday×hour/account/source/service, and `items`
//   (dishes, categories, never sold — from OrderItem; ?category= narrows them).
//   ?format=csv&table=days|accounts|items|categories|never → that table as CSV.
//   (Per-person totals: the Employees report. Every sale: /api/admin/sales.)
// Manager tier. Range: local days (BUSINESS_TZ), up to 366, default today.
const CSV_TABLES = ['days', 'accounts', 'items', 'categories', 'never'] as const;
type CsvTable = (typeof CSV_TABLES)[number];

export async function getSalesReport(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'reports', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const range = parseRange(req);
  if (!range.ok) return res.status(400).json({ error: range.error });
  const filters = parseSalesFilters(req);
  if (!filters.ok) return res.status(400).json({ error: filters.error });
  const q = searchParams(req);
  const csv = q.get('format') === 'csv';
  const table = (q.get('table') || 'items') as CsvTable;
  if (csv && !CSV_TABLES.includes(table)) return res.status(400).json({ error: `table must be one of: ${CSV_TABLES.join(', ')}` });

  try {
    const category = (q.get('category') || '').trim().slice(0, 80) || undefined;
    const r = await salesReport(prisma, range.value, filters.value, { category });
    if (!csv) return res.json(r);

    const name = `sales-${table}_${r.from}_${r.to}.csv`;
    switch (table) {
      case 'days':
        return sendCsv(res, name, ['Date', 'Orders', 'Sales'], r.byDay.map((d) => [d.day, d.orders, d.total.toFixed(2)]));
      case 'accounts':
        return sendCsv(res, name, ['Account', 'Orders', 'Sales'], r.byAccount.map((a) => [a.label, a.orders, a.total.toFixed(2)]));
      case 'categories':
        return sendCsv(res, name, ['Category', 'Dishes', 'Qty', 'Menu value', 'Share %'], r.items.categories.map((c) => [c.category, c.dishes, c.quantity, c.revenue.toFixed(2), c.share]));
      case 'never':
        return sendCsv(res, name, ['Dish', 'Category'], r.items.neverSold.map((d) => [d.name, d.category]));
      default:
        return sendCsv(res, name, ['Dish', 'Category', 'Qty sold', 'Menu value', 'Share %'], r.items.items.map((i) => [i.name, i.category, i.quantity, i.revenue.toFixed(2), i.share]));
    }
  } catch (err) {
    console.error('GET /api/admin/reports/sales:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/admin/reports/inventory?from&to&itemId&type
//   JSON: stock on hand + value, low/out of stock, per-item movement totals in
//   the range, purchases by supplier.
//   ?format=csv&table=stock|suppliers → that table as CSV.
// Manager tier.
export function parseInventoryFilters(q: URLSearchParams): { value?: InventoryFilters; error?: string } {
  const out: InventoryFilters = {};
  const item = q.get('itemId');
  if (item) {
    const n = Number(item);
    if (!Number.isInteger(n) || n <= 0) return { error: 'itemId must be a stock item id' };
    out.itemId = n;
  }
  const type = q.get('type');
  if (type) {
    if (!MOVEMENT_TYPES.includes(type as MovementType)) return { error: `type must be one of: ${MOVEMENT_TYPES.join(', ')}` };
    out.type = type as MovementType;
  }
  return { value: out };
}

export async function getInventoryReport(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'reports', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const range = parseRange(req, 30);
  if (!range.ok) return res.status(400).json({ error: range.error });
  const q = searchParams(req);
  const filters = parseInventoryFilters(q);
  if (filters.error) return res.status(400).json({ error: filters.error });

  try {
    const r = await inventoryReport(prisma, range.value, filters.value!);
    if (q.get('format') !== 'csv') return res.json(r);
    if (q.get('table') === 'suppliers') {
      return sendCsv(res, `inventory-suppliers_${r.from}_${r.to}.csv`, ['Supplier', 'Items bought', 'Purchase cost'],
        r.bySupplier.map((s) => [s.supplier, s.items, s.cost.toFixed(2)]));
    }
    return sendCsv(res, `inventory-stock_${r.from}_${r.to}.csv`,
      ['Item', 'Unit', 'On hand', 'Reorder level', 'Status', 'Unit cost', 'Stock value', 'Bought', 'Purchase cost', 'Used', 'Wasted', 'Adjusted', 'Supplier'],
      r.items.map((i) => [
        i.name, i.unit, i.quantity, i.reorderLevel ?? '', i.status, i.unitCost?.toFixed(2) ?? '', i.value?.toFixed(2) ?? '',
        i.purchasedQty, i.purchaseCost.toFixed(2), i.usedQty, i.wastedQty, i.adjustedQty, i.supplier ?? '',
      ]));
  } catch (err) {
    console.error('GET /api/admin/reports/inventory:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/admin/reports/inventory/movements?from&to&itemId&type — the stock
// movement ledger (who bought/used/wasted what, when, at what cost).
//   JSON: cursor-paginated (?cursor=<id>&limit=50, max 200), newest first.
//   ?format=csv → every matching movement.
// Manager tier.
const BATCH = 1000;

export async function getInventoryMovementsReport(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'reports', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const range = parseRange(req, 30);
  if (!range.ok) return res.status(400).json({ error: range.error });
  const q = searchParams(req);
  const filters = parseInventoryFilters(q);
  if (filters.error) return res.status(400).json({ error: filters.error });
  const f = filters.value!;
  const where: Prisma.StockMovementWhereInput = {
    createdAt: { gte: range.value.from, lt: range.value.to },
    ...(f.itemId ? { inventoryItemId: f.itemId } : {}),
    ...(f.type ? { type: f.type } : {}),
  };

  try {
    if (q.get('format') === 'csv') {
      const rows: ReturnType<typeof movementRow>[] = [];
      let cursor: number | undefined;
      for (;;) {
        const batch = await prisma.stockMovement.findMany({
          where, select: MOVEMENT_SELECT, orderBy: { id: 'desc' }, take: BATCH,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        rows.push(...batch.map(movementRow));
        if (batch.length < BATCH) break;
        cursor = batch[batch.length - 1].id;
      }
      return sendCsv(res, `inventory-movements_${range.value.fromKey}_${range.value.toKey}.csv`,
        ['When (local)', 'Item', 'Type', 'Quantity', 'Unit', 'Total cost', 'Recorded by', 'Note'],
        rows.map((m) => [localStamp(m.createdAt, env.BUSINESS_TZ), m.item, m.type, m.quantity, m.unit, m.totalCost?.toFixed(2) ?? '', m.staff ?? '', m.note ?? '']));
    }

    const limit = Math.min(Math.max(parseInt(q.get('limit') ?? '50', 10) || 50, 1), 200);
    const cursor = parseInt(q.get('cursor') ?? '', 10);
    const page = await prisma.stockMovement.findMany({
      where, select: MOVEMENT_SELECT, orderBy: { id: 'desc' }, take: limit + 1,
      ...(Number.isFinite(cursor) && cursor > 0 ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = page.length > limit;
    const rows = (hasMore ? page.slice(0, limit) : page).map(movementRow);
    return res.json({ rows, nextCursor: hasMore ? rows[rows.length - 1].id : null });
  } catch (err) {
    console.error('GET /api/admin/reports/inventory/movements:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/admin/reports/financial?from&to
//   JSON: profit & loss (net profit is the last line), sales vs expenses by day,
//   and `lossDays` — only the days that lost money.
//   ?format=csv&table=pnl|days → that table as CSV.
// Manager tier. Default range: the last 30 days.
const money = (n: number) => n.toFixed(2);

export async function getFinancialReport(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'reports', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const range = parseRange(req, 30);
  if (!range.ok) return res.status(400).json({ error: range.error });
  const q = searchParams(req);

  try {
    const r = await financialReport(prisma, range.value);
    if (q.get('format') !== 'csv') return res.json(r);
    const tag = `${r.from}_${r.to}`;
    switch (q.get('table')) {
      case 'days':
        return sendCsv(res, `financial-loss-days_${tag}.csv`, ['Date', 'Sales', 'Expenses', 'Net'],
          r.lossDays.map((d) => [d.day, money(d.sales), money(d.expenses), money(d.net)]));
      default:
        return sendCsv(res, `financial-pnl_${tag}.csv`, ['Line', 'Amount'], [
          ['Sales paid (till + online)', money(r.pnl.paidSales)],
          ['Sales billed on account', money(r.pnl.billedOnAccount)],
          ['Total sales', money(r.pnl.totalSales)],
          ...(r.pnl.taxRate > 0 ? [[`Tax included in sales (${r.pnl.taxRate}%)`, money(r.pnl.includedTax)]] : []),
          ['Stock purchases', money(-r.pnl.expensesByKind.stock_purchase)],
          ['Operating expenses', money(-r.pnl.expensesByKind.operating)],
          ['Payroll', money(-r.pnl.expensesByKind.payroll)],
          ['Expenses', money(-r.pnl.expenses)],
          ['Net profit', money(r.pnl.netProfit)],
        ]);
    }
  } catch (err) {
    console.error('GET /api/admin/reports/financial:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/admin/reports/employees?from&to&role
//   JSON: per staff member — sales taken (cashier), sales served (waiter),
//   discounts, voids, edits and invoice money collected.
//   ?format=csv → the per-staff table.
// Manager tier.
export async function getEmployeesReport(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'reports', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const range = parseRange(req, 30);
  if (!range.ok) return res.status(400).json({ error: range.error });
  const q = searchParams(req);
  const role = q.get('role') || undefined;
  if (role && !STAFF_REPORT_ROLES.includes(role as (typeof STAFF_REPORT_ROLES)[number])) {
    return res.status(400).json({ error: `role must be one of: ${STAFF_REPORT_ROLES.join(', ')}` });
  }

  try {
    const r = await employeesReport(prisma, range.value, role);
    if (q.get('format') !== 'csv') return res.json(r);
    return sendCsv(res, `employees_${r.from}_${r.to}.csv`,
      ['Name', 'Role', 'Active', 'Orders taken', 'Sales taken', 'Avg ticket', 'Orders served', 'Sales served', 'Discounts given', 'Voids', 'Voided value', 'Edits', 'Invoice money collected'],
      r.rows.map((e) => [
        e.name, e.role, e.isActive ? 'yes' : 'no', e.taken.orders, e.taken.total.toFixed(2), e.taken.avgTicket.toFixed(2),
        e.served.orders, e.served.total.toFixed(2), e.discounts.toFixed(2), e.voids.count, e.voids.total.toFixed(2),
        e.edits, e.invoiceCollected.toFixed(2),
      ]));
  } catch (err) {
    console.error('GET /api/admin/reports/employees:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/admin/reports/employees/:id?from&to — one staff member: the same
// numbers as the list row, plus sales by day, the accounts their sales went
// into. Their orders come from the sales ledger
// (/api/admin/sales?personId=:id). Manager tier.
export async function getEmployeeReport(req: Request<{ id: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'reports', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
  const range = parseRange(req, 30);
  if (!range.ok) return res.status(400).json({ error: range.error });

  try {
    const r = await employeeDetail(prisma, range.value, id);
    if (!r) return res.status(404).json({ error: 'Staff member not found' });
    return res.json(r);
  } catch (err) {
    console.error(`GET /api/admin/reports/employees/[id] (${id}):`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/admin/reports/menu?from&to
//   JSON: quantity + revenue per dish and per category, and the active dishes
//   that never sold in the range.
//   ?category=<name> limits everything to one menu category.
//   ?format=csv&table=items|categories|never → that table as CSV.
// Manager tier. Default range: the last 30 days.

export async function getMenuReport(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'reports', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const range = parseRange(req, 30);
  if (!range.ok) return res.status(400).json({ error: range.error });
  const q = searchParams(req);

  try {
    const category = (q.get('category') || '').trim().slice(0, 80) || undefined;
    const r = await menuReport(prisma, range.value, { category });
    if (q.get('format') !== 'csv') return res.json(r);
    const tag = `${r.from}_${r.to}`;
    switch (q.get('table')) {
      case 'categories':
        return sendCsv(res, `menu-categories_${tag}.csv`, ['Category', 'Dishes', 'Qty', 'Revenue', 'Share %'],
          r.categories.map((c) => [c.category, c.dishes, c.quantity, money(c.revenue), c.share]));
      case 'never':
        return sendCsv(res, `menu-never-sold_${tag}.csv`, ['Dish', 'Category'], r.neverSold.map((d) => [d.name, d.category]));
      default:
        return sendCsv(res, `menu-dishes_${tag}.csv`, ['Dish', 'Category', 'Qty', 'Revenue', 'Share %'],
          r.items.map((d) => [d.name, d.category, d.quantity, money(d.revenue), d.share]));
    }
  } catch (err) {
    console.error('GET /api/admin/reports/menu:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
