// Year close (docs/system-blueprint.md §3.6). A financial year is 12 months
// starting in the month set in Settings (January by default) and is labelled by
// the calendar year it STARTS in ("FY2026"). It can be closed only when every
// month of it (from the opening month on) is closed. The annual statements are
// built from the frozen month snapshots, so they always agree with the months:
//   • P&L with one column per month and a total,
//   • cash flow per business account (opening on day 1 → closing on the last day),
//   • position at year end vs the start of the year,
//   • owner summary: profit, owner money in/out, result carried forward.
// Closing locks the year (its months can't be reopened until the year is).
import type { Prisma } from '@prisma/client';
import type { Db } from '../db/prisma.js';
import { dayKey } from '../time/businessTime.js';
import { readCalendar } from '../money/moneyReads.js';
import { audit } from '../db/audit.js';
import { httpError } from '../../utils/httpError.js';
import { monthRange, nextMonth, prevMonthOf } from './statements.js';
import { round2 } from '../reports/common.js';

export const FY_RE = /^FY(\d{4})$/;
export const fyLabel = (year: number) => `FY${year}`;

/** The 12 months of the financial year that starts in `startYear`. */
export function fyMonths(startYear: number, startMonth: number) {
  const out: string[] = [];
  let y = startYear;
  let m = startMonth;
  for (let i = 0; i < 12; i++) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    if (m === 12) { y += 1; m = 1; } else m += 1;
  }
  return out;
}

/** The financial year (its start year) a month belongs to. */
export const fyOfMonth = (month: string, startMonth: number) => {
  const [y, m] = month.split('-').map(Number);
  return m >= startMonth ? y : y - 1;
};

type MonthSnap = {
  month: string;
  pnl: {
    sales: { gross: number; discounts: number; refunds: number; net: number; count: number };
    openingStock: number; purchases: number; closingStock: number | null; cogs: number; grossProfit: number;
    operating: { total: number; byCategory: { category: string; amount: number }[] };
    payroll: number; overShort: number; netProfit: number;
  };
  cashFlow: { accounts: { accountId: number; label: string; kind: string; opening: number; moneyIn: number; moneyOut: number; closing: number; byKind: Record<string, number> }[] };
  position: { money: number; stock: number; customersOwe: number; suppliersOwed: number; salariesUnpaid: number; net: number; ownerIn: number; ownerOut: number };
};

const sum = (xs: number[]) => round2(xs.reduce((s, x) => s + x, 0));

/** The annual statements from the month snapshots (in month order). */
export function annualStatements(snaps: MonthSnap[]) {
  const first = snaps[0];
  const last = snaps[snaps.length - 1];
  const p = (f: (s: MonthSnap) => number) => sum(snaps.map(f));
  const net = p((s) => s.pnl.sales.net);
  const cogs = p((s) => s.pnl.cogs);

  const byCategory = new Map<string, number>();
  for (const s of snaps) for (const c of s.pnl.operating.byCategory) byCategory.set(c.category, round2((byCategory.get(c.category) ?? 0) + c.amount));

  const accounts = new Map<number, { accountId: number; label: string; kind: string; opening: number; moneyIn: number; moneyOut: number; closing: number; byKind: Record<string, number> }>();
  for (const s of snaps) {
    for (const a of s.cashFlow.accounts) {
      const cur = accounts.get(a.accountId) ?? { accountId: a.accountId, label: a.label, kind: a.kind, opening: a.opening, moneyIn: 0, moneyOut: 0, closing: a.closing, byKind: {} };
      cur.moneyIn = round2(cur.moneyIn + a.moneyIn);
      cur.moneyOut = round2(cur.moneyOut + a.moneyOut);
      cur.closing = a.closing; // the last month seen wins
      for (const [k, v] of Object.entries(a.byKind)) cur.byKind[k] = round2((cur.byKind[k] ?? 0) + v);
      accounts.set(a.accountId, cur);
    }
  }
  const acc = [...accounts.values()];

  const profit = p((s) => s.pnl.netProfit);
  const ownerIn = p((s) => s.position.ownerIn);
  const ownerOut = p((s) => s.position.ownerOut);
  return {
    months: snaps.map((s) => ({
      month: s.month, net: s.pnl.sales.net, cogs: s.pnl.cogs, grossProfit: s.pnl.grossProfit,
      operating: s.pnl.operating.total, payroll: s.pnl.payroll, overShort: s.pnl.overShort, netProfit: s.pnl.netProfit,
    })),
    pnl: {
      sales: { gross: p((s) => s.pnl.sales.gross), discounts: p((s) => s.pnl.sales.discounts), refunds: p((s) => s.pnl.sales.refunds), net, count: p((s) => s.pnl.sales.count) },
      openingStock: first.pnl.openingStock, purchases: p((s) => s.pnl.purchases), closingStock: last.pnl.closingStock, cogs,
      grossProfit: p((s) => s.pnl.grossProfit), foodCostPct: net > 0 ? round2((cogs / net) * 100) : null,
      operating: { total: p((s) => s.pnl.operating.total), byCategory: [...byCategory].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount) },
      payroll: p((s) => s.pnl.payroll), overShort: p((s) => s.pnl.overShort), netProfit: profit,
    },
    cashFlow: {
      accounts: acc,
      total: { opening: sum(acc.map((a) => a.opening)), moneyIn: sum(acc.map((a) => a.moneyIn)), moneyOut: sum(acc.map((a) => a.moneyOut)), closing: sum(acc.map((a) => a.closing)) },
    },
    position: { end: last.position, startNet: null as number | null },
    owner: { profit, ownerIn, ownerOut, carriedForward: round2(profit + ownerIn - ownerOut) },
  };
}

