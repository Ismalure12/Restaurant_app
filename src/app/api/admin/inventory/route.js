import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { inventoryItemSchema } from '@/lib/validations';

const VIEW_ROLES = ['admin', 'manager', 'cashier'];
const EDIT_ROLES = ['admin', 'manager'];

function serialize(item) {
  return {
    id: item.id,
    name: item.name,
    unit: item.unit,
    quantity: item.quantity.toString(),
    reorderLevel: item.reorderLevel?.toString() ?? null,
    costPerUnit: item.costPerUnit?.toString() ?? null,
    supplier: item.supplier,
    isActive: item.isActive,
    lowStock: item.reorderLevel != null && Number(item.quantity) <= Number(item.reorderLevel),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export async function GET() {
  const auth = await requireRole(prisma, VIEW_ROLES);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const items = await prisma.inventoryItem.findMany({ orderBy: { name: 'asc' } });
    return NextResponse.json(items.map(serialize));
  } catch (err) {
    console.error('GET /api/admin/inventory:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await requireRole(prisma, EDIT_ROLES);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const parsed = inventoryItemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' }, { status: 400 });
    }

    const item = await prisma.inventoryItem.create({ data: parsed.data });
    return NextResponse.json(serialize(item), { status: 201 });
  } catch (err) {
    console.error('POST /api/admin/inventory:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
