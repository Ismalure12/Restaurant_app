import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createPrismaMock, tokenFor, type PrismaMock } from './helpers.js';

const db: PrismaMock = vi.hoisted(() => ({}) as PrismaMock);
vi.mock('../src/lib/db/prisma.js', () => ({ default: db }));

const { createApp } = await import('../src/app.js');
const app = createApp();

const DAY = '2026-01-10';
const OPENING = [{ key: 'opening_date', value: '2026-01-01' }];

// Every business account starts the day empty and takes $100 in (a sale).
function quietDay() {
  db.setting.findMany.mockResolvedValue(OPENING);
  db.order.findMany.mockResolvedValue([]);
  db.order.count.mockResolvedValue(0);
  db.order.aggregate.mockResolvedValue({ _sum: { total: 0, discount: 0 }, _count: { _all: 0 } });
  db.accountEntry.groupBy.mockResolvedValue([]);
  db.accountEntry.aggregate.mockImplementation(async (args: { where: { amount?: { gt?: number } } }) => ({
    _sum: { amount: args.where.amount?.gt !== undefined ? 100 : 0 }, _count: { _all: 0 },
  }));
  db.adminUser.findMany.mockResolvedValue([]);
}

beforeEach(() => {
  Object.assign(db, createPrismaMock());
  quietDay();
});

const asManager = async () => ({ Cookie: await tokenFor('manager', 1) });

