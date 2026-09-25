import { vi } from 'vitest';
import { SignJWT } from 'jose';

// A Prisma stand-in: every model method is a vi.fn, and $transaction runs the
// callback against the same mock, so route code executes unchanged.
const model = () => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  upsert: vi.fn(),
  delete: vi.fn(),
  deleteMany: vi.fn(),
  count: vi.fn(),
  groupBy: vi.fn(),
  aggregate: vi.fn(),
});

export function createPrismaMock() {
  const db = {
    adminUser: model(),
    category: model(),
    menuItem: model(),
    customer: model(),
    onlineClient: model(),
    order: model(),
    paymentSession: model(),
    setting: model(),
    socialLink: model(),
    invoice: model(),
    invoicePayment: model(),
    receiptCounter: model(),
    expense: model(),
    salaryPayment: model(),
    salaryRate: { ...model(), createMany: vi.fn() },
    inventoryItem: model(),
    moneyAccount: model(),
    accountEntry: { ...model(), createMany: vi.fn() },
    staffAccount: model(),
    auditLog: model(),
    dayClose: model(),
    diningTable: model(),
    orderItem: { ...model(), createMany: vi.fn() },
    periodClose: model(),
    expenseCategory: model(),
    supplier: model(),
    supplierPayment: model(),
    stockCount: model(),
    stockCountLine: model(),
    dayCloseLine: { ...model(), createMany: vi.fn() },
    stockMovement: { ...model(), createMany: vi.fn() },
    $transaction: vi.fn(),
  };
  // The business accounts every test starts with (see ACCOUNTS).
  const pick = (args?: { where?: Record<string, unknown> }) => ACCOUNTS.filter((a) => matches(a, args?.where ?? {}));
  db.moneyAccount.findMany.mockImplementation(async (args?: { where?: Record<string, unknown> }) => pick(args));
  db.moneyAccount.findFirst.mockImplementation(async (args?: { where?: Record<string, unknown> }) => pick(args)[0] ?? null);
  db.moneyAccount.findUnique.mockImplementation(async (args?: { where?: Record<string, unknown> }) => pick(args)[0] ?? null);
  db.moneyAccount.count.mockImplementation(async (args?: { where?: Record<string, unknown> }) => pick(args).length);
  db.accountEntry.findMany.mockResolvedValue([]);
  db.accountEntry.findFirst.mockResolvedValue(null);
  db.accountEntry.createMany.mockResolvedValue({ count: 0 });
  db.accountEntry.create.mockImplementation(async ({ data }: { data: unknown }) => ({ id: 900, ...(data as object) }));
  db.accountEntry.upsert.mockResolvedValue({});
  db.auditLog.create.mockResolvedValue({});
  db.dayClose.findUnique.mockResolvedValue(null);
  db.orderItem.createMany.mockResolvedValue({ count: 0 });
  db.menuItem.findMany.mockResolvedValue([]);
  db.diningTable.findMany.mockResolvedValue([]);
  db.setting.findMany.mockResolvedValue([]);
  db.accountEntry.groupBy.mockResolvedValue([]);
  db.periodClose.findUnique.mockResolvedValue(null);
  db.expenseCategory.findMany.mockResolvedValue([]);
  db.expenseCategory.upsert.mockResolvedValue({ kind: 'operating' });
  db.salaryRate.findMany.mockResolvedValue([]);
  // A fresh day's first receipt unless a test says otherwise.
  db.receiptCounter.upsert.mockResolvedValue({ last: 1 });
  db.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: typeof db) => unknown)(db) : Promise.all(arg as unknown[]),
  );
  return db;
}

export type PrismaMock = ReturnType<typeof createPrismaMock>;

/** Business money accounts in every test (ids are what the tests send). */
export const ACCOUNTS = [
  { id: 1, kind: 'cash', label: 'Cash', number: null, isActive: true, sortOrder: 0, openingBalance: 0 },
  { id: 2, kind: 'wallet', label: 'A/C', number: '521436', isActive: true, staffNumbers: true, sortOrder: 11, openingBalance: 0 },
  { id: 3, kind: 'wallet', label: 'E/d', number: '748079', isActive: true, staffNumbers: false, sortOrder: 12, openingBalance: 0 },
  { id: 4, kind: 'wallet', label: 'Old wallet', number: null, isActive: false, sortOrder: 13, openingBalance: 0 },
  { id: 5, kind: 'card', label: 'Mastercard', number: null, isActive: true, sortOrder: 50, openingBalance: 0 },
  { id: 6, kind: 'gateway', label: 'Sifalo (online)', number: null, isActive: true, sortOrder: 60, openingBalance: 0 },
];

// Just enough of Prisma's where-matching for the account lookups above.
function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, cond]) => {
    const v = row[k];
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      const c = cond as { in?: unknown[]; not?: unknown };
      if (c.in) return c.in.includes(v);
      if ('not' in c) return v !== c.not;
      return true;
    }
    return v === cond;
  });
}

const secret = () => new TextEncoder().encode(process.env.JWT_SECRET);

export async function tokenFor(role: string | undefined, userId = 1, opts: { expired?: boolean } = {}) {
  const jwt = new SignJWT({ userId, email: `${role}@test.local`, ...(role ? { role } : {}) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt();
  jwt.setExpirationTime(opts.expired ? Math.floor(Date.now() / 1000) - 60 : '7d');
  return `auth-token=${await jwt.sign(secret())}`;
}
