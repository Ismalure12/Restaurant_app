// The cash book (docs/system-blueprint.md §3). Where money really sits is a
// business MoneyAccount (Cash, each mobile wallet — A/C, E/d, My Cash… —, the
// Mastercard, the bank, Sifalo online). Every path that moves money writes one
// signed AccountEntry per account, in the SAME transaction as the thing that
// moved it:
//
//   sale · invoice_payment      money in from a customer
//   refund · adjustment         a void/decline gives it back; a correction of a
//                               paid sale moves the difference
//   expense · salary            money out (mirrors the Expense row)
//   transfer · owner_in/out     between accounts / the owner's own money
//
// Staff never hold a balance: a payment a waiter takes on THEIR A/C number is
// written straight into the business A/C account, tagged `collectedById`
// (everything they collect is handed over at the end of the day). Card and
// online money is never tagged to staff — only the business has a card.
//
// Balance of an account = openingBalance + sum(amount) of its rows from the
// opening date (Setting `opening_date`) on.
import { Prisma } from '@prisma/client';
import type { Db } from '../db/prisma.js';
import { dayKey } from '../time/businessTime.js';

type Tx = Prisma.TransactionClient;
type Reader = Pick<Db, 'moneyAccount' | 'adminUser'> | Pick<Tx, 'moneyAccount' | 'adminUser'>;

export const ACCOUNT_KINDS = ['cash', 'wallet', 'card', 'bank', 'gateway'] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];
/** Kinds a customer can pay into at the till (never the online gateway or the bank). */
export const TILL_KINDS: readonly string[] = ['cash', 'wallet', 'card'];
/** Kinds whose money a staff member physically takes (card/online are business-only). */
const STAFF_KINDS: readonly string[] = ['cash', 'wallet'];

export const ENTRY_KINDS = [
  'sale', 'invoice_payment', 'refund', 'adjustment', 'expense', 'salary', 'supplier_payment', 'transfer', 'owner_in', 'owner_out', 'over_short',
] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

/** Rows that are customer money a staff member collected (Collections, My performance). */
export const COLLECTION_KINDS: EntryKind[] = ['sale', 'invoice_payment', 'refund', 'adjustment'];

export type Account = { id: number; kind: string; label: string; isActive: boolean };

const cents = (n: number) => Math.round(n * 100);

export function activeAccounts(db: Reader) {
  return db.moneyAccount.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
}

