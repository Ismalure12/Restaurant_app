import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { jwtVerify } from 'jose';
import { createPrismaMock, tokenFor, type PrismaMock } from './helpers.js';

const db: PrismaMock = vi.hoisted(() => ({}) as PrismaMock);
const sifalo = vi.hoisted(() => ({ startCheckout: vi.fn(), verify: vi.fn(), refund: vi.fn() }));
vi.mock('../src/lib/db/prisma.js', () => ({ default: db }));
// These tests check the real-amount money rules, so the temporary test charge
// (FIXED_CHARGE_USD) is switched off here; sifalo.test.ts covers the charge itself.
const realAmount = (r: { toString(): string }) => Number(r.toString()).toFixed(2);
vi.mock('../src/lib/payments/sifalo.js', async (importOriginal) => ({ ...(await importOriginal<object>()), ...sifalo, chargedAmount: realAmount }));

const { createApp } = await import('../src/app.js');
const app = createApp();

// Burger 5.00 + "Large" option 1.50 + "Cheese" extra 0.75 = 7.25 per unit.
const BURGER = {
  id: 1, name: 'Burger', price: '5.00', isActive: true,
  optionGroups: [{ options: [{ name: 'Large', priceAdd: '1.50' }] }],
  extras: [{ name: 'Cheese', priceAdd: '0.75' }],
};
const line = (over = {}) => ({
  itemId: 1, name: 'Burger', optionName: 'Large', extras: [{ name: 'Cheese', priceAdd: 99 }],
  unitPrice: 0.01, quantity: 2, ...over,
});
const checkout = (over = {}) => ({
  name: 'Amina', phone: '061-555-0101', orderType: 'dine_in', tableNumber: '4', cart: [line()], total: 14.5, ...over,
});

beforeEach(() => {
  Object.assign(db, createPrismaMock());
  for (const fn of Object.values(sifalo)) fn.mockReset();
});

describe('POST /api/checkout — server-side pricing', () => {
  it('recomputes unitPrice = base + option + extras from the DB and ignores client prices', async () => {
    db.menuItem.findMany.mockResolvedValue([BURGER]);
    const res = await request(app).post('/api/checkout').send(checkout());
    expect(res.status).toBe(200);
    expect(res.body.reference).toMatch(/^ord-/);
    const { data } = db.paymentSession.create.mock.calls[0][0];
    expect(data.amount).toBe(14.5);
    expect(data.phone).toBe('0615550101');
    expect(data.cartJson[0].unitPrice).toBe(7.25);
    expect(data.cartJson[0].extras).toEqual([{ name: 'Cheese', priceAdd: 0.75 }]);
  });

  it('rejects a client total that does not match DB prices (409), no session created', async () => {
    db.menuItem.findMany.mockResolvedValue([BURGER]);
    const res = await request(app).post('/api/checkout').send(checkout({ total: 0.02 }));
    expect(res.status).toBe(409);
    expect(db.paymentSession.create).not.toHaveBeenCalled();
  });

  it('rejects an item that is gone or inactive (400)', async () => {
    db.menuItem.findMany.mockResolvedValue([]);
    const res = await request(app).post('/api/checkout').send(checkout());
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('"Burger" is no longer available');
  });

  it('rejects an empty cart and dine-in without a table (400)', async () => {
    expect((await request(app).post('/api/checkout').send(checkout({ cart: [] }))).status).toBe(400);
    expect((await request(app).post('/api/checkout').send(checkout({ tableNumber: null }))).status).toBe(400);
    expect(db.menuItem.findMany).not.toHaveBeenCalled();
  });
});

// ── Sifalo hosted checkout ──────────────────────────────────────────────────
const SESSION = {
  reference: 'ord-1', phone: '0615550101', name: 'Amina', address: null, orderType: 'dine_in',
  tableNumber: '4', cartJson: [line()], amount: '14.50', sid: null,
};
const PAID = { state: 'paid', sid: 'SID-9', amount: '14.50', currency: 'USD', paymentType: 'ZAAD', code: '601' };

/** verify() answers by what it is asked: order_id → the order's payment, sid → that sid's payment. */
function sifaloHolds(byOrder: object, bySid: object = byOrder) {
  sifalo.verify.mockImplementation(async (q: { order_id?: string; sid?: string }) => (q.order_id ? byOrder : bySid));
}

