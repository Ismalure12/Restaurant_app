import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createPrismaMock, tokenFor, type PrismaMock } from './helpers.js';

const db: PrismaMock = vi.hoisted(() => ({}) as PrismaMock);
vi.mock('../src/lib/db/prisma.js', () => ({ default: db }));

const { createApp } = await import('../src/app.js');
const app = createApp();

// Burger 5.00 + "Large" 1.50 + "Cheese" 0.75 = 7.25 per unit.
const BURGER = {
  id: 1, name: 'Burger', price: '5.00', isActive: true,
  optionGroups: [{ options: [{ name: 'Large', priceAdd: '1.50' }] }],
  extras: [{ name: 'Cheese', priceAdd: '0.75' }],
};
const line = (over = {}) => ({
  itemId: 1, name: 'Burger', optionName: 'Large', extras: [{ name: 'Cheese', priceAdd: 99 }],
  unitPrice: 0.01, quantity: 2, ...over,
});
const UPDATED = new Date('2026-09-19T10:00:00Z');
const TAB = {
  id: 42, status: 'open', paymentStatus: 'unpaid', orderType: 'dine_in', tableNumber: '4',
  items: [{ itemId: 1, name: 'Burger', unitPrice: 7.25, quantity: 2 }], total: '14.50',
  updatedAt: UPDATED, createdAt: UPDATED, staffId: 7, waiterId: 7,
};

beforeEach(() => {
  Object.assign(db, createPrismaMock());
  db.menuItem.findMany.mockResolvedValue([BURGER]);
  db.setting.findMany.mockResolvedValue([]);
  // Waiter #7 exists and is active (dine-in needs a waiter).
  db.adminUser.findFirst.mockResolvedValue({ id: 7 });
});

describe('POST /api/admin/pos/orders — waiter required for dine-in', () => {
  it('cashier dine-in without a waiter → 400; delivery without one is fine; a waiter is always themselves', async () => {
    const cashier = await tokenFor('cashier');
    const none = await request(app).post('/api/admin/pos/orders').set('Cookie', cashier).send({ items: [line()], paymentMethod: 'cash' });
    expect(none.status).toBe(400);
    expect(none.body.error).toBe('Choose the waiter serving this table');
    expect(db.order.create).not.toHaveBeenCalled();

    db.order.create.mockImplementation(async ({ data }: { data: object }) => ({ id: 50, ...data }));
    db.order.findUnique.mockResolvedValue({ ...TAB, id: 50 });
    const delivery = await request(app).post('/api/admin/pos/orders').set('Cookie', cashier)
      .send({ items: [line()], orderType: 'delivery', contactPhone: '061', address: 'X', paymentMethod: 'cash' });
    expect(delivery.status).toBe(201);

    const waiter = await request(app).post('/api/admin/pos/orders').set('Cookie', await tokenFor('waiter', 9)).send({ items: [line()], paymentMethod: 'cash' });
    expect(waiter.status).toBe(201);
    expect(db.order.create.mock.calls[1][0].data.waiterId).toBe(9);
  });
});

