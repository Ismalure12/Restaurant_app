// Money pages (admin redesign): Sales history summary + status=all,
// Cash › Transfers & owner history, Customers overdue filter + summary,
// Expenses summary additions + CSV export.
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
  db.order.findMany.mockResolvedValue([]);
  db.orderItem.groupBy.mockResolvedValue([]);
  db.order.aggregate.mockResolvedValue({ _sum: { total: 0 }, _count: { _all: 0 } });
});

// ── Sales history ────────────────────────────────────────────────────────
describe('GET /api/admin/sales — manager summary + status=all', () => {
  it('status=all lists completed OR voided sales, filters still ANDed', async () => {
    const res = await request(app).get('/api/admin/sales?status=all&waiterId=4').set('Cookie', await tokenFor('cashier'));
    expect(res.status).toBe(200);
    const [status, filters] = db.order.findMany.mock.calls[0][0].where.AND;
    expect(status.OR).toHaveLength(2);
    expect(status.OR[0].status).toEqual({ in: ['pending', 'confirmed'] });
    expect(status.OR[1].status).toEqual({ in: ['voided', 'declined'] });
    expect(filters).toEqual({ AND: [{ waiterId: 4 }] });
  });

  it('manager first page: listed + sales + on account + voided + items/dishes, all aggregates (no row loops)', async () => {
    db.order.aggregate.mockImplementation(async ({ where }: { where: { AND: unknown[] } }) => {
      const json = JSON.stringify(where);
      const last = JSON.stringify(where.AND[where.AND.length - 1]);
      if (last === '{"paymentMethod":"invoice"}') return { _sum: { total: '20' }, _count: { _all: 2 } }; // on account
      if (json.includes('voided') && !json.includes('confirmed')) return { _sum: { total: '5.5' }, _count: { _all: 1 } }; // voided
      return { _sum: { total: '110' }, _count: { _all: 11 } };
    });
    db.orderItem.groupBy.mockResolvedValue([
      { name: 'Bariis', _sum: { quantity: 4 } }, { name: 'Shaah', _sum: { quantity: 9 } },
    ]);
    const res = await request(app).get('/api/admin/sales?q=ali').set('Cookie', await tokenFor('manager'));
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({
      count: 11, total: 110,
      sales: { count: 11, total: 110 },
      onAccount: { count: 2, total: 20 },
      voided: { count: 1, total: 5.5 },
      itemsSold: 13,
      dishes: 2,
    });
    expect(db.order.aggregate).toHaveBeenCalledTimes(4);
    expect(db.orderItem.groupBy).toHaveBeenCalledTimes(1);
    const gb = db.orderItem.groupBy.mock.calls[0][0];
    expect(gb.by).toEqual(['name']);
    expect(gb.take).toBeGreaterThan(0);
    // The items are counted over the same (completed) sales the view filters, search included.
    expect(JSON.stringify(gb.where.order)).toContain('"contactName"');
    expect(db.order.findMany).toHaveBeenCalledTimes(1);
  });

  it('cashiers and waiters never get the summary; cursor pages skip it', async () => {
    for (const role of ['cashier', 'waiter']) {
      const res = await request(app).get('/api/admin/sales').set('Cookie', await tokenFor(role, 7));
      expect(res.body).not.toHaveProperty('summary');
    }
    const next = await request(app).get('/api/admin/sales?cursor=5').set('Cookie', await tokenFor('manager'));
    expect(next.body).not.toHaveProperty('summary');
    expect(db.order.aggregate).not.toHaveBeenCalled();
    expect(db.orderItem.groupBy).not.toHaveBeenCalled();
  });
});

