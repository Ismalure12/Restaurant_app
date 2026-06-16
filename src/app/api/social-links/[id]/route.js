import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { updateSocialLinkSchema } from '@/lib/validations';

// Admin-only — update a social link
export async function PUT(request, { params }) {
  try {
    const auth = await requireAdmin(prisma);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = updateSocialLinkSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    const link = await prisma.socialLink.update({
      where: { id: parseInt(id) },
      data: { value: parsed.data.value },
    });

    return NextResponse.json(link);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Admin-only — delete a social link
export async function DELETE(request, { params }) {
  try {
    const auth = await requireAdmin(prisma);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;

    await prisma.socialLink.delete({ where: { id: parseInt(id) } });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
