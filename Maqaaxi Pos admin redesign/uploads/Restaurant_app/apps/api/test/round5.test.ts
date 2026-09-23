import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createPrismaMock, tokenFor, type PrismaMock } from './helpers.js';

const db: PrismaMock = vi.hoisted(() => ({}) as PrismaMock);
vi.mock('../src/lib/db/prisma.js', () => ({ default: db }));

const { createApp } = await import('../src/app.js');
const app = createApp();
const asManager = async () => ({ Cookie: await tokenFor('manager', 1) });

const EMPTY = { _sum: {}, _count: { _all: 0 } };

beforeEach(() => {
  // Defaults are set ON the mock's models (never replacing them: $transaction hands the callback the originals).
  Object.assign(db, createPrismaMock());
  for (const m of [db.order, db.invoice, db.invoicePayment, db.adminUser, db.customer, db.orderItem, db.menuItem, db.expense, db.stockMovement, db.inventoryItem, db.salaryPayment]) {
    m.aggregate.mockResolvedValue(EMPTY);
    m.groupBy.mockResolvedValue([]);
    m.findMany.mockResolvedValue([]);
  }
  db.order.count.mockResolvedValue(0);
  db.invoice.count.mockResolvedValue(0);
  db.setting.findUnique.mockResolvedValue(null);
});

describe('GET /api/admin/overview — period, filters, comparison', () => {
  // 7 days: 2026-09-08 … 2026-09-14; the comparison period is 2026-09-01 … 2026-09-07
  const url = '/api/admin/overview?from=2026-09-08&to=2026-09-14';
  const rangeStart = new Date('2026-09-07T21:00:00Z'); // 2026-09-08 00:00 Mogadishu

  function sales() {
    db.order.aggregate.mockImplementation(async (a: { where: { closedAt?: { gte: Date }; status?: string } }) => {
      const gte = a.where.closedAt?.gte;
      if (gte && gte < rangeStart) return { _sum: { total: 100 }, _count: { _all: 4 } }; // previous period
      return { _sum: { total: 150, discount: 10, deliveryFee: 0 }, _count: { _all: 5 } };
    });
  }

  it('manager only', async () => {
    expect((await request(app).get(url)).status).toBe(401);
    expect((await request(app).get(url).set({ Cookie: await tokenFor('cashier', 2) })).status).toBe(403);
  });

  it('KPIs carry the previous equal-length period; the trend has one row per day', async () => {
    sales();
    const res = await request(app).get(url).set(await asManager());
    expect(res.status).toBe(200);
    expect(res.body.range).toEqual({ from: '2026-09-08', to: '2026-09-14', days: 7 });
    expect(res.body.previous).toEqual({ from: '2026-09-01', to: '2026-09-07' });
    expect(res.body.kpis.sales).toEqual({ value: 150, previous: 100 });
    expect(res.body.kpis.orders).toEqual({ value: 5, previous: 4 });
    expect(res.body.kpis.avgTicket).toEqual({ value: 30, previous: 25 });
    expect(res.body.trend).toHaveLength(7);
    expect(res.body.live).toHaveProperty('unpaid');
  });

  it('a channel filter narrows the sales query and marks profit/expenses as not applicable', async () => {
    sales();
    const res = await request(app).get(`${url}&source=online`).set(await asManager());
    expect(res.status).toBe(200);
    expect(res.body.filtered).toBe(true);
    expect(res.body.kpis.profit.applies).toBe(false);
    const wheres = db.order.aggregate.mock.calls.map((c) => JSON.stringify(c[0].where));
    expect(wheres.some((w) => w.includes('"source":"online"'))).toBe(true);
    const plain = await request(app).get(url).set(await asManager());
    expect(plain.body.kpis.profit.applies).toBe(true);
  });

  it('bad range or filter → 400, nothing read', async () => {
    expect((await request(app).get('/api/admin/overview?from=2026-09-20&to=2026-09-01').set(await asManager())).status).toBe(400);
    expect((await request(app).get(`${url}&source=drive-through`).set(await asManager())).status).toBe(400);
    expect(db.order.aggregate).not.toHaveBeenCalled();
  });
});

