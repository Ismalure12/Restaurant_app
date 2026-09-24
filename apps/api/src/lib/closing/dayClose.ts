// Day close / Z-report (docs/system-blueprint.md §3.4).
//
// A manager closes each business day once it has ENDED (a day still running
// can't be closed — new sales would land in a locked day). Closing:
//   • checks unpaid tabs and pending online orders (carry them over or stop),
//   • per business account records opening → in → out → expected, and what was
//     counted (cash) or read from the app/statement; a difference becomes an
//     `over_short` cash-book row on that day,
//   • freezes the Z-report snapshot and LOCKS the day: every write that takes a
//     date calls assertOpenDay and gets 409 PERIOD_CLOSED for a closed day.
// A later correction is a new entry in the current open day (a void of an old
// sale refunds TODAY — writeRefundEntries). Reopening needs a reason, is
// audited, and is only possible newest-first.
import { Prisma } from '@prisma/client';
import type { Db } from '../db/prisma.js';
import { addDays, dayKey, startOfDay } from '../time/businessTime.js';
import { collectionsOn, readCalendar, statementTotals } from '../money/moneyReads.js';
import { activeAccounts } from '../money/cashBook.js';
import { audit } from '../db/audit.js';
import { httpError } from '../../utils/httpError.js';
import { num, round2 } from '../reports/common.js';
import { salesFigures } from './salesFigures.js';

type Tx = Prisma.TransactionClient;
type Reader = Pick<Db, 'dayClose' | 'periodClose'> | Pick<Tx, 'dayClose' | 'periodClose'>;

export const PERIOD_CLOSED = 'PERIOD_CLOSED';

/** 409 PERIOD_CLOSED — thrown inside a transaction so the whole write rolls back. */
export const periodClosed = (what: string) =>
  Object.assign(httpError(`${what} is closed — record the correction in today's open day instead`, 409), { code: PERIOD_CLOSED });

/** True when the day — or the month it belongs to — is closed. */
export async function isDayClosed(db: Reader, day: string) {
  const [row, month] = await Promise.all([
    db.dayClose.findUnique({ where: { businessDay: day }, select: { isClosed: true } }),
    db.periodClose.findUnique({ where: { period: day.slice(0, 7) }, select: { isClosed: true } }),
  ]);
  return !!row?.isClosed || !!month?.isClosed;
}

/** Every write that takes a date calls this first: closed day or month → 409 PERIOD_CLOSED. */
export async function assertOpenDay(db: Reader, day: string) {
  if (await isDayClosed(db, day)) throw periodClosed(`The day ${day}`);
}
export const assertOpenAt = (db: Reader, at: Date) => assertOpenDay(db, dayKey(at));

/** A route's catch turns a thrown httpError into its response. */
export function sendHttpError(res: { status: (n: number) => { json: (b: unknown) => unknown } }, err: unknown) {
  const e = err as { httpStatus?: number; message?: string; code?: string } | null;
  if (!e?.httpStatus) return false;
  res.status(e.httpStatus).json({ error: e.message, ...(e.code ? { code: e.code } : {}) });
  return true;
}

// ── The checks and the Z-report ─────────────────────────────────────────

const money = (d: unknown) => round2(num(d));

/** Everything a manager needs to see before closing `day` (also what gets frozen). */
export async function dayReport(db: Db, day: string) {
  const from = startOfDay(day);
  const to = startOfDay(addDays(day, 1));
  const inDay = { gte: from, lt: to };
  const [tabs, pendingOnline, figures, voids, entryKinds, collections, accounts] = await Promise.all([
    // Unpaid dine-in tabs that were opened on or before this day.
    db.order.findMany({ where: { status: 'open', createdAt: { lt: to } }, select: { id: true, tableNumber: true, total: true }, take: 200 }),
    db.order.count({ where: { status: 'pending', source: 'online', createdAt: { lt: to } } }),
    salesFigures(db, from, to),
    db.order.findMany({ where: { voidedAt: inDay, status: 'voided' }, select: { id: true, total: true, voidReason: true, tableNumber: true }, take: 100 }),
    db.accountEntry.groupBy({ by: ['accountId', 'kind'], where: { businessDay: day }, _sum: { amount: true } }),
    collectionsOn(db, day),
    db.moneyAccount.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
  ]);

  const byAccount = accounts
    .map((a) => {
      const sale = entryKinds.filter((e) => e.accountId === a.id && e.kind === 'sale').reduce((s, e) => s + num(e._sum.amount), 0);
      return { accountId: a.id, label: a.label, kind: a.kind, sales: round2(sale) };
    })
    .filter((a) => a.sales !== 0);

  return {
    day,
    checks: {
      openTabs: tabs.map((t) => ({ id: t.id, table: t.tableNumber, total: money(t.total) })),
      pendingOnline,
    },
    sales: { ...figures, byAccount },
    voids: voids.map((v) => ({ orderId: v.id, table: v.tableNumber, total: money(v.total), reason: v.voidReason })),
    collections,
  };
}

