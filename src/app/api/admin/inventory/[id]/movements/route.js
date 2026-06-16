import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { stockMovementSchema } from '@/lib/validations';

const EDIT_ROLES = ['admin', 'manager'];

export async function POST(request, { params }) {
  const auth = await requireRole(prisma, EDIT_ROLES);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: rawId } = await params;
  const inventoryItemId = parseInt(rawId, 10);
  if (!Number.isFinite(inventoryItemId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const body = await request.json();
    const parsed = stockMovementSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' }, { status: 400 });
    }

    const { type, quantity, unitCost, note } = parsed.data;
    const staffId = auth.session.userId;

    // Sign is enforced by type so the ledger can't be corrupted by a bad sign:
    // purchase adds, usage/waste remove, adjustment is taken as-is (signed).
    let delta;
    if (type === 'purchase') delta = Math.abs(quantity);
    else if (type === 'usage' || type === 'waste') delta = -Math.abs(quantity);
    else delta = quantity; // adjustment

    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findUnique({ where: { id: inventoryItemId } });
      if (!item) throw Object.assign(new Error('Item not found'), { httpStatus: 404 });

      const movement = await tx.stockMovement.create({
        data: { inventoryItemId, type, quantity: delta, unitCost: unitCost ?? null, note: note ?? null, staffId },
      });

      const updated = await tx.inventoryItem.update({
        where: { id: inventoryItemId },
        data: { quantity: { increment: delta } },
      });

      // A purchase with a unit cost also books a matching expense.
      if (type === 'purchase' && unitCost != null && unitCost > 0) {
        await tx.expense.create({
          data: {
            category: 'purchases',
            amount: Math.abs(delta) * unitCost,
            note: note ?? `Stock purchase: ${item.name}`,
            staffId,
          },
        });
      }

      return { movement, quantity: updated.quantity.toString() };
    });

    return NextResponse.json(
      { id: result.movement.id, quantity: result.quantity },
      { status: 201 },
    );
  } catch (err) {
    if (err.httpStatus === 404) return NextResponse.json({ error: err.message }, { status: 404 });
    console.error('POST /api/admin/inventory/[id]/movements:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
