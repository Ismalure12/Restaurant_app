// Shared building blocks for the Reports hub (sales, inventory, financial,
// employees): the date range, the filters, what counts as a "sale", the
// money-account keys, staff names and CSV output.
import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import type { Db } from '../db/prisma.js';
import { rangeFromQuery, type DayRange } from '../time/businessTime.js';
import { searchParams } from '../../utils/query.js';

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const num = (d: unknown) => (d == null ? 0 : Number(d));

// ── What counts as a sale ───────────────────────────────────────────────
// A sale is an order that CLOSED in the range (closedAt — paid at the till,
// billed On account, or paid online) and was not voided/declined since.
// Online orders awaiting the kitchen's accept ('pending') are paid, so count.
export function salesWhere(range: DayRange, extra: Prisma.OrderWhereInput = {}): Prisma.OrderWhereInput {
  return {
    closedAt: { gte: range.from, lt: range.to },
    status: { in: ['pending', 'confirmed'] },
    OR: [{ paymentStatus: 'paid' }, { paymentMethod: 'invoice' }],
    ...extra,
  };
}

// ── Money accounts ──────────────────────────────────────────────────────
// Where the money for a sale went, as one stable key:
//   cash · card · invoice (On account) · acct:<label> (a Settings account,
//   e.g. acct:EVC Plus) · evc (EVC before accounts were recorded) ·
//   online:<gateway> (Sifalo checkout: waafi, edahab, pbwallet, card…)
const ONLINE_LABEL: Record<string, string> = {
  waafi: 'EVC/ZAAD', edahab: 'eDahab', pbwallet: 'Premier Wallet', card: 'Card', sifalo: 'Sifalo Pay',
};
const TILL_LABEL: Record<string, string> = { cash: 'Cash', card: 'Card', invoice: 'On account', evc: 'EVC (account not recorded)' };

export function accountKey(o: { source?: string | null; paymentMethod?: string | null; paymentAccount?: string | null }) {
  const m = o.paymentMethod || 'unknown';
  if (o.source === 'online') return `online:${m}`;
  if (m === 'evc' && o.paymentAccount) return `acct:${o.paymentAccount}`;
  return m;
}

export function accountLabel(key: string) {
  if (key.startsWith('acct:')) return key.slice(5);
  if (key.startsWith('online:')) return `Online · ${ONLINE_LABEL[key.slice(7)] || key.slice(7)}`;
  return TILL_LABEL[key] || key;
}

/** Order filter for one account key (see accountKey). */
export function accountWhere(key: string): Prisma.OrderWhereInput | null {
  if (key.startsWith('online:')) return { source: 'online', paymentMethod: key.slice(7) };
  if (key.startsWith('acct:')) return { source: { not: 'online' }, paymentMethod: 'evc', paymentAccount: key.slice(5) };
  if (key === 'evc') return { source: { not: 'online' }, paymentMethod: 'evc', paymentAccount: null };
  if (key === 'cash' || key === 'card' || key === 'invoice') return { source: { not: 'online' }, paymentMethod: key };
  return null;
}

// ── Query parsing ───────────────────────────────────────────────────────
export interface SalesFilters {
  waiterId?: number;
  staffId?: number;
  /** Either role on the sale: took the money OR served the table. */
  personId?: number;
  account?: string;
  source?: 'pos' | 'online';
  orderType?: 'dine_in' | 'delivery';
  /** How the order came in: rung up in the restaurant (dine-in / delivery) or placed online. */
  channel?: Channel;
}

export const CHANNELS = ['dine_in', 'delivery', 'online'] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_LABEL: Record<Channel, string> = { dine_in: 'Dine-in', delivery: 'Delivery', online: 'Online' };
/** Online = placed through the online menu (eaten in or delivered); otherwise the service at the till. */
export const channelOf = (o: { source?: string | null; orderType?: string | null }): Channel =>
  (o.source === 'online' ? 'online' : o.orderType === 'delivery' ? 'delivery' : 'dine_in');
export const channelWhere = (c: Channel): Prisma.OrderWhereInput =>
  (c === 'online' ? { source: 'online' } : { source: { not: 'online' }, orderType: c });

const intParam = (v: string | null) => {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : NaN;
};

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseRange(req: Request, defaultDays = 1): Parsed<DayRange> {
  const q = searchParams(req);
  const r = rangeFromQuery(q.get('from'), q.get('to'), { defaultDays });
  return r.error ? { ok: false, error: r.error } : { ok: true, value: r.range! };
}

export function parseSalesFilters(req: Request): Parsed<SalesFilters> {
  const q = searchParams(req);
  const out: SalesFilters = {};
  for (const [key, field] of [['waiterId', 'waiterId'], ['staffId', 'staffId'], ['personId', 'personId']] as const) {
    const n = intParam(q.get(key));
    if (Number.isNaN(n)) return { ok: false, error: `${key} must be a staff id` };
    if (n) out[field] = n;
  }
  const account = q.get('account');
  if (account) {
    if (account.length > 60 || !accountWhere(account)) return { ok: false, error: 'Unknown account' };
    out.account = account;
  }
  const source = q.get('source');
  if (source) {
    if (source !== 'pos' && source !== 'online') return { ok: false, error: 'source must be pos or online' };
    out.source = source;
  }
  const channel = q.get('channel');
  if (channel) {
    if (!(CHANNELS as readonly string[]).includes(channel)) return { ok: false, error: 'channel must be dine_in, delivery or online' };
    out.channel = channel as Channel;
  }
  const orderType = q.get('orderType');
  if (orderType) {
    if (orderType !== 'dine_in' && orderType !== 'delivery') return { ok: false, error: 'orderType must be dine_in or delivery' };
    out.orderType = orderType;
  }
  return { ok: true, value: out };
}

/** Filters → an Order where-fragment (AND-combined so account's source can't clobber `source`). */
export function filtersWhere(f: SalesFilters): Prisma.OrderWhereInput {
  const and: Prisma.OrderWhereInput[] = [];
  if (f.waiterId) and.push({ waiterId: f.waiterId });
  if (f.staffId) and.push({ staffId: f.staffId });
  if (f.personId) and.push({ OR: [{ staffId: f.personId }, { waiterId: f.personId }] });
  if (f.account) and.push(accountWhere(f.account)!);
  if (f.source) and.push({ source: f.source });
  if (f.orderType) and.push({ orderType: f.orderType });
  if (f.channel) and.push(channelWhere(f.channel));
  return and.length ? { AND: and } : {};
}

// ── Names ───────────────────────────────────────────────────────────────
export async function staffNames(db: Db, ids: (number | null | undefined)[]) {
  const unique = [...new Set(ids.filter((x): x is number => x != null))];
  if (!unique.length) return new Map<number, string>();
  const rows = await db.adminUser.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, email: true } });
  return new Map(rows.map((r) => [r.id, r.name?.trim() || r.email]));
}

// ── CSV ─────────────────────────────────────────────────────────────────
// Opens straight in Excel: UTF-8 BOM, CRLF, every cell quoted. A cell that
// starts with = + - @ (or a tab/CR) is prefixed with ' so a spreadsheet
// never runs it as a formula (CSV injection — names and notes are typed by
// staff and customers). Plain numbers are left alone so they stay numeric.
const NUMERIC = /^-?\d+(\.\d+)?$/;

export function csvCell(v: unknown): string {
  if (v == null) return '""';
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (!NUMERIC.test(s) && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Local date + time of an instant in the business timezone, for CSV cells. */
export function localStamp(d: Date | null | undefined, tz: string) {
  if (!d) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(d).replace(',', '');
}

export function localHour(d: Date, tz: string) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(d));
}
