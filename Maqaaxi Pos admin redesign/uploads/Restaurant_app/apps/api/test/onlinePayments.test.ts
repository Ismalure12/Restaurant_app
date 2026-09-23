import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createPrismaMock, tokenFor, type PrismaMock } from './helpers.js';

// The online-payment safety net: reconciler rules, the staff view and its
// actions, the rate limits on the public payment endpoints, and SSE nudges.
const db: PrismaMock = vi.hoisted(() => ({}) as PrismaMock);
const sifalo = vi.hoisted(() => ({ startCheckout: vi.fn(), verify: vi.fn(), refund: vi.fn() }));
vi.mock('../src/lib/db/prisma.js', () => ({ default: db }));
const realAmount = (r: { toString(): string }) => Number(r.toString()).toFixed(2);
vi.mock('../src/lib/payments/sifalo.js', async (importOriginal) => ({ ...(await importOriginal<object>()), ...sifalo, chargedAmount: realAmount }));

const { createApp } = await import('../src/app.js');
const R = await import('../src/lib/payments/paymentReconciler.js');
const events = await import('../src/lib/orders/orderEvents.js');
const app = createApp();

const MIN = 60_000;
const NOW = new Date('2026-09-21T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const tracked = (over: Partial<{ createdAt: Date; initiatedAt: Date | null; lastCheckedAt: Date | null; checkCount: number; lastResult: string | null }> = {}) => ({
  createdAt: ago(10 * MIN), initiatedAt: ago(9 * MIN), lastCheckedAt: null, checkCount: 0, lastResult: null, ...over,
});

const SESSION = {
  id: 7, reference: 'ord-7', phone: '0615550101', name: 'Amina', address: null, orderType: 'dine_in', tableNumber: '4',
  cartJson: [{ itemId: 1, name: 'Burger', optionName: 'Large', extras: [], unitPrice: 7.25, quantity: 2 }],
  amount: '14.50', sid: null, createdAt: ago(30 * MIN), initiatedAt: ago(29 * MIN), lastCheckedAt: ago(5 * MIN), checkCount: 3, lastResult: 'pending',
};
const PAID = { state: 'paid', sid: 'SID-7', amount: '14.50', currency: 'USD', paymentType: 'EVC', code: '601' };

beforeEach(() => {
  Object.assign(db, createPrismaMock());
  for (const fn of Object.values(sifalo)) fn.mockReset();
  db.paymentSession.updateMany.mockResolvedValue({ count: 1 });
  db.paymentSession.deleteMany.mockResolvedValue({ count: 0 });
});

