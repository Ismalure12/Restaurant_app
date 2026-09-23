import type { Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import prisma from '../../lib/db/prisma.js';
import { requirePos, requirePage, sessionCan } from '../../lib/auth/auth.js';
import { readJson } from '../../utils/body.js';
import { searchParams } from '../../utils/query.js';
import { dayKey, isDayKey, startOfDay } from '../../lib/time/businessTime.js';
import { activeAccounts } from '../../lib/money/cashBook.js';
import { accountBalances, readCalendar, OPENING_DATE_KEY, statementRow, statementRows, statementTotals } from '../../lib/money/moneyReads.js';
import { audit } from '../../lib/db/audit.js';
import { assertOpenDay, sendHttpError } from '../../lib/closing/dayClose.js';
import { localStamp, parseRange, sendCsv } from '../../lib/reports/common.js';
import { formatOrderCode, getOrderPrefix } from '../../lib/orders/orderCode.js';
import { env } from '../../config/env.js';

// GET  /api/admin/accounts — the business money accounts (Cash, the mobile
//      wallets A/C · E/d · My Cash…, the Mastercard, the bank, Sifalo online).
//      Everyone on the Register gets the ACTIVE ones (id, kind, label, number)
//      for the payment pickers. `?balances=1` (manager) adds every account's
//      balance, today's movement and the opening date.
// POST /api/admin/accounts — a manager adds an account.
export const accountFields = {
  label: z.string().trim().min(1, 'Give the account a name').max(30, 'Account name is too long (max 30)'),
  number: z.string().trim().max(40, 'Account number is too long').nullable().optional(),
};
const createSchema = z.object({
  // One Sifalo account exists already; online money is never added by hand.
  kind: z.enum(['cash', 'wallet', 'card', 'bank'], { error: 'Kind must be cash, wallet, card or bank' }),
  ...accountFields,
  sortOrder: z.number().int().min(0).max(999).optional(),
});

const errCode = (e: unknown) => (e as { code?: string } | null)?.code;

export async function listAccounts(req: Request, res: Response) {
  const auth = await requirePos(prisma, req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const wantBalances = searchParams(req).get('balances') === '1';
  if (wantBalances && !(await sessionCan(prisma, auth.session, ['cash', 'settings'], 'view'))) {
    return res.status(403).json({ error: 'You can’t see account balances' });
  }
  try {
    if (!wantBalances) {
      const rows = await activeAccounts(prisma);
      return res.json(rows.map((a) => ({ id: a.id, kind: a.kind, label: a.label, number: a.number })));
    }
    const calendar = await readCalendar(prisma);
    const today = dayKey(new Date());
    return res.json({ ...(await accountBalances(prisma, calendar.openingDate, today)), today, fiscalYearStartMonth: calendar.fiscalYearStartMonth });
  } catch (err) {
    console.error('GET /api/admin/accounts:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createAccount(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'settings', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  let body: unknown;
  try { body = readJson(req); } catch { body = null; }
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });
  const { kind, label, number, sortOrder } = parsed.data;
  try {
    const account = await prisma.$transaction(async (tx) => {
      const created = await tx.moneyAccount.create({
        data: { kind, label, number: number || null, sortOrder: sortOrder ?? (kind === 'wallet' ? 20 : kind === 'bank' ? 55 : 40) },
      });
      await audit(tx, auth.session.userId, 'account.create', 'MoneyAccount', created.id, { kind, label, number: number || null });
      return created;
    });
    return res.status(201).json({ id: account.id, kind: account.kind, label: account.label, number: account.number, isActive: account.isActive });
  } catch (err) {
    if (errCode(err) === 'P2002') return res.status(409).json({ error: 'An account with that name already exists' });
    console.error('POST /api/admin/accounts:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// PUT /api/admin/accounts/opening — the one-time starting point of the cash
// book: the opening date (Settings › Business) and the counted/statement
// balance of each business account on that day. Manager tier; audited.
// (Phase 2: locked once the first day is closed.)
const openingSchema = z.object({
  openingDate: z.string().refine(isDayKey, 'Opening date must be a date like 2026-09-19'),
  balances: z.array(z.object({
    accountId: z.number().int().positive(),
    amount: z.number().min(0, 'An opening balance cannot be negative').max(100_000_000),
  })).max(50),
});

export async function setOpeningBalances(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'settings', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  let body: unknown;
  try { body = readJson(req); } catch { body = null; }
  const parsed = openingSchema.safeParse(body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });
  const { openingDate, balances } = parsed.data;
  if (openingDate > dayKey(new Date())) return res.status(400).json({ error: 'The opening date cannot be in the future' });
  const ids = balances.map((b) => b.accountId);
  if (new Set(ids).size !== ids.length) return res.status(400).json({ error: 'An account is listed twice' });

  try {
    const known = await prisma.moneyAccount.count({ where: { id: { in: ids } } });
    if (known !== ids.length) return res.status(404).json({ error: 'Account not found' });
    await prisma.$transaction(async (tx) => {
      await tx.setting.upsert({ where: { key: OPENING_DATE_KEY }, create: { key: OPENING_DATE_KEY, value: openingDate }, update: { value: openingDate } });
      // Bounded by the number of accounts (a handful).
      await Promise.all(balances.map((b) => tx.moneyAccount.update({ where: { id: b.accountId }, data: { openingBalance: b.amount } })));
      await audit(tx, auth.session.userId, 'cashbook.opening', 'Setting', OPENING_DATE_KEY, { openingDate, balances });
    });
    return res.json({ openingDate, balances });
  } catch (err) {
    console.error('PUT /api/admin/accounts/opening:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// POST /api/admin/accounts/owner — the owner puts money into the business
// (capital) or takes money out (drawings). Kept apart from expenses so profit
// stays honest. One cash-book row. Manager tier.
/** A back-dated movement is stamped at local noon of its day. */
export const middayOf = (day: string) => new Date(startOfDay(day).getTime() + 12 * 3600_000);

const ownerSchema = z.object({
  accountId: z.number().int().positive(),
  direction: z.enum(['in', 'out'], { error: 'Choose money in or money out' }),
  amount: z.number().positive('Enter an amount').max(100_000_000),
  note: z.string().trim().max(300).nullable().optional(),
  day: z.string().refine(isDayKey, 'Day must be a date like 2026-09-19').optional(),
});

export async function recordOwnerMoney(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'cash', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  let body: unknown;
  try { body = readJson(req); } catch { body = null; }
  const parsed = ownerSchema.safeParse(body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });
  const { accountId, direction, amount, note } = parsed.data;
  const today = dayKey(new Date());
  const day = parsed.data.day ?? today;
  if (day > today) return res.status(400).json({ error: 'This cannot be dated in the future' });

  try {
    const account = await prisma.moneyAccount.findFirst({ where: { id: accountId, kind: { not: 'gateway' } } });
    if (!account) return res.status(404).json({ error: 'Account not found' });
    const at = day === today ? new Date() : middayOf(day);
    const entry = await prisma.$transaction(async (tx) => {
      await assertOpenDay(tx, day);
      const row = await tx.accountEntry.create({
        data: {
          accountId, amount: direction === 'in' ? amount : -amount, kind: direction === 'in' ? 'owner_in' : 'owner_out',
          businessDay: day, occurredAt: at, note: note || null, createdById: auth.session.userId ?? null,
        },
      });
      await audit(tx, auth.session.userId, `cashbook.owner_${direction}`, 'AccountEntry', row.id, { account: account.label, amount, day });
      return row;
    });
    return res.status(201).json({ id: entry.id, day, amount, direction, account: account.label });
  } catch (err) {
    if (sendHttpError(res, err)) return;
    console.error('POST /api/admin/accounts/owner:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// POST /api/admin/accounts/transfer — money moved between two business
// accounts (cash to the bank, a Sifalo payout, E/d withdrawn to cash…): two
// cash-book rows sharing one transferId, in one transaction. Manager tier.
const transferSchema = z.object({
  fromAccountId: z.number().int().positive(),
  toAccountId: z.number().int().positive(),
  amount: z.number().positive('Enter an amount').max(100_000_000),
  note: z.string().trim().max(300).nullable().optional(),
  // Defaults to today; can be back-dated, never forward.
  day: z.string().refine(isDayKey, 'Day must be a date like 2026-09-19').optional(),
});

export async function transferMoney(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'cash', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  let body: unknown;
  try { body = readJson(req); } catch { body = null; }
  const parsed = transferSchema.safeParse(body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });
  const { fromAccountId, toAccountId, amount, note } = parsed.data;
  const today = dayKey(new Date());
  const day = parsed.data.day ?? today;
  if (day > today) return res.status(400).json({ error: 'A transfer cannot be dated in the future' });
  if (fromAccountId === toAccountId) return res.status(400).json({ error: 'Choose two different accounts' });

  try {
    const accounts = await prisma.moneyAccount.findMany({ where: { id: { in: [fromAccountId, toAccountId] } } });
    const from = accounts.find((a) => a.id === fromAccountId);
    const to = accounts.find((a) => a.id === toAccountId);
    if (!from || !to) return res.status(404).json({ error: 'Account not found' });
    if (to.kind === 'gateway') return res.status(400).json({ error: 'Money cannot be moved into the online payment account' });
    const transferId = randomUUID();
    const at = day === today ? new Date() : middayOf(day);
    const text = note || `${from.label} → ${to.label}`;
    const by = auth.session.userId ?? null;
    await prisma.$transaction(async (tx) => {
      await assertOpenDay(tx, day);
      await tx.accountEntry.createMany({
        data: [
          { accountId: from.id, amount: -amount, kind: 'transfer', businessDay: day, occurredAt: at, transferId, note: text, createdById: by },
          { accountId: to.id, amount, kind: 'transfer', businessDay: day, occurredAt: at, transferId, note: text, createdById: by },
        ],
      });
      await audit(tx, by, 'cashbook.transfer', 'AccountEntry', transferId, { from: from.label, to: to.label, amount, day });
    });
    return res.status(201).json({ transferId, day, amount, from: from.label, to: to.label });
  } catch (err) {
    if (sendHttpError(res, err)) return;
    console.error('POST /api/admin/accounts/transfer:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// PUT /api/admin/accounts/:id — a manager renames an account, changes its
// number or order, or switches it off (it stays in history and still holds
// its balance). The opening balance is set only through /accounts/opening.
const updateSchema = z.object({
  ...accountFields,
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(999),
}).partial();


export async function updateAccount(req: Request<{ id: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'settings', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
  let body: unknown;
  try { body = readJson(req); } catch { body = null; }
  const parsed = updateSchema.safeParse(body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });
  const data = { ...parsed.data, ...(parsed.data.number !== undefined ? { number: parsed.data.number || null } : {}) };
  if (!Object.keys(data).length) return res.status(400).json({ error: 'Nothing to update' });
  try {
    const existing = await prisma.moneyAccount.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Account not found' });
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.moneyAccount.update({ where: { id }, data });
      await audit(tx, auth.session.userId, 'account.update', 'MoneyAccount', id, {
        before: { label: existing.label, number: existing.number, isActive: existing.isActive, sortOrder: existing.sortOrder },
        after: data,
      });
      return row;
    });
    return res.json({ id: updated.id, kind: updated.kind, label: updated.label, number: updated.number, isActive: updated.isActive, sortOrder: updated.sortOrder });
  } catch (err) {
    if (errCode(err) === 'P2002') return res.status(409).json({ error: 'An account with that name already exists' });
    console.error(`PUT /api/admin/accounts/${id}:`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/admin/accounts/:id/entries?from&to — one business account's
// statement (the cash book for that account): opening balance on `from`,
// every movement in the range (oldest first, cursor-paged), money in/out and
// the closing balance. `?format=csv` exports every row. Manager tier.
const CSV_BATCH = 1000;
const KIND_LABEL: Record<string, string> = {
  sale: 'Sale', invoice_payment: 'Account payment', refund: 'Refund', adjustment: 'Sale correction', expense: 'Expense',
  salary: 'Salary', transfer: 'Transfer', owner_in: 'Owner put in', owner_out: 'Owner took out', over_short: 'Count difference',
};

export async function listAccountEntries(req: Request<{ id: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'cash', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
  const range = parseRange(req);
  if (!range.ok) return res.status(400).json({ error: range.error });
  const sp = searchParams(req);
  const limit = Math.min(Math.max(parseInt(sp.get('limit') ?? '100', 10) || 100, 1), 200);
  const cursor = parseInt(sp.get('cursor') ?? '', 10);
  const { fromKey, toKey } = range.value;

  try {
    const account = await prisma.moneyAccount.findUnique({ where: { id } });
    if (!account) return res.status(404).json({ error: 'Account not found' });
    const [{ openingDate }, prefix] = await Promise.all([readCalendar(prisma), getOrderPrefix(prisma)]);
    const codeOf = (o: { id: number; createdAt: Date }) => formatOrderCode(o, prefix);

    if (sp.get('format') === 'csv') {
      const all = [];
      let after: number | undefined;
      for (;;) {
        const batch = await statementRows(prisma, id, fromKey, toKey, { cursor: after, take: CSV_BATCH });
        all.push(...batch);
        if (batch.length < CSV_BATCH) break;
        after = batch[batch.length - 1].id;
      }
      return sendCsv(res, `${account.label}_${fromKey}_${toKey}.csv`,
        ['Day', 'Time (local)', 'What', 'Amount', 'Order ID', 'Collected by', 'Recorded by', 'Note'],
        all.map((e) => statementRow(e, codeOf)).map((r) => [
          r.day, localStamp(r.at, env.BUSINESS_TZ), KIND_LABEL[r.kind] || r.kind, r.amount.toFixed(2),
          r.order?.code ?? '', r.collectedBy ?? '', r.by ?? '', r.note ?? '',
        ]));
    }

    const hasCursor = Number.isFinite(cursor) && cursor > 0;
    const [page, totals] = await Promise.all([
      statementRows(prisma, id, fromKey, toKey, { cursor: hasCursor ? cursor : undefined, take: limit + 1 }),
      openingDate && !hasCursor ? statementTotals(prisma, account, openingDate, fromKey, toKey) : null,
    ]);
    const hasMore = page.length > limit;
    const rows = (hasMore ? page.slice(0, limit) : page).map((e) => statementRow(e, codeOf));
    return res.json({
      account: { id: account.id, kind: account.kind, label: account.label, number: account.number, isActive: account.isActive },
      openingDate,
      from: fromKey,
      to: toKey,
      ...(totals ? { totals } : {}),
      rows,
      nextCursor: hasMore ? rows[rows.length - 1].id : null,
    });
  } catch (err) {
    console.error(`GET /api/admin/accounts/${id}/entries:`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