async function closedMonthSnaps(db: Db, months: string[]) {
  const rows = await db.periodClose.findMany({ where: { kind: 'month', period: { in: months } }, select: { period: true, isClosed: true, snapshot: true } });
  const byPeriod = new Map(rows.map((r) => [r.period, r]));
  return months.map((m) => {
    const r = byPeriod.get(m);
    return { month: m, snap: r?.isClosed ? ({ ...(r.snapshot as object), month: m } as unknown as MonthSnap) : null };
  });
}

/** The months of `fy` that count: from the opening month on. */
async function yearMonths(db: Db, fy: number) {
  const cal = await readCalendar(db);
  if (!cal.openingDate) return { cal, months: [] as string[], startMonth: cal.fiscalYearStartMonth };
  const openingMonth = cal.openingDate.slice(0, 7);
  return { cal, startMonth: cal.fiscalYearStartMonth, months: fyMonths(fy, cal.fiscalYearStartMonth).filter((m) => m >= openingMonth) };
}

export async function yearPreview(db: Db, fy: number, now = new Date()) {
  const period = fyLabel(fy);
  const row = await db.periodClose.findUnique({ where: { period } });
  if (row?.isClosed && row.kind === 'year') return { status: 'closed' as const, year: period, closedAt: row.closedAt, closedById: row.closedById, statement: row.snapshot };

  const { cal, months, startMonth } = await yearMonths(db, fy);
  if (!cal.openingDate) return { status: 'open' as const, year: period, blocked: 'needs-opening' as const };
  if (!months.length) return { status: 'open' as const, year: period, blocked: 'before-opening' as const };

  const snaps = await closedMonthSnaps(db, months);
  const closed = snaps.filter((s) => s.snap);
  const open = snaps.filter((s) => !s.snap).map((s) => s.month);
  const last = monthRange(fyMonths(fy, startMonth)[11]).last;
  const blockers: string[] = [];
  if (dayKey(now) <= last) blockers.push('The financial year has not ended yet');
  if (open.length) blockers.push(`${open.length} month(s) are not closed: ${open.join(', ')}`);

  const statement = closed.length ? annualStatements(closed.map((s) => s.snap!)) : null;
  if (statement) {
    const prevSnap = await db.periodClose.findUnique({ where: { period: prevMonthOf(months[0]) } });
    statement.position.startNet = prevSnap?.isClosed ? ((prevSnap.snapshot as unknown as MonthSnap).position?.net ?? null) : null;
  }
  return {
    status: 'open' as const, year: period, months, closedMonths: closed.map((s) => s.month), openMonths: open,
    statement: statement ? { year: period, from: months[0], to: months[months.length - 1], ...statement } : null,
    blockers, canClose: blockers.length === 0 && closed.length > 0,
    checks: { ended: dayKey(now) > last, openMonths: open, hasClosedMonths: closed.length > 0 },
    reopened: row ? { at: row.reopenedAt, reason: row.reopenReason } : null,
  };
}

