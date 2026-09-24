import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createPrismaMock, tokenFor, type PrismaMock } from './helpers.js';

const db: PrismaMock = vi.hoisted(() => ({}) as PrismaMock);
const sifalo = vi.hoisted(() => ({ startCheckout: vi.fn() }));
vi.mock('../src/lib/db/prisma.js', () => ({ default: db }));
vi.mock('../src/lib/payments/sifalo.js', async (importOriginal) => ({ ...(await importOriginal<object>()), ...sifalo }));

const { createApp } = await import('../src/app.js');
const app = createApp();

// A tiny in-memory settings table behind the mock.
let rows: Record<string, string>;
beforeEach(() => {
  Object.assign(db, createPrismaMock());
  sifalo.startCheckout.mockReset();
  db.category.findMany.mockResolvedValue([]);
  db.socialLink.findMany.mockResolvedValue([]);
  rows = {};
  db.setting.findMany.mockImplementation(async () => Object.entries(rows).map(([key, value]) => ({ key, value })));
  db.setting.upsert.mockImplementation(async ({ where, update }: { where: { key: string }; update: { value: string } }) => {
    rows[where.key] = update.value;
    return { key: where.key, value: update.value };
  });
});

const checkout = {
  name: 'Amina', phone: '0615550101', orderType: 'delivery', address: 'KM4',
  cart: [{ itemId: 1, name: 'Burger', unitPrice: 5, quantity: 1 }], total: 5,
};

describe('online ordering switch', () => {
  it('is on when never set, and the menu says so', async () => {
    const menu = await request(app).get('/api/menu');
    expect(menu.body.onlineOrdering).toEqual({ enabled: true, message: 'Online ordering is coming soon. Please order with a waiter.' });
    const s = await request(app).get('/api/admin/settings').set('Cookie', await tokenFor('manager'));
    expect(s.body).toMatchObject({ onlineOrdering: true, onlineOrderingMessage: '' });
  });

  it('a manager turns it off with a message; the menu carries both', async () => {
    const put = await request(app).put('/api/admin/settings').set('Cookie', await tokenFor('manager'))
      .send({ onlineOrdering: false, onlineOrderingMessage: '  Back on Friday!  ' });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ onlineOrdering: false, onlineOrderingMessage: 'Back on Friday!' });
    expect(rows).toMatchObject({ online_ordering: 'off', online_ordering_message: 'Back on Friday!' });
    const menu = await request(app).get('/api/menu');
    expect(menu.body.onlineOrdering).toEqual({ enabled: false, message: 'Back on Friday!' });
  });

  it('a cashier cannot flip it (403); a bad value is 400', async () => {
    expect((await request(app).put('/api/admin/settings').set('Cookie', await tokenFor('cashier')).send({ onlineOrdering: false })).status).toBe(403);
    expect((await request(app).put('/api/admin/settings').set('Cookie', await tokenFor('manager')).send({ onlineOrdering: 'no' })).status).toBe(400);
    expect((await request(app).put('/api/admin/settings').set('Cookie', await tokenFor('manager')).send({ onlineOrderingMessage: 'x'.repeat(301) })).status).toBe(400);
    expect(db.setting.upsert).not.toHaveBeenCalled();
  });

  it('off → checkout is refused with the message (409) and nothing is created', async () => {
    rows = { online_ordering: 'off', online_ordering_message: 'Back on Friday!' };
    const res = await request(app).post('/api/checkout').send(checkout);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Back on Friday!', code: 'ONLINE_ORDERING_OFF' });
    expect(db.menuItem.findMany).not.toHaveBeenCalled();
    expect(db.paymentSession.create).not.toHaveBeenCalled();
  });

  it('off (no message) → the default message', async () => {
    rows = { online_ordering: 'off' };
    const res = await request(app).post('/api/checkout').send(checkout);
    expect(res.body.error).toBe('Online ordering is coming soon. Please order with a waiter.');
  });

  it('switched off after a checkout was created → payment/initiate refuses, no Sifalo session', async () => {
    rows = { online_ordering: 'off' };
    db.order.findUnique.mockResolvedValue(null);
    db.paymentSession.findUnique.mockResolvedValue({ reference: 'ord-1', amount: '5.00' });
    const res = await request(app).post('/api/payment/initiate').send({ reference: 'ord-1' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ONLINE_ORDERING_OFF');
    expect(sifalo.startCheckout).not.toHaveBeenCalled();
  });
});
