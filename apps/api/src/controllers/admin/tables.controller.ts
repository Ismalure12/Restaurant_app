import type { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../lib/db/prisma.js';
import { requirePos, requirePage, sessionCan } from '../../lib/auth/auth.js';
import { readJson } from '../../utils/body.js';
import { searchParams } from '../../utils/query.js';
import { tableKey } from '../../lib/orders/tables.js';
import { audit } from '../../lib/db/audit.js';
import { num, round2 } from '../../lib/reports/common.js';

// GET  /api/admin/tables — the restaurant's tables. Everyone on the Register
//      gets the ACTIVE ones (id, name) for the table picker; `?status=1`
//      (manager) returns every table with its unpaid tab (count + total, the
//      oldest open order's id + createdAt as `orderId`/`oldestAt`) so the
//      Tables page shows which are busy and for how long.
// POST /api/admin/tables — a manager adds a table.
export const tableFields = {
  name: z.string().trim().min(1, 'Give the table a name').max(20, 'Table name is too long (max 20)'),
  sortOrder: z.number().int().min(0).max(9999),
};
const createSchema = z.object({ name: tableFields.name, sortOrder: tableFields.sortOrder.optional() });
const errCode = (e: unknown) => (e as { code?: string } | null)?.code;

export async function listTables(req: Request, res: Response) {
  const auth = await requirePos(prisma, req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const withStatus = searchParams(req).get('status') === '1';
  if (withStatus && !(await sessionCan(prisma, auth.session, 'tables', 'view'))) {
    return res.status(403).json({ error: 'You can’t see table status' });
  }
  try {
    const tables = await prisma.diningTable.findMany({
      where: withStatus ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      take: 500,
    });
    if (!withStatus) return res.json(tables.map((t) => ({ id: t.id, name: t.name })));
    // One read of every open dine-in order, oldest first — so the first one
    // seen per table is its oldest (orderId / oldestAt), no per-table query.
    const tabs = await prisma.order.findMany({
      where: { status: 'open', orderType: 'dine_in' },
      select: { id: true, tableNumber: true, total: true, createdAt: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 500,
    });
    type Busy = { tabs: number; total: number; orderId: number | null; oldestAt: Date | null };
    const busy = new Map<string, Busy>();
    for (const t of tabs) {
      const key = tableKey(t.tableNumber ?? '');
      const cur = busy.get(key) ?? { tabs: 0, total: 0, orderId: t.id, oldestAt: t.createdAt };
      cur.tabs += 1;
      cur.total = round2(cur.total + num(t.total));
      busy.set(key, cur);
    }
    const free: Busy = { tabs: 0, total: 0, orderId: null, oldestAt: null };
    return res.json(tables.map((t) => ({ id: t.id, name: t.name, isActive: t.isActive, sortOrder: t.sortOrder, ...(busy.get(tableKey(t.name)) ?? free) })));
  } catch (err) {
    console.error('GET /api/admin/tables:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createTable(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'tables', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  let body: unknown;
  try { body = readJson(req); } catch { body = null; }
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });
  try {
    // "T5" and "Table 5" are the same table — refuse a second spelling of one.
    const existing = await prisma.diningTable.findMany({ select: { name: true }, take: 500 });
    if (existing.some((t) => tableKey(t.name) === tableKey(parsed.data.name))) {
      return res.status(409).json({ error: 'A table with that number already exists' });
    }
    const table = await prisma.$transaction(async (tx) => {
      const created = await tx.diningTable.create({ data: { name: parsed.data.name, sortOrder: parsed.data.sortOrder ?? existing.length } });
      await audit(tx, auth.session.userId, 'table.create', 'DiningTable', created.id, { name: created.name });
      return created;
    });
    return res.status(201).json({ id: table.id, name: table.name, isActive: table.isActive, sortOrder: table.sortOrder, tabs: 0, total: 0 });
  } catch (err) {
    if (errCode(err) === 'P2002') return res.status(409).json({ error: 'A table with that name already exists' });
    console.error('POST /api/admin/tables:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// PUT /api/admin/tables/:id — a manager renames a table, reorders it or
// switches it off (old orders keep the name they were rung up with).
// DELETE /api/admin/tables/:id — remove a table that was never used by name.
const updateSchema = z.object({ ...tableFields, isActive: z.boolean() }).partial();
const parseId = (raw: string) => { const n = parseInt(raw, 10); return Number.isFinite(n) && n > 0 ? n : null; };

export async function updateTable(req: Request<{ id: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'tables', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  let body: unknown;
  try { body = readJson(req); } catch { body = null; }
  const parsed = updateSchema.safeParse(body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });
  if (!Object.keys(parsed.data).length) return res.status(400).json({ error: 'Nothing to update' });
  try {
    const existing = await prisma.diningTable.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Table not found' });
    if (parsed.data.name) {
      const others = await prisma.diningTable.findMany({ where: { id: { not: id } }, select: { name: true }, take: 500 });
      if (others.some((t) => tableKey(t.name) === tableKey(parsed.data.name!))) return res.status(409).json({ error: 'A table with that number already exists' });
    }
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.diningTable.update({ where: { id }, data: parsed.data });
      await audit(tx, auth.session.userId, 'table.update', 'DiningTable', id, { before: { name: existing.name, isActive: existing.isActive }, after: parsed.data });
      return row;
    });
    return res.json({ id: updated.id, name: updated.name, isActive: updated.isActive, sortOrder: updated.sortOrder });
  } catch (err) {
    if (errCode(err) === 'P2002') return res.status(409).json({ error: 'A table with that name already exists' });
    console.error(`PUT /api/admin/tables/${id}:`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteTable(req: Request<{ id: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'tables', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  try {
    const existing = await prisma.diningTable.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Table not found' });
    const used = await prisma.order.count({ where: { orderType: 'dine_in', tableNumber: existing.name } });
    if (used > 0) return res.status(409).json({ error: 'Orders were rung up on this table — switch it off instead of deleting it' });
    await prisma.$transaction(async (tx) => {
      await tx.diningTable.delete({ where: { id } });
      await audit(tx, auth.session.userId, 'table.delete', 'DiningTable', id, { name: existing.name });
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error(`DELETE /api/admin/tables/${id}:`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
