import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireStaff } from '@/lib/auth';
import { shiftSchema } from '@/lib/validations';

export async function POST(request) {
  const auth = await requireStaff(prisma);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const staffId = auth.session.userId;

  try {
    const open = await prisma.shift.findFirst({ where: { staffId, clockOut: null }, orderBy: { clockIn: 'desc' } });
    if (!open) return NextResponse.json({ error: 'No open shift to close' }, { status: 409 });

    const body = await request.json().catch(() => ({}));
    const parsed = shiftSchema.partial().safeParse(body);
    const closingCash = parsed.success ? parsed.data.closingCash ?? null : null;
    const note = parsed.success ? parsed.data.note ?? null : null;

    const shift = await prisma.shift.update({
      where: { id: open.id },
      data: { clockOut: new Date(), closingCash, note },
    });
    return NextResponse.json({ id: shift.id, clockOut: shift.clockOut });
  } catch (err) {
    console.error('POST /api/admin/shifts/clock-out:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
