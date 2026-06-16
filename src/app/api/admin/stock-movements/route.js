import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';

const VIEW_ROLES = ['admin', 'manager', 'cashier'];

export async function GET(request) {
  const auth = await requireRole(prisma, VIEW_ROLES);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const itemId = parseInt(searchParams.get('itemId') ?? '', 10);
  if (!Number.isFinite(itemId)) return NextResponse.json({ error: 'itemId is required' }, { status: 400 });

  try {
    const movements = await prisma.stockMovement.findMany({
      where: { inventoryItemId: itemId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { staff: { select: { email: true, name: true } } },
    });

    return NextResponse.json(movements.map((m) => ({
      id: m.id,
      type: m.type,
      quantity: m.quantity.toString(),
      unitCost: m.unitCost?.toString() ?? null,
      note: m.note,
      staff: m.staff ? (m.staff.name || m.staff.email) : null,
      createdAt: m.createdAt,
    })));
  } catch (err) {
    console.error('GET /api/admin/stock-movements:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