// ── Cash › Transfers & owner ─────────────────────────────────────────────
describe('GET /api/admin/accounts/transfers', () => {
  const cash = { id: 1, label: 'Cash', kind: 'cash' };
  const ac = { id: 2, label: 'A/C', kind: 'wallet' };
  const at = new Date('2026-09-20T09:00:00Z');

  it('anonymous 401; cashier/waiter (no cash page) 403; nothing read', async () => {
    expect((await request(app).get('/api/admin/accounts/transfers')).status).toBe(401);
    for (const role of ['cashier', 'waiter']) {
      expect((await request(app).get('/api/admin/accounts/transfers').set('Cookie', await tokenFor(role))).status).toBe(403);
    }
    expect(db.accountEntry.findMany).not.toHaveBeenCalled();
  });

  it('bad range or cursor → 400 before any read', async () => {
    const cookie = await tokenFor('manager');
    for (const qs of ['from=2026-02-30', 'cursor=abc', 'cursor=-3', 'limit=999']) {
      expect((await request(app).get(`/api/admin/accounts/transfers?${qs}`).set('Cookie', cookie)).status).toBe(400);
    }
    expect(db.accountEntry.findMany).not.toHaveBeenCalled();
  });

  it('pairs the two legs of a transfer into one row; owner money is one-sided; two queries in total', async () => {
    db.accountEntry.findMany
      .mockResolvedValueOnce([
        { id: 30, businessDay: '2026-09-20', occurredAt: at, kind: 'transfer', amount: '-400', note: 'Float', transferId: 't1', account: cash, createdBy: { name: 'Muna', email: 'm@x' } },
        { id: 29, businessDay: '2026-09-20', occurredAt: at, kind: 'owner_out', amount: '-50', note: null, transferId: null, account: ac, createdBy: null },
        { id: 28, businessDay: '2026-09-19', occurredAt: at, kind: 'owner_in', amount: '1000', note: 'Capital', transferId: null, account: cash, createdBy: null },
      ])
      .mockResolvedValueOnce([{ transferId: 't1', account: ac }]);
    const res = await request(app).get('/api/admin/accounts/transfers?from=2026-09-01&to=2026-09-20').set('Cookie', await tokenFor('manager'));
    expect(res.status).toBe(200);
    expect(res.body.rows).toEqual([
      expect.objectContaining({ id: 30, kind: 'transfer', amount: 400, from: { id: 1, label: 'Cash' }, to: { id: 2, label: 'A/C' }, note: 'Float', by: 'Muna' }),
      expect.objectContaining({ id: 29, kind: 'owner_out', amount: 50, from: { id: 2, label: 'A/C' }, to: null }),
      expect.objectContaining({ id: 28, kind: 'owner_in', amount: 1000, from: null, to: { id: 1, label: 'Cash' } }),
    ]);
    expect(res.body.nextCursor).toBeNull();
    expect(db.accountEntry.findMany).toHaveBeenCalledTimes(2);
    const [first, second] = db.accountEntry.findMany.mock.calls.map((c) => c[0]);
    // Only the money-out leg of a transfer is paged (so a pair never splits across pages).
    expect(first.where.OR).toContainEqual({ kind: 'transfer', amount: { lt: 0 } });
    expect(first.where.businessDay).toEqual({ gte: '2026-09-01', lte: '2026-09-20' });
    expect(first.take).toBe(51);
    expect(second.where).toEqual({ transferId: { in: ['t1'] }, kind: 'transfer', amount: { gt: 0 } });
  });

  it('cursor paging: limit+1 read, nextCursor = last listed id; no second query without transfers', async () => {
    const rows = [1, 2, 3].map((i) => ({ id: 10 - i, businessDay: '2026-09-20', occurredAt: at, kind: 'owner_in', amount: '5', note: null, transferId: null, account: cash, createdBy: null }));
    db.accountEntry.findMany.mockResolvedValueOnce(rows);
    const res = await request(app).get('/api/admin/accounts/transfers?limit=2&cursor=12').set('Cookie', await tokenFor('manager'));
    expect(res.body.rows).toHaveLength(2);
    expect(res.body.nextCursor).toBe(8);
    expect(db.accountEntry.findMany.mock.calls[0][0]).toMatchObject({ take: 3, cursor: { id: 12 }, skip: 1 });
    expect(db.accountEntry.findMany).toHaveBeenCalledTimes(1);
  });
});

