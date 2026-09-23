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
  db.order.aggregate.mockResolvedValue({ _sum: { total: '42.50' }, _count: { _all: 3 } });
  db.order.groupBy.mockResolvedValue([]);
  db.orderItem.groupBy.mockResolvedValue([]);
  db.order.count.mockResolvedValue(0);
  db.adminUser.findMany.mockResolvedValue([]);
  db.inventoryItem.findMany.mockResolvedValue([]);
  db.salaryPayment.findMany.mockResolvedValue([]);
});

const whereOf = () => db.order.findMany.mock.calls[0][0].where;

describe('GET /api/admin/sales — POS › Sales history', () => {
  it('anonymous 401; nothing read', async () => {
    expect((await request(app).get('/api/admin/sales')).status).toBe(401);
    expect(db.order.findMany).not.toHaveBeenCalled();
  });

  it('a waiter sees only the sales they served or rang up — a filter in the URL cannot widen it', async () => {
    const cookie = await tokenFor('waiter', 7);
    const res = await request(app).get('/api/admin/sales?waiterId=99').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('summary');
    expect(whereOf().AND).toContainEqual({ OR: [{ waiterId: 7 }, { staffId: 7 }] });
    expect((await request(app).get('/api/admin/sales?format=csv').set('Cookie', cookie)).status).toBe(403);
  });

  it('a cashier sees every sale but no money totals, and cannot export', async () => {
    const cookie = await tokenFor('cashier');
    const res = await request(app).get('/api/admin/sales').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('summary');
    expect(db.order.aggregate).not.toHaveBeenCalled();
    expect(whereOf().AND[1]).toEqual({}); // no hidden "own sales only" filter
    expect((await request(app).get('/api/admin/sales?format=csv').set('Cookie', cookie)).status).toBe(403);
  });

  it('a manager gets count/total on the first page only', async () => {
    const cookie = await tokenFor('manager');
    const res = await request(app).get('/api/admin/sales').set('Cookie', cookie);
    expect(res.body.summary).toMatchObject({ count: 3, total: 42.5 });
    db.order.aggregate.mockClear();
    const next = await request(app).get('/api/admin/sales?cursor=9').set('Cookie', cookie);
    expect(next.body).not.toHaveProperty('summary');
    expect(db.order.aggregate).not.toHaveBeenCalled();
  });

  it('search: an order code → that id; a short number → receipt # too; always name/phone/table', async () => {
    const cookie = await tokenFor('cashier');
    await request(app).get('/api/admin/sales?q=KFG-260919-0042').set('Cookie', cookie);
    let or = whereOf().AND[2].OR;
    expect(or).toContainEqual({ id: 42 });
    expect(or).toContainEqual({ contactName: { contains: 'KFG-260919-0042', mode: 'insensitive' } });
    db.order.findMany.mockClear();
    await request(app).get('/api/admin/sales?q=0007').set('Cookie', cookie);
    or = whereOf().AND[2].OR;
    expect(or).toContainEqual({ receiptNo: 7 });
    expect(or).toContainEqual({ customer: { phone: { contains: '0007' } } });
  });

  it('keeps the sale rule and the filters side by side (AND), so neither OR clobbers the other', async () => {
    await request(app).get('/api/admin/sales?q=ali&waiterId=4').set('Cookie', await tokenFor('manager'));
    const [sale, filters, search] = whereOf().AND;
    expect(sale.OR).toEqual([{ paymentStatus: 'paid' }, { paymentMethod: 'invoice' }]);
    expect(filters).toEqual({ AND: [{ waiterId: 4 }] });
    expect(search.OR.length).toBeGreaterThan(3);
  });

  it('status=voided lists closed sales voided/declined afterwards', async () => {
    await request(app).get('/api/admin/sales?status=voided').set('Cookie', await tokenFor('cashier'));
    expect(whereOf().AND[0].status).toEqual({ in: ['voided', 'declined'] });
  });

  it('bad input → 400 before any read', async () => {
    const cookie = await tokenFor('manager');
    for (const qs of ['status=open', `q=${'x'.repeat(81)}`, 'from=2026-02-30', 'account=bitcoin']) {
      expect((await request(app).get(`/api/admin/sales?${qs}`).set('Cookie', cookie)).status).toBe(400);
    }
    expect(db.order.findMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/sales/items — Sales history › Items sold', () => {
  const orders = [
    { id: 1, items: [{ name: 'Shaah', quantity: 2, unitPrice: 0.5 }, { name: 'Bariis', quantity: 1, unitPrice: 4 }] },
    { id: 2, items: [{ name: 'Shaah', quantity: 3, unitPrice: 0.5 }] },
  ];

  it('anonymous 401; bad input 400 before any read', async () => {
    expect((await request(app).get('/api/admin/sales/items')).status).toBe(401);
    const cookie = await tokenFor('cashier');
    for (const qs of ['status=open', 'from=2026-02-30', 'account=bitcoin']) {
      expect((await request(app).get(`/api/admin/sales/items?${qs}`).set('Cookie', cookie)).status).toBe(400);
    }
    expect(db.order.findMany).not.toHaveBeenCalled();
  });

  it('adds up qty and value per item, most sold first, with totals', async () => {
    db.order.findMany.mockResolvedValueOnce(orders);
    const res = await request(app).get('/api/admin/sales/items').set('Cookie', await tokenFor('cashier'));
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([
      { name: 'Shaah', qty: 5, total: 2.5 },
      { name: 'Bariis', qty: 1, total: 4 },
    ]);
    expect(res.body).toMatchObject({ units: 6, total: 6.5 });
  });

  it('counts exactly the sales the list shows (same where), and a waiter only their own', async () => {
    const qs = 'q=ali&status=voided&source=pos';
    await request(app).get(`/api/admin/sales?${qs}`).set('Cookie', await tokenFor('waiter', 7));
    const listWhere = whereOf();
    db.order.findMany.mockClear();
    await request(app).get(`/api/admin/sales/items?${qs}`).set('Cookie', await tokenFor('waiter', 7));
    expect(whereOf()).toEqual(listWhere);
    expect(whereOf().AND).toContainEqual({ OR: [{ waiterId: 7 }, { staffId: 7 }] });
  });
});
