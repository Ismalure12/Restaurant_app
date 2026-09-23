// Page permissions per role (owner, 2026-09-22): for every dashboard page a
// role has 'none', 'view' (read only) or 'act' (read + change). Stored as one
// Setting row (`role_permissions`, JSON); anything missing falls back to
// DEFAULTS, which are exactly the role lists the app used before, so nothing
// changes until someone edits the matrix. The admin always has everything.
// The manager edits the cashier and waiter rows (never above their own level);
// only the admin edits the manager row.
import { z } from 'zod';
import type { Db } from '../db/prisma.js';

export const LEVELS = ['none', 'view', 'act'] as const;
export type Level = (typeof LEVELS)[number];
export const EDITABLE_ROLES = ['manager', 'cashier', 'waiter'] as const;
export type EditableRole = (typeof EDITABLE_ROLES)[number];

type PageDef = { key: string; label: string; group: string; readOnly?: boolean; defaults: Record<EditableRole, Level> };

// `readOnly` pages have nothing to change, so their highest level is 'view'.
export const PAGES: PageDef[] = [
  { key: 'overview', label: 'Overview', group: 'Home', readOnly: true, defaults: { manager: 'view', cashier: 'none', waiter: 'none' } },
  { key: 'pos', label: 'Register', group: 'Sell', defaults: { manager: 'act', cashier: 'act', waiter: 'act' } },
  { key: 'orders', label: 'Orders', group: 'Sell', defaults: { manager: 'act', cashier: 'act', waiter: 'none' } },
  { key: 'tables', label: 'Tables', group: 'Sell', defaults: { manager: 'act', cashier: 'none', waiter: 'none' } },
  { key: 'sales', label: 'Sales history', group: 'Money', readOnly: true, defaults: { manager: 'view', cashier: 'view', waiter: 'view' } },
  { key: 'cash', label: 'Cash & accounts', group: 'Money', defaults: { manager: 'act', cashier: 'none', waiter: 'none' } },
  { key: 'customers', label: 'Customers', group: 'Money', defaults: { manager: 'act', cashier: 'act', waiter: 'none' } },
  { key: 'expenses', label: 'Expenses & suppliers', group: 'Money', defaults: { manager: 'act', cashier: 'none', waiter: 'none' } },
  { key: 'menu', label: 'Menu items', group: 'Menu', defaults: { manager: 'act', cashier: 'act', waiter: 'none' } },
  { key: 'categories', label: 'Categories', group: 'Menu', defaults: { manager: 'act', cashier: 'act', waiter: 'none' } },
  { key: 'tags', label: 'Tags', group: 'Menu', defaults: { manager: 'act', cashier: 'view', waiter: 'none' } },
  { key: 'inventory', label: 'Inventory', group: 'Back office', defaults: { manager: 'act', cashier: 'view', waiter: 'none' } },
  { key: 'staff', label: 'Staff', group: 'Back office', defaults: { manager: 'act', cashier: 'none', waiter: 'none' } },
  { key: 'payroll', label: 'Payroll', group: 'Back office', defaults: { manager: 'act', cashier: 'none', waiter: 'none' } },
  { key: 'reports', label: 'Reports', group: 'Insights', defaults: { manager: 'act', cashier: 'none', waiter: 'none' } },
  { key: 'settings', label: 'Settings (General, Money)', group: 'System', defaults: { manager: 'act', cashier: 'none', waiter: 'none' } },
];
export type PageKey = string;
const PAGE = new Map(PAGES.map((p) => [p.key, p]));
export const PAGE_KEYS = PAGES.map((p) => p.key);

export const SETTING_KEY = 'role_permissions';
export type Matrix = Record<EditableRole, Record<string, Level>>;

const rank = (l: Level) => LEVELS.indexOf(l);
export const atLeast = (have: Level, need: Level) => rank(have) >= rank(need);

/** Caps a level to what the page allows ('act' on a read-only page → 'view'). */
function cap(page: string, l: Level): Level {
  return PAGE.get(page)?.readOnly && l === 'act' ? 'view' : l;
}

