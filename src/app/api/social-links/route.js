import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { socialLinkSchema } from '@/lib/validations';

// Public — anyone can read social links
export async function GET() {
  try {
    const links = await prisma.socialLink.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json(links);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Admin-only — create a social link
export async function POST(request) {
  try {
    const auth = await requireAdmin(prisma);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const parsed = socialLinkSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' }, { status: 400 });
    }

    const { platform, value } = parsed.data;

    const existing = await prisma.socialLink.findUnique({ where: { platform } });
    if (existing) {
      return NextResponse.json({ error: `${platform} already exists. Use PUT to update.` }, { status: 409 });
    }

    const link = await prisma.socialLink.create({
      data: { platform, value },
    });

    return NextResponse.json(link, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
