import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createPrismaMock, tokenFor, type PrismaMock } from './helpers.js';

// Sell group pages: Tables status (oldest open tab per table) and the
// Overview's channel card (byChannel from the same sales report).

const db: PrismaMock = vi.hoisted(() => ({}) as PrismaMock);
vi.mock('../src/lib/db/prisma.js', () => ({ default: db }));

const { createApp } = await import('../src/app.js');
const app = createApp();
const as = async (role: string) => ({ Cookie: await tokenFor(role, 1) });
const EMPTY = { _sum: {}, _count: { _all: 0 } };

beforeEach(() => {
  Object.assign(db, createPrismaMock());
  for (const m of [db.order, db.invoice, db.invoicePayment, db.adminUser, db.customer, db.orderItem, db.menuItem, db.expense, db.stockMovement, db.inventoryItem, db.salaryPayment]) {
    m.aggregate.mockResolvedValue(EMPTY);
    m.groupBy.mockResolvedValue([]);
    m.findMany.mockResolvedValue([]);
  }
  db.order.count.mockResolvedValue(0);
  db.invoice.count.mockResolvedValue(0);
  db.setting.findUnique.mockResolvedValue(null); // default permissions
});

describe('GET /api/admin/tables?status=1 — busy tables with their oldest open tab', () => {
  const TABLES = [
    { id: 1, name: '5', isActive: true, sortOrder: 0 },
    { id: 2, name: 'Terrace', isActive: false, sortOrder: 1 },
    { id: 3, name: '7', isActive: true, sortOrder: 2 },
  ];
  const t0 = new Date('2026-09-22T09:00:00Z');
  const t1 = new Date('2026-09-22T10:30:00Z');

  it('anonymous 401; a waiter (no Tables access) 403 — no orders read', async () => {
    expect((await request(app).get('/api/admin/tables?status=1')).status).toBe(401);
    expect((await request(app).get('/api/admin/tables?status=1').set(await as('waiter'))).status).toBe(403);
    expect(db.order.findMany).not.toHaveBeenCalled();
  });

  it('without status=1 (any other value) it is the plain picker list: active tables, no order read', async () => {
    db.diningTable.findMany.mockResolvedValue([TABLES[0], TABLES[2]]);
    const res = await request(app).get('/api/admin/tables?status=yes').set(await as('waiter'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 1, name: '5' }, { id: 3, name: '7' }]);
    expect(db.diningTable.findMany.mock.calls[0][0].where).toEqual({ isActive: true });
    expect(db.order.findMany).not.toHaveBeenCalled();
  });

  it('manager: tabs, total, oldest open order id + time per table, in ONE order read', async () => {
    db.diningTable.findMany.mockResolvedValue(TABLES);
    // Returned oldest first, as the query asks for; "T5" and "Table 5" are table 5.
    db.order.findMany.mockResolvedValue([
      { id: 40, tableNumber: 'T5', total: 12.5, createdAt: t0 },
      { id: 44, tableNumber: 'Table 5', total: 7.25, createdAt: t1 },
      { id: 41, tableNumber: '7', total: 30, createdAt: t1 },
    ]);
    const res = await request(app).get('/api/admin/tables?status=1').set(await as('manager'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: 1, name: '5', isActive: true, sortOrder: 0, tabs: 2, total: 19.75, orderId: 40, oldestAt: t0.toISOString() },
      { id: 2, name: 'Terrace', isActive: false, sortOrder: 1, tabs: 0, total: 0, orderId: null, oldestAt: null },
      { id: 3, name: '7', isActive: true, sortOrder: 2, tabs: 1, total: 30, orderId: 41, oldestAt: t1.toISOString() },
    ]);
    // No per-table query: one bounded read of open dine-in orders, oldest first.
    expect(db.order.findMany).toHaveBeenCalledTimes(1);
    const q = db.order.findMany.mock.calls[0][0];
    expect(q.where).toEqual({ status: 'open', orderType: 'dine_in' });
    expect(q.orderBy).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
    expect(q.take).toBe(500);
    expect(q.select).toEqual({ id: true, tableNumber: true, total: true, createdAt: true });
  });
});

describe('GET /api/admin/overview — byChannel', () => {
  const url = '/api/admin/overview?from=2026-09-08&to=2026-09-14';

  it('manager only; bad staff filter → 400 before any read', async () => {
    expect((await request(app).get(url)).status).toBe(401);
    expect((await request(app).get(url).set(await as('cashier'))).status).toBe(403);
    expect((await request(app).get(`${url}&waiterId=abc`).set(await as('manager'))).status).toBe(400);
    expect(db.order.aggregate).not.toHaveBeenCalled();
  });

  it('returns the period’s sales by channel from the sales report; waiter/cashier filters reach the query', async () => {
    db.order.groupBy.mockImplementation(async (a: { by: string[] }) => (a.by.includes('orderType') && a.by.includes('source')
      ? [
        { source: 'pos', orderType: 'dine_in', _sum: { total: 50 }, _count: { _all: 5 } },
        { source: 'online', orderType: 'delivery', _sum: { total: 10 }, _count: { _all: 1 } },
      ]
      : []));
    const res = await request(app).get(`${url}&waiterId=7&staffId=3`).set(await as('manager'));
    expect(res.status).toBe(200);
    expect(res.body.byChannel).toEqual([
      { channel: 'dine_in', label: 'Dine-in', orders: 5, total: 50 },
      { channel: 'online', label: 'Online', orders: 1, total: 10 },
    ]);
    const wheres = db.order.aggregate.mock.calls.map((c) => JSON.stringify(c[0].where));
    expect(wheres.some((w) => w.includes('"waiterId":7') && w.includes('"staffId":3'))).toBe(true);
    expect(res.body.filtered).toBe(true);
  });
});
