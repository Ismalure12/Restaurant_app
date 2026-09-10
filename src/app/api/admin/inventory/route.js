import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { inventoryItemSchema } from '@/lib/validations';
import { getAvgCostMap, effectiveCost } from '@/lib/inventoryCosting';

const VIEW_ROLES = ['admin', 'manager', 'cashier'];
const EDIT_ROLES = ['admin', 'manager'];

function serialize(item, avgCost = null) {
  return {
    id: item.id,
    name: item.name,
    unit: item.unit,
    quantity: item.quantity.toString(),
    reorderLevel: item.reorderLevel?.toString() ?? null,
    // Manual fallback estimate — see effectiveCost for what's actually used.
    costPerUnit: item.costPerUnit?.toString() ?? null,
    // Weighted-average cost from purchase history, or null if none yet.
    avgCost: avgCost != null ? avgCost.toFixed(2) : null,
    // What valuation/reporting should actually use: avgCost when it exists,
    // else the manual costPerUnit estimate.
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

export async function GET() {
  const auth = await requireRole(prisma, VIEW_ROLES);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const items = await prisma.inventoryItem.findMany({ orderBy: { name: 'asc' } });
    const avgCostMap = await getAvgCostMap(prisma, items.map((i) => i.id));
    return NextResponse.json(items.map((item) => serialize(item, avgCostMap.get(item.id) ?? null)));
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
