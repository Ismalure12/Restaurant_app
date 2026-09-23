import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import prisma from '../../lib/db/prisma.js';
import { requirePos } from '../../lib/auth/auth.js';
import { searchParams as getSearchParams } from '../../utils/query.js';

type WaiterRow = { id: number; name: string | null; email: string; phone: string | null; isActive: boolean };

// Waiters are unified into login accounts (AdminUser, role 'waiter'). This list
// powers the POS "Waiter" picker — the cashier attributes the order to a waiter.
// Management (create/edit/remove) happens on the Staff page via /api/users.
// `name` is the real name only (printed on receipts); `label` falls back to the
// login email so an unnamed waiter is still pickable in the Register.
const serialize = (w: WaiterRow) => ({ id: w.id, name: w.name?.trim() || null, label: w.name?.trim() || w.email, phone: w.phone, isActive: w.isActive });

export async function listWaiters(req: Request, res: Response) {
  const auth = await requirePos(prisma, req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const searchParams = getSearchParams(req);
  const where: Prisma.AdminUserWhereInput = { role: 'waiter', ...(searchParams.get('active') === '1' ? { isActive: true } : {}) };

  try {
    const waiters = await prisma.adminUser.findMany({
      where,
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
      select: { id: true, name: true, email: true, phone: true, isActive: true },
    });
    return res.json(waiters.map(serialize));
  } catch (err) {
    console.error('GET /api/admin/waiters:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
