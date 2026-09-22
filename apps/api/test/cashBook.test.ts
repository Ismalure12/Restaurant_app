// The cash book (docs/system-blueprint.md §3): every path that moves money
// writes its rows in the same transaction; staff never hold a balance; card
// and online money is never tagged to staff; a void gives back exactly what
// the sale took; transfers net to zero.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createPrismaMock, tokenFor, type PrismaMock } from './helpers.js';

const db: PrismaMock = vi.hoisted(() => ({}) as PrismaMock);
vi.mock('../src/lib/db/prisma.js', () => ({ default: db }));

const { createApp } = await import('../src/app.js');
const app = createApp();

// Burger 5.00 → 2 × 5.00 = 10.00 (no options/extras).
const BURGER = { id: 1, name: 'Burger', price: '5.00', isActive: true, optionGroups: [], extras: [] };
const line = { itemId: 1, name: 'Burger', unitPrice: 5, quantity: 2 };
const sale = (over: object) => ({ items: [line], orderType: 'delivery', contactPhone: '061', address: 'X', ...over });
const rowsWritten = () => db.accountEntry.createMany.mock.calls.flatMap((c) => c[0].data);

beforeEach(() => {
  Object.assign(db, createPrismaMock());
  db.menuItem.findMany.mockResolvedValue([BURGER]);
  db.setting.findMany.mockResolvedValue([]);
  db.adminUser.findFirst.mockResolvedValue({ id: 7 });
  db.order.create.mockImplementation(async ({ data }: { data: object }) => ({ id: 60, ...data }));
  db.order.findUnique.mockResolvedValue({ id: 60, createdAt: new Date(), status: 'confirmed' });
});

describe('selling: which accounts the money goes into', () => {
  it('split payment: parts must add up to the total, go into different active till accounts', async () => {
    const cookie = await tokenFor('cashier', 8);
    for (const payments of [
      [{ accountId: 1, amount: 4 }, { accountId: 3, amount: 5 }], // 9 ≠ 10
      [{ accountId: 1, amount: 5 }, { accountId: 1, amount: 5 }], // same account twice
      [{ accountId: 1, amount: 5 }, { accountId: 6, amount: 5 }], // online gateway
      [{ accountId: 1, amount: 5 }, { accountId: 4, amount: 5 }], // switched off
    ]) {
      const res = await request(app).post('/api/admin/pos/orders').set('Cookie', cookie).send(sale({ paymentMethod: 'split', payments }));
      expect(res.status).toBe(400);
    }
    expect(db.order.create).not.toHaveBeenCalled();
    expect(db.accountEntry.createMany).not.toHaveBeenCalled();
  });

  it('split payment writes one sale row per part; the card part is never tagged to a person', async () => {
    const res = await request(app).post('/api/admin/pos/orders').set('Cookie', await tokenFor('cashier', 8))
      .send(sale({ paymentMethod: 'split', payments: [{ accountId: 1, amount: 3.5 }, { accountId: 5, amount: 6.5 }] }));
    expect(res.status).toBe(201);
    expect(db.order.create.mock.calls[0][0].data).toMatchObject({ paymentMethod: 'split', paymentAccount: null, collectedById: 8, total: 10 });
    const rows = rowsWritten();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ accountId: 1, amount: 3.5, kind: 'sale', collectedById: 8 });
    expect(rows[1]).toMatchObject({ accountId: 5, amount: 6.5, kind: 'sale', collectedById: null });
    expect(rows.reduce((s: number, r: { amount: number }) => s + r.amount, 0)).toBe(10); // ties to the sale total
  });

  it('a card-only sale has no collector; cash lands in the Cash account', async () => {
    const cookie = await tokenFor('cashier', 8);
    await request(app).post('/api/admin/pos/orders').set('Cookie', cookie).send(sale({ paymentMethod: 'card' }));
    expect(db.order.create.mock.calls[0][0].data.collectedById).toBeNull();
    expect(rowsWritten()[0]).toMatchObject({ accountId: 5, collectedById: null });
    await request(app).post('/api/admin/pos/orders').set('Cookie', cookie).send(sale({ paymentMethod: 'cash' }));
    expect(rowsWritten()[1]).toMatchObject({ accountId: 1, amount: 10, collectedById: 8 });
  });

  it('a waiter can only collect for themselves — a collectedById in the request is ignored', async () => {
    const res = await request(app).post('/api/admin/pos/orders').set('Cookie', await tokenFor('waiter', 9))
      .send({ items: [line], paymentMethod: 'cash', collectedById: 7 });
    expect(res.status).toBe(201);
    expect(rowsWritten()[0]).toMatchObject({ collectedById: 9 });
  });

  it('a cashier naming a collector who does not exist → 404, nothing written', async () => {
    db.adminUser.findFirst.mockResolvedValue(null);
    const res = await request(app).post('/api/admin/pos/orders').set('Cookie', await tokenFor('cashier', 8))
      .send(sale({ paymentMethod: 'cash', collectedById: 55 }));
    expect(res.status).toBe(404);
    expect(db.order.create).not.toHaveBeenCalled();
  });

  it('On account takes no money: no cash-book row', async () => {
    db.customer.upsert.mockResolvedValue({ id: 3 });
    db.invoice.create.mockResolvedValue({ id: 11 });
    const res = await request(app).post('/api/admin/pos/orders').set('Cookie', await tokenFor('cashier', 8))
      .send(sale({ paymentMethod: 'invoice', invoiceCustomer: { phone: '0611', name: 'Ali' } }));
    expect(res.status).toBe(201);
    expect(db.accountEntry.createMany).not.toHaveBeenCalled();
  });
});

