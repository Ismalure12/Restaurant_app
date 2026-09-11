import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole, CATALOG_ROLES } from '@/lib/auth';
import { itemOptionSchema } from '@/lib/validations';

export async function POST(request) {
  try {
    const auth = await requireRole(prisma, CATALOG_ROLES);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = await request.json();
    const parsed = itemOptionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }
    const opt = await prisma.itemOption.create({ data: parsed.data });
    return NextResponse.json(opt, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
