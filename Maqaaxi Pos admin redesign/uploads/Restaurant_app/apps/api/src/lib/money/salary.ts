// Salary history rules (pure — no database).
//
// A staff member's salary is a list of rates, each valid from a month onward.
// The salary for month M is the rate with the greatest fromMonth <= M, so a
// raise from October changes October and later; September keeps its amount.
// Payments already recorded are separate rows and never change.
import { dayKey } from '../time/businessTime.js';

export type Rate = { staffId: number; amount: number; fromMonth: string };
export type RateMode = 'set' | 'add' | 'percent';

export const currentMonth = (now = new Date()) => dayKey(now).slice(0, 7);

/** The rate in force for `month` (rates for one person, any order). */
export function rateFor<T extends { fromMonth: string }>(rates: T[], month: string): T | null {
  let best: T | null = null;
  for (const r of rates) if (r.fromMonth <= month && (!best || r.fromMonth > best.fromMonth)) best = r;
  return best;
}

/** Salary for a month; 0 when none is set (or it was set to 0). */
export const salaryFor = (rates: { fromMonth: string; amount: unknown }[], month: string) => {
  const r = rateFor(rates, month);
  return r ? Number(r.amount) : 0;
};

const cents = (n: number) => Math.round(n * 100) / 100;

/** New monthly amount after a change — rounded to cents, never below zero. */
export function applyChange(base: number, mode: RateMode, value: number) {
  const next = mode === 'set' ? value : mode === 'add' ? base + value : base * (1 + value / 100);
  return Math.max(0, cents(next));
}

/** Rates grouped by staff id. */
export function groupRates<T extends { staffId: number }>(rates: T[]) {
  const m = new Map<number, T[]>();
  for (const r of rates) {
    const list = m.get(r.staffId);
    if (list) list.push(r); else m.set(r.staffId, [r]);
  }
  return m;
}

/** The month before 'YYYY-MM'. */
export function prevMonth(month: string) {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}
