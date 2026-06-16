import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('kfg_auth')?.value;
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    if (!payload?.customerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const customer = await prisma.customer.findUnique({
      where: { id: payload.customerId },
      include: {
        orders: { orderBy: { createdAt: 'desc' }, take: 1, select: { address: true } },
      },
    });
    if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({
      name: customer.name,
      phone: customer.phone,
      address: customer.orders[0]?.address ?? customer.address,
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