describe('POST /api/payment/initiate', () => {
  it('opens a checkout for the SERVER-priced session total (no test amount) and returns the Sifalo URL', async () => {
    db.order.findUnique.mockResolvedValue(null);
    db.paymentSession.findUnique.mockResolvedValue(SESSION);
    sifalo.startCheckout.mockResolvedValue({ ok: true, checkoutUrl: 'https://pay.sifalo.com/checkout/?key=k&token=t' });

    const res = await request(app).post('/api/payment/initiate').send({ reference: 'ord-1' });
    expect(res.status).toBe(200);
    expect(res.body.checkoutUrl).toBe('https://pay.sifalo.com/checkout/?key=k&token=t');
    const arg = sifalo.startCheckout.mock.calls[0][0];
    expect(arg.amount).toBe('14.50');
    expect(arg.returnUrl).toBe('http://localhost:3100/api/payment/return?order_id=ord-1');
  });

  it('unknown reference → 404, no Sifalo session opened', async () => {
    db.order.findUnique.mockResolvedValue(null);
    db.paymentSession.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/api/payment/initiate').send({ reference: 'nope' });
    expect(res.status).toBe(404);
    expect(sifalo.startCheckout).not.toHaveBeenCalled();
  });

  it('already-paid checkout → 409, never a second payment', async () => {
    db.order.findUnique.mockResolvedValue({ reference: 'ord-1' });
    const res = await request(app).post('/api/payment/initiate').send({ reference: 'ord-1' });
    expect(res.status).toBe(409);
    expect(sifalo.startCheckout).not.toHaveBeenCalled();
  });

  it('Sifalo refusing the session (e.g. bad credentials) → 502', async () => {
    db.order.findUnique.mockResolvedValue(null);
    db.paymentSession.findUnique.mockResolvedValue(SESSION);
    sifalo.startCheckout.mockResolvedValue({ ok: false, error: 'code 0' });
    const res = await request(app).post('/api/payment/initiate').send({ reference: 'ord-1' });
    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: 'failed' });
  });

  it('missing reference → 400', async () => {
    expect((await request(app).post('/api/payment/initiate').send({})).status).toBe(400);
  });
});

