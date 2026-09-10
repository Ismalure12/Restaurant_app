import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { inventoryItemSchema } from '@/lib/validations';
import { getAvgCost, effectiveCost } from '@/lib/inventoryCosting';

const EDIT_ROLES = ['admin', 'manager'];

function serialize(item, avgCost = null) {
  return {
    id: item.id,
    name: item.name,
    unit: item.unit,
    quantity: item.quantity.toString(),
    reorderLevel: item.reorderLevel?.toString() ?? null,
    costPerUnit: item.costPerUnit?.toString() ?? null,
    avgCost: avgCost != null ? avgCost.toFixed(2) : null,
    effectiveCost: (() => {
      const c = effectiveCost(avgCost, item.costPerUnit);
      return c != null ? c.toFixed(2) : null;
    })(),
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

    const updated = await prisma.inventoryItem.updateMany({ where: { id }, data: parsed.data });
    if (updated.count === 0) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

    const item = await prisma.inventoryItem.findUnique({ where: { id } });
    const avgCost = await getAvgCost(prisma, id);
    return NextResponse.json(serialize(item, avgCost));
  } catch (err) {
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
    const deleted = await prisma.inventoryItem.deleteMany({ where: { id } });
    if (deleted.count === 0) return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/admin/inventory/[id]:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