export function defaultMatrix(): Matrix {
  const m = { manager: {}, cashier: {}, waiter: {} } as Matrix;
  for (const p of PAGES) for (const r of EDITABLE_ROLES) m[r][p.key] = p.defaults[r];
  return m;
}

const levelSchema = z.enum(LEVELS);
// What the stored JSON / a PUT body may hold: known roles × known pages only.
export const matrixPatchSchema = z.object(
  Object.fromEntries(EDITABLE_ROLES.map((r) => [r, z.partialRecord(z.enum(PAGE_KEYS as [string, ...string[]]), levelSchema).optional()])),
).strict();

/** Stored matrix merged over the defaults. Unreadable JSON → defaults (logged). */
export function parseMatrix(raw: string | null | undefined): Matrix {
  const m = defaultMatrix();
  if (!raw) return m;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error('[permissions] role_permissions is not valid JSON, using defaults', err);
    return m;
  }
  const res = matrixPatchSchema.safeParse(parsed);
  if (!res.success) {
    console.error('[permissions] role_permissions has an unexpected shape, using defaults', res.error.issues);
    return m;
  }
  for (const r of EDITABLE_ROLES) {
    const row = (res.data as Partial<Record<EditableRole, Record<string, Level>>>)[r];
    if (row) for (const [page, l] of Object.entries(row)) m[r][page] = cap(page, l);
  }
  return m;
}

export async function loadMatrix(db: Db): Promise<Matrix> {
  const row = await db.setting.findUnique({ where: { key: SETTING_KEY } });
  return parseMatrix(row?.value);
}

/** One role's level on one page. Admin → 'act'; unknown role or page → 'none'. */
export function levelIn(m: Matrix, role: string | undefined, page: string): Level {
  if (role === 'admin') return cap(page, 'act');
  if (!PAGE.has(page) || !(EDITABLE_ROLES as readonly string[]).includes(role ?? '')) return 'none';
  return m[role as EditableRole][page] ?? 'none';
}

/** Every page's level for one role (what /auth/me hands the dashboard). */
export function pagesFor(m: Matrix, role: string | undefined): Record<string, Level> {
  return Object.fromEntries(PAGES.map((p) => [p.key, levelIn(m, role, p.key)]));
}

/** Which role rows `editor` may change: admin → all three, manager → cashier + waiter. */
export function editableRowsFor(editorRole: string | undefined): EditableRole[] {
  if (editorRole === 'admin') return [...EDITABLE_ROLES];
  if (editorRole === 'manager') return ['cashier', 'waiter'];
  return [];
}

/**
 * Applies a patch for `editorRole`. Returns the new matrix, or an error when the
 * patch touches a row the editor can't change, or (manager) grants a level above
 * the manager's own on that page.
 */
export function applyPatch(current: Matrix, patch: Partial<Record<EditableRole, Record<string, Level>>>, editorRole: string | undefined):
  { matrix: Matrix; error?: undefined } | { error: string; matrix?: undefined } {
  const rows = editableRowsFor(editorRole);
  const next: Matrix = { manager: { ...current.manager }, cashier: { ...current.cashier }, waiter: { ...current.waiter } };
  for (const r of EDITABLE_ROLES) {
    const row = patch[r];
    if (!row) continue;
    if (!rows.includes(r)) return { error: `You can't change the ${r} permissions` };
    for (const [page, l] of Object.entries(row)) {
      const level = cap(page, l);
      if (editorRole !== 'admin' && !atLeast(levelIn(current, editorRole, page), level)) {
        return { error: `You can't give ${r}s more access to ${PAGE.get(page)?.label ?? page} than you have` };
      }
      next[r][page] = level;
    }
  }
  return { matrix: next };
}

/** Only what differs from the defaults is stored (so new defaults still apply). */
export function diffFromDefaults(m: Matrix): Partial<Matrix> {
  const d = defaultMatrix();
  const out: Partial<Matrix> = {};
  for (const r of EDITABLE_ROLES) {
    const row = Object.fromEntries(Object.entries(m[r]).filter(([p, l]) => d[r][p] !== l));
    if (Object.keys(row).length) out[r] = row;
  }
  return out;
}
