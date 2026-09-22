import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createPrismaMock, tokenFor, type PrismaMock } from './helpers.js';

const db: PrismaMock = vi.hoisted(() => ({}) as PrismaMock);
vi.mock('../src/lib/db/prisma.js', () => ({ default: db }));

const { createApp } = await import('../src/app.js');
const app = createApp();

beforeEach(() => {
  Object.assign(db, createPrismaMock());
  db.order.findMany.mockResolvedValue([]);
  db.order.count.mockResolvedValue(0);
  db.setting.findUnique.mockResolvedValue(null);
});

const argsOf = () => db.order.findMany.mock.calls[0][0];

describe('GET /api/admin/orders — the live Orders page', () => {
  it('is bounded: only open work or today, never the whole history', async () => {
    const res = await request(app).get('/api/admin/orders').set('Cookie', await tokenFor('cashier'));
    expect(res.status).toBe(200);
    const { where, take } = argsOf();
    expect(take).toBe(500);
    expect(where.OR).toContainEqual({ status: { in: ['pending', 'open'] } });
    const today = where.OR.find((c: Record<string, unknown>) => 'createdAt' in c).createdAt.gte as Date;
    expect(today).toBeInstanceOf(Date);
    expect(Date.now() - today.getTime()).toBeLessThan(26 * 3600_000); // start of the local day
    expect(where.OR).toContainEqual({ closedAt: { gte: today } });
    expect(where.OR).toContainEqual({ voidedAt: { gte: today } });
  });

  it('?status=open lists just the unpaid dine-in orders (waiters allowed), oldest first', async () => {
    const res = await request(app).get('/api/admin/orders?status=open').set('Cookie', await tokenFor('waiter'));
    expect(res.status).toBe(200);
    expect(argsOf()).toMatchObject({ where: { status: 'open' }, orderBy: { createdAt: 'asc' }, take: 100 });
  });
});

describe('GET /api/admin/orders/counts — badge numbers', () => {
  it('anonymous 401, waiter 403, nothing counted', async () => {
    expect((await request(app).get('/api/admin/orders/counts')).status).toBe(401);
    expect((await request(app).get('/api/admin/orders/counts').set('Cookie', await tokenFor('waiter'))).status).toBe(403);
    expect(db.order.count).not.toHaveBeenCalled();
  });

  it('counts pending online, unpaid orders and stuck online payments without loading any row', async () => {
    db.order.count.mockResolvedValueOnce(2).mockResolvedValueOnce(5);
    db.paymentSession.count.mockResolvedValue(1);
    const res = await request(app).get('/api/admin/orders/counts').set('Cookie', await tokenFor('cashier'));
    expect(res.body).toEqual({ pending: 2, unpaid: 5, stuckPayments: 1 });
    expect(db.paymentSession.findMany).not.toHaveBeenCalled();
    expect(db.order.count.mock.calls.map((c) => c[0].where)).toEqual([{ status: 'pending' }, { status: 'open' }]);
    expect(db.order.findMany).not.toHaveBeenCalled();
  });
});