describe('giving money back', () => {
  const PAID = {
    id: 60, status: 'confirmed', paymentStatus: 'paid', source: 'pos', paymentMethod: 'evc', paymentAccount: 'E/d',
    total: '10.00', updatedAt: new Date(), invoice: null, collectedById: 7,
  };

  it('voiding a paid sale reverses each of its sale rows, dated today, same collector', async () => {
    db.order.findUnique.mockResolvedValueOnce(PAID).mockResolvedValue({ ...PAID, status: 'voided' });
    db.order.updateMany.mockResolvedValue({ count: 1 });
    db.accountEntry.findMany.mockResolvedValue([
      { id: 501, accountId: 1, amount: '3.50', collectedById: 7 },
      { id: 502, accountId: 5, amount: '6.50', collectedById: null },
    ]);
    const res = await request(app).post('/api/admin/orders/60/void').set('Cookie', await tokenFor('manager', 2)).send({ reason: 'Wrong table' });
    expect(res.status).toBe(200);
    expect(db.accountEntry.findMany.mock.calls[0][0].where).toMatchObject({ orderId: 60, kind: { in: ['sale', 'adjustment'] }, reversedBy: { is: null } });
    const rows = rowsWritten();
    expect(rows.map((r: { accountId: number; amount: { toString(): string }; reversesId: number; kind: string }) => [r.accountId, r.amount.toString(), r.reversesId, r.kind]))
      .toEqual([[1, '-3.5', 501, 'refund'], [5, '-6.5', 502, 'refund']]);
    expect(rows[0].collectedById).toBe(7);
    expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'order.void', entityId: '60' }) });
  });

  it('a sale from before the cash book is refunded from the account its payment columns point at', async () => {
    db.order.findUnique.mockResolvedValueOnce(PAID).mockResolvedValue({ ...PAID, status: 'voided' });
    db.order.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(app).post('/api/admin/orders/60/void').set('Cookie', await tokenFor('manager', 2)).send({ reason: 'Wrong table' });
    expect(res.status).toBe(200);
    expect(db.accountEntry.create.mock.calls[0][0].data).toMatchObject({ accountId: 3, amount: -10, kind: 'refund', orderId: 60 });
  });

  it('voiding an unpaid On-account sale moves no money', async () => {
    db.order.findUnique.mockResolvedValueOnce({ ...PAID, paymentStatus: 'unpaid', paymentMethod: 'invoice' }).mockResolvedValue({ ...PAID, status: 'voided' });
    db.order.updateMany.mockResolvedValue({ count: 1 });
    await request(app).post('/api/admin/orders/60/void').set('Cookie', await tokenFor('manager', 2)).send({ reason: 'Wrong table' });
    expect(db.accountEntry.createMany).not.toHaveBeenCalled();
    expect(db.accountEntry.create).not.toHaveBeenCalled();
  });
});

