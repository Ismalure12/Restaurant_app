import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { createPrismaMock, tokenFor, type PrismaMock } from './helpers.js';
import { csvCell, toCsv, accountKey, accountLabel, accountWhere } from '../src/lib/reports/common.js';

const db: PrismaMock = vi.hoisted(() => ({}) as PrismaMock);
vi.mock('../src/lib/db/prisma.js', () => ({ default: db }));

const { createApp } = await import('../src/app.js');
const app = createApp();

const EMPTY_AGG = { _sum: {}, _count: { _all: 0 } };

beforeEach(() => {
  Object.assign(db, createPrismaMock(), {
    inventoryItem: { findMany: vi.fn().mockResolvedValue([]) },
    stockMovement: { groupBy: vi.fn().mockResolvedValue([]), findMany: vi.fn().mockResolvedValue([]) },
    expense: { groupBy: vi.fn().mockResolvedValue([]), findMany: vi.fn().mockResolvedValue([]), aggregate: vi.fn().mockResolvedValue(EMPTY_AGG) },
    shift: { findMany: vi.fn().mockResolvedValue([]) },
  });
  for (const m of [db.order, db.invoice, db.invoicePayment, db.adminUser, db.customer, db.menuItem, db.orderItem]) {
    m.aggregate.mockResolvedValue(EMPTY_AGG);
    m.groupBy.mockResolvedValue([]);
    m.findMany.mockResolvedValue([]);
  }
});

describe('CSV output', () => {
  it('neutralises formulas (CSV injection) but keeps numbers numeric', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell('+252 61')).toBe(`"'+252 61"`);
    expect(csvCell('@cmd')).toBe(`"'@cmd"`);
    expect(csvCell('-12.50')).toBe('"-12.50"');
    expect(csvCell(null)).toBe('""');
  });

  it('starts with a UTF-8 BOM and uses CRLF rows', () => {
    const out = toCsv(['A', 'B'], [[1, 'x']]);
    expect(out.startsWith('﻿"A","B"\r\n"1","x"\r\n')).toBe(true);
  });
});

describe('money-account keys', () => {
  it('till accounts, Settings accounts and online gateways get distinct keys + labels', () => {
    expect(accountKey({ source: 'pos', paymentMethod: 'evc', paymentAccount: 'E-Dahab' })).toBe('acct:E-Dahab');
    expect(accountKey({ source: 'pos', paymentMethod: 'evc', paymentAccount: null })).toBe('evc');
    expect(accountKey({ source: 'online', paymentMethod: 'card' })).toBe('online:card');
    expect(accountKey({ source: 'pos', paymentMethod: 'card' })).toBe('card');
    expect(accountLabel('invoice')).toBe('On account');
    expect(accountLabel('online:waafi')).toBe('Online · EVC/ZAAD');
  });

  it('each key filters back to exactly its orders; unknown keys are refused', () => {
    expect(accountWhere('acct:E-Dahab')).toEqual({ source: { not: 'online' }, paymentMethod: 'evc', paymentAccount: 'E-Dahab' });
    expect(accountWhere('online:card')).toEqual({ source: 'online', paymentMethod: 'card' });
    expect(accountWhere('card')).toEqual({ source: { not: 'online' }, paymentMethod: 'card' });
    expect(accountWhere('bitcoin')).toBeNull();
  });
});

const REPORTS = [
  '/api/admin/reports/sales', '/api/admin/reports/inventory',
  '/api/admin/reports/inventory/movements', '/api/admin/reports/financial', '/api/admin/reports/employees',
  '/api/admin/reports/employees/3',
];