export async function closeYear(db: Db, args: { fy: number; userId: number | null; now?: Date }) {
  const { fy, userId } = args;
  const preview = await yearPreview(db, fy, args.now);
  if (preview.status === 'closed') throw httpError(`${preview.year} is already closed`, 409);
  if ('blocked' in preview && preview.blocked) throw httpError('This financial year cannot be closed yet', 409);
  if (!('canClose' in preview) || !preview.canClose || !preview.statement) {
    throw Object.assign(httpError(`${preview.year} cannot be closed: ${(preview as { blockers?: string[] }).blockers?.join('; ') || 'nothing to close'}`, 409), { code: 'YEAR_HAS_OPEN_MONTHS' });
  }
  // `months` = the per-month columns; `monthList` = which months it covers (the lock on reopening a month).
  const snapshot = { ...preview.statement, monthList: preview.months } as unknown as Prisma.InputJsonValue;
  await db.$transaction(async (tx) => {
    const existing = await tx.periodClose.findUnique({ where: { period: preview.year } });
    if (existing?.isClosed) throw httpError(`${preview.year} is already closed`, 409);
    if (existing) await tx.periodClose.update({ where: { period: preview.year }, data: { isClosed: true, closedAt: new Date(), closedById: userId, snapshot } });
    else await tx.periodClose.create({ data: { period: preview.year, kind: 'year', closedById: userId, snapshot } });
    await audit(tx, userId, 'year.close', 'PeriodClose', preview.year, { netProfit: preview.statement!.pnl.netProfit });
  });
  return yearPreview(db, fy, args.now);
}

export async function reopenYear(db: Db, args: { fy: number; reason: string; userId: number | null }) {
  const period = fyLabel(args.fy);
  await db.$transaction(async (tx) => {
    const row = await tx.periodClose.findUnique({ where: { period } });
    if (!row?.isClosed || row.kind !== 'year') throw httpError('That year is not closed', 409);
    const later = await tx.periodClose.findFirst({ where: { isClosed: true, kind: 'year', period: { gt: period } }, orderBy: { period: 'asc' }, select: { period: true } });
    if (later) throw httpError(`Reopen ${later.period} first — years are reopened newest first`, 409);
    await tx.periodClose.update({ where: { period }, data: { isClosed: false, reopenedAt: new Date(), reopenReason: args.reason } });
    await audit(tx, args.userId, 'year.reopen', 'PeriodClose', period, { reason: args.reason });
  });
  return yearPreview(db, args.fy);
}

/** Financial years from the opening one to the current one. */
export async function yearList(db: Db, now = new Date()) {
  const cal = await readCalendar(db);
  if (!cal.openingDate) return { openingDate: null, startMonth: cal.fiscalYearStartMonth, years: [] as { year: string; fy: number; from: string; to: string; status: 'closed' | 'open' | 'running' }[] };
  const closed = new Set((await db.periodClose.findMany({ where: { isClosed: true, kind: 'year' }, select: { period: true } })).map((c) => c.period));
  const today = dayKey(now);
  const first = fyOfMonth(cal.openingDate.slice(0, 7), cal.fiscalYearStartMonth);
  const current = fyOfMonth(today.slice(0, 7), cal.fiscalYearStartMonth);
  const years = [];
  for (let fy = first; fy <= current; fy++) {
    const ms = fyMonths(fy, cal.fiscalYearStartMonth);
    const label = fyLabel(fy);
    years.push({ year: label, fy, from: ms[0], to: ms[11], status: closed.has(label) ? ('closed' as const) : fy === current ? ('running' as const) : ('open' as const) });
  }
  return { openingDate: cal.openingDate, startMonth: cal.fiscalYearStartMonth, years: years.reverse() };
}

export { nextMonth };
