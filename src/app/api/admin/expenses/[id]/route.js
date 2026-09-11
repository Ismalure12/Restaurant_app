import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole, MANAGER_ROLES } from '@/lib/auth';
import { expenseSchema } from '@/lib/validations';
import { EXPENSE_INCLUDE, serializeExpense, parseExpenseDate } from '@/lib/expenses';

const parseId = (raw) => { const id = parseInt(raw, 10); return Number.isFinite(id) ? id : null; };

// Managers correct a logged expense; returns the full row so the Expenses
// page can swap it into its list without refetching.
export async function PATCH(request, { params }) {
  const auth = await requireRole(prisma, MANAGER_ROLES);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const id = parseId((await params).id);
  if (id == null) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const body = await request.json().catch(() => null);
    const parsed = expenseSchema.partial().safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' }, { status: 400 });
    }
    const { incurredAt, note, ...rest } = parsed.data;
    const data = { ...rest };
    if (note !== undefined) data.note = note || null;
    if (incurredAt) data.incurredAt = parseExpenseDate(incurredAt);
    if (Object.keys(data).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

    const existing = await prisma.expense.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: 'Expense not found' }, { status: 404 });

    const expense = await prisma.expense.update({ where: { id }, data, include: EXPENSE_INCLUDE });
    return NextResponse.json(serializeExpense(expense));
  } catch (err) {
    console.error(`PATCH /api/admin/expenses/[id] (expense ${id}):`, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const auth = await requireRole(prisma, MANAGER_ROLES);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const id = parseId((await params).id);
  if (id == null) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const { count } = await prisma.expense.deleteMany({ where: { id } });
    if (count === 0) return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`DELETE /api/admin/expenses/[id] (expense ${id}):`, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
