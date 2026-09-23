import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createPrismaMock, tokenFor, type PrismaMock } from './helpers.js';

const db: PrismaMock = vi.hoisted(() => ({}) as PrismaMock);
vi.mock('../src/lib/db/prisma.js', () => ({ default: db }));

const { createApp } = await import('../src/app.js');
const app = createApp();

beforeEach(() => {
  Object.assign(db, createPrismaMock());
  db.setting.findUnique.mockResolvedValue(null); // default permissions
  db.order.count.mockResolvedValue(0);
  db.paymentSession.count.mockResolvedValue(0);
  db.inventoryItem.findMany.mockResolvedValue([]);
  db.dayClose.findMany.mockResolvedValue([]);
});

describe('GET /api/admin/nav-counts — sidebar badges + bell', () => {
  it('anonymous 401, nothing counted', async () => {
    expect((await request(app).get('/api/admin/nav-counts')).status).toBe(401);
    expect(db.order.count).not.toHaveBeenCalled();
  });

  it('manager gets every group: orders, tabs, stock (low + out) and unclosed days', async () => {
    db.order.count.mockImplementation(async ({ where }: { where: { status: string } }) => (where.status === 'pending' ? 2 : 4));
    db.paymentSession.count.mockResolvedValue(1);
    db.inventoryItem.findMany.mockResolvedValue([
      { quantity: 0, reorderLevel: 5 }, { quantity: 3, reorderLevel: 5 }, { quantity: 9, reorderLevel: 5 },
    ]);
    db.setting.findMany.mockResolvedValue([{ key: 'opening_date', value: '2000-01-01' }]);
    db.dayClose.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/admin/nav-counts').set('Cookie', await tokenFor('manager'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ pending: 2, stuckPayments: 1, openTabs: 4, lowStock: 2, outOfStock: 1, oldestUnclosed: '2000-01-01' });
    expect(res.body.unclosedDays).toBe(31); // capped by unclosedDays()
    // Counts only: the stock read selects two numbers, never names.
    expect(db.inventoryItem.findMany.mock.calls[0][0].select).toEqual({ quantity: true, reorderLevel: true });
    expect(db.order.findMany).not.toHaveBeenCalled();
  });

  it('a waiter (Register + Sales only by default) learns nothing about orders, stock or cash', async () => {
    const res = await request(app).get('/api/admin/nav-counts').set('Cookie', await tokenFor('waiter'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
    expect(db.order.count).not.toHaveBeenCalled();
    expect(db.inventoryItem.findMany).not.toHaveBeenCalled();
    expect(db.dayClose.findMany).not.toHaveBeenCalled();
  });

  it('a cashier sees orders, tabs and stock (view) but not the cash close state', async () => {
    const res = await request(app).get('/api/admin/nav-counts').set('Cookie', await tokenFor('cashier'));
    expect(Object.keys(res.body).sort()).toEqual(['lowStock', 'openTabs', 'outOfStock', 'pending', 'stuckPayments']);
    expect(db.dayClose.findMany).not.toHaveBeenCalled();
  });
});