describe('reports — manager tier only', () => {
  it.each(REPORTS)('%s: anonymous 401, waiter + cashier 403', async (url) => {
    expect((await request(app).get(url)).status).toBe(401);
    expect((await request(app).get(url).set('Cookie', await tokenFor('waiter'))).status).toBe(403);
    expect((await request(app).get(url).set('Cookie', await tokenFor('cashier'))).status).toBe(403);
    expect(db.order.aggregate).not.toHaveBeenCalled();
  });

  it('manager gets the sales report; every day of the range is present', async () => {
    const res = await request(app).get('/api/admin/reports/sales?from=2026-09-01&to=2026-09-07').set('Cookie', await tokenFor('manager'));
    expect(res.status).toBe(200);
    expect(res.body.byDay).toHaveLength(7);
    expect(res.body.summary).toMatchObject({ orders: 0, netSales: 0 });
    // Sales window = closedAt in the LOCAL days (Mogadishu midnight = 21:00 UTC).
    const where = db.order.aggregate.mock.calls[0][0].where;
    expect(where.closedAt.gte.toISOString()).toBe('2026-08-31T21:00:00.000Z');
    expect(where.closedAt.lt.toISOString()).toBe('2026-09-07T21:00:00.000Z');
  });

  it('filters combine without clobbering each other (account + waiter + cashier)', async () => {
    await request(app).get('/api/admin/reports/sales?account=acct:EVC%20Plus&waiterId=4&staffId=5').set('Cookie', await tokenFor('admin'));
    const where = db.order.aggregate.mock.calls[0][0].where;
    expect(where.AND).toEqual([
      { waiterId: 4 }, { staffId: 5 }, { source: { not: 'online' }, paymentMethod: 'evc', paymentAccount: 'EVC Plus' },
    ]);
    expect(where.OR).toEqual([{ paymentStatus: 'paid' }, { paymentMethod: 'invoice' }]);
  });

  it('bad input → 400 before any query', async () => {
    const cookie = await tokenFor('manager');
    for (const qs of ['from=2026-02-30', 'from=2025-01-01&to=2026-09-01', 'account=bitcoin', 'waiterId=abc', 'source=phone']) {
      const res = await request(app).get(`/api/admin/reports/sales?${qs}`).set('Cookie', cookie);
      expect(res.status).toBe(400);
    }
    expect(db.order.aggregate).not.toHaveBeenCalled();
  });

  it('CSV export: text/csv attachment, BOM, header row', async () => {
    const res = await request(app).get('/api/admin/reports/sales?format=csv&table=days&from=2026-09-01&to=2026-09-02').set('Cookie', await tokenFor('manager'));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toBe('attachment; filename="Sales report - By day 2026-09-01 to 2026-09-02.csv"');
    expect(res.text.startsWith('﻿"Date","Orders","Sales"')).toBe(true);
  });

  it('Excel export: one workbook — Summary + a sheet per table, titled', async () => {
    db.setting.findUnique.mockResolvedValue({ value: 'KFG' });
    const res = await request(app).get('/api/admin/reports/sales?format=xlsx&from=2026-09-01&to=2026-09-02')
      .set('Cookie', await tokenFor('manager'))
      .buffer(true).parse((r, cb) => { const c: Buffer[] = []; r.on('data', (d: Buffer) => c.push(d)); r.on('end', () => cb(null, Buffer.concat(c))); });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/spreadsheetml\.sheet/);
    expect(res.headers['content-disposition']).toBe('attachment; filename="Sales report 2026-09-01 to 2026-09-02.xlsx"');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as never);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Summary', 'By day', 'By account', 'By channel', 'Categories', 'Dishes', 'Never sold']);
    expect(wb.getWorksheet('Summary')!.getCell('A1').value).toBe('KFG — Sales report');
    const days = wb.getWorksheet('By day')!;
    expect(days.getCell('A4').value).toBe('Date');
    expect(days.getCell('A5').value).toEqual(new Date(Date.UTC(2026, 8, 1)));
  });

  it('export: unknown format → 400; a waiter or cashier cannot export', async () => {
    expect((await request(app).get('/api/admin/reports/sales?format=pdf').set('Cookie', await tokenFor('manager'))).status).toBe(400);
    expect((await request(app).get('/api/admin/reports/sales?format=xlsx').set('Cookie', await tokenFor('waiter'))).status).toBe(403);
    expect((await request(app).get('/api/admin/sales?format=xlsx').set('Cookie', await tokenFor('cashier'))).status).toBe(403);
  });

  it('employee detail of an unknown id → 404', async () => {
    db.adminUser.findUnique.mockResolvedValue(null);
    expect((await request(app).get('/api/admin/reports/employees/999').set('Cookie', await tokenFor('manager'))).status).toBe(404);
  });
});

