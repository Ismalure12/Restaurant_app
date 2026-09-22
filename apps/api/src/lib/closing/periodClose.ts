// Month close (docs/system-blueprint.md §3.5). Closing a month freezes its
// statements and LOCKS every day in it (assertOpenDay). Rules:
//   • the month has ended and every day in it (from the opening date) is closed,
//   • the previous month is closed (closes run in order),
//   • the month's closing stock is counted (Inventory › Counts) — without it
//     the cost of goods is unknown.
// Reopening needs a reason, is audited, and only the newest closed month can be
// reopened, so later opening balances never move.
import type { Prisma } from '@prisma/client';
import type { Db } from '../db/prisma.js';
import { dayKey } from '../time/businessTime.js';
import { readCalendar } from '../money/moneyReads.js';
import { audit } from '../db/audit.js';
import { httpError } from '../../utils/httpError.js';
import { isMonthEnded, liveMonthStatement, monthRange, prevMonthOf, unclosedDaysIn } from './statements.js';

export async function monthPreview(db: Db, month: string) {
  const row = await db.periodClose.findUnique({ where: { period: month } });
  if (row?.isClosed) {
    return { status: 'closed' as const, month, closedAt: row.closedAt, closedById: row.closedById, statement: row.snapshot };
  }
  const statement = await liveMonthStatement(db, month);
  const blockers: string[] = [];
  let unclosedDays: string[] = [];
  // Structured readiness for the checklist UI (never parse `blockers` text).
  let checks: { ended: boolean; unclosedDays: string[]; stockCounted: boolean; prevMonth: string | null } | null = null;
  if (!statement.blocked) {
    const ended = isMonthEnded(month);
    unclosedDays = await unclosedDaysIn(db, month, statement.openingDate!);
    const prevOpen = statement.warnings.some((w) => w.includes('is not closed yet'));
    checks = { ended, unclosedDays, stockCounted: !!statement.complete, prevMonth: prevOpen ? prevMonthOf(month) : null };
    if (!ended) blockers.push('The month has not ended yet');
    if (unclosedDays.length) blockers.push(`${unclosedDays.length} day(s) are not closed yet`);
    if (!statement.complete) blockers.push('Count the stock for this month (Inventory › Counts)');
    if (prevOpen) blockers.push(`${prevMonthOf(month)} must be closed first`);
  }
  return {
    status: 'open' as const, month, statement, blockers, unclosedDays, checks,
    reopened: row ? { at: row.reopenedAt, reason: row.reopenReason } : null,
    canClose: !statement.blocked && blockers.length === 0,
  };
}

export async function closeMonth(db: Db, args: { month: string; userId: number | null }) {
  const { month, userId } = args;
  const cal = await readCalendar(db);
  if (!cal.openingDate) throw httpError('Set the opening balances first (Settings › Business)', 409);
  if (month < cal.openingDate.slice(0, 7)) throw httpError('That month is before the opening date', 409);
  if (!isMonthEnded(month)) throw httpError('A month can only be closed after it has ended', 409);
  if (month > cal.openingDate.slice(0, 7)) {
    const prev = await db.periodClose.findUnique({ where: { period: prevMonthOf(month) }, select: { isClosed: true } });
    if (!prev?.isClosed) throw httpError(`Close ${prevMonthOf(month)} first — months are closed in order`, 409);
  }
  const open = await unclosedDaysIn(db, month, cal.openingDate);
  if (open.length) {
    throw Object.assign(httpError(`Close every day of ${month} first — ${open.length} day(s) are still open (${open.slice(0, 3).join(', ')}${open.length > 3 ? '…' : ''})`, 409), { code: 'MONTH_HAS_OPEN_DAYS' });
  }
  const statement = await liveMonthStatement(db, month);
  if (statement.blocked) throw httpError('This month cannot be closed', 409);
  if (!statement.complete) throw Object.assign(httpError('Count and post the stock for this month before closing it', 409), { code: 'NEEDS_STOCK_COUNT' });

  await db.$transaction(async (tx) => {
    const existing = await tx.periodClose.findUnique({ where: { period: month } });
    if (existing?.isClosed) throw httpError(`${month} is already closed`, 409);
    const snapshot = statement as unknown as Prisma.InputJsonValue;
    if (existing) await tx.periodClose.update({ where: { period: month }, data: { isClosed: true, closedAt: new Date(), closedById: userId, snapshot } });
    else await tx.periodClose.create({ data: { period: month, kind: 'month', closedById: userId, snapshot } });
    await audit(tx, userId, 'month.close', 'PeriodClose', month, { netProfit: statement.pnl!.netProfit, netPosition: statement.position!.net });
  });
  return monthPreview(db, month);
}

export async function reopenMonth(db: Db, args: { month: string; reason: string; userId: number | null }) {
  const { month, reason, userId } = args;
  await db.$transaction(async (tx) => {
    const row = await tx.periodClose.findUnique({ where: { period: month } });
    if (!row?.isClosed || row.kind !== 'month') throw httpError('That month is not closed', 409);
    const later = await tx.periodClose.findFirst({ where: { isClosed: true, kind: 'month', period: { gt: month } }, orderBy: { period: 'asc' }, select: { period: true } });
    if (later) throw httpError(`Reopen ${later.period} first — months are reopened newest first`, 409);
    const years = await tx.periodClose.findMany({ where: { isClosed: true, kind: 'year' }, select: { period: true, snapshot: true }, take: 100 });
    const year = years.find((y) => (y.snapshot as { monthList?: string[] } | null)?.monthList?.includes(month));
    if (year) throw httpError(`${month} belongs to the closed year ${year.period} — reopen the year first`, 409);
    await tx.periodClose.update({ where: { period: month }, data: { isClosed: false, reopenedAt: new Date(), reopenReason: reason } });
    await audit(tx, userId, 'month.reopen', 'PeriodClose', month, { reason });
  });
  return monthPreview(db, month);
}

/** Months from the opening month up to the last ended month — for the Statements picker. */
export async function monthList(db: Db, now = new Date()) {
  const cal = await readCalendar(db);
  if (!cal.openingDate) return { openingDate: null, months: [] as { month: string; status: 'closed' | 'open' | 'running' }[] };
  const closed = new Set((await db.periodClose.findMany({ where: { isClosed: true, kind: 'month' }, select: { period: true } })).map((c) => c.period));
  const current = dayKey(now).slice(0, 7);
  const months: { month: string; status: 'closed' | 'open' | 'running' }[] = [];
  for (let m = cal.openingDate.slice(0, 7); m <= current && months.length < 120; ) {
    months.push({ month: m, status: closed.has(m) ? 'closed' : m === current ? 'running' : 'open' });
    const [y, mm] = m.split('-').map(Number);
    m = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`;
  }
  return { openingDate: cal.openingDate, months: months.reverse() };
}

export { monthRange };
