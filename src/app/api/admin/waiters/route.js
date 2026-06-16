import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePos } from '@/lib/auth';

// Waiters are unified into login accounts (AdminUser, role 'waiter'). This list
// powers the POS "Waiter" picker — the cashier attributes the order to a waiter.
// Management (create/edit/remove) happens on the Staff page via /api/users.
const serialize = (w) => ({ id: w.id, name: w.name || w.email, phone: w.phone, isActive: w.isActive });

export async function GET(request) {
  const auth = await requirePos(prisma);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const where = { role: 'waiter', ...(searchParams.get('active') === '1' ? { isActive: true } : {}) };

  try {
    const waiters = await prisma.adminUser.findMany({
      where,
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
      select: { id: true, name: true, email: true, phone: true, isActive: true },
    });
    return NextResponse.json(waiters.map(serialize));
  } catch (err) {
    console.error('GET /api/admin/waiters:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