describe('Sales report — on account instead of average ticket', () => {
  it('summary carries what was billed on account in the range and what customers still owe', async () => {
    db.order.groupBy.mockImplementation(async (a: { by: string[] }) => (a.by.includes('paymentMethod')
      ? [
        { source: 'pos', paymentMethod: 'cash', paymentAccount: null, _sum: { total: 60 }, _count: { _all: 3 } },
        { source: 'pos', paymentMethod: 'invoice', paymentAccount: null, _sum: { total: 40 }, _count: { _all: 2 } },
      ]
      : []));
    db.invoice.aggregate.mockResolvedValue({ _sum: { total: 200, amountPaid: 75 } });
    db.invoice.count.mockResolvedValue(3);
    const res = await request(app).get('/api/admin/reports/sales?from=2026-09-10&to=2026-09-10').set(await asManager());
    expect(res.status).toBe(200);
    expect(res.body.summary.onAccount).toEqual({ orders: 2, total: 40 });
    expect(res.body.summary.receivable).toEqual({ owed: 125, openInvoices: 3 });
  });
});

describe('Financial report — net profit last, only loss days', () => {
  it('lossDays lists only days where expenses beat sales', async () => {
    db.expense.aggregate.mockResolvedValue({ _sum: { amount: 50 }, _count: { _all: 1 } });
    db.expense.findMany.mockResolvedValue([{ id: 1, amount: '50', incurredAt: new Date('2026-09-10T09:00:00Z') }]);
    const res = await request(app).get('/api/admin/reports/financial?from=2026-09-09&to=2026-09-11').set(await asManager());
    expect(res.status).toBe(200);
    expect(res.body.byDay).toHaveLength(3);
    expect(res.body.lossDays).toEqual([{ day: '2026-09-10', sales: 0, expenses: 50, net: -50 }]);
    const csv = await request(app).get('/api/admin/reports/financial?from=2026-09-09&to=2026-09-11&format=csv').set(await asManager());
    const lines = csv.text.trim().split('\r\n');
    expect(lines[lines.length - 1]).toMatch(/Net profit/); // the last line of the P&L
    expect(csv.text).not.toMatch(/Discounts|Refunds/);
  });
});

describe('Menu report — category filter', () => {
  it('filters the lines and the never-sold list by category and lists every category for the picker', async () => {
    db.orderItem.groupBy.mockResolvedValue([{ menuItemId: 1, name: 'Burger', categoryName: 'Mains', _sum: { quantity: 3, lineTotal: 30 } }]);
    db.menuItem.findMany.mockResolvedValue([
      { id: 1, name: 'Burger', category: { name: 'Mains' } },
      { id: 2, name: 'Steak', category: { name: 'Mains' } },
      { id: 3, name: 'Cake', category: { name: 'Desserts' } },
    ]);
    const res = await request(app).get('/api/admin/reports/menu?from=2026-09-01&to=2026-09-30&category=Mains').set(await asManager());
    expect(res.status).toBe(200);
    expect(db.orderItem.groupBy.mock.calls[0][0].where.categoryName).toBe('Mains');
    expect(res.body.neverSold).toEqual([{ id: 2, name: 'Steak', category: 'Mains' }]);
    expect(res.body.categoryOptions).toEqual(['Desserts', 'Mains']);
    expect(res.body.category).toBe('Mains');
  });
});

