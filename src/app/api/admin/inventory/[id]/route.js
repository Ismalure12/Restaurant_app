import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { inventoryItemSchema } from '@/lib/validations';

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

export async function PATCH(request, { params }) {
  const auth = await requireRole(prisma, EDIT_ROLES);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const body = await request.json();
    const parsed = inventoryItemSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' }, { status: 400 });
    }

    const item = await prisma.inventoryItem.update({ where: { id }, data: parsed.data });
    return NextResponse.json(serialize(item));
  } catch (err) {
    if (err.code === 'P2025') return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    console.error('PATCH /api/admin/inventory/[id]:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const auth = await requireRole(prisma, EDIT_ROLES);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    await prisma.inventoryItem.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err.code === 'P2025') return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    console.error('DELETE /api/admin/inventory/[id]:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