describe('the closed-day lock (assertOpenDay)', () => {
  const expense = { category: 'Rent', amount: 20, paidFromAccountId: 1, incurredAt: DAY };
  const created = { id: 5, amount: 20, category: 'Rent', incurredAt: new Date(`${DAY}T12:00:00Z`), paidFromAccountId: 1, staff: null, salaryPayment: null, paidFrom: null };

  it('an expense dated in a closed day is refused with 409 PERIOD_CLOSED and writes no cash-book row', async () => {
    db.dayClose.findUnique.mockResolvedValue({ isClosed: true });
    db.expense.create.mockResolvedValue(created);
    const res = await request(app).post('/api/admin/expenses').set(await asManager()).send(expense);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PERIOD_CLOSED');
    expect(db.accountEntry.upsert).not.toHaveBeenCalled();
  });

  it('the same expense in an open day is created', async () => {
    db.expense.create.mockResolvedValue(created);
    const res = await request(app).post('/api/admin/expenses').set(await asManager()).send(expense);
    expect(res.status).toBe(201);
    expect(db.accountEntry.upsert).toHaveBeenCalled();
  });

  it('a transfer dated in a closed day is refused', async () => {
    db.dayClose.findUnique.mockResolvedValue({ isClosed: true });
    const res = await request(app).post('/api/admin/accounts/transfer').set(await asManager()).send({ fromAccountId: 1, toAccountId: 2, amount: 5, day: DAY });
    expect(res.status).toBe(409);
    expect(db.accountEntry.createMany).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/day-close/:day', () => {
  const close = async (body: object, day = DAY) => request(app).post(`/api/admin/day-close/${day}`).set(await asManager()).send(body);

  it('only a manager can close a day', async () => {
    const res = await request(app).post(`/api/admin/day-close/${DAY}`).set({ Cookie: await tokenFor('cashier', 2) }).send({ counted: [] });
    expect(res.status).toBe(403);
  });

  it('a day that has not ended cannot be closed', async () => {
    const { dayKey } = await import('../src/lib/time/businessTime.js');
    const today = dayKey(new Date()); // the business day, not the UTC date
    const res = await close({ counted: [{ accountId: 1, amount: 100 }] }, today);
    expect(res.status).toBe(409);
    expect(db.dayClose.create).not.toHaveBeenCalled();
  });

  it('needs the opening balances first', async () => {
    db.setting.findMany.mockResolvedValue([]);
    const res = await close({ counted: [{ accountId: 1, amount: 100 }] });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/opening balances/i);
  });

  it('the cash is optional like every other account', async () => {
    const res = await close({ counted: [{ accountId: 2, amount: 100 }] });
    expect(res.status).toBe(201);
    const none = await close({ counted: [] });
    expect(none.status).toBe(201);
  });

  it('unpaid tabs block the close unless carried over', async () => {
    db.order.findMany.mockImplementation(async (a: { where: { status?: string } }) => (a.where.status === 'open' ? [{ id: 9, tableNumber: '4', total: 12 }] : []));
    const blocked = await close({ counted: [{ accountId: 1, amount: 100 }] });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('DAY_HAS_OPEN_WORK');
    expect(db.dayClose.create).not.toHaveBeenCalled();
    const carried = await close({ counted: [{ accountId: 1, amount: 100 }], carryOver: true });
    expect(carried.status).toBe(201);
  });

  it('closes: locks the day, freezes the lines, and books the cash difference as over_short', async () => {
    const res = await close({ counted: [{ accountId: 1, amount: 90 }, { accountId: 2, amount: 100 }] });
    expect(res.status).toBe(201);
    expect(db.dayClose.create).toHaveBeenCalledTimes(1);
    expect(db.dayClose.create.mock.calls[0][0].data.businessDay).toBe(DAY);
    const lines = db.dayCloseLine.createMany.mock.calls[0][0].data;
    expect(lines.find((l: { accountId: number }) => l.accountId === 1)).toMatchObject({ expected: 100, counted: 90 });
    const rows = db.accountEntry.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(1); // A/C matched exactly, cash was short
    expect(rows[0]).toMatchObject({ accountId: 1, amount: -10, kind: 'over_short', businessDay: DAY });
    expect(db.auditLog.create).toHaveBeenCalled();
  });

  it('a day that is already closed cannot be closed twice', async () => {
    db.dayClose.findUnique.mockResolvedValue({ businessDay: DAY, isClosed: true, closedAt: new Date(), snapshot: {}, lines: [] });
    const res = await close({ counted: [{ accountId: 1, amount: 100 }] });
    expect(res.status).toBe(409);
    expect(db.dayClose.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/day-close/:day/reopen', () => {
  const reopen = async (body: object) => request(app).post(`/api/admin/day-close/${DAY}/reopen`).set(await asManager()).send(body);

  it('needs a reason', async () => {
    const res = await reopen({});
    expect(res.status).toBe(400);
  });

  it('refuses a day that is not closed', async () => {
    const res = await reopen({ reason: 'Wrong count' });
    expect(res.status).toBe(409);
  });

  it('is newest-first: a later closed day must be reopened before this one', async () => {
    db.dayClose.findUnique.mockResolvedValue({ businessDay: DAY, isClosed: true, closedAt: new Date(), snapshot: {}, lines: [] });
    db.dayClose.findFirst.mockResolvedValue({ businessDay: '2026-01-11' });
    const res = await reopen({ reason: 'Wrong count' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/2026-01-11/);
    expect(db.dayClose.update).not.toHaveBeenCalled();
  });

  it('reverses the over/short rows (never deletes) and records why', async () => {
    db.dayClose.findUnique.mockResolvedValue({ businessDay: DAY, isClosed: true, closedAt: new Date(), snapshot: {}, lines: [] });
    db.dayClose.findFirst.mockResolvedValue(null);
    db.accountEntry.findMany.mockResolvedValue([{ id: 40, accountId: 1, amount: -10, occurredAt: new Date(), businessDay: DAY }]);
    const res = await reopen({ reason: 'Wrong count' });
    expect(res.status).toBe(200);
    const row = db.accountEntry.createMany.mock.calls[0][0].data[0];
    expect(row).toMatchObject({ accountId: 1, kind: 'over_short', reversesId: 40, businessDay: DAY });
    expect(Number(row.amount)).toBe(10);
    expect(db.dayClose.update.mock.calls[0][0].data).toMatchObject({ isClosed: false, reopenReason: 'Wrong count' });
    expect(db.accountEntry.deleteMany).not.toHaveBeenCalled();
  });
});
