import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../../lib/db/prisma.js';
import { MANAGER_ROLES, requireRole } from '../../lib/auth/auth.js';
import {
  EDITABLE_ROLES, PAGES, SETTING_KEY, applyPatch, type Matrix, defaultMatrix, diffFromDefaults, editableRowsFor, loadMatrix, matrixPatchSchema, pagesFor,
} from '../../lib/auth/permissions.js';
import { audit } from '../../lib/db/audit.js';
import { readJson } from '../../utils/body.js';
import { searchParams } from '../../utils/query.js';
import { rangeFromQuery } from '../../lib/time/businessTime.js';

// Settings › Staff access and Settings › Audit log. Both are admin + manager
// only, whatever the permission matrix says (so nobody can lock the manager
// out of the screen that grants access).

/** GET /api/admin/permissions — the matrix, the defaults and what the caller may change. */
export async function getPermissions(req: Request, res: Response) {
  const auth = await requireRole(prisma, req, MANAGER_ROLES);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  try {
    const matrix = await loadMatrix(prisma);
    const role = auth.session.role;
    return res.json({
      pages: PAGES.map(({ key, label, group, readOnly }) => ({ key, label, group, readOnly: Boolean(readOnly) })),
      matrix,
      defaults: defaultMatrix(),
      editable: editableRowsFor(role),
      // A manager can't give more than they have; the page greys out higher levels.
      own: pagesFor(matrix, role),
    });
  } catch (err) {
    console.error('GET /api/admin/permissions:', err);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}

const putSchema = z.object({ matrix: matrixPatchSchema });

/**
 * PUT /api/admin/permissions { matrix: { cashier: { reports: 'view' }, … } }.
 * Admin changes any row; a manager only cashier/waiter rows and never above
 * their own level (403). Writes the setting + an audit row in one transaction.
 */
export async function updatePermissions(req: Request, res: Response) {
  const auth = await requireRole(prisma, req, MANAGER_ROLES);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  let body: unknown;
  try { body = readJson(req); } catch { body = null; }
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid permissions' });

  try {
    const before = await loadMatrix(prisma);
    const result = applyPatch(before, parsed.data.matrix as Partial<Matrix>, auth.session.role);
    if (result.error !== undefined) return res.status(403).json({ error: result.error });
    const next = result.matrix;
    const stored = JSON.stringify(diffFromDefaults(next));
    // Only what actually changed goes into the audit row.
    const changes: Record<string, Record<string, { from: string; to: string }>> = {};
    for (const r of EDITABLE_ROLES) {
      for (const [page, to] of Object.entries(next[r])) {
        const from = before[r][page];
        if (from !== to) (changes[r] ??= {})[page] = { from, to };
      }
    }
    if (Object.keys(changes).length) {
      await prisma.$transaction(async (tx) => {
        await tx.setting.upsert({ where: { key: SETTING_KEY }, create: { key: SETTING_KEY, value: stored }, update: { value: stored } });
        await audit(tx, auth.session.userId, 'permissions.update', 'Setting', SETTING_KEY, changes as Prisma.InputJsonValue);
      });
    }
    return res.json({ matrix: next, changed: Object.keys(changes).length > 0 });
  } catch (err) {
    console.error('PUT /api/admin/permissions:', err);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}

const auditQuery = z.object({
  entity: z.string().trim().max(40).optional(),
  actorId: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(80).optional(),
  cursor: z.coerce.number().int().positive().optional(),
  take: z.coerce.number().int().min(1).max(100).default(50),
});

/**
 * GET /api/admin/audit-log?from&to&entity&actorId&q&cursor&take — newest first
 * (ids are append-only, so `id < cursor` pages), ≤ 100 rows a page, with the
 * actor's name looked up in one query. Also returns the entity list for the filter.
 */
export async function listAuditLog(req: Request, res: Response) {
  const auth = await requireRole(prisma, req, MANAGER_ROLES);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const sp = searchParams(req);
  const range = rangeFromQuery(sp.get('from'), sp.get('to'), { defaultDays: 30 });
  if (range.error) return res.status(400).json({ error: range.error });
  const parsed = auditQuery.safeParse(Object.fromEntries([...sp.entries()].filter(([k, v]) => k !== 'from' && k !== 'to' && v !== '')));
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid filters' });
  const { entity, actorId, q, cursor, take } = parsed.data;
  const r = range.range!;

  const where: Prisma.AuditLogWhereInput = {
    at: { gte: r.from, lt: r.to },
    ...(entity ? { entity } : {}),
    ...(actorId ? { actorId } : {}),
    ...(cursor ? { id: { lt: cursor } } : {}),
    ...(q ? { OR: [{ action: { contains: q, mode: 'insensitive' } }, { entity: { contains: q, mode: 'insensitive' } }, { entityId: { contains: q } }] } : {}),
  };
  try {
    const [rows, entities] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { id: 'desc' }, take: take + 1 }),
      prisma.auditLog.groupBy({ by: ['entity'], orderBy: { entity: 'asc' } }),
    ]);
    const page = rows.slice(0, take);
    const ids = [...new Set(page.map((a) => a.actorId).filter((n): n is number => n != null))];
    const people = ids.length
      ? await prisma.adminUser.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true, role: true } })
      : [];
    const byId = new Map(people.map((p) => [p.id, p]));
    return res.json({
      from: r.fromKey,
      to: r.toKey,
      entities: entities.map((e) => e.entity),
      rows: page.map((a) => {
        const p = a.actorId != null ? byId.get(a.actorId) : null;
        return {
          id: a.id, at: a.at, action: a.action, entity: a.entity, entityId: a.entityId, meta: a.meta,
          actor: p ? { id: p.id, name: p.name?.trim() || p.email, role: p.role } : null,
        };
      }),
      nextCursor: rows.length > take ? page[page.length - 1].id : null,
    });
  } catch (err) {
    console.error('GET /api/admin/audit-log:', err);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