describe('GET /api/admin/customers/:id/statement', () => {
  const inv = (over = {}) => ({
    id: 5, createdAt: new Date('2026-09-01T10:00:00Z'), dueDate: null, status: 'partial', tableNumber: null,
    items: [{ name: 'Lunch', quantity: 2, unitPrice: 5 }], subtotal: '10', discount: '0', total: '10', amountPaid: '4',
    payments: [{ amount: '4', paidAt: new Date('2026-09-02T10:00:00Z'), method: 'cash', account: null }], ...over,
  });

  it('needs a login; unknown customer 404', async () => {
    expect((await request(app).get('/api/admin/customers/3/statement')).status).toBe(401);
    db.customer.findUnique.mockResolvedValue(null);
    expect((await request(app).get('/api/admin/customers/3/statement').set(await asManager())).status).toBe(404);
  });

  it('returns each invoice with its lines, payments and balance, and the totals to print', async () => {
    db.customer.findUnique.mockResolvedValue({ id: 3, name: 'Amina', phone: '061', address: null });
    db.invoice.findMany.mockResolvedValue([inv({ id: 6, total: '20', amountPaid: '20', status: 'paid', payments: [] }), inv()]);
    db.invoice.aggregate.mockResolvedValue({ _sum: { total: 30, amountPaid: 24 } });
    db.invoice.count.mockResolvedValue(2);
    const res = await request(app).get('/api/admin/customers/3/statement').set(await asManager());
    expect(res.status).toBe(200);
    expect(res.body.invoices[0]).toMatchObject({ id: 5, total: 10, amountPaid: 4, balance: 6, items: [{ name: 'Lunch', quantity: 2, unitPrice: 5 }] });
    expect(res.body.totals).toEqual({ count: 2, shown: 2, invoiced: 30, paid: 24, owed: 6 });
    // "all" never includes void invoices
    expect(db.invoice.findMany.mock.calls[0][0].where.status).toEqual({ not: 'void' });
  });

  it('status=open only asks for invoices still owing', async () => {
    db.customer.findUnique.mockResolvedValue({ id: 3, name: 'Amina', phone: '061', address: null });
    await request(app).get('/api/admin/customers/3/statement?status=open').set(await asManager());
    expect(db.invoice.findMany.mock.calls[0][0].where.status).toEqual({ in: ['unpaid', 'partial'] });
  });
});

describe('POST /api/admin/stock-counts/:id/post — the response the page renders', () => {
  it('returns a plain number of items (the page once rendered an object and crashed after posting), even if the summary fails', async () => {
    db.stockCount.findUnique.mockResolvedValue({ id: 4, countedOn: '2026-01-31', status: 'draft', lines: [{ id: 1, countId: 4, itemId: 7, systemQty: 5, countedQty: 5, unitCost: null }] });
    db.stockCount.updateMany.mockResolvedValue({ count: 1 });
    db.inventoryItem.findMany.mockResolvedValue([{ id: 7, name: 'Rice', costPerUnit: '2', quantity: 5, unit: 'kg' }]);
    db.stockMovement.groupBy.mockResolvedValue([]);
    db.stockCountLine.update.mockResolvedValue({});
    db.stockCount.update.mockResolvedValue({});
    const res = await request(app).post('/api/admin/stock-counts/4/post').set(await asManager());
    expect(res.status).toBe(200);
    expect(typeof res.body.items).toBe('number');
    expect(typeof res.body.adjustments).toBe('number');
  });
});

