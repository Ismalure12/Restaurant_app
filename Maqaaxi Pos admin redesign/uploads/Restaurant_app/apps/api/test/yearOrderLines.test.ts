import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createPrismaMock, tokenFor, type PrismaMock } from './helpers.js';

const db: PrismaMock = vi.hoisted(() => ({}) as PrismaMock);
vi.mock('../src/lib/db/prisma.js', () => ({ default: db }));

const { createApp } = await import('../src/app.js');
const { annualStatements, fyMonths, fyOfMonth } = await import('../src/lib/closing/yearClose.js');
const { tableKey } = await import('../src/lib/orders/tables.js');
const app = createApp();
const asManager = async () => ({ Cookie: await tokenFor('manager', 1) });

beforeEach(() => {
  Object.assign(db, createPrismaMock());
});

// ── Year close ────────────────────────────────────────────────────────────
const snap = (month: string, o: { net: number; cogs: number; opex?: number; payroll?: number; ownerIn?: number; ownerOut?: number; closing?: number }) => ({
  month,
  pnl: {
    sales: { gross: o.net, discounts: 0, refunds: 0, net: o.net, count: 10 },
    openingStock: 100, purchases: 0, closingStock: o.closing ?? 100, cogs: o.cogs, grossProfit: o.net - o.cogs,
    operating: { total: o.opex ?? 0, byCategory: o.opex ? [{ category: 'Rent', amount: o.opex }] : [] },
    payroll: o.payroll ?? 0, overShort: 0, netProfit: o.net - o.cogs - (o.opex ?? 0) - (o.payroll ?? 0),
  },
  cashFlow: { accounts: [{ accountId: 1, label: 'Cash', kind: 'cash', opening: 0, moneyIn: o.net, moneyOut: 20, closing: o.net - 20, byKind: { sale: o.net, expense: -20 } }] },
  position: { money: o.net - 20, stock: 100, customersOwe: 0, suppliersOwed: 0, salariesUnpaid: 0, net: 200, ownerIn: o.ownerIn ?? 0, ownerOut: o.ownerOut ?? 0 },
});

