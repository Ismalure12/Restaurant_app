import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole, MANAGER_ROLES } from '@/lib/auth';
import { tagSchema } from '@/lib/validations';

export async function GET() {
  try {
    const tags = await prisma.tag.findMany({ orderBy: { label: 'asc' } });
    return NextResponse.json(tags);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const auth = await requireRole(prisma, MANAGER_ROLES);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = await request.json();
    const parsed = tagSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }
    const tag = await prisma.tag.create({ data: parsed.data });
    return NextResponse.json(tag, { status: 201 });
  } catch (error) {
    if (error.code === 'P2002') return NextResponse.json({ error: 'Tag slug already exists' }, { status: 409 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
