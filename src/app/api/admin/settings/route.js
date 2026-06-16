import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requirePos, requireRole } from '@/lib/auth';

const EDIT_ROLES = ['admin', 'manager'];

async function readSettings() {
  const rows = await prisma.setting.findMany();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    deliveryFee: map.delivery_fee != null ? Number(map.delivery_fee) : 0,
  };
}

// Readable by anyone who can operate the Register — the POS prefills the delivery fee.
export async function GET() {
  const auth = await requirePos(prisma);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    return NextResponse.json(await readSettings());
  } catch (err) {
    console.error('GET /api/admin/settings:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const settingsSchema = z.object({
  deliveryFee: z.number().min(0, 'Delivery fee cannot be negative'),
});

export async function PUT(request) {
  const auth = await requireRole(prisma, EDIT_ROLES);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const body = await request.json();
    const parsed = settingsSchema.partial().safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' }, { status: 400 });

    if (parsed.data.deliveryFee != null) {
      const value = parsed.data.deliveryFee.toFixed(2);
      await prisma.setting.upsert({
        where: { key: 'delivery_fee' },
        create: { key: 'delivery_fee', value },
        update: { value },
      });
    }
    return NextResponse.json(await readSettings());
  } catch (err) {
    console.error('PUT /api/admin/settings:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
