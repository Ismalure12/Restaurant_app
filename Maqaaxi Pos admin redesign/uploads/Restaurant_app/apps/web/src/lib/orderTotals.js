// Order-level money arithmetic, shared by the POS create route and the
// manager edit route so a sale and its correction can never be priced by two
// slightly different formulas.
//
// Line-level pricing lives in cartPricing.js (priceCart) — feed this its
// `totalCents`. Invariant: every number here is derived server-side from the
// database; client-sent totals are display-only and never reach this function.

/**
 * @param {object}  input
 * @param {number}  input.totalCents                  priceCart().totalCents (line subtotal, cents)
 * @param {'percent'|'fixed'|null} [input.discountType]
 * @param {number|null} [input.discountValue]
 * @param {'dine_in'|'delivery'} input.orderType
 * @param {number|null} [input.deliveryFee]
 * @returns {{subtotal:number, discount:number, delivery:number, total:number} | {error:string}}
 */
export function computeOrderTotals({ totalCents, discountType, discountValue, orderType, deliveryFee }) {
  const subtotal = totalCents / 100;

  // Resolve discount from type/value, clamped to [0, subtotal]. Only the
  // resolved flat amount is ever persisted (Order.discount) — the type is an
  // input, which is why an edit must re-state it.
  let discount = 0;
  if (discountType && discountValue > 0) {
    discount = discountType === 'percent' ? (subtotal * discountValue) / 100 : discountValue;
  }
  discount = Math.min(Math.max(discount, 0), subtotal);
  discount = Math.round(discount * 100) / 100;

  // Delivery fee only applies to delivery orders.
  const delivery = orderType === 'delivery' ? Math.max(deliveryFee || 0, 0) : 0;

  const total = Math.round((subtotal - discount + delivery) * 100) / 100;
  if (!(total > 0)) return { error: 'Order total must be greater than zero' };

  return { subtotal, discount, delivery, total };
}
