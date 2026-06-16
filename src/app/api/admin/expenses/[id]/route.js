import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { expenseSchema } from '@/lib/validations';

const FINANCE_ROLES = ['admin', 'manager'];

export async function PATCH(request, { params }) {
  const auth = await requireRole(prisma, FINANCE_ROLES);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const body = await request.json();
    const parsed = expenseSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' }, { status: 400 });
    }

    const { incurredAt, ...rest } = parsed.data;
    const data = { ...rest };
    if (incurredAt) data.incurredAt = new Date(incurredAt);

    const expense = await prisma.expense.update({ where: { id }, data });
    return NextResponse.json({ id: expense.id, amount: expense.amount.toString() });
  } catch (err) {
    if (err.code === 'P2025') return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
    console.error('PATCH /api/admin/expenses/[id]:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const auth = await requireRole(prisma, FINANCE_ROLES);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    await prisma.expense.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err.code === 'P2025') return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
    console.error('DELETE /api/admin/expenses/[id]:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