describe('reconciler rules', () => {
  it('backs off 1 → 2 → 5 → 10 → 30 → 60 min and stays at 60', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map((n) => R.delayAfterCheck(n) / MIN)).toEqual([1, 2, 5, 10, 30, 60, 60]);
  });

  it('due: only checkouts the customer was sent to pay, within 48 h, past their backoff, not needing a person', () => {
    expect(R.isDue(tracked(), NOW)).toBe(true);
    expect(R.isDue(tracked({ initiatedAt: null }), NOW)).toBe(false);
    expect(R.isDue(tracked({ createdAt: ago(49 * 60 * MIN), lastCheckedAt: ago(2 * 60 * MIN), checkCount: 5 }), NOW)).toBe(false); // checked before, now past 48 h
    expect(R.isDue(tracked({ lastCheckedAt: ago(4 * MIN), checkCount: 2 }), NOW)).toBe(false); // waits 5 min
    expect(R.isDue(tracked({ lastCheckedAt: ago(5 * MIN), checkCount: 2 }), NOW)).toBe(true);
    expect(R.isDue(tracked({ lastResult: 'amount_mismatch' }), NOW)).toBe(false);
    expect(R.isDue(tracked({ lastResult: 'no_payment', lastCheckedAt: ago(61 * MIN), checkCount: 8 }), NOW)).toBe(true);
  });

  it('classifies for staff: checking → stuck after 15 min; not paid; attention', () => {
    expect(R.classify(tracked({ initiatedAt: ago(5 * MIN) }), NOW)).toBe('checking');
    expect(R.classify(tracked({ initiatedAt: ago(16 * MIN), lastResult: 'pending' }), NOW)).toBe('stuck');
    expect(R.classify(tracked({ lastResult: 'no_payment' }), NOW)).toBe('not_paid');
    expect(R.classify(tracked({ lastResult: 'declined_604' }), NOW)).toBe('not_paid');
    for (const r of R.ATTENTION_RESULTS) expect(R.classify(tracked({ lastResult: r }), NOW)).toBe('attention');
    expect(R.reasonText('declined_604')).toMatch(/code 604/);
  });

  it('reconcileOnce: a paid-but-never-returned checkout becomes its order; one Sifalo call per due checkout', async () => {
    db.paymentSession.findMany.mockResolvedValue([
      { reference: 'ord-7', ...tracked({ lastCheckedAt: ago(10 * MIN), checkCount: 2 }) },
      { reference: 'ord-8', ...tracked({ lastCheckedAt: ago(1 * MIN), checkCount: 2 }) }, // not due yet
    ]);
    db.order.findUnique.mockResolvedValue(null);
    db.paymentSession.findUnique.mockResolvedValue(SESSION);
    db.onlineClient.upsert.mockResolvedValue({ id: 3 });
    db.order.create.mockImplementation(async ({ data }: { data: object }) => ({ id: 50, ...data }));
    sifalo.verify.mockResolvedValue(PAID);

    const out = await R.reconcileOnce(NOW);
    expect(out).toMatchObject({ checked: 1, paid: 1 });
    expect(sifalo.verify).toHaveBeenCalledWith({ order_id: 'ord-7' });
    expect(sifalo.verify).not.toHaveBeenCalledWith({ order_id: 'ord-8' });
    expect(db.order.create.mock.calls[0][0].data).toMatchObject({ reference: 'ord-7', paymentStatus: 'paid', clientId: 3, paymentTransactionId: 'SID-7' });
  });

  it('reconcileOnce: a not-paid answer is recorded on the checkout, never an order', async () => {
    db.paymentSession.findMany.mockResolvedValue([{ reference: 'ord-7', ...tracked() }]);
    db.order.findUnique.mockResolvedValue(null);
    db.paymentSession.findUnique.mockResolvedValue({ ...SESSION, sid: null });
    sifalo.verify.mockResolvedValue({ state: 'failed', sid: null, amount: null, currency: null, code: '600' });

    await R.reconcileOnce(NOW);
    expect(db.order.create).not.toHaveBeenCalled();
    expect(db.paymentSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { reference: 'ord-7' }, data: expect.objectContaining({ lastResult: 'no_payment', checkCount: { increment: 1 } }),
    }));
  });

  it('every checkout is asked about once, however old; afterwards only inside 48 h', () => {
    expect(R.isDue(tracked({ createdAt: ago(10 * 24 * 60 * MIN), lastCheckedAt: null }), NOW)).toBe(true);
    expect(R.isDue(tracked({ createdAt: ago(10 * 24 * 60 * MIN), lastCheckedAt: ago(2 * 60 * MIN), checkCount: 1 }), NOW)).toBe(false);
  });

  it('an OLD checkout that Sifalo says is paid is flagged paid_late for staff — never turned into an order unattended', async () => {
    db.paymentSession.findMany.mockResolvedValue([{ reference: 'ord-7', ...tracked({ createdAt: ago(5 * 24 * 60 * MIN) }) }]);
    db.order.findUnique.mockResolvedValue(null);
    db.paymentSession.findUnique.mockResolvedValue(SESSION);
    sifalo.verify.mockResolvedValue(PAID);

    const out = await R.reconcileOnce(NOW);
    expect(out.paid).toBe(0);
    expect(db.order.create).not.toHaveBeenCalled();
    expect(db.paymentSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ lastResult: 'paid_late' }) }));
    expect(R.classify(tracked({ lastResult: 'paid_late' }), NOW)).toBe('attention');
  });

  it('stuck (badge) includes a checkout Sifalo was never asked about yet — the NULL result', () => {
    const where = R.stuckWhere(NOW);
    const stuckBranch = (where.OR as Array<{ OR?: unknown[] }>)[1];
    expect(stuckBranch.OR).toContainEqual({ lastResult: null });
  });

  it('cleanup never deletes a checkout that needs a person, nor a pending one', async () => {
    await R.cleanup(NOW);
    const wheres = db.paymentSession.deleteMany.mock.calls.map((c) => JSON.stringify(c[0].where));
    expect(wheres).toHaveLength(2);
    expect(wheres[0]).toContain('"initiatedAt":null');
    expect(wheres[1]).toContain('no_payment');
    expect(wheres[1]).toContain('declined_');
    for (const w of wheres) for (const r of R.ATTENTION_RESULTS) expect(w).not.toContain(r);
    expect(wheres.join()).not.toContain('pending');
  });
});

