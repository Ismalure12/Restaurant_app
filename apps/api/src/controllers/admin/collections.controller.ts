import type { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../lib/db/prisma.js';
import { requirePage } from '../../lib/auth/auth.js';
import { searchParams } from '../../utils/query.js';
import { dayKey, isDayKey } from '../../lib/time/businessTime.js';
import { collectionsOn } from '../../lib/money/moneyReads.js';
import { readJson } from '../../utils/body.js';
import { audit } from '../../lib/db/audit.js';

// GET /api/admin/collections?day=YYYY-MM-DD — what each waiter/cashier took
// from customers on a business day, per business account (A/C, E/d, My Cash,
// cash…). Everything they collect is handed over to the business at the end
// of the day, so this is what each person should have handed over. Manager.
export async function listCollections(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'cash', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const raw = searchParams(req).get('day');
  if (raw && !isDayKey(raw)) return res.status(400).json({ error: 'day must be a date like 2026-09-19' });
  try {
    return res.json(await collectionsOn(prisma, raw || dayKey(new Date())));
  } catch (err) {
    console.error('GET /api/admin/collections:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// GET/PUT /api/admin/staff/:id/accounts — one waiter's/cashier's own number
// for each business wallet (their A/C, E/d, My Cash…). Printed on the bill so
// customers know where to send money; the money counts in the business wallet.
// Only wallets switched on for staff (Settings › Money "Show in staff
// accounts") are listed or may get a number; clearing works on any wallet.
// Manager tier; audited.
const schema = z.object({
  numbers: z.array(z.object({
    accountId: z.number().int().positive(),
    number: z.string().trim().max(40, 'Number is too long').nullable(),
  })).max(20),
});

async function load(staffId: number) {
  const [wallets, mine] = await Promise.all([
    prisma.moneyAccount.findMany({ where: { kind: 'wallet', isActive: true, staffNumbers: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true, label: true } }),
    prisma.staffAccount.findMany({ where: { staffId }, select: { accountId: true, number: true } }),
  ]);
  const byId = new Map(mine.map((m) => [m.accountId, m.number]));
  return wallets.map((w) => ({ accountId: w.id, label: w.label, number: byId.get(w.id) ?? null }));
}

const parseId = (raw: string) => { const n = parseInt(raw, 10); return Number.isFinite(n) ? n : null; };

export async function getStaffAccounts(req: Request<{ id: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'staff', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const staffId = parseId(req.params.id);
  if (!staffId) return res.status(400).json({ error: 'Invalid id' });
  try {
    const person = await prisma.adminUser.findUnique({ where: { id: staffId }, select: { id: true } });
    if (!person) return res.status(404).json({ error: 'Staff member not found' });
    return res.json(await load(staffId));
  } catch (err) {
    console.error(`GET /api/admin/staff/${staffId}/accounts:`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateStaffAccounts(req: Request<{ id: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'staff', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const staffId = parseId(req.params.id);
  if (!staffId) return res.status(400).json({ error: 'Invalid id' });
  let body: unknown;
  try { body = readJson(req); } catch { body = null; }
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });
  const { numbers } = parsed.data;
  const ids = numbers.map((n) => n.accountId);
  if (new Set(ids).size !== ids.length) return res.status(400).json({ error: 'A wallet is listed twice' });
  try {
    const [person, wallets] = await Promise.all([
      prisma.adminUser.findUnique({ where: { id: staffId }, select: { id: true } }),
      prisma.moneyAccount.count({ where: { id: { in: ids }, kind: 'wallet' } }),
    ]);
    if (!person) return res.status(404).json({ error: 'Staff member not found' });
    if (wallets !== ids.length) return res.status(400).json({ error: 'Numbers can only be set for mobile wallets' });
    const set = numbers.filter((n) => n.number);
    const clear = numbers.filter((n) => !n.number).map((n) => n.accountId);
    const setIds = set.map((n) => n.accountId);
    if (setIds.length && (await prisma.moneyAccount.count({ where: { id: { in: setIds }, staffNumbers: true } })) !== setIds.length) {
      return res.status(400).json({ error: 'That account is not switched on for staff numbers (Settings › Money)' });
    }
    await prisma.$transaction(async (tx) => {
      if (clear.length) await tx.staffAccount.deleteMany({ where: { staffId, accountId: { in: clear } } });
      // Bounded by the number of wallets (a handful).
      await Promise.all(set.map((n) => tx.staffAccount.upsert({
        where: { staffId_accountId: { staffId, accountId: n.accountId } },
        create: { staffId, accountId: n.accountId, number: n.number! },
        update: { number: n.number! },
      })));
      await audit(tx, auth.session.userId, 'staff.accounts', 'AdminUser', staffId, { numbers });
    });
    return res.json(await load(staffId));
  } catch (err) {
    console.error(`PUT /api/admin/staff/${staffId}/accounts:`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