describe('POST /api/admin/pos/orders — pay later (payNow:false)', () => {
  it('a waiter opens a dine-in tab: open + unpaid, no receipt #, no payment method', async () => {
    db.order.create.mockImplementation(async ({ data }: { data: object }) => ({ id: 42, ...data }));
    db.order.findUnique.mockResolvedValue({ ...TAB, createdAt: UPDATED });
    const res = await request(app).post('/api/admin/pos/orders').set('Cookie', await tokenFor('waiter', 7))
      .send({ items: [line()], orderType: 'dine_in', tableNumber: '4', payNow: false });
    expect(res.status).toBe(201);
    const { data } = db.order.create.mock.calls[0][0];
    expect(data).toMatchObject({ status: 'open', paymentStatus: 'unpaid', total: 14.5, waiterId: 7 });
    expect(data.paymentMethod).toBeUndefined();
    expect(data.receiptNo).toBeUndefined();
    expect(data.closedAt).toBeUndefined();
    expect(db.receiptCounter.upsert).not.toHaveBeenCalled();
    expect(res.body.code).toBe('KFG-260919-0042');
  });

  it('delivery cannot be paid later (400), and no discount on an open tab (400)', async () => {
    const cookie = await tokenFor('cashier');
    const delivery = await request(app).post('/api/admin/pos/orders').set('Cookie', cookie)
      .send({ items: [line()], orderType: 'delivery', contactPhone: '061', address: 'X', payNow: false });
    expect(delivery.status).toBe(400);
    const discounted = await request(app).post('/api/admin/pos/orders').set('Cookie', cookie)
      .send({ items: [line()], payNow: false, discountType: 'fixed', discountValue: 1 });
    expect(discounted.status).toBe(400);
    expect(db.order.create).not.toHaveBeenCalled();
  });

  it('pay-now sale closes immediately with a receipt # and closedAt', async () => {
    db.receiptCounter.upsert.mockResolvedValue({ last: 7 });
    db.order.create.mockImplementation(async ({ data }: { data: object }) => ({ id: 43, ...data }));
    db.order.findUnique.mockResolvedValue({ ...TAB, id: 43, status: 'confirmed', paymentStatus: 'paid', receiptNo: 7 });
    const res = await request(app).post('/api/admin/pos/orders').set('Cookie', await tokenFor('cashier'))
      .send({ items: [line()], paymentMethod: 'cash', amountReceived: 20, waiterId: 7 });
    expect(res.status).toBe(201);
    const { data } = db.order.create.mock.calls[0][0];
    expect(data).toMatchObject({ status: 'confirmed', paymentStatus: 'paid', paymentMethod: 'cash', receiptNo: 7, amountReceived: 20 });
    expect(data.closedAt).toBeInstanceOf(Date);
    expect(data.receiptDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(res.body.receiptNo).toBe('0007');
  });

  it('pay-now without a payment method → 400', async () => {
    const res = await request(app).post('/api/admin/pos/orders').set('Cookie', await tokenFor('cashier'))
      .send({ items: [line()], waiterId: 7 });
    expect(res.status).toBe(400);
  });

  it('cash tendered below the total → 400, nothing written', async () => {
    const res = await request(app).post('/api/admin/pos/orders').set('Cookie', await tokenFor('cashier'))
      .send({ items: [line()], paymentMethod: 'cash', amountReceived: 10, waiterId: 7 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/less than the total/);
    expect(db.order.create).not.toHaveBeenCalled();
  });

  it('a wallet sale names an active business wallet; its label is recorded and the money written to it, tagged to the table waiter', async () => {
    const cookie = await tokenFor('cashier', 8);
    for (const accountId of [undefined, 1, 4, 6]) { // none · Cash (not a wallet) · switched off · online
      const bad = await request(app).post('/api/admin/pos/orders').set('Cookie', cookie)
        .send({ items: [line()], paymentMethod: 'evc', accountId, waiterId: 7 });
      expect(bad.status).toBe(400);
    }
    expect(db.order.create).not.toHaveBeenCalled();
    db.order.create.mockImplementation(async ({ data }: { data: object }) => ({ id: 44, ...data }));
    db.order.findUnique.mockResolvedValue({ ...TAB, id: 44 });
    const ok = await request(app).post('/api/admin/pos/orders').set('Cookie', cookie)
      .send({ items: [line()], paymentMethod: 'evc', accountId: 3, waiterId: 7 });
    expect(ok.status).toBe(201);
    expect(db.order.create.mock.calls[0][0].data).toMatchObject({ paymentMethod: 'evc', paymentAccount: 'E/d', collectedById: 7 });
    expect(db.accountEntry.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ accountId: 3, amount: 14.5, kind: 'sale', orderId: 44, collectedById: 7, createdById: 8 }),
    ]);
  });
});

