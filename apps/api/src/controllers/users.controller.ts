import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import prisma from '../lib/db/prisma.js';
import { requirePage } from '../lib/auth/auth.js';
import { createUserSchema, updateUserSchema } from '../validations/users.validation.js';
import { readJson } from '../utils/body.js';
import { currentMonth, groupRates, salaryFor } from '../lib/money/salary.js';
import { audit } from '../lib/db/audit.js';
import { rangeFromQuery } from '../lib/time/businessTime.js';
import { num, round2, salesWhere } from '../lib/reports/common.js';

// Anyone given Staff › Act may manage accounts, but never above themselves:
// an account's role (and the role handed out) must rank at most the editor's,
// and only an admin creates, changes or removes an admin.
const RANK: Record<string, number> = { waiter: 1, cashier: 2, manager: 3, admin: 4 };
const rankOf = (role: string | null | undefined) => RANK[role ?? ''] ?? 0;
function outranks(editorRole: string | undefined, role: string | null | undefined) {
  if (role === 'admin') return editorRole === 'admin';
  return rankOf(role) <= rankOf(editorRole);
}

export async function listUsers(req: Request, res: Response) {
  try {
    const auth = await requirePage(prisma, req, ['staff', 'payroll', 'reports', 'sales', 'cash', 'expenses'], 'view');
    if (auth.error) {
      return res.status(auth.status).json({ error: auth.error });
    }

    // Managers (and admins) also get each person's last 7 business days on
    // the Staff cards: sales they rang up OR served, and voided sales they
    // rang up or served. Two groupBy reads over (staffId, waiterId) pairs, so
    // a sale where one person did both counts once — never a query per person.
    const withStats = auth.session.role === 'admin' || auth.session.role === 'manager';
    const week = withStats ? rangeFromQuery(null, null, { defaultDays: 7 }).range : undefined;

    const [users, rates, sold, voided] = await Promise.all([
      prisma.adminUser.findMany({
        select: { id: true, email: true, role: true, name: true, phone: true, isActive: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
        take: 500,
      }),
      prisma.salaryRate.findMany({ select: { staffId: true, amount: true, fromMonth: true }, take: 5000 }),
      week
        ? prisma.order.groupBy({ by: ['staffId', 'waiterId'], where: salesWhere(week), _sum: { total: true }, _count: { _all: true } })
        : null,
      week
        ? prisma.order.groupBy({ by: ['staffId', 'waiterId'], where: { voidedAt: { gte: week.from, lt: week.to } }, _count: { _all: true } })
        : null,
    ]);
    // Current monthly salary, from salary history (0 = none on file).
    const ratesOf = groupRates(rates);
    const month = currentMonth();
    const mine = <T extends { staffId: number | null; waiterId: number | null }>(rows: T[], id: number) =>
      rows.filter((r) => r.staffId === id || r.waiterId === id);
    return res.json(users.map((u) => {
      const row = { ...u, salary: salaryFor(ratesOf.get(u.id) ?? [], month) };
      if (!sold || !voided) return row;
      const s = mine(sold, u.id);
      return {
        ...row,
        stats7d: {
          sales: round2(s.reduce((t, r) => t + num(r._sum.total), 0)),
          orders: s.reduce((t, r) => t + r._count._all, 0),
          voids: mine(voided, u.id).reduce((t, r) => t + r._count._all, 0),
        },
      };
    }));
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createUser(req: Request, res: Response) {
  try {
    const auth = await requirePage(prisma, req, 'staff', 'act');
    if (auth.error) {
      return res.status(auth.status).json({ error: auth.error });
    }

    const body = readJson(req);
    const parsed = createUserSchema.safeParse(body);

    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });
    }

    const { email, password, role, name, phone, isActive, monthlySalary } = parsed.data;

    // Only an admin may create another admin — stop managers from escalating.
    if (role === 'admin' && auth.session.role !== 'admin') {
      return res.status(403).json({ error: 'Only an admin can assign the admin role' });
    }
    if (!outranks(auth.session.role, role)) {
      return res.status(403).json({ error: `You can't create a ${role} account` });
    }

    const existing = await prisma.adminUser.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Email already in use' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.adminUser.create({
        data: {
          email, passwordHash, role, name: name ?? null, phone: phone ?? null, isActive,
          // The first salary applies from this month; raises later go through Payroll.
          ...(monthlySalary ? { salaryRates: { create: { amount: monthlySalary, fromMonth: currentMonth(), setById: auth.session.userId } } } : {}),
        },
        select: { id: true, email: true, role: true, name: true, phone: true, isActive: true, createdAt: true },
      });
      await audit(tx, auth.session.userId, 'user.create', 'AdminUser', created.id, { email, role, name: name ?? null, isActive });
      return created;
    });

    return res.status(201).json({ ...user, salary: monthlySalary ?? 0 });
  } catch (err) {
    console.error('POST /api/users:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateUser(req: Request<{ id: string }>, res: Response) {
  try {
    const auth = await requirePage(prisma, req, 'staff', 'act');
    if (auth.error) {
      return res.status(auth.status).json({ error: auth.error });
    }

    const { id } = req.params;
    const userId = parseInt(id);
    const body = readJson(req);
    const parsed = updateUserSchema.safeParse(body);

    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });
    }

    // Only an admin may promote a user to admin — stop managers from escalating.
    if (parsed.data.role === 'admin' && auth.session.role !== 'admin') {
      return res.status(403).json({ error: 'Only an admin can assign the admin role' });
    }

    if (!Number.isInteger(userId)) return res.status(400).json({ error: 'Invalid id' });
    const SELECT = { id: true, email: true, role: true, name: true, phone: true, isActive: true, createdAt: true } as const;
    const before = await prisma.adminUser.findUnique({ where: { id: userId }, select: SELECT });
    if (!before) return res.status(404).json({ error: 'User not found' });
    if (!outranks(auth.session.role, before.role) || (parsed.data.role && !outranks(auth.session.role, parsed.data.role))) {
      return res.status(403).json({ error: "You can't change an account above your own role" });
    }

    if (parsed.data.email) {
      const existing = await prisma.adminUser.findUnique({ where: { email: parsed.data.email } });
      if (existing && existing.id !== userId) {
        return res.status(409).json({ error: 'Email already in use' });
      }
    }

    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.adminUser.update({ where: { id: userId }, data: parsed.data, select: SELECT });
      // Only the fields that changed (never a password — this route can't set one).
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const k of ['email', 'role', 'name', 'phone', 'isActive'] as const) {
        if (k in parsed.data && before[k] !== updated[k]) changes[k] = { from: before[k], to: updated[k] };
      }
      if (Object.keys(changes).length) await audit(tx, auth.session.userId, 'user.update', 'AdminUser', userId, changes as Prisma.InputJsonValue);
      return updated;
    });

    return res.json(user);
  } catch (err) {
    console.error('PUT /api/users/:id:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteUser(req: Request<{ id: string }>, res: Response) {
  try {
    const auth = await requirePage(prisma, req, 'staff', 'act');
    if (auth.error) {
      return res.status(auth.status).json({ error: auth.error });
    }

    const { id } = req.params;
    const userId = parseInt(id);

    if (auth.session.userId === userId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    if (!Number.isInteger(userId)) return res.status(400).json({ error: 'Invalid id' });
    const target = await prisma.adminUser.findUnique({ where: { id: userId }, select: { email: true, role: true, name: true } });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (!outranks(auth.session.role, target.role)) {
      return res.status(403).json({ error: "You can't remove an account above your own role" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.adminUser.delete({ where: { id: userId } });
      await audit(tx, auth.session.userId, 'user.delete', 'AdminUser', userId, target);
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/users/:id:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
