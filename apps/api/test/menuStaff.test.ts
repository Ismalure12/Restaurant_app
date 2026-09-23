import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createPrismaMock, tokenFor, type PrismaMock } from './helpers.js';

// Menu & back-office redesign endpoints: the Menu items "never sold" KPI, the
// tag list's dish counts, the category delete guard and the Staff cards' 7-day
// stats on GET /api/users.

const db: PrismaMock = vi.hoisted(() => ({}) as PrismaMock);
vi.mock('../src/lib/db/prisma.js', () => ({ default: db }));

const { createApp } = await import('../src/app.js');
const app = createApp();

const dec = (v: string) => ({ toString: () => v, valueOf: () => Number(v) }); // Prisma Decimal stand-in
type Tagged = PrismaMock & { tag: ReturnType<typeof tagModel> };
const tagModel = () => ({ findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() });

beforeEach(() => {
  Object.assign(db, createPrismaMock(), { tag: tagModel() });
  db.setting.findUnique.mockResolvedValue(null); // default permissions
  db.orderItem.groupBy.mockResolvedValue([]);
  db.order.groupBy.mockResolvedValue([]);
  db.adminUser.findMany.mockResolvedValue([]);
});

describe('GET /api/admin/menu-items/never-sold', () => {
  const url = '/api/admin/menu-items/never-sold';

  it('anonymous 401 and a waiter (no Menu access) 403 — nothing read', async () => {
    expect((await request(app).get(url)).status).toBe(401);
    expect((await request(app).get(url).set('Cookie', await tokenFor('waiter'))).status).toBe(403);
    expect(db.orderItem.groupBy).not.toHaveBeenCalled();
    expect(db.menuItem.findMany).not.toHaveBeenCalled();
  });

  it.each(['0', '366', 'abc', '2.5'])('days=%s → 400 before any query', async (days) => {
    const res = await request(app).get(`${url}?days=${days}`).set('Cookie', await tokenFor('manager'));
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
    expect(db.orderItem.groupBy).not.toHaveBeenCalled();
  });

  it('returns the active dishes with no sale line in the last 30 days (the Menu report rule), in two reads', async () => {
    db.orderItem.groupBy.mockResolvedValue([
      { menuItemId: 1, name: 'Burger', categoryName: 'Mains', _sum: { quantity: 4, lineTotal: dec('22.00') } },
    ]);
    db.menuItem.findMany.mockResolvedValue([
      { id: 1, name: 'Burger', category: { name: 'Mains' } },
      { id: 2, name: 'Soup', category: { name: 'Starters' } },
      { id: 3, name: 'Juice', category: { name: 'Drinks' } },
    ]);
    const res = await request(app).get(url).set('Cookie', await tokenFor('cashier'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ days: 30, count: 2, ids: [2, 3] });
    // Closed, not-voided sales only (salesWhere), and one query each — no loop.
    const where = db.orderItem.groupBy.mock.calls[0][0].where;
    expect(where.order.closedAt).toBeDefined();
    expect(where.order.status).toEqual({ in: ['pending', 'confirmed'] });
    expect(db.orderItem.groupBy).toHaveBeenCalledTimes(1);
    expect(db.menuItem.findMany).toHaveBeenCalledTimes(1);
    expect(db.menuItem.findMany.mock.calls[0][0].where).toEqual({ isActive: true });
  });

  it('honours ?days=7', async () => {
    const res = await request(app).get(`${url}?days=7`).set('Cookie', await tokenFor('manager'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ days: 7, count: 0, ids: [] });
  });

  it('database failure → 500, nothing leaked', async () => {
    db.orderItem.groupBy.mockRejectedValue(new Error('connection refused at 10.0.0.1'));
    const res = await request(app).get(url).set('Cookie', await tokenFor('manager'));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });
});

