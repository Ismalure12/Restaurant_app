import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireStaff } from '@/lib/auth';
import { ORDER_INCLUDE, serializeOrder } from '@/lib/orderSerialize';

// Any back-office staff member (admin/manager/cashier) works the Orders page.
// Editing and voiding are manager-tier and gated in their own routes.
export async function GET(request) {
  const auth = await requireStaff(prisma);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const since = parseInt(searchParams.get('since') ?? '0', 10);
  const source = searchParams.get('source'); // online | pos | (all)

  const where = {};
  if (since > 0) where.id = { gt: since };
  if (source === 'online' || source === 'pos') where.source = source;

  try {
    const orders = await prisma.order.findMany({
      where: Object.keys(where).length ? where : undefined,
      orderBy: { createdAt: 'desc' },
      include: ORDER_INCLUDE,
    });
    return NextResponse.json(orders.map(serializeOrder));
  } catch (err) {
    console.error('GET /api/admin/orders:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
