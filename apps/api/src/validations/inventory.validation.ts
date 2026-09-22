// Zod schemas — Inventory items and stock movements.
import { z } from 'zod';

export const inventoryItemSchema = z.object({
  name: z.string().min(1).max(160),
  unit: z.string().min(1).max(30),
  reorderLevel: z.number().min(0).nullable().optional(),
  costPerUnit: z.number().min(0).nullable().optional(),
  supplier: z.string().max(160).nullable().optional(),
  isActive: z.boolean().optional().default(true),
});

const MOVEMENT_TYPES = ['purchase', 'usage', 'adjustment', 'waste'] as const;

export const stockMovementSchema = z.object({
  type: z.enum(MOVEMENT_TYPES, { error: `Type must be one of: ${MOVEMENT_TYPES.join(', ')}` }),
  // signed delta: positive adds stock, negative removes it
  quantity: z.number().refine((n) => n !== 0, 'Quantity cannot be zero'),
  // Total price paid for the whole purchased quantity (purchase-type only) —
  // NOT a per-unit price, since unit price fluctuates day to day.
  totalCost: z.number().min(0).nullable().optional(),
  note: z.string().max(300).nullable().optional(),
  // Purchase with a cost: the business account the money came out of.
  paidFromAccountId: z.number().int().positive().nullable().optional(),
  // Purchases: who it was bought from; onCredit = not paid yet (owed to the supplier).
  supplierId: z.number().int().positive().nullable().optional(),
  onCredit: z.boolean().optional(),
});