describe('Orders › Online payments API', () => {
  it('list: anonymous 401, waiter 403; staff see status + reason, never the Sifalo reference', async () => {
    expect((await request(app).get('/api/admin/online-payments')).status).toBe(401);
    expect((await request(app).get('/api/admin/online-payments').set('Cookie', await tokenFor('waiter'))).status).toBe(403);

    db.paymentSession.findMany.mockResolvedValue([SESSION]);
    const res = await request(app).get('/api/admin/online-payments').set('Cookie', await tokenFor('cashier'));
    expect(res.status).toBe(200);
    expect(res.body.payments[0]).toMatchObject({ id: 7, name: 'Amina', phone: '0615550101', items: '2× Burger (Large)', total: 14.5, status: 'stuck', checks: 3 });
    expect(JSON.stringify(res.body)).not.toContain('ord-7');
    expect(db.paymentSession.findMany.mock.calls[0][0].where).toEqual({ initiatedAt: { not: null } });
  });

  it('recheck: Sifalo confirms → the order is created and its id returned', async () => {
    db.paymentSession.findUnique.mockResolvedValueOnce({ reference: 'ord-7', initiatedAt: SESSION.initiatedAt }).mockResolvedValue(SESSION);
    db.order.findUnique.mockResolvedValueOnce(null).mockResolvedValue({ id: 50 });
    db.onlineClient.upsert.mockResolvedValue({ id: 3 });
    db.order.create.mockImplementation(async ({ data }: { data: object }) => ({ id: 50, ...data }));
    sifalo.verify.mockResolvedValue(PAID);

    const res = await request(app).post('/api/admin/online-payments/7/recheck').set('Cookie', await tokenFor('cashier'));
    expect(res.body).toEqual({ state: 'paid', orderId: 50 });
    expect(db.order.create).toHaveBeenCalledTimes(1);
  });

  it('dismiss: cashier 403; reason required; a checkout that turns out paid is NOT dismissed', async () => {
    expect((await request(app).post('/api/admin/online-payments/7/dismiss').set('Cookie', await tokenFor('cashier')).send({ reason: 'test' })).status).toBe(403);
    expect((await request(app).post('/api/admin/online-payments/7/dismiss').set('Cookie', await tokenFor('manager')).send({})).status).toBe(400);

    db.paymentSession.findUnique.mockResolvedValue(SESSION);
    db.order.findUnique.mockResolvedValueOnce(null).mockResolvedValue({ id: 50 });
    db.onlineClient.upsert.mockResolvedValue({ id: 3 });
    db.order.create.mockImplementation(async ({ data }: { data: object }) => ({ id: 50, ...data }));
    sifalo.verify.mockResolvedValue(PAID);
    const res = await request(app).post('/api/admin/online-payments/7/dismiss').set('Cookie', await tokenFor('manager')).send({ reason: 'customer called' });
    expect(res.status).toBe(409);
    expect(res.body.orderId).toBe(50);
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it('dismiss: Sifalo says not paid → deleted and audited with the reason', async () => {
    db.paymentSession.findUnique.mockResolvedValue({ ...SESSION, sid: null });
    db.order.findUnique.mockResolvedValue(null);
    sifalo.verify.mockResolvedValue({ state: 'failed', sid: null, amount: null, currency: null, code: '600' });
    const res = await request(app).post('/api/admin/online-payments/7/dismiss').set('Cookie', await tokenFor('manager')).send({ reason: 'customer called, never paid' });
    expect(res.status).toBe(200);
    expect(db.paymentSession.deleteMany).toHaveBeenCalledWith({ where: { id: 7 } });
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'online_payment.dismiss', entityId: '7', meta: expect.objectContaining({ reason: 'customer called, never paid', lastResult: 'no_payment' }) });
  });

  it('dismiss: a paid_late checkout (handled by hand) is dismissed without creating its order', async () => {
    db.paymentSession.findUnique.mockResolvedValue({ ...SESSION, lastResult: 'paid_late' });
    const res = await request(app).post('/api/admin/online-payments/7/dismiss').set('Cookie', await tokenFor('manager')).send({ reason: 'made at the counter on Friday' });
    expect(res.status).toBe(200);
    expect(sifalo.verify).not.toHaveBeenCalled();
    expect(db.order.create).not.toHaveBeenCalled();
    expect(db.auditLog.create.mock.calls[0][0].data.meta).toMatchObject({ lastResult: 'paid_late' });
  });

  it('dismiss: pending / unreachable at Sifalo → 409, kept', async () => {
    db.paymentSession.findUnique.mockResolvedValue(SESSION);
    db.order.findUnique.mockResolvedValue(null);
    sifalo.verify.mockResolvedValue({ state: 'pending', sid: null, amount: null, currency: null, code: null, unreachable: true });
    const res = await request(app).post('/api/admin/online-payments/7/dismiss').set('Cookie', await tokenFor('manager')).send({ reason: 'customer called' });
    expect(res.status).toBe(409);
    expect(db.paymentSession.deleteMany).not.toHaveBeenCalled();
  });
});

describe('rate limits on the public payment endpoints', () => {
  it('the 31st checkout from one IP within 10 minutes gets 429 with Retry-After', async () => {
    const fresh = createApp(); // its own counters
    const hit = () => request(fresh).post('/api/checkout').send({});
    for (let i = 0; i < 30; i++) expect((await hit()).status).toBe(400); // reaches validation
    const res = await hit();
    expect(res.status).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(res.body.error).toMatch(/Too many attempts/);
  });
});

describe('SSE order nudges', () => {
  afterEach(() => { events.closeAll(); vi.useRealTimers(); });

  it('a burst of changes becomes ONE event per open screen', async () => {
    vi.useFakeTimers();
    const writes: string[] = [];
    const res = { write: (s: string) => { writes.push(s); return true; }, end: () => {} } as never;
    expect(events.subscribe(res)).toBe(true);
    events.publishOrdersChanged();
    events.publishOrdersChanged();
    events.publishOrdersChanged();
    await vi.advanceTimersByTimeAsync(400);
    expect(writes).toEqual(['event: orders\ndata: {}\n\n']);
  });

  it('/api/admin/events: anonymous 401, waiter 403', async () => {
    expect((await request(app).get('/api/admin/events')).status).toBe(401);
    expect((await request(app).get('/api/admin/events').set('Cookie', await tokenFor('waiter'))).status).toBe(403);
  });
});
