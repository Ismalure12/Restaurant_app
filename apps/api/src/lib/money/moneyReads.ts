// Reading the cash book: account balances, one account's statement for a date
// range (opening → rows → closing), and what each staff member collected on a
// day. Pure aggregates over AccountEntry — the writes live in lib/money/cashBook.ts.
import type { Prisma } from '@prisma/client';
import type { Db } from '../db/prisma.js';
import { COLLECTION_KINDS } from './cashBook.js';
import { num, round2 } from '../reports/common.js';

// ── The business calendar (Settings › Business) ─────────────────────────
export const OPENING_DATE_KEY = 'opening_date';
export const FY_START_KEY = 'fiscal_year_start_month';

export async function readCalendar(db: Pick<Db, 'setting'>) {
  const rows = await db.setting.findMany({ where: { key: { in: [OPENING_DATE_KEY, FY_START_KEY] } } });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const fy = Number(map[FY_START_KEY]);
  return {
    /** The cut-over day: the cash book counts from here. Null until opening balances are set. */
    openingDate: (map[OPENING_DATE_KEY] as string | undefined) || null,
    fiscalYearStartMonth: Number.isInteger(fy) && fy >= 1 && fy <= 12 ? fy : 1,
  };
}

const nameOf = (u: { name: string | null; email: string } | null | undefined) => (u ? u.name?.trim() || u.email : null);

// ── Balances ─────────────────────────────────────────────────────────────

/**
 * Every business account with its balance now (opening + all rows from the
 * opening date) and today's net movement. Balances are null until the
 * opening date is set — before that the book has no starting point.
 */
export async function accountBalances(db: Db, openingDate: string | null, today: string) {
  const [accounts, sums, todays] = await Promise.all([
    db.moneyAccount.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
    openingDate
      ? db.accountEntry.groupBy({ by: ['accountId'], where: { businessDay: { gte: openingDate } }, _sum: { amount: true } })
      : Promise.resolve([]),
    db.accountEntry.groupBy({ by: ['accountId'], where: { businessDay: today }, _sum: { amount: true } }),
  ]);
  const sum = new Map(sums.map((s) => [s.accountId, num(s._sum.amount)]));
  const day = new Map(todays.map((s) => [s.accountId, num(s._sum.amount)]));
  const rows = accounts.map((a) => ({
    id: a.id,
    kind: a.kind,
    label: a.label,
    number: a.number,
    isActive: a.isActive,
    staffNumbers: a.staffNumbers,
    sortOrder: a.sortOrder,
    openingBalance: round2(num(a.openingBalance)),
    balance: openingDate ? round2(num(a.openingBalance) + (sum.get(a.id) ?? 0)) : null,
    today: round2(day.get(a.id) ?? 0),
  }));
  // Money in every account, inactive ones included (they can still hold some).
  const total = openingDate ? round2(rows.reduce((s, r) => s + (r.balance ?? 0), 0)) : null;
  return { openingDate, accounts: rows, total };
}

// ── One account's statement ──────────────────────────────────────────────

const ENTRY_SELECT = {
  id: true, businessDay: true, occurredAt: true, kind: true, amount: true, note: true, transferId: true, reversesId: true,
  order: { select: { id: true, createdAt: true } },
  collectedBy: { select: { name: true, email: true } },
  createdBy: { select: { name: true, email: true } },
} satisfies Prisma.AccountEntrySelect;
export type StatementRow = Prisma.AccountEntryGetPayload<{ select: typeof ENTRY_SELECT }>;

export function statementRow(e: StatementRow, codeOf: (o: { id: number; createdAt: Date }) => string) {
  return {
    id: e.id,
    day: e.businessDay,
    at: e.occurredAt,
    kind: e.kind,
    amount: round2(num(e.amount)),
    note: e.note,
    order: e.order ? { id: e.order.id, code: codeOf(e.order) } : null,
    collectedBy: nameOf(e.collectedBy),
    by: nameOf(e.createdBy),
    transferId: e.transferId,
    reversesId: e.reversesId,
  };
}

/**
 * Opening balance on `fromKey`, the money in/out within [fromKey, toKey] and
 * the closing balance. Days before the opening date don't count.
 */
export async function statementTotals(db: Db, account: { id: number; openingBalance: Prisma.Decimal | number | string }, openingDate: string, fromKey: string, toKey: string) {
  const start = fromKey < openingDate ? openingDate : fromKey;
  const range = { accountId: account.id, businessDay: { gte: start, lte: toKey } };
  const [before, ins, outs, inRange] = await Promise.all([
    start > openingDate
      ? db.accountEntry.aggregate({ where: { accountId: account.id, businessDay: { gte: openingDate, lt: start } }, _sum: { amount: true } })
      : Promise.resolve({ _sum: { amount: 0 } }),
    db.accountEntry.aggregate({ where: { ...range, amount: { gt: 0 } }, _sum: { amount: true } }),
    db.accountEntry.aggregate({ where: { ...range, amount: { lt: 0 } }, _sum: { amount: true } }),
    db.accountEntry.groupBy({ by: ['kind'], where: range, _sum: { amount: true } }),
  ]);
  const opening = round2(num(account.openingBalance) + num(before._sum.amount));
  const moneyIn = round2(num(ins._sum.amount));
  const moneyOut = round2(-num(outs._sum.amount));
  return {
    from: start,
    to: toKey,
    opening,
    moneyIn,
    moneyOut,
    closing: round2(opening + moneyIn - moneyOut),
    byKind: Object.fromEntries(inRange.map((g) => [g.kind, round2(num(g._sum.amount))])),
  };
}

export function statementRows(db: Db, accountId: number, fromKey: string, toKey: string, page: { cursor?: number; take: number }) {
  return db.accountEntry.findMany({
    where: { accountId, businessDay: { gte: fromKey, lte: toKey } },
    select: ENTRY_SELECT,
    orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    take: page.take,
    ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
  });
}

// ── Collections: what each staff member took on a day ────────────────────

/** Per person, per business account: customer money they took on `day` (net of refunds). */
export async function collectionsOn(db: Db, day: string, staffId?: number) {
  const groups = await db.accountEntry.groupBy({
    by: ['collectedById', 'accountId'],
    where: { businessDay: day, kind: { in: COLLECTION_KINDS }, collectedById: staffId ?? { not: null } },
    _sum: { amount: true },
  });
  const staffIds = [...new Set(groups.map((g) => g.collectedById!))];
  const accountIds = [...new Set(groups.map((g) => g.accountId))];
  const [people, accounts] = await Promise.all([
    staffIds.length ? db.adminUser.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true, email: true, role: true } }) : [],
    accountIds.length ? db.moneyAccount.findMany({ where: { id: { in: accountIds } }, select: { id: true, label: true, kind: true, sortOrder: true } }) : [],
  ]);
  accounts.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const rows = people.map((p) => {
    const mine = groups.filter((g) => g.collectedById === p.id);
    const byAccount = Object.fromEntries(mine.map((g) => [g.accountId, round2(num(g._sum.amount))]));
    return { staffId: p.id, name: nameOf(p), role: p.role, byAccount, total: round2(mine.reduce((s, g) => s + num(g._sum.amount), 0)) };
  }).sort((a, b) => b.total - a.total);
  const totals = Object.fromEntries(accounts.map((a) => [a.id, round2(groups.filter((g) => g.accountId === a.id).reduce((s, g) => s + num(g._sum.amount), 0))]));
  return {
    day,
    accounts: accounts.map((a) => ({ id: a.id, label: a.label, kind: a.kind })),
    rows,
    totals,
    total: round2(rows.reduce((s, r) => s + r.total, 0)),
  };
}
