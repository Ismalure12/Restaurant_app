import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createPrismaMock, tokenFor, type PrismaMock } from './helpers.js';

const db: PrismaMock = vi.hoisted(() => ({}) as PrismaMock);
vi.mock('../src/lib/db/prisma.js', () => ({ default: db }));

const { createApp } = await import('../src/app.js');
const { liveMonthStatement } = await import('../src/lib/closing/statements.js');
const app = createApp();

const asManager = async () => ({ Cookie: await tokenFor('manager', 1) });

beforeEach(() => {
  Object.assign(db, createPrismaMock());
});

describe('purchases: paid now vs on credit', () => {
  const buy = async (body: object) => request(app).post('/api/admin/inventory/7/movements').set(await asManager())
    .send({ type: 'purchase', quantity: 10, totalCost: 50, ...body });
  const item = { id: 7, name: 'Rice', quantity: '5' };

  beforeEach(() => {
    db.inventoryItem.findFirst.mockResolvedValue(item);
    db.inventoryItem.update.mockResolvedValue({ quantity: 15 });
    db.stockMovement.create.mockResolvedValue({ id: 33 });
    db.supplier.findFirst.mockResolvedValue({ id: 2 });
    db.expense.create.mockResolvedValue({ id: 61, amount: 50, incurredAt: new Date(), paidFromAccountId: 1, category: 'purchases' });
  });

  it('on credit needs a supplier and a cost', async () => {
    expect((await buy({ onCredit: true })).status).toBe(400);
    expect((await buy({ onCredit: true, supplierId: 2, totalCost: 0 })).status).toBe(400);
    expect(db.stockMovement.create).not.toHaveBeenCalled();
  });

  it('on credit books the stock and the debt — no expense, no cash-book row', async () => {
    const res = await buy({ onCredit: true, supplierId: 2 });
    expect(res.status).toBe(201);
    expect(db.stockMovement.create.mock.calls[0][0].data).toMatchObject({ type: 'purchase', supplierId: 2, onCredit: true, totalCost: 50 });
    expect(db.expense.create).not.toHaveBeenCalled();
    expect(db.accountEntry.upsert).not.toHaveBeenCalled();
  });

  it('paid now books the expense + cash row and links them, so cost of goods counts it once', async () => {
    const res = await buy({ paidFromAccountId: 1 });
    expect(res.status).toBe(201);
    expect(db.expense.create).toHaveBeenCalled();
    expect(db.accountEntry.upsert).toHaveBeenCalled();
    expect(db.stockMovement.update.mock.calls[0][0]).toMatchObject({ where: { id: 33 }, data: { expenseId: 61 } });
  });
});

describe('POST /api/admin/suppliers/:id/payments', () => {
  const pay = async (body: object) => request(app).post('/api/admin/suppliers/2/payments').set(await asManager()).send({ accountId: 1, ...body });

  beforeEach(() => {
    db.supplier.findUnique.mockResolvedValue({ id: 2, name: 'Bakery' });
    // owed = 80 bought on credit − 30 already paid = 50
    db.stockMovement.groupBy.mockResolvedValue([{ supplierId: 2, _sum: { totalCost: 80 } }]);
    db.supplierPayment.groupBy.mockResolvedValue([{ supplierId: 2, _sum: { amount: 30 } }]);
    db.supplierPayment.create.mockResolvedValue({ id: 9 });
  });

  it('cannot pay more than is owed', async () => {
    const res = await pay({ amount: 60 });
    expect(res.status).toBe(409);
    expect(db.supplierPayment.create).not.toHaveBeenCalled();
    expect(db.accountEntry.create).not.toHaveBeenCalled();
  });

  it('writes one supplier_payment row: money out of the chosen account', async () => {
    const res = await pay({ amount: 50 });
    expect(res.status).toBe(201);
    expect(db.accountEntry.create.mock.calls[0][0].data).toMatchObject({ accountId: 1, amount: -50, kind: 'supplier_payment', supplierPaymentId: 9 });
  });

  it('cannot pay from the online gateway account', async () => {
    const res = await pay({ amount: 10, accountId: 6 });
    expect(res.status).toBe(400);
  });

  it('is a manager job', async () => {
    const res = await request(app).post('/api/admin/suppliers/2/payments').set({ Cookie: await tokenFor('cashier', 2) }).send({ amount: 5, accountId: 1 });
    expect(res.status).toBe(403);
  });
});

