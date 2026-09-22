import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createPrismaMock, tokenFor, type PrismaMock } from './helpers.js';
import { salaryExpenseDate } from '../src/controllers/admin/payroll.controller.js';
import { applyChange, rateFor, salaryFor, prevMonth, currentMonth } from '../src/lib/money/salary.js';

const db: PrismaMock = vi.hoisted(() => ({}) as PrismaMock);
vi.mock('../src/lib/db/prisma.js', () => ({ default: db }));

const { createApp } = await import('../src/app.js');
const app = createApp();

beforeEach(() => {
  Object.assign(db, createPrismaMock());
  db.salaryPayment.findMany.mockResolvedValue([]);
});

const nextMonth = (m: string) => {
  const [y, mm] = m.split('-').map(Number);
  return mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`;
};

describe('salary history rules', () => {
  const rates = [
    { staffId: 1, amount: 200, fromMonth: '2000-01' },
    { staffId: 1, amount: 250, fromMonth: '2026-10' },
    { staffId: 1, amount: 300, fromMonth: '2027-01' },
  ];

  it('a month uses the latest rate that started on or before it — earlier months keep their amount', () => {
    expect(salaryFor(rates, '2026-09')).toBe(200);
    expect(salaryFor(rates, '2026-10')).toBe(250);
    expect(salaryFor(rates, '2026-12')).toBe(250);
    expect(salaryFor(rates, '2027-03')).toBe(300);
    expect(rateFor([], '2026-09')).toBeNull();
    expect(salaryFor([], '2026-09')).toBe(0);
  });

  it('set / raise by amount / raise by percent, rounded to cents, never negative', () => {
    expect(applyChange(200, 'set', 320)).toBe(320);
    expect(applyChange(200, 'add', 25.5)).toBe(225.5);
    expect(applyChange(333.33, 'percent', 10)).toBe(366.66);
    expect(applyChange(100, 'add', -500)).toBe(0);
    expect(prevMonth('2026-01')).toBe('2025-12');
  });
});

describe('payroll — manager tier only', () => {
  it.each([
    ['get', '/api/admin/payroll'], ['post', '/api/admin/payroll'], ['delete', '/api/admin/payroll/1'],
    ['post', '/api/admin/payroll/rates'], ['get', '/api/admin/payroll/staff/1'], ['delete', '/api/admin/payroll/rates/1'],
  ] as const)('%s %s: anonymous 401, cashier + waiter 403, nothing read', async (method, url) => {
    expect((await request(app)[method](url)).status).toBe(401);
    expect((await request(app)[method](url).set('Cookie', await tokenFor('cashier'))).status).toBe(403);
    expect((await request(app)[method](url).set('Cookie', await tokenFor('waiter'))).status).toBe(403);
    expect(db.salaryPayment.findMany).not.toHaveBeenCalled();
    expect(db.salaryRate.findMany).not.toHaveBeenCalled();
    expect(db.salaryRate.createMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/payroll — salary for the chosen month', () => {
  it('uses the rate in force that month, flags a change made that month, and shows the next one', async () => {
    db.adminUser.findMany.mockResolvedValue([{ id: 5, name: 'Jaamac', email: 'j@x', role: 'cashier', isActive: true }]);
    db.salaryRate.findMany.mockResolvedValue([
      { staffId: 5, amount: '200.00', fromMonth: '2000-01' },
      { staffId: 5, amount: '250.00', fromMonth: '2026-10' },
      { staffId: 5, amount: '280.00', fromMonth: '2027-01' },
    ]);
    const cookie = await tokenFor('manager');
    const sep = await request(app).get('/api/admin/payroll?month=2026-09').set('Cookie', cookie);
    expect(sep.body.rows[0]).toMatchObject({ salary: 200, changedFrom: null, next: { amount: 250, fromMonth: '2026-10' } });
    const oct = await request(app).get('/api/admin/payroll?month=2026-10').set('Cookie', cookie);
    expect(oct.body.rows[0]).toMatchObject({ salary: 250, changedFrom: 200 });
    expect(oct.body.summary).toMatchObject({ people: 1, due: 250, remaining: 250, unpaidCount: 1 });
  });
});

describe('POST /api/admin/payroll/rates — set or raise salaries from a month', () => {
  const change = async (body: object) => request(app).post('/api/admin/payroll/rates').set('Cookie', await tokenFor('manager', 2)).send(body);
  const month = currentMonth();

  it('raises everyone by 10% from this month in ONE transaction (one delete + one createMany), manager included', async () => {
    db.adminUser.findMany.mockResolvedValue([{ id: 2, name: 'Manager', email: 'm@x' }, { id: 5, name: 'Jaamac', email: 'j@x' }]);
    db.salaryRate.findMany.mockResolvedValue([{ staffId: 2, amount: '500', fromMonth: '2000-01' }, { staffId: 5, amount: '200', fromMonth: '2000-01' }]);
    const res = await change({ all: true, mode: 'percent', value: 10, fromMonth: month });
    expect(res.status).toBe(200);
    expect(res.body.changes).toEqual([
      { staffId: 2, name: 'Manager', from: 500, to: 550 },
      { staffId: 5, name: 'Jaamac', from: 200, to: 220 },
    ]);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.salaryRate.deleteMany).toHaveBeenCalledWith({ where: { staffId: { in: [2, 5] }, fromMonth: month } });
    expect(db.salaryRate.createMany).toHaveBeenCalledTimes(1);
    expect(db.salaryRate.createMany.mock.calls[0][0].data).toEqual([
      { staffId: 2, amount: 550, fromMonth: month, setById: 2 },
      { staffId: 5, amount: 220, fromMonth: month, setById: 2 },
    ]);
  });

  it('dryRun previews old → new and writes nothing', async () => {
    db.adminUser.findMany.mockResolvedValue([{ id: 5, name: 'Jaamac', email: 'j@x' }]);
    db.salaryRate.findMany.mockResolvedValue([{ staffId: 5, amount: '200', fromMonth: '2000-01' }]);
    const res = await change({ staffIds: [5], mode: 'add', value: 50, fromMonth: nextMonth(month), dryRun: true });
    expect(res.body.changes[0]).toMatchObject({ from: 200, to: 250 });
    expect(db.salaryRate.createMany).not.toHaveBeenCalled();
    expect(db.salaryRate.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses a past month, a negative salary, nobody chosen, and unknown staff', async () => {
    expect((await change({ all: true, mode: 'set', value: 100, fromMonth: prevMonth(month) })).status).toBe(400);
    expect((await change({ all: true, mode: 'set', value: -1, fromMonth: month })).status).toBe(400);
    expect((await change({ mode: 'set', value: 100, fromMonth: month })).status).toBe(400);
    expect(db.adminUser.findMany).not.toHaveBeenCalled();
    db.adminUser.findMany.mockResolvedValue([]);
    expect((await change({ staffIds: [99], mode: 'set', value: 100, fromMonth: month })).status).toBe(404);
    expect(db.salaryRate.createMany).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/admin/payroll/rates/:id — cancel a change that has not started', () => {
  const del = async () => request(app).delete('/api/admin/payroll/rates/7').set('Cookie', await tokenFor('manager'));

  it('only a future change can be deleted (guarded in the where), so past months never move', async () => {
    db.salaryRate.deleteMany.mockResolvedValue({ count: 1 });
    expect((await del()).status).toBe(200);
    expect(db.salaryRate.deleteMany).toHaveBeenCalledWith({ where: { id: 7, fromMonth: { gt: currentMonth() } } });
  });

  it('a change already in force → 409; unknown → 404', async () => {
    db.salaryRate.deleteMany.mockResolvedValue({ count: 0 });
    db.salaryRate.findUnique.mockResolvedValue({ id: 7 });
    expect((await del()).status).toBe(409);
    db.salaryRate.findUnique.mockResolvedValue(null);
    expect((await del()).status).toBe(404);
  });
});

describe('POST /api/admin/payroll — pay one or several for a month', () => {
  // Salaries are paid out of Cash (account 1) unless a test says otherwise.
  const pay = async (body: object) => request(app).post('/api/admin/payroll').set('Cookie', await tokenFor('manager', 2)).send({ paidFromAccountId: 1, ...body });

  it('creates each Salaries expense WITH its payment, all in one transaction', async () => {
    db.adminUser.findMany.mockResolvedValue([{ id: 5, name: 'Jaamac', email: 'j@x' }, { id: 6, name: 'Hodan', email: 'h@x' }]);
    let n = 0;
    db.salaryPayment.create.mockImplementation(async ({ data }: { data: { month: string; amount: number; expense: { create: object } } }) => {
      n += 1;
      return {
        id: n, month: data.month, amount: String(data.amount), note: null, paidAt: new Date(), paidBy: { name: 'Mgr', email: 'm@x' },
        expense: { id: 70 + n, ...data.expense.create, paidFromAccountId: 1 },
      };
    });
    const res = await pay({ month: '2026-09', payments: [{ staffId: 5, amount: 250 }, { staffId: 6, amount: 180, note: 'EVC' }] });
    expect(res.status).toBe(201);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.salaryPayment.create).toHaveBeenCalledTimes(2);
    const first = db.salaryPayment.create.mock.calls[0][0].data;
    expect(first).toMatchObject({ month: '2026-09', amount: 250, staff: { connect: { id: 5 } }, paidBy: { connect: { id: 2 } } });
    expect(first.expense.create).toMatchObject({ category: 'Salaries', amount: 250, note: 'Salary · Jaamac · Sep 2026', staff: { connect: { id: 2 } } });
    expect(first.expense.create.paidFrom).toEqual({ connect: { id: 1 } });
    expect(db.salaryPayment.create.mock.calls[1][0].data.expense.create.note).toBe('Salary · Hodan · Sep 2026 · EVC');
    expect(res.body.paid).toHaveLength(2);
    // The money leaving Cash: one salary row per person, in the same transaction.
    const rows = db.accountEntry.createMany.mock.calls[0][0].data;
    expect(rows).toEqual([
      expect.objectContaining({ accountId: 1, amount: -250, kind: 'salary', expenseId: 71 }),
      expect.objectContaining({ accountId: 1, amount: -180, kind: 'salary', expenseId: 72 }),
    ]);
  });

  it('salaries must come out of an active account the money can leave (not online, not switched off)', async () => {
    db.adminUser.findMany.mockResolvedValue([{ id: 5, name: 'Jaamac', email: 'j@x' }]);
    for (const paidFromAccountId of [6, 4, 999]) {
      const res = await pay({ month: '2026-09', payments: [{ staffId: 5, amount: 250 }], paidFromAccountId });
      expect(res.status).toBe(400);
    }
    expect((await request(app).post('/api/admin/payroll').set('Cookie', await tokenFor('manager', 2)).send({ month: '2026-09', payments: [{ staffId: 5, amount: 250 }] })).status).toBe(400);
    expect(db.salaryPayment.create).not.toHaveBeenCalled();
  });

  it('anyone already paid for the month → 409 naming them, nothing written', async () => {
    db.adminUser.findMany.mockResolvedValue([{ id: 5, name: 'Jaamac', email: 'j@x' }]);
    db.salaryPayment.findMany.mockResolvedValue([{ staff: { name: 'Jaamac', email: 'j@x' } }]);
    const res = await pay({ month: '2026-09', payments: [{ staffId: 5, amount: 250 }] });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Jaamac is already paid for Sep 2026/);
    expect(db.salaryPayment.create).not.toHaveBeenCalled();
  });

  it('bad month / amount / duplicate person → 400 before any read; unknown staff → 404', async () => {
    for (const body of [
      { month: '2026-13', payments: [{ staffId: 5, amount: 1 }] },
      { month: '2026-09', payments: [{ staffId: 5, amount: 0 }] },
      { month: '2026-09', payments: [] },
      { month: '2026-09', payments: [{ staffId: 5, amount: 1 }, { staffId: 5, amount: 2 }] },
    ]) expect((await pay(body)).status).toBe(400);
    expect(db.adminUser.findMany).not.toHaveBeenCalled();
    db.adminUser.findMany.mockResolvedValue([]);
    expect((await pay({ month: '2026-09', payments: [{ staffId: 99, amount: 10 }] })).status).toBe(404);
  });

  it('a past month is costed on its last local day, the current month now', () => {
    const now = new Date('2026-09-18T10:00:00Z');
    expect(salaryExpenseDate('2026-09', now)).toBe(now);
    // 31 Aug 12:00 Mogadishu = 09:00 UTC
    expect(salaryExpenseDate('2026-08', now).toISOString()).toBe('2026-08-31T09:00:00.000Z');
    expect(salaryExpenseDate('2026-10', now).toISOString()).toBe('2026-10-01T09:00:00.000Z');
  });
});

describe('DELETE /api/admin/payroll/:id — undo', () => {
  it('deletes the linked expense (the payment cascades)', async () => {
    db.salaryPayment.findUnique.mockResolvedValue({ expenseId: 77, expense: { incurredAt: new Date('2026-09-10T09:00:00Z') } });
    db.expense.deleteMany.mockResolvedValue({ count: 1 });
    const res = await request(app).delete('/api/admin/payroll/3').set('Cookie', await tokenFor('admin'));
    expect(res.status).toBe(200);
    expect(db.expense.deleteMany).toHaveBeenCalledWith({ where: { id: 77 } });
  });

  it('a salary paid in a closed day cannot be undone (409, nothing deleted)', async () => {
    db.salaryPayment.findUnique.mockResolvedValue({ expenseId: 77, expense: { incurredAt: new Date('2026-09-10T09:00:00Z') } });
    db.dayClose.findUnique.mockResolvedValue({ isClosed: true });
    const res = await request(app).delete('/api/admin/payroll/3').set('Cookie', await tokenFor('admin'));
    expect(res.status).toBe(409);
    expect(db.expense.deleteMany).not.toHaveBeenCalled();
  });

  it('unknown payment → 404', async () => {
    db.salaryPayment.findUnique.mockResolvedValue(null);
    expect((await request(app).delete('/api/admin/payroll/3').set('Cookie', await tokenFor('admin'))).status).toBe(404);
  });
});

describe('staff salary on create / edit', () => {
  it('a new staff member with a salary gets their first rate from this month', async () => {
    db.adminUser.findUnique.mockResolvedValue(null);
    db.adminUser.create.mockResolvedValue({ id: 9, email: 'n@x.com', role: 'cashier' });
    const res = await request(app).post('/api/users').set('Cookie', await tokenFor('manager', 2))
      .send({ email: 'n@x.com', password: 'secret123', role: 'cashier', monthlySalary: 180 });
    expect(res.status).toBe(201);
    expect(db.adminUser.create.mock.calls[0][0].data.salaryRates).toEqual({ create: { amount: 180, fromMonth: currentMonth(), setById: 2 } });
  });

  it('editing staff never changes salary (that goes through Payroll with a start month)', async () => {
    db.adminUser.findUnique.mockResolvedValue({ id: 5, email: 'c@x.com', role: 'cashier', name: 'C', phone: null, isActive: true });
    db.adminUser.update.mockResolvedValue({ id: 5 });
    await request(app).put('/api/users/5').set('Cookie', await tokenFor('manager')).send({ name: 'X', monthlySalary: 999 });
    expect(db.adminUser.update.mock.calls[0][0].data).not.toHaveProperty('monthlySalary');
  });
});

describe('GET /api/admin/me/salary — own record only', () => {
  it('queries by the caller id, never a param', async () => {
    db.salaryRate.findMany.mockResolvedValue([{ amount: '300.00', fromMonth: '2000-01' }]);
    const res = await request(app).get('/api/admin/me/salary?staffId=1').set('Cookie', await tokenFor('waiter', 9));
    expect(res.status).toBe(200);
    expect(db.salaryRate.findMany.mock.calls[0][0].where).toEqual({ staffId: 9 });
    expect(db.salaryPayment.findMany.mock.calls[0][0].where.staffId).toBe(9);
    expect(res.body.salary).toBe(300);
  });
});

describe('Invoicing folded into Customers', () => {
  it('the standalone "new invoice" endpoint is gone', async () => {
    const res = await request(app).post('/api/admin/invoices').set('Cookie', await tokenFor('manager')).send({ customerId: 1, items: [] });
    expect(res.status).toBe(405);
  });

  it('customers ?owing=1 filters to customers with an open invoice', async () => {
    db.customer.findMany.mockResolvedValue([]);
    await request(app).get('/api/admin/customers?owing=1').set('Cookie', await tokenFor('cashier'));
    expect(db.customer.findMany.mock.calls[0][0].where).toEqual({ invoices: { some: { status: { in: ['unpaid', 'partial'] } } } });
  });
});