describe('GET /api/payment/return — finalize', () => {
  beforeEach(() => {
    db.order.findUnique.mockResolvedValue(null);
    db.paymentSession.findUnique.mockResolvedValue(SESSION);
    db.paymentSession.update.mockResolvedValue({});
    db.onlineClient.upsert.mockResolvedValue({ id: 42 });
    db.order.create.mockImplementation(async ({ data }: { data: { clientId: number } }) => ({ id: 5, ...data }));
  });

  it('paid for the exact amount → one paid order, session deleted, customer cookie, redirect to confirmation', async () => {
    sifaloHolds(PAID);
    const res = await request(app).get('/api/payment/return?order_id=ord-1&sid=SID-9');
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/?ref=ord-1');

    expect(db.order.create).toHaveBeenCalledTimes(1);
    expect(db.order.create.mock.calls[0][0].data).toMatchObject({
      reference: 'ord-1', total: '14.50', paymentStatus: 'paid', status: 'pending',
      paymentTransactionId: 'SID-9', paymentMethod: 'waafi', clientId: 42,
    });
    expect(db.paymentSession.delete).toHaveBeenCalledWith({ where: { reference: 'ord-1' } });

    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/^customer_session=/);
    expect(cookie).toMatch(/HttpOnly/);
    const token = cookie.split(';')[0].split('=')[1];
    const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET));
    expect(payload).toMatchObject({ clientId: 42, type: 'customer' }); // the set-cookie route accepts it now
  });

  it('amount paid ≠ session amount → no order, failed', async () => {
    sifaloHolds({ ...PAID, amount: '0.01' });
    const res = await request(app).get('/api/payment/return?order_id=ord-1&sid=SID-9');
    expect(res.headers.location).toBe('/?pay=failed');
    expect(db.order.create).not.toHaveBeenCalled();
  });

  it('non-USD payment → no order', async () => {
    sifaloHolds({ ...PAID, currency: 'SLSH' });
    const res = await request(app).get('/api/payment/return?order_id=ord-1&sid=SID-9');
    expect(res.headers.location).toBe('/?pay=failed');
    expect(db.order.create).not.toHaveBeenCalled();
  });

  it('a sid that is not the payment Sifalo holds for this order_id (replay) → no order', async () => {
    // The attacker returns with someone else's paid sid; Sifalo's record for OUR order id differs.
    sifaloHolds({ ...PAID, sid: 'OUR-REAL-SID', state: 'pending' }, { ...PAID, sid: 'STOLEN' });
    const res = await request(app).get('/api/payment/return?order_id=ord-1&sid=STOLEN');
    expect(res.headers.location).toBe('/?pay=failed');
    expect(db.order.create).not.toHaveBeenCalled();
  });

  it('sid already attached to another checkout (unique violation) → no order', async () => {
    db.paymentSession.update.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    sifaloHolds(PAID);
    const res = await request(app).get('/api/payment/return?order_id=ord-1&sid=SID-9');
    expect(res.headers.location).toBe('/?pay=failed');
    expect(db.order.create).not.toHaveBeenCalled();
  });

  it('declined (600/604) → failed, no order', async () => {
    sifaloHolds({ state: 'failed', sid: 'SID-9', amount: '14.50', currency: 'USD', code: '600' });
    const res = await request(app).get('/api/payment/return?order_id=ord-1&sid=SID-9');
    expect(res.headers.location).toBe('/?pay=failed');
    expect(db.order.create).not.toHaveBeenCalled();
  });

  it('pending (603) → redirect to polling, sid remembered, no order yet', async () => {
    sifaloHolds({ state: 'pending', sid: 'SID-9', amount: '14.50', currency: 'USD', code: '603' });
    const res = await request(app).get('/api/payment/return?order_id=ord-1&sid=SID-9');
    expect(res.headers.location).toBe('/?pay=pending&payref=ord-1');
    expect(db.paymentSession.update).toHaveBeenCalledWith({ where: { reference: 'ord-1' }, data: { sid: 'SID-9' } });
    expect(db.order.create).not.toHaveBeenCalled();
  });

  it('Sifalo unreachable → pending (never assumed failed)', async () => {
    sifaloHolds({ state: 'pending', sid: null, amount: null, currency: null, code: null, unreachable: true });
    const res = await request(app).get('/api/payment/return?order_id=ord-1&sid=SID-9');
    expect(res.headers.location).toBe('/?pay=pending&payref=ord-1');
    expect(db.order.create).not.toHaveBeenCalled();
  });

  it('second return / refresh after the order exists → same confirmation, no second order, no verify', async () => {
    db.order.findUnique.mockResolvedValue({ reference: 'ord-1', clientId: 42 });
    const res = await request(app).get('/api/payment/return?order_id=ord-1&sid=SID-9');
    expect(res.headers.location).toBe('/?ref=ord-1');
    expect(sifalo.verify).not.toHaveBeenCalled();
    expect(db.order.create).not.toHaveBeenCalled();
  });

  it('losing the create race (P2002 on reference) → reads the winner, still one order', async () => {
    sifaloHolds(PAID);
    db.order.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ reference: 'ord-1', clientId: 42 });
    db.order.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    const res = await request(app).get('/api/payment/return?order_id=ord-1&sid=SID-9');
    expect(res.headers.location).toBe('/?ref=ord-1');
  });

  it('no order_id → failed', async () => {
    const res = await request(app).get('/api/payment/return?sid=SID-9');
    expect(res.headers.location).toBe('/?pay=failed');
  });
});

describe('POST /api/payment/status — polling', () => {
  it('finds the sid via order_id when the customer never returned, then finalizes', async () => {
    db.order.findUnique.mockResolvedValue(null);
    db.paymentSession.findUnique.mockResolvedValue(SESSION); // sid: null
    db.onlineClient.upsert.mockResolvedValue({ id: 42 });
    db.order.create.mockImplementation(async ({ data }: { data: object }) => ({ id: 5, clientId: 42, ...data }));
    sifaloHolds(PAID);
    const res = await request(app).post('/api/payment/status').send({ reference: 'ord-1' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ state: 'paid', reference: 'ord-1' });
    expect(db.order.create.mock.calls[0][0].data.paymentTransactionId).toBe('SID-9');
  });

  it('still pending → pending', async () => {
    db.order.findUnique.mockResolvedValue(null);
    db.paymentSession.findUnique.mockResolvedValue({ ...SESSION, sid: 'SID-9' });
    sifaloHolds({ state: 'pending', sid: 'SID-9', amount: '14.50', currency: 'USD', code: '603' });
    const res = await request(app).post('/api/payment/status').send({ reference: 'ord-1' });
    expect(res.body).toEqual({ state: 'pending', reference: 'ord-1' });
  });

  it('bad body → 400', async () => {
    expect((await request(app).post('/api/payment/status').send({})).status).toBe(400);
  });
});

