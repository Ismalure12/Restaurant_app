// Short, human order IDs: KFG-260919-0101
//   prefix (Settings → order_prefix, default KFG)
//   local date the order was opened (YYMMDD, BUSINESS_TZ)
//   Order.id — a running count that never resets (owner's decision)
//
// Derived on read, never stored: the id is already unique and sequential, so
// a stored copy could only drift. The random Order.reference stays as the
// Sifalo order_id and the public /?ref= confirmation token — a sequential
// code there would let anyone walk other customers' orders.
import type { Db } from '../db/prisma.js';
import { dayKey } from '../time/businessTime.js';

export const ORDER_PREFIX_KEY = 'order_prefix';
export const DEFAULT_ORDER_PREFIX = 'KFG';
export const ORDER_PREFIX_RE = /^[A-Z0-9]{1,8}$/;

export function formatOrderCode(order: { id: number; createdAt: Date | string }, prefix = DEFAULT_ORDER_PREFIX): string {
  const n = String(order.id).padStart(4, '0');
  const at = new Date(order.createdAt);
  if (Number.isNaN(at.getTime())) return `${prefix}-${n}`;
  return `${prefix}-${dayKey(at).slice(2).replace(/-/g, '')}-${n}`;
}

/**
 * The order id a search term points at, if it looks like an order code:
 * "KFG-260919-0101", "260919-0101", "#101", "0101" or "101" → 101.
 */
export function parseOrderCode(raw: string): number | null {
  const m = /^(?:[a-z0-9]{1,8}-)?(?:\d{6}-)?#?(\d{1,9})$/i.exec(raw.trim());
  if (!m) return null;
  const id = Number(m[1]);
  return id > 0 && id <= 2147483647 ? id : null;
}

export async function getOrderPrefix(db: Db): Promise<string> {
  const row = await db.setting.findUnique({ where: { key: ORDER_PREFIX_KEY } });
  const v = row?.value?.trim().toUpperCase();
  return v && ORDER_PREFIX_RE.test(v) ? v : DEFAULT_ORDER_PREFIX;
}