describe('POST /api/admin/orders/:id/items — add a round', () => {
  it('appends server-priced lines and updates the total, guarded on status + updatedAt', async () => {
    db.order.findUnique.mockResolvedValueOnce(TAB).mockResolvedValueOnce({ ...TAB, total: '21.75' });
    db.order.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(app).post('/api/admin/orders/42/items').set('Cookie', await tokenFor('cashier', 8))
      .send({ items: [line({ quantity: 1 })] });
    expect(res.status).toBe(200);
    const call = db.order.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: 42, status: 'open', updatedAt: UPDATED });
    expect(call.data.total).toBe(21.75);
    expect(call.data.items).toHaveLength(2);
    expect(call.data.items[1].unitPrice).toBe(7.25);
    expect(res.body.addedLines).toHaveLength(1);
  });

  it('a closed tab → 409, nothing written', async () => {
    db.order.findUnique.mockResolvedValue({ ...TAB, status: 'confirmed' });
    const res = await request(app).post('/api/admin/orders/42/items').set('Cookie', await tokenFor('cashier'))
      .send({ items: [line()] });
    expect(res.status).toBe(409);
    expect(db.order.updateMany).not.toHaveBeenCalled();
  });

  it('lost the race (tab changed) → 409', async () => {
    db.order.findUnique.mockResolvedValue(TAB);
    db.order.updateMany.mockResolvedValue({ count: 0 });
    const res = await request(app).post('/api/admin/orders/42/items').set('Cookie', await tokenFor('manager'))
      .send({ items: [line()] });
    expect(res.status).toBe(409);
  });

  it('anonymous → 401; waiters → 403 (items are added at the counter) before anything is read', async () => {
    expect((await request(app).post('/api/admin/orders/42/items').send({ items: [line()] })).status).toBe(401);
    expect((await request(app).post('/api/admin/orders/42/items').set('Cookie', await tokenFor('waiter')).send({ items: [line()] })).status).toBe(403);
    expect(db.order.findUnique).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/orders/:id/pay — settle a tab', () => {
  it('a waiter cannot take payment (403) — before anything is read', async () => {
    const res = await request(app).post('/api/admin/orders/42/pay').set('Cookie', await tokenFor('waiter'))
      .send({ paymentMethod: 'cash' });
    expect(res.status).toBe(403);
    expect(db.order.findUnique).not.toHaveBeenCalled();
  });

  it('cashier pays: closes with receipt #, discount from stored lines, credited to the cashier', async () => {
    db.receiptCounter.upsert.mockResolvedValue({ last: 3 });
    db.order.findUnique.mockResolvedValueOnce(TAB).mockResolvedValueOnce({ ...TAB, status: 'confirmed', receiptNo: 3 });
    db.order.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(app).post('/api/admin/orders/42/pay').set('Cookie', await tokenFor('cashier', 5))
      .send({ paymentMethod: 'cash', amountReceived: 20, discountType: 'percent', discountValue: 10 });
    expect(res.status).toBe(200);
    // Menu prices are NOT re-read: the tab's stored lines are the bill.
    expect(db.menuItem.findMany).not.toHaveBeenCalled();
    const call = db.order.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: 42, status: 'open', updatedAt: UPDATED });
    expect(call.data).toMatchObject({
      status: 'confirmed', paymentStatus: 'paid', paymentMethod: 'cash', receiptNo: 3,
      discount: 1.45, total: 13.05, staffId: 5, amountReceived: 20,
    });
    expect(res.body.order.receiptNo).toBe('0003');
  });

  it('paying twice → 409 (already closed)', async () => {
    db.order.findUnique.mockResolvedValue({ ...TAB, status: 'confirmed', paymentStatus: 'paid' });
    const res = await request(app).post('/api/admin/orders/42/pay').set('Cookie', await tokenFor('cashier'))
      .send({ paymentMethod: 'card' });
    expect(res.status).toBe(409);
    expect(db.order.updateMany).not.toHaveBeenCalled();
  });

  it('two tills paying at once: the loser gets 409 and the counter bump rolls back with it', async () => {
    db.order.findUnique.mockResolvedValue(TAB);
    db.order.updateMany.mockResolvedValue({ count: 0 });
    const res = await request(app).post('/api/admin/orders/42/pay').set('Cookie', await tokenFor('cashier'))
      .send({ paymentMethod: 'card' });
    expect(res.status).toBe(409);
  });

  it('On account: stays unpaid and creates the invoice in the same transaction', async () => {
    db.order.findUnique.mockResolvedValue(TAB);
    db.order.updateMany.mockResolvedValue({ count: 1 });
    db.customer.findFirst.mockResolvedValue({ id: 3 });
    db.invoice.create.mockResolvedValue({ id: 11 });
    const res = await request(app).post('/api/admin/orders/42/pay').set('Cookie', await tokenFor('manager'))
      .send({ paymentMethod: 'invoice', invoiceCustomerId: 3 });
    expect(res.status).toBe(200);
    expect(db.order.updateMany.mock.calls[0][0].data).toMatchObject({ paymentStatus: 'unpaid', customerId: 3, receiptNo: 1 });
    expect(db.invoice.create.mock.calls[0][0].data).toMatchObject({ orderId: 42, customerId: 3, total: 14.5 });
    expect(res.body.invoiceId).toBe(11);
  });
});

describe('GET /api/admin/orders?status=open', () => {
  it('waiters can list open tabs (bounded), but not the full orders list', async () => {
    db.order.findMany.mockResolvedValue([TAB]);
    const cookie = await tokenFor('waiter');
    const tabs = await request(app).get('/api/admin/orders?status=open').set('Cookie', cookie);
    expect(tabs.status).toBe(200);
    expect(db.order.findMany.mock.calls[0][0]).toMatchObject({ where: { status: 'open' }, take: 100 });
    expect(tabs.body[0].code).toBe('KFG-260919-0042');
    expect((await request(app).get('/api/admin/orders').set('Cookie', cookie)).status).toBe(403);
  });
});
