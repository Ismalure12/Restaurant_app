import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { expenseSchema } from '@/lib/validations';

const FINANCE_ROLES = ['admin', 'manager'];

function serialize(e) {
  return {
    id: e.id,
    category: e.category,
    amount: e.amount.toString(),
    note: e.note,
    staff: e.staff ? (e.staff.name || e.staff.email) : null,
    incurredAt: e.incurredAt,
    createdAt: e.createdAt,
  };
}

export async function GET(request) {
  const auth = await requireRole(prisma, FINANCE_ROLES);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const where = {};
  if (from || to) {
    where.incurredAt = {};
    if (from) where.incurredAt.gte = new Date(from);
    if (to) where.incurredAt.lte = new Date(to);
  }

  try {
    const expenses = await prisma.expense.findMany({
      where,
      orderBy: { incurredAt: 'desc' },
      take: 200,
      include: { staff: { select: { name: true, email: true } } },
    });
    return NextResponse.json(expenses.map(serialize));
  } catch (err) {
    console.error('GET /api/admin/expenses:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await requireRole(prisma, FINANCE_ROLES);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const parsed = expenseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' }, { status: 400 });
    }

    const { category, amount, note, incurredAt } = parsed.data;
    const expense = await prisma.expense.create({
      data: {
        category,
        amount,
        note: note ?? null,
        staffId: auth.session.userId,
        ...(incurredAt ? { incurredAt: new Date(incurredAt) } : {}),
      },
      include: { staff: { select: { name: true, email: true } } },
    });
    return NextResponse.json(serialize(expense), { status: 201 });
  } catch (err) {
    console.error('POST /api/admin/expenses:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