describe('financial year', () => {
  it('a year is 12 months from the start month and is labelled by the year it starts in', () => {
    expect(fyMonths(2026, 1)[0]).toBe('2026-01');
    expect(fyMonths(2026, 1)[11]).toBe('2026-12');
    expect(fyMonths(2026, 7)).toEqual(['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06']);
    expect(fyOfMonth('2027-03', 7)).toBe(2026);
    expect(fyOfMonth('2026-07', 7)).toBe(2026);
    expect(fyOfMonth('2026-06', 7)).toBe(2025);
  });

  it('annual statements add up the months: P&L total = sum of months, cash opening = first, closing = last', () => {
    const a = annualStatements([
      snap('2026-01', { net: 1000, cogs: 300, opex: 100, ownerIn: 50 }),
      snap('2026-02', { net: 800, cogs: 200, opex: 100, payroll: 150, ownerOut: 30 }),
    ] as never);
    expect(a.pnl.sales.net).toBe(1800);
    expect(a.pnl.cogs).toBe(500);
    expect(a.pnl.operating).toEqual({ total: 200, byCategory: [{ category: 'Rent', amount: 200 }] });
    expect(a.pnl.netProfit).toBe(1800 - 500 - 200 - 150);
    expect(a.months.map((m) => m.netProfit)).toEqual([600, 350]);
    expect(a.cashFlow.accounts[0]).toMatchObject({ opening: 0, moneyIn: 1800, moneyOut: 40, closing: 780 });
    expect(a.owner).toEqual({ profit: 950, ownerIn: 50, ownerOut: 30, carriedForward: 970 });
    expect(a.pnl.foodCostPct).toBeCloseTo(27.78, 1);
  });

  it('a year cannot be closed while a month is open', async () => {
    db.setting.findMany.mockResolvedValue([{ key: 'opening_date', value: '2025-01-01' }]);
    // only January 2025 is closed
    db.periodClose.findMany.mockResolvedValue([{ period: '2025-01', isClosed: true, snapshot: snap('2025-01', { net: 100, cogs: 10 }) }]);
    const res = await request(app).post('/api/admin/statements/year/FY2025').set(await asManager());
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('YEAR_HAS_OPEN_MONTHS');
    expect(db.periodClose.create).not.toHaveBeenCalled();
  });

  it('with all 12 months closed the year closes and remembers which months it covers', async () => {
    db.setting.findMany.mockResolvedValue([{ key: 'opening_date', value: '2025-01-01' }]);
    const all = fyMonths(2025, 1).map((m) => ({ period: m, isClosed: true, snapshot: snap(m, { net: 100, cogs: 10 }) }));
    db.periodClose.findMany.mockResolvedValue(all);
    db.periodClose.create.mockResolvedValue({});
    const res = await request(app).post('/api/admin/statements/year/FY2025').set(await asManager());
    expect(res.status).toBe(201);
    const row = db.periodClose.create.mock.calls[0][0].data;
    expect(row).toMatchObject({ period: 'FY2025', kind: 'year' });
    expect(row.snapshot.monthList).toHaveLength(12);
    expect(row.snapshot.pnl.sales.net).toBe(1200);
  });

  it('a month of a closed year cannot be reopened until the year is', async () => {
    db.periodClose.findUnique.mockResolvedValue({ period: '2025-12', kind: 'month', isClosed: true });
    db.periodClose.findFirst.mockResolvedValue(null);
    db.periodClose.findMany.mockResolvedValue([{ period: 'FY2025', snapshot: { monthList: fyMonths(2025, 1) } }]);
    const res = await request(app).post('/api/admin/statements/month/2025-12/reopen').set(await asManager()).send({ reason: 'Fix a count' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/FY2025/);
    expect(db.periodClose.update).not.toHaveBeenCalled();
  });

  it('the financial year start cannot change once a year is closed', async () => {
    db.setting.findMany.mockResolvedValue([{ key: 'fiscal_year_start_month', value: '1' }]);
    db.periodClose.count.mockResolvedValue(1);
    const res = await request(app).put('/api/admin/settings').set(await asManager()).send({ fiscalYearStartMonth: 7 });
    expect(res.status).toBe(409);
  });
});

// ── Order lines ───────────────────────────────────────────────────────────
describe('order lines are written next to the JSON', () => {
  const BURGER = { id: 1, name: 'Burger', price: '5.00', isActive: true, optionGroups: [], extras: [], category: { name: 'Mains' } };
  const line = { itemId: 1, name: 'Burger', unitPrice: 0.01, quantity: 3 };
  const created = { id: 60, status: 'open', paymentStatus: 'unpaid', orderType: 'delivery', items: [], total: 15, createdAt: new Date(), updatedAt: new Date() };

  it('a Register sale creates OrderItem rows repriced from the DB, with the category snapshot', async () => {
    db.menuItem.findMany.mockResolvedValue([BURGER]);
    db.order.create.mockImplementation(async ({ data }: { data: object }) => ({ ...created, ...data, id: 60 }));
    db.order.findUnique.mockResolvedValue(created);
    const res = await request(app).post('/api/admin/pos/orders').set(await asManager())
      .send({ items: [line], orderType: 'delivery', contactPhone: '061', address: 'X', paymentMethod: 'cash' });
    expect(res.status).toBe(201);
    const rows = db.orderItem.createMany.mock.calls[0][0].data;
    expect(rows).toEqual([expect.objectContaining({ orderId: 60, menuItemId: 1, name: 'Burger', categoryName: 'Mains', quantity: 3, unitPrice: 5, lineTotal: 15 })]);
  });
});

// ── Tables ────────────────────────────────────────────────────────────────
describe('tables', () => {
  it('"5", "T5", "Table 5" and "t 5" are one table', () => {
    expect(new Set(['5', 'T5', 'Table 5', 't 5', 'table#5'].map(tableKey))).toEqual(new Set(['5']));
    expect(tableKey('Terrace 2')).toBe('terrace2');
  });

  const BURGER = { id: 1, name: 'Burger', price: '5.00', isActive: true, optionGroups: [], extras: [], category: { name: 'Mains' } };
  const dineIn = (table: string) => ({ items: [{ itemId: 1, name: 'Burger', unitPrice: 5, quantity: 1 }], orderType: 'dine_in', tableNumber: table, waiterId: 7, payNow: false });

  beforeEach(() => {
    db.menuItem.findMany.mockResolvedValue([BURGER]);
    db.adminUser.findFirst.mockResolvedValue({ id: 7 });
    db.order.create.mockImplementation(async ({ data }: { data: object }) => ({ id: 61, ...data, createdAt: new Date(), updatedAt: new Date() }));
    db.order.findUnique.mockResolvedValue({ id: 61, status: 'open', items: [], total: 5, createdAt: new Date() });
  });

  it('once tables exist the Register must pick one; an unknown table is refused, nothing created', async () => {
    db.diningTable.findMany.mockResolvedValue([{ name: 'Table 5' }, { name: 'Table 6' }]);
    const bad = await request(app).post('/api/admin/pos/orders').set(await asManager()).send(dineIn('9'));
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/not one of the restaurant's tables/);
    expect(db.order.create).not.toHaveBeenCalled();
  });

  it('a spelling of a known table is stored under the table’s own name', async () => {
    db.diningTable.findMany.mockResolvedValue([{ name: 'Table 5' }]);
    const ok = await request(app).post('/api/admin/pos/orders').set(await asManager()).send(dineIn('T5'));
    expect(ok.status).toBe(201);
    expect(db.order.create.mock.calls[0][0].data.tableNumber).toBe('Table 5');
  });

  it('with no tables defined nothing changes: free text still works', async () => {
    const ok = await request(app).post('/api/admin/pos/orders').set(await asManager()).send(dineIn('T5'));
    expect(ok.status).toBe(201);
    expect(db.order.create.mock.calls[0][0].data.tableNumber).toBe('T5');
  });

  it('a second spelling of an existing table cannot be added', async () => {
    db.diningTable.findMany.mockResolvedValue([{ name: 'Table 5' }]);
    const res = await request(app).post('/api/admin/tables').set(await asManager()).send({ name: 'T5' });
    expect(res.status).toBe(409);
    expect(db.diningTable.create).not.toHaveBeenCalled();
  });

  it('only a manager manages tables', async () => {
    const res = await request(app).post('/api/admin/tables').set({ Cookie: await tokenFor('cashier', 2) }).send({ name: '8' });
    expect(res.status).toBe(403);
  });
});

// ── Menu report ───────────────────────────────────────────────────────────
describe('GET /api/admin/reports/menu', () => {
  it('per dish + per category, merging a renamed dish, and listing active dishes that never sold', async () => {
    db.orderItem.groupBy.mockResolvedValue([
      { menuItemId: 1, name: 'Burger', categoryName: 'Mains', _sum: { quantity: 10, lineTotal: 100 } },
      { menuItemId: 1, name: 'Old burger name', categoryName: 'Mains', _sum: { quantity: 5, lineTotal: 40 } },
      { menuItemId: 2, name: 'Soup', categoryName: 'Starters', _sum: { quantity: 4, lineTotal: 20 } },
    ]);
    db.menuItem.findMany.mockResolvedValue([
      { id: 1, name: 'Burger', category: { name: 'Mains' } },
      { id: 2, name: 'Soup', category: { name: 'Starters' } },
      { id: 3, name: 'Tiramisu', category: { name: 'Desserts' } },
    ]);
    const res = await request(app).get('/api/admin/reports/menu?from=2026-09-01&to=2026-09-30').set(await asManager());
    expect(res.status).toBe(200);
    expect(res.body.items[0]).toMatchObject({ menuItemId: 1, quantity: 15, revenue: 140 });
    expect(res.body.totals).toMatchObject({ quantity: 19, revenue: 160, dishes: 2 });
    expect(res.body.categories[0]).toMatchObject({ category: 'Mains', revenue: 140, dishes: 1 });
    expect(res.body.neverSold).toEqual([{ id: 3, name: 'Tiramisu', category: 'Desserts' }]);
    // counts the same orders every sales figure counts (closed in range, not voided)
    expect(db.orderItem.groupBy.mock.calls[0][0].where.order.status).toEqual({ in: ['pending', 'confirmed'] });
  });

  it('is manager only', async () => {
    const res = await request(app).get('/api/admin/reports/menu').set({ Cookie: await tokenFor('cashier', 2) });
    expect(res.status).toBe(403);
  });
});