describe('stock counts', () => {
  const lines = [
    { id: 1, countId: 4, itemId: 7, systemQty: 5, countedQty: 8, unitCost: null },
    { id: 2, countId: 4, itemId: 8, systemQty: 3, countedQty: 3, unitCost: null },
  ];
  const draft = { id: 4, countedOn: '2026-01-31', status: 'draft', lines };

  it('a line nobody touched posts as the stock at posting time — never a stale snapshot that would undo the day', async () => {
    // Rice was 5 when the count started; 2 were used since (now 3). Nobody touched the line.
    db.stockCount.findUnique.mockResolvedValue({ ...draft, lines: [{ ...lines[0], systemQty: 5, countedQty: null }] });
    db.stockCount.updateMany.mockResolvedValue({ count: 1 });
    db.stockMovement.groupBy.mockResolvedValue([]);
    db.inventoryItem.findMany.mockResolvedValue([{ id: 7, name: 'Rice', costPerUnit: '2', quantity: 3 }]);
    db.stockCountLine.update.mockResolvedValue({});
    db.stockCount.update.mockResolvedValue({});
    const res = await request(app).post('/api/admin/stock-counts/4/post').set(await asManager());
    expect(res.status).toBe(200);
    expect(res.body.adjustments).toBe(0);
    expect(db.stockMovement.createMany).not.toHaveBeenCalled();
    expect(db.stockCountLine.update.mock.calls[0][0].data.countedQty).toBe(3);
    expect(res.body.totalValue).toBe(6);
  });

  it('posting books only the differences as adjustments and fixes the value at cost', async () => {
    db.stockCount.findUnique.mockResolvedValue(draft);
    db.stockCount.updateMany.mockResolvedValue({ count: 1 });
    db.stockMovement.groupBy.mockResolvedValue([{ inventoryItemId: 7, _sum: { quantity: 10, totalCost: 50 } }]); // Rice avg 5.00
    db.inventoryItem.findMany.mockResolvedValue([{ id: 7, name: 'Rice', costPerUnit: null, quantity: 5 }, { id: 8, name: 'Oil', costPerUnit: '2', quantity: 3 }]);
    db.stockMovement.createMany.mockResolvedValue({ count: 1 });
    db.inventoryItem.update.mockResolvedValue({});
    db.stockCountLine.update.mockResolvedValue({});
    db.stockCount.update.mockResolvedValue({});
    const res = await request(app).post('/api/admin/stock-counts/4/post').set(await asManager());
    expect(res.status).toBe(200);
    const moves = db.stockMovement.createMany.mock.calls[0][0].data;
    expect(moves).toEqual([expect.objectContaining({ inventoryItemId: 7, type: 'adjustment', quantity: 3 })]);
    // 8 rice × 5.00 + 3 oil × 2.00
    expect(res.body.totalValue).toBe(46);
  });

  it('a count dated in a closed month cannot be posted', async () => {
    db.stockCount.findUnique.mockResolvedValue(draft);
    db.periodClose.findUnique.mockResolvedValue({ isClosed: true });
    db.inventoryItem.findMany.mockResolvedValue([]);
    db.stockMovement.groupBy.mockResolvedValue([]);
    const res = await request(app).post('/api/admin/stock-counts/4/post').set(await asManager());
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PERIOD_CLOSED');
  });
});

