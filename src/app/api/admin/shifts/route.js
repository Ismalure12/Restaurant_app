import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireStaff } from '@/lib/auth';

const MANAGE_ROLES = ['admin', 'manager'];

export async function GET(request) {
  const auth = await requireStaff(prisma);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const mine = searchParams.get('mine') === '1';
  const canSeeAll = MANAGE_ROLES.includes(auth.session.role);

  // Non-managers (and anyone passing ?mine=1) only see their own shifts.
  const where = (!canSeeAll || mine) ? { staffId: auth.session.userId } : {};
  const requestedStaff = parseInt(searchParams.get('staffId') ?? '', 10);
  if (canSeeAll && !mine && Number.isFinite(requestedStaff)) where.staffId = requestedStaff;

  try {
    const shifts = await prisma.shift.findMany({
      where,
      orderBy: { clockIn: 'desc' },
      take: 100,
      include: { staff: { select: { name: true, email: true } } },
    });

    return NextResponse.json(shifts.map((s) => ({
      id: s.id,
      staff: s.staff ? (s.staff.name || s.staff.email) : null,
      clockIn: s.clockIn,
      clockOut: s.clockOut,
      openingFloat: s.openingFloat?.toString() ?? null,
      closingCash: s.closingCash?.toString() ?? null,
      note: s.note,
      open: s.clockOut == null,
    })));
  } catch (err) {
    console.error('GET /api/admin/shifts:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