describe('Round 6 — merged Sales report, channels, overview comparison, readiness checks', () => {
  it('channel = Dine-in / Delivery (rung up here) / Online (placed online, either service)', async () => {
    db.order.groupBy.mockImplementation(async (a: { by: string[] }) => (a.by.includes('orderType') && a.by.includes('source')
      ? [
        { source: 'pos', orderType: 'dine_in', _sum: { total: 50 }, _count: { _all: 5 } },
        { source: 'pos', orderType: 'delivery', _sum: { total: 20 }, _count: { _all: 2 } },
        { source: 'online', orderType: 'dine_in', _sum: { total: 7 }, _count: { _all: 1 } },
        { source: 'online', orderType: 'delivery', _sum: { total: 3 }, _count: { _all: 1 } },
      ]
      : []));
    const res = await request(app).get('/api/admin/reports/sales?from=2026-09-10&to=2026-09-10').set(await asManager());
    expect(res.body.byChannel).toEqual([
      { channel: 'dine_in', label: 'Dine-in', orders: 5, total: 50 },
      { channel: 'delivery', label: 'Delivery', orders: 2, total: 20 },
      { channel: 'online', label: 'Online', orders: 2, total: 10 },
    ]);
    const online = await request(app).get('/api/admin/reports/sales?from=2026-09-10&to=2026-09-10&channel=online').set(await asManager());
    expect(online.status).toBe(200);
    expect(JSON.stringify(db.order.aggregate.mock.calls.at(-1)?.[0].where)).toContain('"source":"online"');
    expect((await request(app).get('/api/admin/reports/sales?channel=counter').set(await asManager())).status).toBe(400);
  });

  it('items come from order lines, honour the sales filters and the category', async () => {
    await request(app).get('/api/admin/reports/sales?from=2026-09-01&to=2026-09-30&channel=delivery&category=Mains').set(await asManager());
    const where = db.orderItem.groupBy.mock.calls[0][0].where;
    expect(where.categoryName).toBe('Mains');
    expect(JSON.stringify(where.order)).toContain('"orderType":"delivery"');
  });

  it('sales by hour uses the local hour; no weekday × hour grid any more', async () => {
    // 2026-09-21 is a Monday; 10:15 Mogadishu = 07:15 UTC
    db.order.findMany.mockImplementation(async (a: { select?: { closedAt?: boolean } }) => (a.select?.closedAt ? [{ id: 1, closedAt: new Date('2026-09-21T07:15:00Z'), total: 12 }] : []));
    const res = await request(app).get('/api/admin/reports/sales?from=2026-09-21&to=2026-09-21').set(await asManager());
    expect(res.body.byHour).toEqual([{ hour: 10, orders: 1, total: 12 }]);
    expect(res.body).not.toHaveProperty('byWeekdayHour');
  });

  it('overview compares with the period the page asks for (e.g. same days last month) and refuses a comparison that is not earlier', async () => {
    const ok = await request(app).get('/api/admin/overview?from=2026-09-01&to=2026-09-21&cfrom=2026-08-01&cto=2026-08-21').set(await asManager());
    expect(ok.status).toBe(200);
    expect(ok.body.previous).toEqual({ from: '2026-08-01', to: '2026-08-21' });
    expect(ok.body.cumulative).toHaveLength(21);
    const bad = await request(app).get('/api/admin/overview?from=2026-09-01&to=2026-09-21&cfrom=2026-09-05&cto=2026-09-06').set(await asManager());
    expect(bad.status).toBe(400);
  });

  it('a single day compares hour by hour', async () => {
    db.order.findMany.mockImplementation(async (a: { select?: { closedAt?: boolean; total?: boolean }; where?: { closedAt?: { gte: Date } } }) => {
      if (!a.select?.closedAt || a.select.total === undefined) return [];
      const today = a.where?.closedAt?.gte && a.where.closedAt.gte >= new Date('2026-09-20T21:00:00Z');
      return [{ id: 1, closedAt: new Date(today ? '2026-09-21T09:10:00Z' : '2026-09-20T10:10:00Z'), total: today ? 20 : 8 }];
    });
    const res = await request(app).get('/api/admin/overview?from=2026-09-21&to=2026-09-21').set(await asManager());
    expect(res.status).toBe(200);
    expect(res.body.hours).toEqual([{ hour: 12, sales: 20, previous: 0 }, { hour: 13, sales: 0, previous: 8 }]);
  });

  it('month readiness is structured data, not text to parse', async () => {
    db.setting.findMany.mockResolvedValue([{ key: 'opening_date', value: '2026-01-01' }]);
    db.stockCount.findFirst.mockResolvedValue(null);
    db.dayClose.findMany.mockResolvedValue([]);
    db.expenseCategory.findMany.mockResolvedValue([]);
    db.accountEntry.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    db.supplierPayment.groupBy.mockResolvedValue([]);
    db.salaryRate.findMany.mockResolvedValue([]);
    db.salaryPayment.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/admin/statements/month/2026-02').set(await asManager());
    expect(res.status).toBe(200);
    expect(res.body.checks).toMatchObject({ ended: true, stockCounted: false, prevMonth: '2026-01' });
    expect(res.body.checks.unclosedDays).toHaveLength(28);
  });
});