describe('trimmed reports — one number, one place', () => {
  it('the old ledger + aggregate endpoints are gone (their data lives in Sales history / Employees)', async () => {
    const cookie = await tokenFor('manager');
    for (const url of ['/api/admin/reports/sales/orders', '/api/admin/finance/summary', '/api/admin/reports/summary']) {
      expect((await request(app).get(url).set('Cookie', cookie)).status).toBe(404);
    }
  });

  it('sales report owns the busy-hours curve but no per-person table; Sales history has no hour curve', async () => {
    const cookie = await tokenFor('manager');
    const res = await request(app).get('/api/admin/reports/sales').set('Cookie', cookie);
    expect(res.body).not.toHaveProperty('byCashier');
    expect(res.body.byHour).toEqual([]);
    const history = await request(app).get('/api/admin/sales').set('Cookie', cookie);
    expect(history.body.summary).not.toHaveProperty('byHour');
    expect(res.body.summary).not.toHaveProperty('openTabs');
    expect((await request(app).get('/api/admin/reports/sales?format=csv&table=cashiers').set('Cookie', cookie)).status).toBe(400);
  });

  it('financial report is the P&L only', async () => {
    const res = await request(app).get('/api/admin/reports/financial').set('Cookie', await tokenFor('manager'));
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['byDay', 'from', 'lossDays', 'pnl', 'to']);
    // discounts and refunds are already out of sales — they are not P&L lines
    expect(res.body.pnl).not.toHaveProperty('discounts');
    expect(res.body.pnl).not.toHaveProperty('deliveryFees');
  });
});

describe('GET /api/admin/search', () => {
  it('anonymous 401; empty query 400', async () => {
    expect((await request(app).get('/api/admin/search?q=x')).status).toBe(401);
    expect((await request(app).get('/api/admin/search?q=').set('Cookie', await tokenFor('cashier'))).status).toBe(400);
  });

  it('an order code finds the order by id; a short number also matches receipt #', async () => {
    await request(app).get('/api/admin/search?q=KFG-260919-0042').set('Cookie', await tokenFor('cashier'));
    expect(db.order.findMany.mock.calls[0][0].where.OR).toContainEqual({ id: 42 });
    db.order.findMany.mockClear();
    await request(app).get('/api/admin/search?q=0007').set('Cookie', await tokenFor('cashier'));
    const or = db.order.findMany.mock.calls[0][0].where.OR;
    expect(or).toContainEqual({ id: 7 });
    expect(or).toContainEqual({ receiptNo: 7 });
  });

  it('a waiter only searches the menu — never orders, customers, stock, staff or expenses', async () => {
    const res = await request(app).get('/api/admin/search?q=ali').set('Cookie', await tokenFor('waiter'));
    expect(res.status).toBe(200);
    expect(db.order.findMany).not.toHaveBeenCalled();
    expect(db.customer.findMany).not.toHaveBeenCalled();
    expect(db.adminUser.findMany).not.toHaveBeenCalled();
    expect(db.menuItem.findMany).toHaveBeenCalled();
  });

  it('a cashier gets no staff or expense results (manager only)', async () => {
    await request(app).get('/api/admin/search?q=ali').set('Cookie', await tokenFor('cashier'));
    expect(db.customer.findMany).toHaveBeenCalled();
    expect(db.adminUser.findMany).not.toHaveBeenCalled();
  });
});