describe('GET /api/tags — dish count per tag', () => {
  it('adds itemCount from one _count include (no query per tag)', async () => {
    (db as Tagged).tag.findMany.mockResolvedValue([
      { id: 1, slug: 'spicy', label: 'Spicy', variant: 'spicy', createdAt: new Date(), _count: { items: 3 } },
      { id: 2, slug: 'new', label: 'New', variant: 'default', createdAt: new Date(), _count: { items: 0 } },
    ]);
    const res = await request(app).get('/api/tags');
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ id: 1, slug: 'spicy', label: 'Spicy', variant: 'spicy', itemCount: 3 });
    expect(res.body[1].itemCount).toBe(0);
    expect(res.body[0]).not.toHaveProperty('_count');
    const args = (db as Tagged).tag.findMany.mock.calls[0][0];
    expect(args.include).toEqual({ _count: { select: { items: true } } });
    expect(args.take).toBeGreaterThan(0);
    expect((db as Tagged).tag.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('DELETE /api/categories/:id — never cascades dishes away', () => {
  it('anonymous 401, waiter 403 — nothing deleted', async () => {
    expect((await request(app).delete('/api/categories/4')).status).toBe(401);
    expect((await request(app).delete('/api/categories/4').set('Cookie', await tokenFor('waiter'))).status).toBe(403);
    expect(db.category.deleteMany).not.toHaveBeenCalled();
    expect(db.category.delete).not.toHaveBeenCalled();
  });

  it('bad id → 400', async () => {
    const res = await request(app).delete('/api/categories/abc').set('Cookie', await tokenFor('manager'));
    expect(res.status).toBe(400);
    expect(db.category.deleteMany).not.toHaveBeenCalled();
  });

  it('a category with dishes → 409 CATEGORY_NOT_EMPTY, and the delete is conditional on "no dishes"', async () => {
    db.category.deleteMany.mockResolvedValue({ count: 0 });
    db.category.findUnique.mockResolvedValue({ id: 4, _count: { items: 3 } });
    const res = await request(app).delete('/api/categories/4').set('Cookie', await tokenFor('manager'));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Move or delete its 3 dishes first', code: 'CATEGORY_NOT_EMPTY', itemCount: 3 });
    expect(db.category.deleteMany.mock.calls[0][0].where).toEqual({ id: 4, items: { none: {} } });
    expect(db.category.delete).not.toHaveBeenCalled();
  });

  it('an empty category is deleted', async () => {
    db.category.deleteMany.mockResolvedValue({ count: 1 });
    const res = await request(app).delete('/api/categories/4').set('Cookie', await tokenFor('cashier'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(db.category.findUnique).not.toHaveBeenCalled();
  });

  it('unknown category → 404', async () => {
    db.category.deleteMany.mockResolvedValue({ count: 0 });
    db.category.findUnique.mockResolvedValue(null);
    const res = await request(app).delete('/api/categories/99').set('Cookie', await tokenFor('manager'));
    expect(res.status).toBe(404);
  });
});

describe('GET /api/users — 7-day stats for managers', () => {
  const USERS = [
    { id: 1, email: 'm@x', role: 'manager', name: 'Maya', phone: null, isActive: true, createdAt: new Date() },
    { id: 2, email: 'c@x', role: 'cashier', name: 'Cali', phone: null, isActive: true, createdAt: new Date() },
    { id: 3, email: 'w@x', role: 'waiter', name: 'Wali', phone: null, isActive: true, createdAt: new Date() },
  ];

  it('anonymous 401', async () => {
    expect((await request(app).get('/api/users')).status).toBe(401);
    expect(db.adminUser.findMany).not.toHaveBeenCalled();
  });

  it('manager: sales rung up OR served (a sale by one person counts once) and voided sales, from two groupBy reads', async () => {
    db.adminUser.findMany.mockResolvedValue(USERS);
    db.order.groupBy
      .mockResolvedValueOnce([
        { staffId: 2, waiterId: 3, _sum: { total: dec('30.00') }, _count: { _all: 2 } },
        { staffId: 2, waiterId: 2, _sum: { total: dec('10.50') }, _count: { _all: 1 } },
        { staffId: 1, waiterId: null, _sum: { total: dec('5.00') }, _count: { _all: 1 } },
      ])
      .mockResolvedValueOnce([{ staffId: 2, waiterId: 3, _count: { _all: 1 } }]);
    const res = await request(app).get('/api/users').set('Cookie', await tokenFor('manager'));
    expect(res.status).toBe(200);
    const by = Object.fromEntries(res.body.map((u: { id: number; stats7d: unknown }) => [u.id, u.stats7d]));
    expect(by[1]).toEqual({ sales: 5, orders: 1, voids: 0 });
    expect(by[2]).toEqual({ sales: 40.5, orders: 3, voids: 1 });
    expect(by[3]).toEqual({ sales: 30, orders: 2, voids: 1 });
    expect(db.order.groupBy).toHaveBeenCalledTimes(2);
    const [salesArgs, voidArgs] = db.order.groupBy.mock.calls.map((c) => c[0]);
    expect(salesArgs.by).toEqual(['staffId', 'waiterId']);
    expect(salesArgs.where.status).toEqual({ in: ['pending', 'confirmed'] }); // salesWhere
    expect(voidArgs.where.voidedAt.gte).toBeInstanceOf(Date);
    // 7 business days: the bounds are 7 local midnights apart (DST-free zone).
    expect((voidArgs.where.voidedAt.lt - voidArgs.where.voidedAt.gte) / 86_400_000).toBe(7);
  });

  it('admin gets the stats too', async () => {
    db.adminUser.findMany.mockResolvedValue(USERS);
    const res = await request(app).get('/api/users').set('Cookie', await tokenFor('admin'));
    expect(res.body[0].stats7d).toEqual({ sales: 0, orders: 0, voids: 0 });
  });

  it.each(['cashier', 'waiter'])('%s gets the list without stats — no order read at all', async (role) => {
    db.adminUser.findMany.mockResolvedValue(USERS);
    const res = await request(app).get('/api/users').set('Cookie', await tokenFor(role));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    for (const u of res.body) expect(u).not.toHaveProperty('stats7d');
    expect(db.order.groupBy).not.toHaveBeenCalled();
  });
});