describe('POST /api/admin/orders/:id/accept', () => {
  const ORDER = { id: 9, reference: 'ord-9', status: 'pending', paymentStatus: 'paid', paymentTransactionId: 'SID-9', paymentMethod: 'waafi', total: '7.25' };

  it('requires staff (waiter → 403)', async () => {
    const res = await request(app).post('/api/admin/orders/9/accept').set('Cookie', await tokenFor('waiter'));
    expect(res.status).toBe(403);
  });

  it('accepting makes NO gateway call and only moves status pending → confirmed', async () => {
    db.order.findUnique.mockResolvedValueOnce(ORDER).mockResolvedValueOnce({ ...ORDER, status: 'confirmed' });
    db.order.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(app).post('/api/admin/orders/9/accept').set('Cookie', await tokenFor('cashier'));
    expect(res.status).toBe(200);
    expect(db.order.updateMany).toHaveBeenCalledWith({ where: { id: 9, status: 'pending' }, data: { status: 'confirmed' } });
    expect(sifalo.refund).not.toHaveBeenCalled();
    expect(res.body.order.status).toBe('confirmed');
  });

  it('concurrent change → 409; non-pending → 409', async () => {
    db.order.findUnique.mockResolvedValue(ORDER);
    db.order.updateMany.mockResolvedValue({ count: 0 });
    expect((await request(app).post('/api/admin/orders/9/accept').set('Cookie', await tokenFor('admin'))).status).toBe(409);
    db.order.findUnique.mockResolvedValue({ ...ORDER, status: 'declined' });
    expect((await request(app).post('/api/admin/orders/9/accept').set('Cookie', await tokenFor('admin'))).status).toBe(409);
  });
});

describe('POST /api/admin/orders/:id/decline — refund', () => {
  const ORDER = { id: 9, reference: 'ord-9', status: 'pending', paymentStatus: 'paid', paymentTransactionId: 'SID-9', paymentMethod: 'edahab', total: '7.25' };

  it('refunds through Sifalo first, then marks declined + refunded', async () => {
    db.order.findUnique.mockResolvedValueOnce(ORDER).mockResolvedValueOnce({ ...ORDER, status: 'declined', paymentStatus: 'refunded' });
    sifalo.refund.mockResolvedValue({ ok: true, refundSid: 'R-1' });
    db.order.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(app).post('/api/admin/orders/9/decline').set('Cookie', await tokenFor('cashier'));
    expect(res.status).toBe(200);
    expect(sifalo.refund).toHaveBeenCalledWith({ sid: 'SID-9', gateway: 'edahab', amount: '7.25', orderId: 'ord-9-R' });
    expect(db.order.updateMany).toHaveBeenCalledWith({
      where: { id: 9, status: 'pending' },
      data: { status: 'declined', paymentStatus: 'refunded' },
    });
  });

  it('refund failure → 502 and the order is NOT touched (can retry)', async () => {
    db.order.findUnique.mockResolvedValue(ORDER);
    sifalo.refund.mockResolvedValue({ ok: false, error: 'Refund was not accepted', code: '600' });
    const res = await request(app).post('/api/admin/orders/9/decline').set('Cookie', await tokenFor('cashier'));
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/Refund failed/);
    expect(db.order.updateMany).not.toHaveBeenCalled();
  });

  it('unpaid (legacy) pending order → declined without a refund call', async () => {
    db.order.findUnique.mockResolvedValueOnce({ ...ORDER, paymentStatus: 'unpaid' }).mockResolvedValueOnce({ ...ORDER, status: 'declined' });
    db.order.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(app).post('/api/admin/orders/9/decline').set('Cookie', await tokenFor('admin'));
    expect(res.status).toBe(200);
    expect(sifalo.refund).not.toHaveBeenCalled();
    expect(db.order.updateMany.mock.calls[0][0].data).toEqual({ status: 'declined' });
  });
});
