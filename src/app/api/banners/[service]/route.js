import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { bannerSchema } from '@/lib/validations';

export async function PUT(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { service } = await params;
    const body = await request.json();
    const parsed = bannerSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }
    const banner = await prisma.banner.update({
      where: { service },
      data: parsed.data,
    });
    return NextResponse.json(banner);
  } catch (error) {
    if (error.code === 'P2025') return NextResponse.json({ error: 'Banner not found' }, { status: 404 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
