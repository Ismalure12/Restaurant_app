import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../../lib/db/prisma.js';
import { requirePage } from '../../lib/auth/auth.js';
import { expenseSchema } from '../../validations/expenses.validation.js';
import { EXPENSE_INCLUDE, serializeExpense, parseExpenseDate } from '../../lib/money/expenses.js';
import { readJson } from '../../utils/body.js';
import { checkPaidFrom, syncExpenseEntry } from '../../lib/money/cashBook.js';
import { assertOpenAt, sendHttpError } from '../../lib/closing/dayClose.js';
import { ensureCategory, CATEGORY_KINDS } from '../../lib/money/expenseCategories.js';
import { searchParams as getSearchParams } from '../../utils/query.js';
import { audit } from '../../lib/db/audit.js';

const DAY = 86400000;

/**
 * Expense ledger for managers. Filters: q (category/note), category, from, to.
 * Cursor-paginated. The first page also carries the figures the Expenses page
 * header needs — computed with aggregate/groupBy, never by loading every row.
 */
export async function listExpenses(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'expenses', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const searchParams = getSearchParams(req);
  const q = (searchParams.get('q') || '').trim();
  const category = (searchParams.get('category') || '').trim();
  // A date-only "from" means the start of that day. (parseExpenseDate anchors
  // form dates at noon, which would drop that morning's expenses from the range.)
  const fromRaw = searchParams.get('from');
  const from = fromRaw ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(fromRaw) ? `${fromRaw}T00:00:00` : fromRaw) : null;
  const to = searchParams.get('to');
  const take = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 1), 500);
  const cursor = parseInt(searchParams.get('cursor') ?? '', 10);

  const and: Prisma.ExpenseWhereInput[] = [];
  if (q) and.push({ OR: [{ category: { contains: q, mode: 'insensitive' } }, { note: { contains: q, mode: 'insensitive' } }] });
  if (category) and.push({ category });
  if (from && !Number.isNaN(from.getTime())) and.push({ incurredAt: { gte: from } });
  if (to) {
    // A date-only "to" includes that whole day.
    const end = /^\d{4}-\d{2}-\d{2}$/.test(to) ? new Date(`${to}T23:59:59.999`) : new Date(to);
    if (!Number.isNaN(end.getTime())) and.push({ incurredAt: { lte: end } });
  }
  const where: Prisma.ExpenseWhereInput = and.length ? { AND: and } : {};

  try {
    const rows = await prisma.expense.findMany({
      where,
      orderBy: [{ incurredAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(Number.isFinite(cursor) ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: EXPENSE_INCLUDE,
    });
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    const result: Record<string, unknown> = { expenses: page.map(serializeExpense), nextCursor: hasMore ? page[page.length - 1].id : null };

    if (!Number.isFinite(cursor)) {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const last30 = new Date(now.getTime() - 30 * DAY);
      const [inView, month, days30, count, topCategories, categories] = await Promise.all([
        prisma.expense.aggregate({ where, _sum: { amount: true }, _count: { _all: true } }),
        prisma.expense.aggregate({ where: { incurredAt: { gte: monthStart } }, _sum: { amount: true }, _count: { _all: true } }),
        prisma.expense.aggregate({ where: { incurredAt: { gte: last30 } }, _sum: { amount: true } }),
        prisma.expense.count(),
        prisma.expense.groupBy({ by: ['category'], where: { incurredAt: { gte: last30 } }, _sum: { amount: true }, orderBy: { _sum: { amount: 'desc' } }, take: 5 }),
        prisma.expense.groupBy({ by: ['category'], orderBy: { category: 'asc' }, take: 200 }),
      ]);
      result.filtered = { count: inView._count._all, total: Number(inView._sum.amount || 0).toFixed(2) };
      result.summary = {
        monthTotal: Number(month._sum.amount || 0).toFixed(2),
        monthCount: month._count._all,
        last30Total: Number(days30._sum.amount || 0).toFixed(2),
        totalCount: count,
        topCategories: topCategories.map((c) => ({ category: c.category, total: Number(c._sum.amount || 0).toFixed(2) })),
      };
      result.categories = categories.map((c) => c.category);
    }

    return res.json(result);
  } catch (err) {
    console.error('GET /api/admin/expenses:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createExpense(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'expenses', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  try {
    // Next: `await request.json().catch(() => null)`
    let body: unknown;
    try { body = readJson(req); } catch { body = null; }
    const parsed = expenseSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });
    }

    const { category, amount, note, incurredAt, paidFromAccountId } = parsed.data;
    const from = await checkPaidFrom(prisma, paidFromAccountId);
    if (!from.ok) return res.status(400).json({ error: from.error });
    // The expense and the money leaving its account, all or nothing.
    const expense = await prisma.$transaction(async (tx) => {
      await ensureCategory(tx, category);
      const created = await tx.expense.create({
        data: {
          category,
          amount,
          note: note || null,
          staffId: auth.session.userId,
          paidFromAccountId: from.value,
          ...(incurredAt ? { incurredAt: parseExpenseDate(incurredAt) } : {}),
        },
        include: EXPENSE_INCLUDE,
      });
      await assertOpenAt(tx, created.incurredAt);
      await syncExpenseEntry(tx, created, { createdById: auth.session.userId ?? null });
      return created;
    });
    return res.status(201).json(serializeExpense(expense));
  } catch (err) {
    if (sendHttpError(res, err)) return;
    console.error('POST /api/admin/expenses:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

const parseId = (raw: string) => { const id = parseInt(raw, 10); return Number.isFinite(id) ? id : null; };

// Managers correct a logged expense; returns the full row so the Expenses
// page can swap it into its list without refetching.
export async function updateExpense(req: Request<{ id: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'expenses', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const id = parseId(req.params.id);
  if (id == null) return res.status(400).json({ error: 'Invalid id' });

  try {
    // Next: `await request.json().catch(() => null)`
    let body: unknown;
    try { body = readJson(req); } catch { body = null; }
    const parsed = expenseSchema.partial().safeParse(body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });
    }
    const { incurredAt, note, paidFromAccountId, ...rest } = parsed.data;
    const data: Prisma.ExpenseUncheckedUpdateInput = { ...rest };
    if (note !== undefined) data.note = note || null;
    if (incurredAt) data.incurredAt = parseExpenseDate(incurredAt);
    if (paidFromAccountId !== undefined) {
      const from = await checkPaidFrom(prisma, paidFromAccountId);
      if (!from.ok) return res.status(400).json({ error: from.error });
      data.paidFromAccountId = from.value;
    }
    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Nothing to update' });

    const existing = await prisma.expense.findUnique({ where: { id }, select: { id: true, incurredAt: true } });
    if (!existing) return res.status(404).json({ error: 'Expense not found' });

    // The expense and its cash-book row change together (amount, date, account).
    const expense = await prisma.$transaction(async (tx) => {
      // A closed day is locked: the expense may not leave it or move into one.
      await assertOpenAt(tx, existing.incurredAt);
      if (typeof rest.category === 'string') await ensureCategory(tx, rest.category);
      const updated = await tx.expense.update({ where: { id }, data, include: EXPENSE_INCLUDE });
      await assertOpenAt(tx, updated.incurredAt);
      await syncExpenseEntry(tx, updated, { createdById: auth.session.userId ?? null, salary: Boolean(updated.salaryPayment) });
      return updated;
    });
    return res.json(serializeExpense(expense));
  } catch (err) {
    if (sendHttpError(res, err)) return;
    console.error(`PATCH /api/admin/expenses/[id] (expense ${id}):`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteExpense(req: Request<{ id: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'expenses', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const id = parseId(req.params.id);
  if (id == null) return res.status(400).json({ error: 'Invalid id' });

  try {
    const found = await prisma.expense.findUnique({ where: { id }, select: { incurredAt: true } });
    if (!found) return res.status(404).json({ error: 'Expense not found' });
    await prisma.$transaction(async (tx) => {
      await assertOpenAt(tx, found.incurredAt);
      await tx.expense.deleteMany({ where: { id } });
    });
    return res.json({ success: true });
  } catch (err) {
    if (sendHttpError(res, err)) return;
    console.error(`DELETE /api/admin/expenses/[id] (expense ${id}):`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/admin/expense-categories — every category with its kind
//     (operating | payroll | stock_purchase) and how many expenses use it.
// PUT /api/admin/expense-categories — change a category's kind: { name, kind }.
// Kinds decide where an expense lands in the month statements: operating costs
// and payroll are costs of the month; stock purchases are cost of goods, counted
// through Inventory purchases. Manager tier; audited.
const schema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(CATEGORY_KINDS, { error: 'Kind must be operating, payroll or stock_purchase' }),
});

export async function listExpenseCategories(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'expenses', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  try {
    const [rows, used] = await Promise.all([
      prisma.expenseCategory.findMany({ orderBy: { name: 'asc' }, take: 500 }),
      prisma.expense.groupBy({ by: ['category'], _count: { _all: true }, orderBy: { category: 'asc' }, take: 500 }),
    ]);
    const count = new Map(used.map((u) => [u.category, u._count._all]));
    return res.json(rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, expenses: count.get(r.name) ?? 0 })));
  } catch (err) {
    console.error('GET /api/admin/expense-categories:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function saveExpenseCategories(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'expenses', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  let body: unknown;
  try { body = readJson(req); } catch { body = null; }
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });
  const { name, kind } = parsed.data;
  try {
    const existing = await prisma.expenseCategory.findUnique({ where: { name } });
    if (!existing) return res.status(404).json({ error: 'Category not found' });
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.expenseCategory.update({ where: { name }, data: { kind } });
      await audit(tx, auth.session.userId, 'expense-category.kind', 'ExpenseCategory', row.id, { name, from: existing.kind, to: kind });
      return row;
    });
    return res.json({ id: updated.id, name: updated.name, kind: updated.kind });
  } catch (err) {
    console.error('PUT /api/admin/expense-categories:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