describe('money out: expenses', () => {
  it('an expense must say which active account paid it; the row is written in the same transaction', async () => {
    const cookie = await tokenFor('manager', 2);
    for (const paidFromAccountId of [undefined, 6, 4]) {
      const res = await request(app).post('/api/admin/expenses').set('Cookie', cookie).send({ category: 'Gas', amount: 12, paidFromAccountId });
      expect(res.status).toBe(400);
    }
    expect(db.expense.create).not.toHaveBeenCalled();
    db.expense.create.mockImplementation(async ({ data }: { data: object }) => ({
      id: 31, incurredAt: new Date('2026-09-19T09:00:00Z'), note: null, ...data, paidFrom: { id: 1, label: 'Cash' }, salaryPayment: null,
    }));
    const ok = await request(app).post('/api/admin/expenses').set('Cookie', cookie).send({ category: 'Gas', amount: 12, paidFromAccountId: 1 });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ paidFrom: 'Cash', paidFromAccountId: 1 });
    const up = db.accountEntry.upsert.mock.calls[0][0];
    expect(up.where).toEqual({ expenseId: 31 });
    expect(up.create).toMatchObject({ accountId: 1, amount: -12, kind: 'expense', businessDay: '2026-09-19', expenseId: 31 });
  });

  it('editing an expense moves its row with it (amount, account)', async () => {
    db.expense.findUnique.mockResolvedValue({ id: 31 });
    db.expense.update.mockImplementation(async ({ data }: { data: object }) => ({
      id: 31, category: 'Gas', amount: 15, incurredAt: new Date('2026-09-19T09:00:00Z'), note: null, paidFromAccountId: 3, ...data,
      paidFrom: { id: 3, label: 'E/d' }, salaryPayment: null,
    }));
    const res = await request(app).patch('/api/admin/expenses/31').set('Cookie', await tokenFor('manager', 2)).send({ amount: 15, paidFromAccountId: 3 });
    expect(res.status).toBe(200);
    expect(db.accountEntry.upsert.mock.calls[0][0].update).toMatchObject({ accountId: 3, amount: -15 });
  });
});

describe('invoice payments', () => {
  it('a customer paying their account writes an invoice_payment row into the chosen account, tagged to who took it', async () => {
    db.invoice.findFirst.mockResolvedValue({ id: 9, total: '40.00', amountPaid: '0', status: 'unpaid' });
    db.invoicePayment.create.mockImplementation(async ({ data }: { data: object }) => ({ id: 77, paidAt: new Date(), ...data }));
    db.invoice.update.mockResolvedValue({ id: 9, status: 'partial', amountPaid: '15', total: '40.00' });
    const res = await request(app).post('/api/admin/invoices/9/payments').set('Cookie', await tokenFor('cashier', 8)).send({ amount: 15, accountId: 2 });
    expect(res.status).toBe(201);
    expect(db.invoicePayment.create.mock.calls[0][0].data).toMatchObject({ method: 'evc', account: 'A/C' });
    expect(db.accountEntry.create.mock.calls[0][0].data).toMatchObject({ accountId: 2, amount: 15, kind: 'invoice_payment', invoicePaymentId: 77, collectedById: 8 });
  });

  it('no account, or the online account → 400 before anything is written', async () => {
    const cookie = await tokenFor('cashier', 8);
    expect((await request(app).post('/api/admin/invoices/9/payments').set('Cookie', cookie).send({ amount: 5 })).status).toBe(400);
    expect((await request(app).post('/api/admin/invoices/9/payments').set('Cookie', cookie).send({ amount: 5, accountId: 6 })).status).toBe(400);
    expect(db.invoicePayment.create).not.toHaveBeenCalled();
  });
});

