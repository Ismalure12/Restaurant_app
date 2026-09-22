import type { Request, Response } from 'express';
import prisma from '../../lib/db/prisma.js';
import { requirePage } from '../../lib/auth/auth.js';
import { MONTH_RE, paySalariesSchema, salaryChangeSchema } from '../../validations/payroll.validation.js';
import { readJson } from '../../utils/body.js';
import { checkPaidFrom, expenseEntryData } from '../../lib/money/cashBook.js';
import { isDayClosed, assertOpenAt, sendHttpError } from '../../lib/closing/dayClose.js';
import { searchParams } from '../../utils/query.js';
import { errCode } from '../../utils/errors.js';
import { dayKey, startOfDay } from '../../lib/time/businessTime.js';
import { groupRates, prevMonth, rateFor, salaryFor, applyChange, currentMonth } from '../../lib/money/salary.js';

// Monthly salaries — manager tier.
//   GET  /api/admin/payroll?month=YYYY-MM → every active staff member (and
//        anyone already paid that month): their salary FOR THAT MONTH (from
//        salary history, lib/money/salary.ts), whether it changed that month, the
//        next scheduled change, and the payment if made.
//   POST /api/admin/payroll {month, payments:[{staffId, amount, note?}]} → pays
//        one or several people: each gets an Expense (category "Salaries") +
//        its SalaryPayment, all in one transaction. Anyone already paid for
//        the month → 409 and nothing is written.
// A salary is an expense like any other, so it shows up in Expenses and the
// Financial report without special cases.
export const SALARY_CATEGORY = 'Salaries';
export const PAYROLL_ROLES = ['admin', 'manager', 'cashier', 'waiter'];

// Fixed names, not Intl: ICU versions disagree ("Sep" vs "Sept") and this text
// is stored in expense notes.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthLabel = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
const nameOf = (u: { name: string | null; email: string }) => u.name?.trim() || u.email;

/**
 * When the salary expense counts: now, unless the month is already over — then
 * midday of its last local day, so the Financial report shows the cost in the
 * month it covers. A future month counts from its first day.
 */
export function salaryExpenseDate(month: string, now = new Date()) {
  const current = dayKey(now).slice(0, 7);
  if (month === current) return now;
  const [y, m] = month.split('-').map(Number);
  const day = month < current ? new Date(Date.UTC(y, m, 0)).getUTCDate() : 1;
  return new Date(startOfDay(`${month}-${String(day).padStart(2, '0')}`).getTime() + 12 * 3_600_000);
}

export function serializeSalary(p: { id: number; month: string; amount: unknown; note: string | null; paidAt: Date; paidBy?: { name: string | null; email: string } | null }) {
  return {
    id: p.id, month: p.month, amount: Number(p.amount), note: p.note, paidAt: p.paidAt,
    paidBy: p.paidBy ? nameOf(p.paidBy) : null,
  };
}

