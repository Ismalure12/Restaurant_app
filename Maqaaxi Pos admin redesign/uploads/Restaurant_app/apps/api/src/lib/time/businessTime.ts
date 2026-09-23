// Local-day arithmetic for the restaurant's timezone (BUSINESS_TZ).
//
// The database stores instants (UTC). A "day" — for receipt numbers and for
// every report — is a calendar day in the restaurant's zone, so a sale at
// 01:30 in Mogadishu belongs to that local date even though it is still the
// previous day in UTC.
import { env } from '../../config/env.js';

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

// ── The business day's end (Settings › Business) ────────────────────────
// A restaurant open past midnight can end its day at, say, 04:00: a sale at
// 01:30 on the 12th then belongs to the 11th. The hour lives in Setting
// `business_day_end_hour` (0–6, default 0 = local midnight). It is read once
// per process and refreshed by `refreshBusinessDayEnd` (see app.ts), so the
// pure date helpers below stay synchronous.
export const DAY_END_KEY = 'business_day_end_hour';
export const MAX_DAY_END_HOUR = 6;
let dayEndHour = 0;
let dayEndCheckedAt = 0;

export const getBusinessDayEnd = () => dayEndHour;
export function setBusinessDayEnd(hour: number) {
  dayEndHour = Number.isInteger(hour) && hour >= 0 && hour <= MAX_DAY_END_HOUR ? hour : 0;
  dayEndCheckedAt = Date.now();
}

/** Re-reads the setting at most every `ttlMs`; a failed read keeps the last known hour. */
export async function refreshBusinessDayEnd(
  db: { setting: { findUnique: (a: { where: { key: string } }) => PromiseLike<{ value: string } | null | undefined> } },
  ttlMs = 30_000,
) {
  if (Date.now() - dayEndCheckedAt < ttlMs) return;
  dayEndCheckedAt = Date.now(); // one refresh at a time; failure retries after the ttl
  try {
    const row = await db.setting.findUnique({ where: { key: DAY_END_KEY } });
    const n = Number(row?.value);
    dayEndHour = Number.isInteger(n) && n >= 0 && n <= MAX_DAY_END_HOUR ? n : 0;
  } catch (err) {
    console.error('Could not read the business day end setting:', err);
  }
}

function partsFormatter(tz: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
}

function localParts(date: Date, tz: string) {
  const out: Record<string, number> = {};
  for (const p of partsFormatter(tz).formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return out as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Offset of `tz` from UTC at `date`, in ms (Mogadishu → +3h). */
function offsetMs(date: Date, tz: string) {
  const p = localParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** The business day an instant belongs to, as YYYY-MM-DD (local date, shifted by the day's end hour). */
export function dayKey(date: Date, tz = env.BUSINESS_TZ, endHour = dayEndHour): string {
  const p = localParts(endHour ? new Date(date.getTime() - endHour * HOUR_MS) : date, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function isDayKey(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = DAY_RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** The UTC instant at which business day `key` starts (local midnight + the day's end hour). */
export function startOfDay(key: string, tz = env.BUSINESS_TZ, endHour = dayEndHour): Date {
  const m = DAY_RE.exec(key);
  if (!m) throw new Error(`Invalid day key "${key}"`);
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  // Correct by the zone offset; re-check once so a DST change on that day
  // still lands on local midnight.
  let t = guess - offsetMs(new Date(guess), tz);
  t = guess - offsetMs(new Date(t), tz);
  return new Date(t + endHour * HOUR_MS);
}

/** The day key `n` days after `key` (negative goes back). */
export function addDays(key: string, n: number): string {
  const m = DAY_RE.exec(key);
  if (!m) throw new Error(`Invalid day key "${key}"`);
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]) + n * DAY_MS);
  return d.toISOString().slice(0, 10);
}

/** Inclusive number of days from `a` to `b` (same day → 1). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS) + 1;
}

export interface DayRange {
  fromKey: string;
  toKey: string;
  /** Inclusive lower bound (local midnight of fromKey). */
  from: Date;
  /** EXCLUSIVE upper bound (local midnight of the day after toKey) — use `lt`. */
  to: Date;
  days: number;
}

export type RangeResult = { range: DayRange; error?: undefined } | { error: string; range?: undefined };

/**
 * Turns `?from=YYYY-MM-DD&to=YYYY-MM-DD` (local days, both inclusive) into
 * UTC bounds. Missing values default to the last `defaultDays` days ending
 * today; a range longer than `maxDays` is refused.
 */
export function rangeFromQuery(
  fromRaw: string | null | undefined,
  toRaw: string | null | undefined,
  { defaultDays = 1, maxDays = 366, now = new Date() }: { defaultDays?: number; maxDays?: number; now?: Date } = {},
): RangeResult {
  const today = dayKey(now);
  if (fromRaw && !isDayKey(fromRaw)) return { error: 'from must be a date like 2026-09-19' };
  if (toRaw && !isDayKey(toRaw)) return { error: 'to must be a date like 2026-09-19' };
  const toKey = toRaw || (fromRaw && fromRaw > today ? fromRaw : today);
  const fromKey = fromRaw || addDays(toKey, -(defaultDays - 1));
  if (fromKey > toKey) return { error: 'The start date is after the end date' };
  const days = daysBetween(fromKey, toKey);
  if (days > maxDays) return { error: `Pick a range of at most ${maxDays} days` };
  return { range: { fromKey, toKey, from: startOfDay(fromKey), to: startOfDay(addDays(toKey, 1)), days } };
}
