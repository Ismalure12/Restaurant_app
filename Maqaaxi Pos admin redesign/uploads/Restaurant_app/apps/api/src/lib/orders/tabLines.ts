// Order lines are stored already priced (priceCart ran when each round was
// added), so an unpaid order's running total is simply the sum of its lines.
import { toCents } from './cartPricing.js';

export type StoredLine = { unitPrice?: number; quantity?: number; [key: string]: unknown };

export const linesTotalCents = (lines: StoredLine[]) =>
  lines.reduce((sum, l) => sum + toCents(l.unitPrice ?? 0) * (l.quantity ?? 0), 0);