describe('transfers and owner money', () => {
  it('a transfer is two rows that net to zero, sharing one transferId', async () => {
    const res = await request(app).post('/api/admin/accounts/transfer').set('Cookie', await tokenFor('manager', 2))
      .send({ fromAccountId: 1, toAccountId: 3, amount: 40 });
    expect(res.status).toBe(201);
    const rows = rowsWritten();
    expect(rows.map((r: { accountId: number; amount: number }) => [r.accountId, r.amount])).toEqual([[1, -40], [3, 40]]);
    expect(rows[0].transferId).toBe(rows[1].transferId);
    expect(rows[0].transferId).toBeTruthy();
  });

  it('same account, into the online account, a future day or a non-manager → refused', async () => {
    const mgr = await tokenFor('manager', 2);
    expect((await request(app).post('/api/admin/accounts/transfer').set('Cookie', mgr).send({ fromAccountId: 1, toAccountId: 1, amount: 5 })).status).toBe(400);
    expect((await request(app).post('/api/admin/accounts/transfer').set('Cookie', mgr).send({ fromAccountId: 1, toAccountId: 6, amount: 5 })).status).toBe(400);
    expect((await request(app).post('/api/admin/accounts/transfer').set('Cookie', mgr).send({ fromAccountId: 1, toAccountId: 3, amount: 5, day: '2099-01-01' })).status).toBe(400);
    expect((await request(app).post('/api/admin/accounts/transfer').set('Cookie', await tokenFor('cashier')).send({ fromAccountId: 1, toAccountId: 3, amount: 5 })).status).toBe(403);
    expect(db.accountEntry.createMany).not.toHaveBeenCalled();
  });

  it('owner drawings are a signed owner_out row, never an expense', async () => {
    const res = await request(app).post('/api/admin/accounts/owner').set('Cookie', await tokenFor('manager', 2))
      .send({ accountId: 1, direction: 'out', amount: 100, note: 'Rent at home' });
    expect(res.status).toBe(201);
    expect(db.accountEntry.create.mock.calls[0][0].data).toMatchObject({ accountId: 1, amount: -100, kind: 'owner_out' });
    expect(db.expense.create).not.toHaveBeenCalled();
  });
});

describe('who may read the money', () => {
  it('everyone on the Register gets the active accounts for the pickers; balances, collections and statements are manager-only', async () => {
    const waiter = await tokenFor('waiter', 9);
    const list = await request(app).get('/api/admin/accounts').set('Cookie', waiter);
    expect(list.status).toBe(200);
    expect(list.body.map((a: { id: number }) => a.id)).toEqual([1, 2, 3, 5, 6]);
    expect(list.body[0]).not.toHaveProperty('balance');
    expect((await request(app).get('/api/admin/accounts?balances=1').set('Cookie', waiter)).status).toBe(403);
    for (const url of ['/api/admin/collections', '/api/admin/accounts/1/entries']) {
      expect((await request(app).get(url).set('Cookie', await tokenFor('cashier'))).status).toBe(403);
    }
    expect(db.accountEntry.groupBy).not.toHaveBeenCalled();
  });

  it('opening balances: a future date or an unknown account is refused', async () => {
    const mgr = await tokenFor('manager', 2);
    expect((await request(app).put('/api/admin/accounts/opening').set('Cookie', mgr).send({ openingDate: '2099-01-01', balances: [] })).status).toBe(400);
    expect((await request(app).put('/api/admin/accounts/opening').set('Cookie', mgr).send({ openingDate: '2026-09-01', balances: [{ accountId: 999, amount: 5 }] })).status).toBe(404);
    expect(db.setting.upsert).not.toHaveBeenCalled();
  });

  it('staff numbers can only be set for wallets', async () => {
    db.adminUser.findUnique.mockResolvedValue({ id: 7 });
    const res = await request(app).put('/api/admin/staff/7/accounts').set('Cookie', await tokenFor('manager', 2))
      .send({ numbers: [{ accountId: 1, number: '123' }] });
    expect(res.status).toBe(400);
    expect(db.staffAccount.upsert).not.toHaveBeenCalled();
  });
});
