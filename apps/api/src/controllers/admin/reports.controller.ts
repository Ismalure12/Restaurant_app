import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import prisma from '../../lib/db/prisma.js';
import { requirePage } from '../../lib/auth/auth.js';
import { searchParams } from '../../utils/query.js';
import { parseRange, parseSalesFilters } from '../../lib/reports/common.js';
import { exportFormat, FORMAT_ERROR, sendReport } from '../../lib/reports/export.js';
import {
  describeSalesFilters, employeesExport, financialExport, inventoryReportExport, menuReportExport, movementsExport, salesReportExport, MOVEMENT_LABEL,
} from '../../lib/reports/exportSpecs.js';
import { salesReport } from '../../lib/reports/sales.js';
import { inventoryReport, MOVEMENT_TYPES, type InventoryFilters, type MovementType, MOVEMENT_SELECT, movementRow } from '../../lib/reports/inventory.js';
import { financialReport } from '../../lib/reports/financial.js';
import { employeesReport, STAFF_REPORT_ROLES, employeeDetail } from '../../lib/reports/employees.js';
import { menuReport } from '../../lib/reports/menu.js';

// GET /api/admin/reports/sales?from&to&waiterId&staffId&account&source&orderType
//   JSON: summary, by day/hour/weekday×hour/account/source/service, and `items`
//   (dishes, categories, never sold — from OrderItem; ?category= narrows them).
//   ?format=xlsx → the whole report as one workbook (Summary + a sheet per table);
//   ?format=csv&table=days|accounts|channels|categories|items|never → that table.
//   (Per-person totals: the Employees report. Every sale: /api/admin/sales.)
// Manager tier. Range: local days (BUSINESS_TZ), up to 366, default today.

export async function getSalesReport(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'reports', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const range = parseRange(req);
  if (!range.ok) return res.status(400).json({ error: range.error });
  const filters = parseSalesFilters(req);
  if (!filters.ok) return res.status(400).json({ error: filters.error });
  const q = searchParams(req);
  const format = exportFormat(req);
  if (format === 'invalid') return res.status(400).json({ error: FORMAT_ERROR });

  try {
    const category = (q.get('category') || '').trim().slice(0, 80) || undefined;
    const r = await salesReport(prisma, range.value, filters.value, { category });
    if (!format) return res.json(r);
    const words = await describeSalesFilters(prisma, filters.value);
    return await sendReport(req, res, format, salesReportExport(r, category ? [...words, ['Category', category]] : words));
  } catch (err) {
    console.error('GET /api/admin/reports/sales:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/admin/reports/inventory?from&to&itemId&type
//   JSON: stock on hand + value, low/out of stock, per-item movement totals in
//   the range, purchases by supplier.
//   ?format=xlsx → Summary + Stock + Suppliers; ?format=csv&table=stock|suppliers.
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
  const format = exportFormat(req);
  if (format === 'invalid') return res.status(400).json({ error: FORMAT_ERROR });

  try {
    const r = await inventoryReport(prisma, range.value, filters.value!);
    if (!format) return res.json(r);
    return await sendReport(req, res, format, inventoryReportExport(r, await inventoryFilterWords(filters.value!)));
  } catch (err) {
    console.error('GET /api/admin/reports/inventory:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/admin/reports/inventory/movements?from&to&itemId&type — the stock
// movement ledger (who bought/used/wasted what, when, at what cost).
//   JSON: cursor-paginated (?cursor=<id>&limit=50, max 200), newest first.
//   ?format=xlsx|csv → every matching movement.
// Manager tier.
const BATCH = 1000;

/** "Item Flour, Type Waste" for an export's filter line. */
async function inventoryFilterWords(f: InventoryFilters): Promise<[string, string][]> {
  const out: [string, string][] = [];
  if (f.itemId) {
    const it = await prisma.inventoryItem.findUnique({ where: { id: f.itemId }, select: { name: true } });
    out.push(['Item', it?.name ?? `#${f.itemId}`]);
  }
  if (f.type) out.push(['Type', MOVEMENT_LABEL[f.type] ?? f.type]);
  return out;
}

export async function getInventoryMovementsReport(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'reports', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const range = parseRange(req, 30);
  if (!range.ok) return res.status(400).json({ error: range.error });
  const q = searchParams(req);
  const filters = parseInventoryFilters(q);
  if (filters.error) return res.status(400).json({ error: filters.error });
  const f = filters.value!;
  const format = exportFormat(req);
  if (format === 'invalid') return res.status(400).json({ error: FORMAT_ERROR });
  const where: Prisma.StockMovementWhereInput = {
    createdAt: { gte: range.value.from, lt: range.value.to },
    ...(f.itemId ? { inventoryItemId: f.itemId } : {}),
    ...(f.type ? { type: f.type } : {}),
  };

  try {
    if (format) {
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
      return await sendReport(req, res, format,
        movementsExport(rows, { from: range.value.fromKey, to: range.value.toKey }, await inventoryFilterWords(f)));
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
//   ?format=xlsx → Summary + Profit & loss + By day + Loss days;
//   ?format=csv&table=pnl|byday|days → that table.
// Manager tier. Default range: the last 30 days.

export async function getFinancialReport(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'reports', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const range = parseRange(req, 30);
  if (!range.ok) return res.status(400).json({ error: range.error });
  const format = exportFormat(req);
  if (format === 'invalid') return res.status(400).json({ error: FORMAT_ERROR });

  try {
    const r = await financialReport(prisma, range.value);
    if (!format) return res.json(r);
    return await sendReport(req, res, format, financialExport(r));
  } catch (err) {
    console.error('GET /api/admin/reports/financial:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/admin/reports/employees?from&to&role
//   JSON: per staff member — sales taken (cashier), sales served (waiter),
//   discounts, voids, edits and invoice money collected.
//   ?format=xlsx|csv → the per-staff table.
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

  const format = exportFormat(req);
  if (format === 'invalid') return res.status(400).json({ error: FORMAT_ERROR });

  try {
    const r = await employeesReport(prisma, range.value, role);
    if (!format) return res.json(r);
    return await sendReport(req, res, format, employeesExport(r, role));
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
//   ?format=xlsx → Categories + Dishes + Never sold; ?format=csv&table=categories|items|never.
// Manager tier. Default range: the last 30 days.

export async function getMenuReport(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'reports', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const range = parseRange(req, 30);
  if (!range.ok) return res.status(400).json({ error: range.error });
  const q = searchParams(req);

  const format = exportFormat(req);
  if (format === 'invalid') return res.status(400).json({ error: FORMAT_ERROR });

  try {
    const category = (q.get('category') || '').trim().slice(0, 80) || undefined;
    const r = await menuReport(prisma, range.value, { category });
    if (!format) return res.json(r);
    return await sendReport(req, res, format, menuReportExport(r, category));
  } catch (err) {
    console.error('GET /api/admin/reports/menu:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
