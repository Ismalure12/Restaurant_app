import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

export async function GET(request) {
  const auth = await requireAdmin(prisma);
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
      include: {
        customer: { select: { name: true, phone: true } },
        staff: { select: { name: true, email: true } },
        waiter: { select: { name: true, email: true } },
      },
    });

    return NextResponse.json(orders.map((o) => ({
      id: o.id,
      reference: o.reference,
      status: o.status,
      total: o.total.toString(),
      address: o.address,
      orderType: o.orderType,
      tableNumber: o.tableNumber,
      source: o.source,
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      discount: o.discount?.toString() ?? '0',
      deliveryFee: o.deliveryFee?.toString() ?? '0',
      contactName: o.contactName,
      contactPhone: o.contactPhone,
      staff: o.staff ? (o.staff.name || o.staff.email) : null,
      waiter: o.waiter ? (o.waiter.name || o.waiter.email) : null,
      items: o.items,
      paymentTransactionId: o.paymentTransactionId,
      createdAt: o.createdAt,
      customer: o.customer,
    })));
  } catch (err) {
    console.error('GET /api/admin/orders:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
