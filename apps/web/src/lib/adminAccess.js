// Which dashboard pages the signed-in person may open — the page-level half of
// access control. The levels come from GET /api/auth/me (`permissions`:
// { pageKey: 'none' | 'view' | 'act' }), set per role in Settings › Staff
// access. It only decides what the browser SHOWS; the API authorizes every
// request itself (apps/api/src/lib/auth/permissions.ts), so bypassing this
// gives an empty page, never someone else's data.

const MANAGER = ['admin', 'manager'];

// First match wins; Overview root is exact, everything else a prefix.
// `pages`: the page may open with at least View on ANY of them.
// `roles`: fixed, never part of the permission matrix.
const RULES = [
  { exact: '/admin/dashboard', pages: ['overview'] },
  { prefix: '/admin/dashboard/pos', pages: ['pos'] },
  // Staff's own numbers and salary; managers use Reports → Employees.
  { prefix: '/admin/dashboard/performance', roles: ['cashier', 'waiter'] },
  { prefix: '/admin/dashboard/orders', pages: ['orders'] },
  { prefix: '/admin/dashboard/tables', pages: ['tables'] },
  { prefix: '/admin/dashboard/customers', pages: ['customers'] },
  // Opening one sale: Orders, or Sales history for everyone but waiters (the API agrees).
  { prefix: '/admin/dashboard/sales/', pages: ['orders', 'sales'], notWaiterUnless: 'orders' },
  { prefix: '/admin/dashboard/sales', pages: ['sales'] },
  { prefix: '/admin/dashboard/cash', pages: ['cash'] },
  { prefix: '/admin/dashboard/expenses', pages: ['expenses'] },
  { prefix: '/admin/dashboard/menu-items', pages: ['menu'] },
  { prefix: '/admin/dashboard/categories', pages: ['categories', 'tags'] },
  { prefix: '/admin/dashboard/inventory', pages: ['inventory'] },
  { prefix: '/admin/dashboard/users', pages: ['staff', 'payroll'] },
  { prefix: '/admin/dashboard/reports', pages: ['reports'] },
  // Staff access + Audit log: admin and manager always, so nobody can lock
  // the manager out of the screen that grants access.
  { prefix: '/admin/dashboard/settings/access', roles: MANAGER },
  { prefix: '/admin/dashboard/settings/audit', roles: MANAGER },
  { prefix: '/admin/dashboard/settings', pages: ['settings'] },
];

/** A role's level on one page ('none' | 'view' | 'act'). The admin has everything. */
export function levelOf(perms, role, page) {
  if (role === 'admin') return 'act';
  return perms?.[page] || 'none';
}

export const canSee = (perms, role, page) => levelOf(perms, role, page) !== 'none';

function allowedBy(rule, role, perms) {
  if (rule.roles) return rule.roles.includes(role);
  if (rule.notWaiterUnless && role === 'waiter') return canSee(perms, role, rule.notWaiterUnless);
  return rule.pages.some((p) => canSee(perms, role, p));
}

// Where someone lands when bounced off a page they can't see: the first page
// they can open, in sidebar order.
const HOMES = [
  ['overview', '/admin/dashboard'],
  ['pos', '/admin/dashboard/pos'],
  ['orders', '/admin/dashboard/orders'],
  ['sales', '/admin/dashboard/sales'],
];
export function homeFor(role, perms) {
  const hit = HOMES.find(([page]) => canSee(perms, role, page));
  if (hit) return hit[1];
  if (role === 'cashier' || role === 'waiter') return '/admin/dashboard/performance';
  return '/admin/dashboard/pos';
}

// Nobody is bounced off their own home page — that stops a redirect loop for
// an unexpected role (it then sees an empty page, because the API refuses its data).
export function canView(pathname, role, perms) {
  const rule = RULES.find((r) => (r.exact ? pathname === r.exact : pathname.startsWith(r.prefix)));
  const ok = rule ? allowedBy(rule, role, perms) : MANAGER.includes(role);
  return ok || pathname === homeFor(role, perms);
}