export async function listPayroll(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'payroll', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const month = searchParams(req).get('month') || dayKey(new Date()).slice(0, 7);
  if (!MONTH_RE.test(month)) return res.status(400).json({ error: 'Month must look like 2026-09' });

  try {
    const [staff, paid, rates] = await Promise.all([
      prisma.adminUser.findMany({
        where: { role: { in: PAYROLL_ROLES }, isActive: true },
        select: { id: true, name: true, email: true, role: true, isActive: true },
        orderBy: { name: 'asc' },
        take: 500,
      }),
      prisma.salaryPayment.findMany({
        where: { month },
        include: { paidBy: { select: { name: true, email: true } }, staff: { select: { id: true, name: true, email: true, role: true, isActive: true } } },
        take: 500,
      }),
      // Small table (a few rows per person) — one read instead of one per person.
      prisma.salaryRate.findMany({ select: { staffId: true, amount: true, fromMonth: true }, orderBy: { fromMonth: 'asc' }, take: 5000 }),
    ]);
    const byStaff = new Map(paid.map((p) => [p.staffId, p]));
    const ratesOf = groupRates(rates);
    // Inactive staff who were paid this month still appear, so undo stays possible.
    const people = [...staff, ...paid.filter((p) => !staff.some((s) => s.id === p.staffId)).map((p) => p.staff)];

    const rows = people.map((u) => {
      const mine = ratesOf.get(u.id) ?? [];
      const salary = salaryFor(mine, month);
      const rate = rateFor(mine, month);
      const before = salaryFor(mine, prevMonth(month));
      const next = mine.find((r) => r.fromMonth > month);
      const p = byStaff.get(u.id);
      return {
        staffId: u.id, name: nameOf(u), role: u.role, isActive: u.isActive,
        salary,
        // Set or changed this very month → what it was before (0 = had none).
        changedFrom: rate?.fromMonth === month && before !== salary ? before : null,
        next: next ? { amount: Number(next.amount), fromMonth: next.fromMonth, label: monthLabel(next.fromMonth) } : null,
        payment: p ? serializeSalary(p) : null,
      };
    });
    const onPayroll = rows.filter((r) => r.salary > 0 || r.payment);
    const unpaid = onPayroll.filter((r) => !r.payment);
    const round = (n: number) => Math.round(n * 100) / 100;
    return res.json({
      month, label: monthLabel(month), rows,
      summary: {
        people: onPayroll.length,
        due: round(onPayroll.reduce((s, r) => s + r.salary, 0)),
        paid: round(rows.reduce((s, r) => s + (r.payment?.amount ?? 0), 0)),
        remaining: round(unpaid.reduce((s, r) => s + r.salary, 0)),
        unpaidCount: unpaid.length,
      },
      withoutSalary: rows.filter((r) => r.salary === 0 && !r.payment).length,
    });
  } catch (err) {
    console.error('GET /api/admin/payroll:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function paySalaries(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'payroll', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  let body: unknown;
  try { body = readJson(req); } catch { body = null; }
  const parsed = paySalariesSchema.safeParse(body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });
  const { month, payments, paidFromAccountId } = parsed.data;
  const ids = payments.map((p) => p.staffId);

  try {
    const [people, already] = await Promise.all([
      prisma.adminUser.findMany({ where: { id: { in: ids }, role: { in: PAYROLL_ROLES } }, select: { id: true, name: true, email: true } }),
      prisma.salaryPayment.findMany({ where: { month, staffId: { in: ids } }, select: { staff: { select: { name: true, email: true } } } }),
    ]);
    if (people.length !== ids.length) return res.status(404).json({ error: 'Staff member not found' });
    const from = await checkPaidFrom(prisma, paidFromAccountId);
    if (!from.ok) return res.status(400).json({ error: from.error });
    if (already.length) {
      const who = already.map((a) => nameOf(a.staff)).join(', ');
      return res.status(409).json({ error: `${who} ${already.length === 1 ? 'is' : 'are'} already paid for ${monthLabel(month)} — undo that first to change it` });
    }
    const names = new Map(people.map((p) => [p.id, nameOf(p)]));
    // A salary for a past month is dated in that month — unless that day is already closed, then today.
    const wanted = salaryExpenseDate(month);
    const incurredAt = (await isDayClosed(prisma, dayKey(wanted))) ? new Date() : wanted;
    const paidById = auth.session!.userId;

    // All or nothing. One nested create per person (expense + its payment);
    // the list is bounded by the staff count.
    const created = await prisma.$transaction(async (tx) => {
      const out = [];
      for (const p of payments) {
        out.push(await tx.salaryPayment.create({
          data: {
            month, amount: p.amount, note: p.note || null,
            staff: { connect: { id: p.staffId } },
            ...(paidById ? { paidBy: { connect: { id: paidById } } } : {}),
            expense: {
              create: {
                category: SALARY_CATEGORY, amount: p.amount, incurredAt, paidFrom: { connect: { id: from.value } },
                ...(paidById ? { staff: { connect: { id: paidById } } } : {}),
                note: `Salary · ${names.get(p.staffId)} · ${monthLabel(month)}${p.note ? ` · ${p.note}` : ''}`.slice(0, 300),
              },
            },
          },
          include: { paidBy: { select: { name: true, email: true } }, expense: true },
        }));
      }
      // The money leaving the account — one cash-book row per salary, in one write.
      await tx.accountEntry.createMany({ data: out.map((sp) => expenseEntryData(sp.expense, { createdById: paidById ?? null, salary: true })) });
      return out;
    });
    return res.status(201).json({ paid: created.map(serializeSalary) });
  } catch (err) {
    if (errCode(err) === 'P2002') return res.status(409).json({ error: 'Someone in this list is already paid for this month — refresh and try again' });
    console.error('POST /api/admin/payroll:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// POST /api/admin/payroll/rates — set or raise salaries from a month onward.
//   { staffIds:[…] | all:true, mode:'set'|'add'|'percent', value, fromMonth, dryRun? }
// One person, several, or everyone (the manager included — they can give
// themselves a raise). Months before `fromMonth` keep their salary; payments
// already made never change. `fromMonth` can't be in the past.
// dryRun:true returns the old → new amounts without saving (the dialog preview).
// Manager tier.
export async function changeSalaryRates(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'payroll', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  let body: unknown;
  try { body = readJson(req); } catch { body = null; }
  const parsed = salaryChangeSchema.safeParse(body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });
  const { staffIds, all, mode, value, fromMonth } = parsed.data;
  const dryRun = (body as { dryRun?: unknown })?.dryRun === true;
  if (fromMonth < currentMonth()) {
    return res.status(400).json({ error: 'A salary change starts this month or later — earlier months keep what they were' });
  }

  try {
    const people = await prisma.adminUser.findMany({
      where: all ? { role: { in: PAYROLL_ROLES }, isActive: true } : { id: { in: staffIds! }, role: { in: PAYROLL_ROLES } },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
      take: 500,
    });
    if (!all && people.length !== new Set(staffIds).size) return res.status(404).json({ error: 'Staff member not found' });
    if (people.length === 0) return res.status(400).json({ error: 'Nobody to change' });
    const ids = people.map((p) => p.id);

    const ratesOf = groupRates(await prisma.salaryRate.findMany({
      where: { staffId: { in: ids } }, select: { staffId: true, amount: true, fromMonth: true },
    }));
    const changes = people.map((p) => {
      const from = salaryFor(ratesOf.get(p.id) ?? [], fromMonth);
      return { staffId: p.id, name: p.name?.trim() || p.email, from, to: applyChange(from, mode, value) };
    });
    const result = { fromMonth, label: monthLabel(fromMonth), changes };
    if (dryRun) return res.json(result);

    // Replace any change already scheduled for that same month, all at once.
    await prisma.$transaction([
      prisma.salaryRate.deleteMany({ where: { staffId: { in: ids }, fromMonth } }),
      prisma.salaryRate.createMany({
        data: changes.map((c) => ({ staffId: c.staffId, amount: c.to, fromMonth, setById: auth.session!.userId })),
      }),
    ]);
    return res.json(result);
  } catch (err) {
    console.error('POST /api/admin/payroll/rates:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// DELETE /api/admin/payroll/rates/:id — cancel a salary change that hasn't
// started yet (its month is after this one). A change already in force can't
// be deleted — set a new amount from this month instead, so past months never
// move. Manager tier.
export async function deleteSalaryRate(req: Request<{ id: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'payroll', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });

  try {
    // One guarded delete: only a future change matches.
    const gone = await prisma.salaryRate.deleteMany({ where: { id, fromMonth: { gt: currentMonth() } } });
    if (gone.count === 0) {
      const exists = await prisma.salaryRate.findUnique({ where: { id }, select: { id: true } });
      return exists
        ? res.status(409).json({ error: 'This salary is already in force — set a new amount instead' })
        : res.status(404).json({ error: 'Salary change not found' });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error(`DELETE /api/admin/payroll/rates/${id}:`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/admin/payroll/staff/:id — one person's salary history: every rate
// (amount, from which month, who set it) and their last 12 salary payments.
// Manager tier.
export async function getStaffPayroll(req: Request<{ id: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'payroll', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });

  try {
    const [person, rates, payments] = await Promise.all([
      prisma.adminUser.findFirst({ where: { id, role: { in: PAYROLL_ROLES } }, select: { id: true, name: true, email: true, role: true } }),
      prisma.salaryRate.findMany({
        where: { staffId: id }, orderBy: { fromMonth: 'desc' }, take: 60,
        select: { id: true, amount: true, fromMonth: true, createdAt: true, setBy: { select: { name: true, email: true } } },
      }),
      prisma.salaryPayment.findMany({
        where: { staffId: id }, orderBy: { month: 'desc' }, take: 12,
        include: { paidBy: { select: { name: true, email: true } } },
      }),
    ]);
    if (!person) return res.status(404).json({ error: 'Staff member not found' });
    const now = currentMonth();
    return res.json({
      person: { id: person.id, name: person.name?.trim() || person.email, role: person.role },
      salary: salaryFor(rates, now),
      rates: rates.map((r) => ({
        id: r.id, amount: Number(r.amount), fromMonth: r.fromMonth,
        label: r.fromMonth <= '2000-01' ? 'From the start' : monthLabel(r.fromMonth),
        setBy: r.setBy ? r.setBy.name?.trim() || r.setBy.email : null, setAt: r.createdAt,
        // Not started yet — can still be cancelled (DELETE /payroll/rates/:id).
        upcoming: r.fromMonth > now,
      })),
      payments: payments.map((p) => ({ ...serializeSalary(p), label: monthLabel(p.month) })),
    });
  } catch (err) {
    console.error(`GET /api/admin/payroll/staff/${id}:`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// DELETE /api/admin/payroll/:id — undo a salary payment (wrong amount, wrong
// person). Deletes its Expense; the SalaryPayment goes with it (cascade), so
// the month shows as unpaid again. Manager tier.
export async function undoSalaryPayment(req: Request<{ id: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'payroll', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });

  try {
    const payment = await prisma.salaryPayment.findUnique({ where: { id }, select: { expenseId: true, expense: { select: { incurredAt: true } } } });
    if (!payment) return res.status(404).json({ error: 'Salary payment not found' });
    const gone = await prisma.$transaction(async (tx) => {
      await assertOpenAt(tx, payment.expense.incurredAt);
      return tx.expense.deleteMany({ where: { id: payment.expenseId } });
    });
    if (gone.count === 0) return res.status(404).json({ error: 'Salary payment not found' });
    return res.json({ ok: true });
  } catch (err) {
    if (sendHttpError(res, err)) return;
    console.error(`DELETE /api/admin/payroll/[id] (${id}):`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