/** Per active business account: opening → in → out → expected for `day`. */
export async function dayLines(db: Db, day: string, openingDate: string) {
  const accounts = await activeAccounts(db);
  return Promise.all(accounts.map(async (a) => {
    const t = await statementTotals(db, a, openingDate, day, day);
    return {
      accountId: a.id, label: a.label, kind: a.kind, number: a.number,
      opening: t.opening, moneyIn: t.moneyIn, moneyOut: t.moneyOut, expected: t.closing,
    };
  }));
}

export type DayState = { status: 'open' | 'closed' | 'running'; closedAt?: Date; reopenedAt?: Date | null };

/** The preview for the Day close screen (or the frozen version if already closed). */
export async function dayPreview(db: Db, day: string, today: string) {
  const cal = await readCalendar(db);
  const row = await db.dayClose.findUnique({ where: { businessDay: day }, include: { lines: true } });
  const base = { day, openingDate: cal.openingDate, today };
  if (row?.isClosed) {
    return { ...base, status: 'closed' as const, closedAt: row.closedAt, closedById: row.closedById, report: row.snapshot, lines: row.lines.map(serializeLine) };
  }
  const status = day >= today ? ('running' as const) : ('open' as const);
  if (!cal.openingDate) return { ...base, status, needsOpening: true as const };
  if (day < cal.openingDate) return { ...base, status, beforeOpening: true as const };
  const [report, lines] = await Promise.all([dayReport(db, day), dayLines(db, day, cal.openingDate)]);
  return { ...base, status, report, lines, reopened: row ? { at: row.reopenedAt, reason: row.reopenReason } : null };
}

function serializeLine(l: { accountId: number; opening: unknown; moneyIn: unknown; moneyOut: unknown; expected: unknown; counted: unknown }) {
  const counted = l.counted == null ? null : money(l.counted);
  return {
    accountId: l.accountId, opening: money(l.opening), moneyIn: money(l.moneyIn), moneyOut: money(l.moneyOut),
    expected: money(l.expected), counted, difference: counted == null ? null : round2(counted - money(l.expected)),
  };
}

// ── Closing and reopening ───────────────────────────────────────────────

export interface CloseInput {
  day: string;
  /** What was counted / read per account. Every account is optional (owner decision) — one left out has no over/short row. */
  counted: { accountId: number; amount: number }[];
  /** Acknowledge unpaid tabs / pending online orders and close anyway (they carry over). */
  carryOver?: boolean;
  userId: number | null;
  now?: Date;
}

/** The end of business day `day` — where over/short rows are dated. */
const endOf = (day: string) => new Date(startOfDay(addDays(day, 1)).getTime() - 1000);