/** The account a kind of money lands in by default (first active one of that kind). */
export function primaryAccount(db: Reader, kind: AccountKind) {
  return db.moneyAccount.findFirst({ where: { kind, isActive: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
}

// ── How a sale is paid ──────────────────────────────────────────────────

export type SalePaymentMethod = 'cash' | 'card' | 'evc' | 'split' | 'invoice';
export interface SettlementInput {
  paymentMethod: SalePaymentMethod;
  /** 'evc' (a mobile wallet): which business wallet — A/C, E/d, My Cash… */
  accountId?: number | null;
  /** 'split': 2–4 parts, each into a different account, summing to the total. */
  payments?: { accountId: number; amount: number }[] | null;
}
export interface ResolvedPayment {
  /** Money parts into business accounts (empty for On account). */
  parts: { account: Account; amount: number }[];
  /** Order.paymentMethod / Order.paymentAccount (label snapshot for a wallet). */
  paymentMethod: SalePaymentMethod;
  paymentAccount: string | null;
}
type Resolved<T> = { ok: true; value: T } | { ok: false; error: string; status?: number };

/** Turns the till's choice into business-account parts. Never trusts an amount except split parts, which must add up. */
export async function resolveSalePayment(db: Reader, input: SettlementInput, total: number): Promise<Resolved<ResolvedPayment>> {
  const m = input.paymentMethod;
  if (m === 'invoice') return { ok: true, value: { parts: [], paymentMethod: 'invoice', paymentAccount: null } };

  if (m === 'cash' || m === 'card') {
    const acct = await primaryAccount(db, m);
    if (!acct) return { ok: false, error: `There is no active ${m === 'cash' ? 'Cash' : 'card'} account — add one in Settings › Business accounts` };
    return { ok: true, value: { parts: [{ account: acct, amount: total }], paymentMethod: m, paymentAccount: null } };
  }

  if (m === 'evc') {
    if (!input.accountId) return { ok: false, error: 'Choose which account the money was paid into' };
    const acct = await db.moneyAccount.findFirst({ where: { id: input.accountId, kind: 'wallet', isActive: true } });
    if (!acct) return { ok: false, error: 'That account is not an active mobile wallet' };
    return { ok: true, value: { parts: [{ account: acct, amount: total }], paymentMethod: 'evc', paymentAccount: acct.label } };
  }

  // Split: part cash, part wallet, part card…
  const parts = input.payments ?? [];
  if (parts.length < 2 || parts.length > 4) return { ok: false, error: 'A split payment has 2 to 4 parts' };
  const ids = parts.map((p) => p.accountId);
  if (new Set(ids).size !== ids.length) return { ok: false, error: 'Each part of a split payment must go into a different account' };
  const accounts = await db.moneyAccount.findMany({ where: { id: { in: ids }, isActive: true, kind: { in: [...TILL_KINDS] } } });
  if (accounts.length !== ids.length) return { ok: false, error: 'A split payment can only use active cash, wallet or card accounts' };
  if (parts.some((p) => !(p.amount > 0))) return { ok: false, error: 'Every part of a split payment needs an amount' };
  const sum = parts.reduce((s, p) => s + cents(p.amount), 0);
  if (sum !== cents(total)) {
    return { ok: false, error: `The parts add up to $${(sum / 100).toFixed(2)} but the total is $${total.toFixed(2)}` };
  }
  const byId = new Map(accounts.map((a) => [a.id, a]));
  return {
    ok: true,
    value: {
      parts: parts.map((p) => ({ account: byId.get(p.accountId)!, amount: p.amount })),
      paymentMethod: 'split',
      paymentAccount: null,
    },
  };
}

/**
 * Who physically took the money. A waiter is always themselves (the session,
 * never the request). A cashier/manager may name any active staff member —
 * the waiter who took it at the table — and otherwise it is them.
 */
export async function resolveCollector(
  db: Reader,
  session: { userId?: number; role?: string },
  requested: number | null | undefined,
): Promise<Resolved<number>> {
  if (!session.userId) return { ok: false, error: 'Unauthorized', status: 401 };
  if (session.role === 'waiter' || !requested || requested === session.userId) return { ok: true, value: session.userId };
  const person = await db.adminUser.findFirst({
    where: { id: requested, isActive: true, role: { in: ['admin', 'manager', 'cashier', 'waiter'] } },
    select: { id: true },
  });
  if (!person) return { ok: false, error: 'The person who took the money was not found', status: 404 };
  return { ok: true, value: person.id };
}

// ── Writing rows ────────────────────────────────────────────────────────

type EntryData = Prisma.AccountEntryCreateManyInput;
const row = (d: Omit<EntryData, 'businessDay'>, at: Date): EntryData => ({ ...d, businessDay: dayKey(at), occurredAt: at });

/** Money parts of a closed sale → one `sale` row each. Card/online parts are never tagged to staff. */
export async function writeSaleEntries(
  tx: Tx,
  args: { orderId: number; parts: ResolvedPayment['parts']; collectedById: number | null; createdById: number | null; at?: Date },
) {
  if (!args.parts.length) return;
  const at = args.at ?? new Date();
  await tx.accountEntry.createMany({
    data: args.parts.map((p) => row({
      accountId: p.account.id,
      amount: p.amount,
      kind: 'sale',
      orderId: args.orderId,
      collectedById: STAFF_KINDS.includes(p.account.kind) ? args.collectedById : null,
      createdById: args.createdById,
    }, at)),
  });
}

/**
 * The account money for a sale went into when the sale predates the cash book
 * (no rows): mapped from the order's own payment columns.
 */
async function legacyAccountFor(tx: Tx, order: { source: string; paymentMethod: string | null; paymentAccount: string | null }) {
  if (order.source === 'online') return primaryAccount(tx, 'gateway');
  const m = order.paymentMethod;
  if (m === 'cash' || m === 'card') return primaryAccount(tx, m);
  if (m === 'evc' || m === 'waafi') {
    if (order.paymentAccount) {
      const byLabel = await tx.moneyAccount.findFirst({ where: { label: order.paymentAccount } });
      if (byLabel) return byLabel;
    }
    return primaryAccount(tx, 'wallet');
  }
  return null; // On account / unknown: no money was taken at the till.
}

type OrderMoney = { id: number; source: string; paymentMethod: string | null; paymentAccount: string | null; total: Prisma.Decimal | number | string; collectedById?: number | null };

/**
 * Gives back all the money a sale took (void of a paid sale, decline of a paid
 * online order): one `refund` row reversing each still-standing sale/adjustment
 * row, dated today. A sale from before the cash book gets one refund row from
 * its mapped account.
 */
export async function writeRefundEntries(tx: Tx, order: OrderMoney, args: { createdById: number | null; note?: string; at?: Date }) {
  const at = args.at ?? new Date();
  const standing = await tx.accountEntry.findMany({
    where: { orderId: order.id, kind: { in: ['sale', 'adjustment'] }, reversedBy: { is: null } },
  });
  if (standing.length) {
    await tx.accountEntry.createMany({
      data: standing.map((e) => row({
        accountId: e.accountId,
        amount: new Prisma.Decimal(e.amount).negated(),
        kind: 'refund',
        orderId: order.id,
        collectedById: e.collectedById,
        reversesId: e.id,
        createdById: args.createdById,
        note: args.note ?? null,
      }, at)),
    });
    return;
  }
  const acct = await legacyAccountFor(tx, order);
  if (!acct) return;
  await tx.accountEntry.create({
    data: row({
      accountId: acct.id, amount: -Number(order.total), kind: 'refund', orderId: order.id,
      collectedById: order.collectedById ?? null, createdById: args.createdById,
      note: args.note ?? 'Refund of a sale from before the cash book',
    }, at),
  });
}

/**
 * A manager corrected a PAID sale and its total changed: the difference moves
 * through the account that took the most of it (an `adjustment` row, + more
 * collected / − given back).
 */
export async function writeAdjustmentEntry(tx: Tx, order: OrderMoney, delta: number, args: { createdById: number | null; note?: string; at?: Date }) {
  if (cents(delta) === 0) return;
  const at = args.at ?? new Date();
  const biggest = await tx.accountEntry.findFirst({
    where: { orderId: order.id, kind: 'sale', reversedBy: { is: null } },
    orderBy: { amount: 'desc' },
  });
  const accountId = biggest?.accountId ?? (await legacyAccountFor(tx, order))?.id;
  if (!accountId) return;
  await tx.accountEntry.create({
    data: row({
      accountId, amount: delta, kind: 'adjustment', orderId: order.id,
      collectedById: biggest ? biggest.collectedById : (order.collectedById ?? null),
      createdById: args.createdById, note: args.note ?? null,
    }, at),
  });
}

/** Money a customer paid off their account (an invoice payment). */
export async function writeInvoicePaymentEntry(
  tx: Tx,
  args: { invoicePaymentId: number; account: Account; amount: number; collectedById: number | null; createdById: number | null; at?: Date },
) {
  const at = args.at ?? new Date();
  await tx.accountEntry.create({
    data: row({
      accountId: args.account.id, amount: args.amount, kind: 'invoice_payment', invoicePaymentId: args.invoicePaymentId,
      collectedById: STAFF_KINDS.includes(args.account.kind) ? args.collectedById : null,
      createdById: args.createdById,
    }, at),
  });
}

/**
 * Keeps an expense's cash-book row in step with the expense (created, edited:
 * amount, date or account). An expense without an account (logged before the
 * cash book) has no row.
 */
export async function syncExpenseEntry(
  tx: Tx,
  expense: ExpenseLike,
  args: { createdById: number | null; salary?: boolean },
) {
  if (!expense.paidFromAccountId) {
    await tx.accountEntry.deleteMany({ where: { expenseId: expense.id } });
    return;
  }
  const { expenseId: _id, createdById: _by, ...data } = expenseEntryData(expense, args);
  await tx.accountEntry.upsert({
    where: { expenseId: expense.id },
    update: data,
    create: { ...data, expenseId: expense.id, createdById: args.createdById },
  });
}

type ExpenseLike = { id: number; amount: Prisma.Decimal | number | string; incurredAt: Date; paidFromAccountId: number | null; note?: string | null; category: string };

/** The cash-book row an expense stands for (money out of its account on its day). */
export function expenseEntryData(expense: ExpenseLike, args: { createdById: number | null; salary?: boolean }) {
  return {
    accountId: expense.paidFromAccountId!,
    amount: -Number(expense.amount),
    kind: args.salary ? 'salary' : 'expense',
    businessDay: dayKey(expense.incurredAt),
    occurredAt: expense.incurredAt,
    note: expense.note ? `${expense.category} · ${expense.note}` : expense.category,
    expenseId: expense.id,
    createdById: args.createdById,
  } satisfies Prisma.AccountEntryCreateManyInput;
}

/** The account an expense is paid from must be an active business account the money can leave. */
export async function checkPaidFrom(db: Reader, accountId: number | null | undefined): Promise<Resolved<number>> {
  if (!accountId) return { ok: false, error: 'Choose which account the money came out of' };
  const acct = await db.moneyAccount.findFirst({ where: { id: accountId, isActive: true, kind: { not: 'gateway' } }, select: { id: true } });
  if (!acct) return { ok: false, error: 'That account is not an active cash, wallet, card or bank account' };
  return { ok: true, value: acct.id };
}