// ── Customers ────────────────────────────────────────────────────────────
describe('GET /api/admin/customers — overdue filter + summary', () => {
  beforeEach(() => {
    db.customer.findMany.mockResolvedValue([]);
    db.customer.count.mockResolvedValue(12);
    db.invoice.groupBy.mockResolvedValue([
      { customerId: 1, _sum: { total: '100', amountPaid: '40' } },
      { customerId: 2, _sum: { total: '30', amountPaid: '30' } },
    ]);
    db.invoice.aggregate.mockResolvedValue({ _sum: { total: '80', amountPaid: '15.5' }, _count: { _all: 3 } });
    db.invoice.count.mockResolvedValue(7);
  });

  it('anonymous 401; waiter (no customers page) 403', async () => {
    expect((await request(app).get('/api/admin/customers')).status).toBe(401);
    expect((await request(app).get('/api/admin/customers').set('Cookie', await tokenFor('waiter'))).status).toBe(403);
    expect(db.customer.findMany).not.toHaveBeenCalled();
  });

  it('summary adds the overdue amount and the open invoice count', async () => {
    const res = await request(app).get('/api/admin/customers').set('Cookie', await tokenFor('cashier'));
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({
      totalCustomers: 12, customersWithBalance: 1, totalOutstanding: 60, overdueInvoices: 3, overdueAmount: 64.5, openInvoices: 7,
    });
    const agg = db.invoice.aggregate.mock.calls[0][0];
    expect(agg.where.status).toEqual({ in: ['unpaid', 'partial'] });
    expect(agg.where.dueDate.lt).toBeInstanceOf(Date);
  });

  it('?overdue=1 narrows to customers with an open invoice past due (and skips the summary)', async () => {
    const res = await request(app).get('/api/admin/customers?overdue=1').set('Cookie', await tokenFor('manager'));
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('summary');
    const where = db.customer.findMany.mock.calls[0][0].where;
    expect(where.invoices.some.status).toEqual({ in: ['unpaid', 'partial'] });
    expect(where.invoices.some.dueDate.lt).toBeInstanceOf(Date);
    expect(db.invoice.aggregate).not.toHaveBeenCalled();
  });
});

// ── Expenses ─────────────────────────────────────────────────────────────
describe('GET /api/admin/expenses — summary additions + CSV', () => {
  const row = {
    id: 5, category: '=Rent', amount: '120.00', note: 'Sept', incurredAt: new Date('2026-09-10T09:00:00Z'), createdAt: new Date(),
    staff: { name: 'Muna', email: 'm@x' }, paidFrom: { id: 1, label: 'Cash' }, salaryPayment: null,
  };
  beforeEach(() => {
    db.expense.findMany.mockResolvedValue([row]);
    db.expense.aggregate.mockImplementation(async (args: { _min?: unknown; where?: { incurredAt?: { lt?: Date } } }) => {
      if (args._min) return { _count: { _all: 40 }, _min: { incurredAt: new Date('2026-03-02T09:00:00Z') } };
      if (args.where?.incurredAt?.lt) return { _sum: { amount: '300' } }; // the 30 days before
      return { _sum: { amount: '250' }, _count: { _all: 4 } };
    });
    db.expense.groupBy.mockResolvedValue([]);
  });

  it('anonymous 401; cashier (no expenses page) 403', async () => {
    expect((await request(app).get('/api/admin/expenses')).status).toBe(401);
    expect((await request(app).get('/api/admin/expenses').set('Cookie', await tokenFor('cashier'))).status).toBe(403);
    expect(db.expense.findMany).not.toHaveBeenCalled();
  });

  it('bad query → 400 before any read', async () => {
    const cookie = await tokenFor('manager');
    for (const qs of ['format=pdf', `q=${'x'.repeat(81)}`, `category=${'y'.repeat(81)}`]) {
      expect((await request(app).get(`/api/admin/expenses?${qs}`).set('Cookie', cookie)).status).toBe(400);
    }
    expect(db.expense.findMany).not.toHaveBeenCalled();
  });

  it('first page carries prev30Total and firstAt (aggregates only)', async () => {
    const res = await request(app).get('/api/admin/expenses').set('Cookie', await tokenFor('manager'));
    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ last30Total: '250.00', prev30Total: '300.00', totalCount: 40, firstAt: '2026-03-02T09:00:00.000Z' });
    expect(db.expense.findMany).toHaveBeenCalledTimes(1);
  });

  it('?format=csv: one bounded read, BOM + formula guard, the list filters apply', async () => {
    const res = await request(app).get('/api/admin/expenses?format=csv&category=Rent').set('Cookie', await tokenFor('manager'));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text.charCodeAt(0)).toBe(0xfeff);
    expect(res.text).toContain("'=Rent");
    expect(res.text).toContain('120.00');
    const call = db.expense.findMany.mock.calls[0][0];
    expect(call.take).toBeGreaterThan(0);
    expect(call.where).toEqual({ AND: [{ category: 'Rent' }] });
    expect(db.expense.findMany).toHaveBeenCalledTimes(1);
    expect(db.expense.aggregate).not.toHaveBeenCalled();
  });
});
