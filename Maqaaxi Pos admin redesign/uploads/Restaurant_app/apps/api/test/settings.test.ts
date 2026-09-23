import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createPrismaMock, tokenFor, type PrismaMock } from './helpers.js';

const db: PrismaMock = vi.hoisted(() => ({}) as PrismaMock);
vi.mock('../src/lib/db/prisma.js', () => ({ default: db }));

const { createApp } = await import('../src/app.js');
const app = createApp();

// A tiny in-memory settings table behind the mock.
let rows: Record<string, string>;
beforeEach(() => {
  Object.assign(db, createPrismaMock());
  rows = {};
  db.setting.findMany.mockImplementation(async () => Object.entries(rows).map(([key, value]) => ({ key, value })));
  db.setting.upsert.mockImplementation(async ({ where, update }: { where: { key: string }; update: { value: string } }) => {
    rows[where.key] = update.value;
    return { key: where.key, value: update.value };
  });
});

describe('payment accounts + tax + business calendar settings', () => {
  it('accounts come from the business accounts table: the Register gets every active one, receipts the wallet numbers', async () => {
    const get = await request(app).get('/api/admin/settings').set('Cookie', await tokenFor('cashier'));
    expect(get.status).toBe(200);
    expect(get.body.moneyAccounts.map((a: { label: string }) => a.label)).toEqual(['Cash', 'A/C', 'E/d', 'Mastercard', 'Sifalo (online)']);
    expect(get.body.paymentAccounts).toEqual([{ label: 'A/C', number: '521436' }, { label: 'E/d', number: '748079' }]);
    expect(get.body).toMatchObject({ openingDate: null, fiscalYearStartMonth: 1, taxRate: 0 });
  });

  it('manager saves tax and the financial-year start month; GET returns them', async () => {
    const put = await request(app).put('/api/admin/settings').set('Cookie', await tokenFor('manager')).send({ taxRate: 5, fiscalYearStartMonth: 7 });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ taxRate: 5, fiscalYearStartMonth: 7 });
    expect(rows.fiscal_year_start_month).toBe('7');
  });

  it.each([
    [{ taxRate: -1 }],
    [{ taxRate: 51 }],
    [{ fiscalYearStartMonth: 0 }],
    [{ fiscalYearStartMonth: 13 }],
  ])('rejects %o with 400 and writes nothing', async (body) => {
    const res = await request(app).put('/api/admin/settings').set('Cookie', await tokenFor('admin')).send(body);
    expect(res.status).toBe(400);
    expect(db.setting.upsert).not.toHaveBeenCalled();
  });

  it('a cashier cannot change them (403)', async () => {
    const res = await request(app).put('/api/admin/settings').set('Cookie', await tokenFor('cashier')).send({ taxRate: 5 });
    expect(res.status).toBe(403);
  });
});
