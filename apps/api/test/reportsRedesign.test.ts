import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createPrismaMock, tokenFor, type PrismaMock } from './helpers.js';

// Sales report `summary.itemsSold / dishesSold` and Financial report
// `pnl.expensesByKind` (admin redesign, Reports).
const db: PrismaMock = vi.hoisted(() => ({}) as PrismaMock);
vi.mock('../src/lib/db/prisma.js', () => ({ default: db }));

const { createApp } = await import('../src/app.js');
const app = createApp();

const EMPTY_AGG = { _sum: {}, _count: { _all: 0 } };

beforeEach(() => {
  Object.assign(db, createPrismaMock());
  for (const m of [db.order, db.invoice, db.invoicePayment, db.orderItem, db.expense]) {
    m.aggregate.mockResolvedValue(EMPTY_AGG);
    m.groupBy.mockResolvedValue([]);
    m.findMany.mockResolvedValue([]);
  }
  db.setting.findUnique.mockResolvedValue(null);
});

const SALES = '/api/admin/reports/sales?from=2026-09-01&to=2026-09-07';
const FIN = '/api/admin/reports/financial?from=2026-09-01&to=2026-09-30';

describe('sales report — items sold', () => {
  it('anonymous 401, waiter 403, nothing read', async () => {
    expect((await request(app).get(SALES)).status).toBe(401);
    expect((await request(app).get(SALES).set('Cookie', await tokenFor('waiter'))).status).toBe(403);
    expect(db.orderItem.aggregate).not.toHaveBeenCalled();
  });

  it('bad range → 400 before any query', async () => {
    const res = await request(app).get('/api/admin/reports/sales?from=2026-02-30').set('Cookie', await tokenFor('manager'));
    expect(res.status).toBe(400);
    expect(db.orderItem.aggregate).not.toHaveBeenCalled();
    expect(db.orderItem.groupBy).not.toHaveBeenCalled();
  });

  it('units + distinct dishes come from DB aggregates over the same sales, ignoring the category', async () => {
    db.orderItem.aggregate.mockResolvedValue({ _sum: { quantity: 42 } });
    db.orderItem.groupBy.mockImplementation(async (args: { by: string[] }) => {
      if (args.by.length === 1 && args.by[0] === 'menuItemId') return [{ menuItemId: 1 }, { menuItemId: 2 }, { menuItemId: 7 }];
      if (args.by.length === 1 && args.by[0] === 'name') return [{ name: 'Old special' }];
      return []; // the dish table's groupBy
    });
    const res = await request(app).get(`${SALES}&category=Drinks&waiterId=4`).set('Cookie', await tokenFor('manager'));
    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ itemsSold: 42, dishesSold: 4 });

    const agg = db.orderItem.aggregate.mock.calls[0][0];
    const salesWhere = db.order.aggregate.mock.calls[0][0].where;
    expect(agg.where.order).toEqual(salesWhere); // same sales, filters included
    expect(agg.where).not.toHaveProperty('categoryName'); // the category narrows only the dish table
    for (const [args] of db.orderItem.groupBy.mock.calls.filter((c: any[]) => c[0].by.length === 1)) {
      expect(args.take).toBeGreaterThan(0); // bounded
      expect(args.where).not.toHaveProperty('categoryName');
    }
    // No line reads: the lines are never loaded one order at a time.
    expect(db.orderItem.findMany).not.toHaveBeenCalled();
  });

  it('no sales → zeros', async () => {
    const res = await request(app).get(SALES).set('Cookie', await tokenFor('manager'));
    expect(res.body.summary).toMatchObject({ itemsSold: 0, dishesSold: 0 });
  });
});

describe('financial report — expenses by kind', () => {
  it('anonymous 401, cashier 403, nothing read', async () => {
    expect((await request(app).get(FIN)).status).toBe(401);
    expect((await request(app).get(FIN).set('Cookie', await tokenFor('cashier'))).status).toBe(403);
    expect(db.expense.groupBy).not.toHaveBeenCalled();
  });

  it('bad range → 400 before any query', async () => {
    const res = await request(app).get('/api/admin/reports/financial?from=2025-01-01&to=2026-09-01').set('Cookie', await tokenFor('manager'));
    expect(res.status).toBe(400);
    expect(db.expense.groupBy).not.toHaveBeenCalled();
  });

  it('splits by category kind; unknown names are operating; payroll-paid expenses are payroll; the kinds add up', async () => {
    db.expenseCategory.findMany.mockResolvedValue([
      { name: 'Stock', kind: 'stock_purchase' }, { name: 'Rent', kind: 'operating' }, { name: 'Wages', kind: 'payroll' },
    ]);
    db.expense.groupBy.mockResolvedValue([
      { category: 'Stock', _sum: { amount: 300 } },
      { category: 'Rent', _sum: { amount: 200 } },
      { category: 'Gas', _sum: { amount: 50.25 } }, // no category row → operating
      { category: 'Wages', _sum: { amount: 40 } },
    ]);
    db.expense.aggregate.mockImplementation(async (args: { where: { salaryPayment?: unknown } }) => (
      args.where.salaryPayment ? { _sum: { amount: 1000 } } : { _sum: { amount: 1590.25 }, _count: { _all: 9 } }
    ));
    const res = await request(app).get(FIN).set('Cookie', await tokenFor('manager'));
    expect(res.status).toBe(200);
    const k = res.body.pnl.expensesByKind;
    expect(k).toEqual({ stock_purchase: 300, operating: 250.25, payroll: 1040 });
    expect(k.stock_purchase + k.operating + k.payroll).toBeCloseTo(res.body.pnl.expenses, 2);
    // Top-level shape unchanged (P&L only).
    expect(Object.keys(res.body).sort()).toEqual(['byDay', 'from', 'lossDays', 'pnl', 'to']);
    // The category split excludes payroll-paid rows so nothing counts twice.
    const g = db.expense.groupBy.mock.calls[0][0];
    expect(g.by).toEqual(['category']);
    expect(g.where.salaryPayment).toEqual({ is: null });
    // One category read, not one per group.
    expect(db.expenseCategory.findMany).toHaveBeenCalledTimes(1);
  });

  it('CSV has the three kind lines', async () => {
    const res = await request(app).get(`${FIN}&format=csv&table=pnl`).set('Cookie', await tokenFor('manager'));
    expect(res.status).toBe(200);
    expect(res.text).toContain('"Stock purchases"');
    expect(res.text).toContain('"Operating expenses"');
    expect(res.text).toContain('"Payroll"');
  });
});
