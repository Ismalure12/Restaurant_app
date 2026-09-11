import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole, MANAGER_ROLES } from '@/lib/auth';
import { expenseSchema } from '@/lib/validations';
import { EXPENSE_INCLUDE, serializeExpense, parseExpenseDate } from '@/lib/expenses';

const DAY = 86400000;

/**
 * Expense ledger for managers. Filters: q (category/note), category, from, to.
 * Cursor-paginated. The first page also carries the figures the Expenses page
 * header needs — computed with aggregate/groupBy, never by loading every row.
 */
export async function GET(request) {
  const auth = await requireRole(prisma, MANAGER_ROLES);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  const category = (searchParams.get('category') || '').trim();
  // A date-only "from" means the start of that day. (parseExpenseDate anchors
  // form dates at noon, which would drop that morning's expenses from the range.)
  const fromRaw = searchParams.get('from');
  const from = fromRaw ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(fromRaw) ? `${fromRaw}T00:00:00` : fromRaw) : null;
  const to = searchParams.get('to');
  const take = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 1), 500);
  const cursor = parseInt(searchParams.get('cursor') ?? '', 10);

  const and = [];
  if (q) and.push({ OR: [{ category: { contains: q, mode: 'insensitive' } }, { note: { contains: q, mode: 'insensitive' } }] });
  if (category) and.push({ category });
  if (from && !Number.isNaN(from.getTime())) and.push({ incurredAt: { gte: from } });
  if (to) {
    // A date-only "to" includes that whole day.
    const end = /^\d{4}-\d{2}-\d{2}$/.test(to) ? new Date(`${to}T23:59:59.999`) : new Date(to);
    if (!Number.isNaN(end.getTime())) and.push({ incurredAt: { lte: end } });
  }
  const where = and.length ? { AND: and } : {};

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
    const result = { expenses: page.map(serializeExpense), nextCursor: hasMore ? page[page.length - 1].id : null };

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

    return NextResponse.json(result);
  } catch (err) {
    console.error('GET /api/admin/expenses:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await requireRole(prisma, MANAGER_ROLES);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json().catch(() => null);
    const parsed = expenseSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' }, { status: 400 });
    }

    const { category, amount, note, incurredAt } = parsed.data;
    const expense = await prisma.expense.create({
      data: {
        category,
        amount,
        note: note || null,
        staffId: auth.session.userId,
        ...(incurredAt ? { incurredAt: parseExpenseDate(incurredAt) } : {}),
      },
      include: EXPENSE_INCLUDE,
    });
    return NextResponse.json(serializeExpense(expense), { status: 201 });
  } catch (err) {
    console.error('POST /api/admin/expenses:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
