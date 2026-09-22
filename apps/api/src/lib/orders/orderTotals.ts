// Order-level money arithmetic, shared by the POS create route and the
// manager edit route so a sale and its correction can never be priced by two
// slightly different formulas.
//
// Line-level pricing lives in cartPricing.ts (priceCart) — feed this its
// `totalCents`. Invariant: every number here is derived server-side from the
// database; client-sent totals are display-only and never reach this function.

export interface OrderTotalsInput {
  totalCents: number;
  discountType?: 'percent' | 'fixed' | null;
  discountValue?: number | null;
  orderType: string;
  deliveryFee?: number | null;
}

export type OrderTotals =
  | { subtotal: number; discount: number; delivery: number; total: number; error?: undefined }
  | { error: string; subtotal?: undefined; discount?: undefined; delivery?: undefined; total?: undefined };

export function computeOrderTotals({ totalCents, discountType, discountValue, orderType, deliveryFee }: OrderTotalsInput): OrderTotals {
  const subtotal = totalCents / 100;

  // Resolve discount from type/value, clamped to [0, subtotal]. Only the
  // resolved flat amount is ever persisted (Order.discount) — the type is an
  // input, which is why an edit must re-state it.
  let discount = 0;
  const value = discountValue as number;
  if (discountType && value > 0) {
    discount = discountType === 'percent' ? (subtotal * value) / 100 : value;
  }
  discount = Math.min(Math.max(discount, 0), subtotal);
  discount = Math.round(discount * 100) / 100;

  // Delivery fee only applies to delivery orders.
  const delivery = orderType === 'delivery' ? Math.max(deliveryFee || 0, 0) : 0;

  const total = Math.round((subtotal - discount + delivery) * 100) / 100;
  if (!(total > 0)) return { error: 'Order total must be greater than zero' };

  return { subtotal, discount, delivery, total };
}
