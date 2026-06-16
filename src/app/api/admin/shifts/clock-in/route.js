import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireStaff } from '@/lib/auth';
import { shiftSchema } from '@/lib/validations';

export async function POST(request) {
  const auth = await requireStaff(prisma);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const staffId = auth.session.userId;

  try {
    const open = await prisma.shift.findFirst({ where: { staffId, clockOut: null } });
    if (open) return NextResponse.json({ error: 'You already have an open shift' }, { status: 409 });

    const body = await request.json().catch(() => ({}));
    const parsed = shiftSchema.partial().safeParse(body);
    const openingFloat = parsed.success ? parsed.data.openingFloat ?? null : null;

    const shift = await prisma.shift.create({ data: { staffId, openingFloat } });
    return NextResponse.json({ id: shift.id, clockIn: shift.clockIn }, { status: 201 });
  } catch (err) {
    console.error('POST /api/admin/shifts/clock-in:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