export async function closeDay(db: Db, input: CloseInput) {
  const { day, userId } = input;
  const today = dayKey(input.now ?? new Date());
  if (day >= today) throw httpError('A day can only be closed after it has ended', 409);
  const cal = await readCalendar(db);
  if (!cal.openingDate) throw httpError('Set the opening balances first (Settings › Business)', 409);
  if (day < cal.openingDate) throw httpError('That day is before the opening date', 409);
  const month = await db.periodClose.findUnique({ where: { period: day.slice(0, 7) }, select: { isClosed: true } });
  if (month?.isClosed) throw periodClosed(`The month ${day.slice(0, 7)}`);

  const [report, lines] = await Promise.all([dayReport(db, day), dayLines(db, day, cal.openingDate)]);
  const blockers = report.checks.openTabs.length + report.checks.pendingOnline;
  if (blockers && !input.carryOver) {
    throw Object.assign(httpError(`${report.checks.openTabs.length} unpaid tab(s) and ${report.checks.pendingOnline} online order(s) are still waiting — settle them or close with them carried over`, 409), { code: 'DAY_HAS_OPEN_WORK' });
  }

  const countedBy = new Map(input.counted.map((c) => [c.accountId, c.amount]));
  for (const c of input.counted) {
    if (!lines.some((l) => l.accountId === c.accountId)) throw httpError('Counted amount for an unknown account', 400);
  }

  const at = endOf(day);
  await db.$transaction(async (tx) => {
    // The row is the lock: create it (or re-close a reopened day) under the
    // same transaction as the over/short rows so two closes can't both win.
    const existing = await tx.dayClose.findUnique({ where: { businessDay: day } });
    if (existing?.isClosed) throw httpError(`The day ${day} is already closed`, 409);

    const finalLines = lines.map((l) => {
      const counted = countedBy.get(l.accountId);
      return { ...l, counted: counted ?? null, difference: counted == null ? null : round2(counted - l.expected) };
    });
    const snapshot = { ...report, lines: finalLines, carriedOver: blockers ? { openTabs: report.checks.openTabs.length, pendingOnline: report.checks.pendingOnline } : null } as unknown as Prisma.InputJsonValue;

    if (existing) {
      await tx.dayCloseLine.deleteMany({ where: { businessDay: day } });
      await tx.dayClose.update({ where: { businessDay: day }, data: { isClosed: true, closedAt: new Date(), closedById: userId, snapshot } });
    } else {
      await tx.dayClose.create({ data: { businessDay: day, closedById: userId, snapshot } });
    }
    await tx.dayCloseLine.createMany({
      data: finalLines.map((l) => ({
        businessDay: day, accountId: l.accountId, opening: l.opening, moneyIn: l.moneyIn, moneyOut: l.moneyOut, expected: l.expected, counted: l.counted,
      })),
    });
    const diffs = finalLines.filter((l) => l.difference != null && l.difference !== 0);
    if (diffs.length) {
      await tx.accountEntry.createMany({
        data: diffs.map((l) => ({
          accountId: l.accountId, amount: l.difference!, kind: 'over_short', businessDay: day, occurredAt: at, createdById: userId,
          note: `Counted ${l.counted!.toFixed(2)} vs expected ${l.expected.toFixed(2)}`,
        })),
      });
    }
    await audit(tx, userId, 'day.close', 'DayClose', day, { differences: diffs.map((l) => ({ account: l.label, difference: l.difference })) });
  });
  return dayPreview(db, day, today);
}

/**
 * Reopens a closed day (manager, with a reason). The over/short rows of that
 * close are reversed by rows dated on that day (nothing is deleted). Only the
 * NEWEST closed day can be reopened, so later days' opening balances never move.
 */
export async function reopenDay(db: Db, args: { day: string; reason: string; userId: number | null }) {
  const { day, reason, userId } = args;
  await db.$transaction(async (tx) => {
    const row = await tx.dayClose.findUnique({ where: { businessDay: day } });
    if (!row?.isClosed) throw httpError('That day is not closed', 409);
    const later = await tx.dayClose.findFirst({ where: { isClosed: true, businessDay: { gt: day } }, orderBy: { businessDay: 'asc' }, select: { businessDay: true } });
    if (later) throw httpError(`Reopen ${later.businessDay} first — days are reopened newest first`, 409);

    const standing = await tx.accountEntry.findMany({ where: { businessDay: day, kind: 'over_short', reversedBy: { is: null }, reversesId: null } });
    if (standing.length) {
      await tx.accountEntry.createMany({
        data: standing.map((e) => ({
          accountId: e.accountId, amount: new Prisma.Decimal(e.amount).negated(), kind: 'over_short', businessDay: day,
          occurredAt: e.occurredAt, reversesId: e.id, createdById: userId, note: `Day reopened: ${reason}`,
        })),
      });
    }
    await tx.dayClose.update({ where: { businessDay: day }, data: { isClosed: false, reopenedAt: new Date(), reopenedById: userId, reopenReason: reason } });
    await audit(tx, userId, 'day.reopen', 'DayClose', day, { reason });
  });
}

/** Ended days from the opening date on that are not closed yet (Overview prompt), oldest first, capped. */
export async function unclosedDays(db: Db, today: string, cap = 31) {
  const cal = await readCalendar(db);
  if (!cal.openingDate) return { openingDate: null as string | null, days: [] as string[] };
  const closed = await db.dayClose.findMany({ where: { isClosed: true, businessDay: { gte: cal.openingDate } }, select: { businessDay: true } });
  const done = new Set(closed.map((c) => c.businessDay));
  const days: string[] = [];
  for (let d = cal.openingDate; d < today && days.length < cap; d = addDays(d, 1)) if (!done.has(d)) days.push(d);
  return { openingDate: cal.openingDate, days };
}