describe('month statements', () => {
  function septemberBooks(opening = '2026-09-01') {
    db.setting.findMany.mockResolvedValue([{ key: 'opening_date', value: opening }]);
    db.expenseCategory.findMany.mockResolvedValue([{ name: 'Rent', kind: 'operating' }, { name: 'purchases', kind: 'stock_purchase' }]);
    db.order.aggregate.mockImplementation(async (a: { where: { voidedAt?: unknown; paymentMethod?: string } }) => {
      if (a.where.voidedAt) return { _sum: { total: 100 }, _count: { _all: 2 } }; // refunds
      if (a.where.paymentMethod === 'invoice') return { _sum: { total: 0 }, _count: { _all: 0 } };
      return { _sum: { total: 1000, discount: 50 }, _count: { _all: 40 } }; // gross 1050
    });
    db.stockMovement.aggregate.mockResolvedValue({ _sum: { totalCost: 300 } });
    db.expense.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    db.expense.groupBy.mockResolvedValue([{ category: 'Rent', _sum: { amount: 200 } }]);
    db.accountEntry.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    db.accountEntry.groupBy.mockResolvedValue([]);
    db.invoice.aggregate.mockResolvedValue({ _sum: { total: 0 } });
    db.invoicePayment.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    db.stockMovement.groupBy.mockResolvedValue([]);
    db.supplierPayment.groupBy.mockResolvedValue([]);
    db.adminUser.findMany.mockResolvedValue([]);
    db.salaryRate.findMany.mockResolvedValue([]);
    db.salaryPayment.findMany.mockResolvedValue([]);
    // month's own count = 250; the opening count (before the month) = 100
    db.stockCount.findFirst.mockImplementation(async (a: { where: { countedOn: { gte?: string } } }) => (a.where.countedOn.gte ? { totalValue: 250, countedOn: '2026-09-30' } : { totalValue: 100, countedOn: '2026-08-31' }));
  }

  it('cost of goods = opening stock + purchases − closing stock, and net profit follows', async () => {
    septemberBooks();
    const s = await liveMonthStatement(db as never, '2026-09');
    expect(s.blocked).toBeNull();
    if (s.blocked) throw new Error('blocked');
    expect(s.pnl.sales).toMatchObject({ gross: 1050, discounts: 50, refunds: 100, net: 900 });
    expect(s.pnl).toMatchObject({ openingStock: 100, purchases: 300, closingStock: 250, cogs: 150, grossProfit: 750 });
    expect(s.pnl.foodCostPct).toBeCloseTo(16.67, 1);
    expect(s.pnl.operating.total).toBe(200);
    expect(s.pnl.netProfit).toBe(550);
    expect(s.complete).toBe(true);
  });

  it('a stock purchase expense is NOT an operating cost (it is cost of goods)', async () => {
    septemberBooks();
    await liveMonthStatement(db as never, '2026-09');
    expect(db.expense.groupBy.mock.calls[0][0].where.category).toEqual({ notIn: ['purchases'] });
  });

  it('without a stock count the month is incomplete and cannot be closed', async () => {
    septemberBooks();
    db.stockCount.findFirst.mockResolvedValue(null);
    const s = await liveMonthStatement(db as never, '2026-09');
    if (s.blocked) throw new Error('blocked');
    expect(s.complete).toBe(false);
    expect(s.warnings.join(' ')).toMatch(/stock count/i);
    // January is over and every day of it is closed — only the count is missing.
    septemberBooks('2026-01-01');
    db.stockCount.findFirst.mockResolvedValue(null);
    db.dayClose.findMany.mockResolvedValue(Array.from({ length: 31 }, (_, i) => ({ businessDay: `2026-01-${String(i + 1).padStart(2, '0')}` })));
    const res = await request(app).post('/api/admin/statements/month/2026-01').set(await asManager());
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NEEDS_STOCK_COUNT');
    expect(db.periodClose.create).not.toHaveBeenCalled();
  });

  it('with the count and every day closed the month closes and is frozen', async () => {
    septemberBooks('2026-01-01');
    db.dayClose.findMany.mockResolvedValue(Array.from({ length: 31 }, (_, i) => ({ businessDay: `2026-01-${String(i + 1).padStart(2, '0')}` })));
    db.periodClose.create.mockResolvedValue({});
    const res = await request(app).post('/api/admin/statements/month/2026-01').set(await asManager());
    expect(res.status).toBe(201);
    const row = db.periodClose.create.mock.calls[0][0].data;
    expect(row).toMatchObject({ period: '2026-01', kind: 'month' });
    expect(row.snapshot.pnl.netProfit).toBe(550);
  });

  it('a month before the opening date, or before opening is set, has no statements', async () => {
    db.setting.findMany.mockResolvedValue([]);
    expect((await liveMonthStatement(db as never, '2026-09')).blocked).toBe('needs-opening');
    db.setting.findMany.mockResolvedValue([{ key: 'opening_date', value: '2026-09-01' }]);
    expect((await liveMonthStatement(db as never, '2026-08')).blocked).toBe('before-opening');
  });

  it('closing needs every day closed first, and months close in order', async () => {
    septemberBooks('2026-01-01');
    db.dayClose.findMany.mockResolvedValue([]); // no day closed
    const res = await request(app).post('/api/admin/statements/month/2026-01').set(await asManager());
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('MONTH_HAS_OPEN_DAYS');
    // February needs January closed first
    const feb = await request(app).post('/api/admin/statements/month/2026-02').set(await asManager());
    expect(feb.status).toBe(409);
    expect(feb.body.error).toMatch(/2026-01/);
  });
});

describe('the month lock', () => {
  it('an expense dated in a closed month is refused', async () => {
    db.periodClose.findUnique.mockResolvedValue({ isClosed: true });
    db.expense.create.mockResolvedValue({ id: 5, amount: 20, category: 'Rent', incurredAt: new Date('2026-01-10T12:00:00Z'), paidFromAccountId: 1, staff: null, salaryPayment: null, paidFrom: null });
    const res = await request(app).post('/api/admin/expenses').set(await asManager()).send({ category: 'Rent', amount: 20, paidFromAccountId: 1, incurredAt: '2026-01-10' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PERIOD_CLOSED');
  });
});
