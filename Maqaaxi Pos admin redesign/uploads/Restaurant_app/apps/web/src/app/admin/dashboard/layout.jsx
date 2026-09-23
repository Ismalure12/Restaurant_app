'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import AdminProviders from '@/app/admin/providers';
import ConnectionBanner from '@/components/admin/ConnectionBanner';
import GlobalSearch from '@/components/admin/GlobalSearch';
import { canSee, canView, homeFor } from '@/lib/adminAccess';
import { AccessContext } from '@/hooks/useAccess';
import useOrderCounts from '@/hooks/useOrderCounts';
import useLiveOrders from '@/hooks/useLiveOrders';
import '@/app/admin/jazeera.css';

const I = {
  overview: (<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>),
  pos: (<><rect x="4" y="3" width="16" height="18" rx="2" /><rect x="7" y="6" width="10" height="4" rx="1" /><path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01M16 17h.01" /></>),
  sales: (<><path d="M4 2v20l2-1.5L8 22l2-1.5L12 22l2-1.5L16 22l2-1.5L20 22V2l-2 1.5L16 2l-2 1.5L12 2l-2 1.5L8 2 6 3.5z" /><path d="M8 8h8M8 12h8M8 16h5" /></>),
  tables: (<><rect x="3" y="9" width="18" height="4" rx="1.5" /><path d="M6 13v7M18 13v7M9 9V5h6v4" /></>),
  orders: (<><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="2" /><path d="M9 12h6M9 16h4" /></>),
  invoices: (<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h4" /></>),
  customers: (<><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M6 16c0-1.66 1.34-3 3-3s3 1.34 3 3M14 9h4M14 13h4" /></>),
  cash: (<><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></>),
  expenses: (<><path d="M20 12V8H6a2 2 0 0 1 0-4h12v4" /><path d="M4 6v12a2 2 0 0 0 2 2h14v-4" /><path d="M18 12a2 2 0 0 0 0 4h4v-4z" /></>),
  reports: (<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 17V11M12 17V7M16 17v-4" /></>),
  performance: (<><path d="M3 3v18h18" /><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14" /></>),
  inventory: (<><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="M3.3 7L12 12l8.7-5M12 22V12" /></>),
  staff: (<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>),
  'menu-items': (<><path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z" /><path d="M6 1v3M10 1v3M14 1v3" /></>),
  categories: (<><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></>),
  settings: (<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>),
};
const svg = (k) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">{I[k]}</svg>;

// Grouped nav (docs/system-blueprint.md §2). `page` is the permission key
// (Settings › Staff access decides who sees it); `roles` is a fixed rule
// outside the matrix. The API enforces both. Every entry is one link — pages
// with sections have their own tabs — except Settings, whose four sub-pages
// share no in-page navigation, so it is a dropdown.
const MANAGER = ['admin', 'manager'];
const NAV = [
  { group: 'Home', items: [
    { id: 'overview', label: 'Overview', href: '/admin/dashboard', exact: true, page: 'overview' },
    // Staff's own numbers + salary; managers read the Employee report instead.
    { id: 'performance', label: 'My Performance', href: '/admin/dashboard/performance', roles: ['cashier', 'waiter'] },
  ]},
  { group: 'Sell', items: [
    { id: 'pos', label: 'Register', href: '/admin/dashboard/pos', page: 'pos' },
    { id: 'orders', label: 'Orders', href: '/admin/dashboard/orders', page: 'orders', badge: 'pending' },
    { id: 'tables', label: 'Tables', href: '/admin/dashboard/tables', page: 'tables' },
  ]},
  { group: 'Money', items: [
    { id: 'sales', label: 'Sales history', href: '/admin/dashboard/sales', page: 'sales' },
    { id: 'cash', label: 'Cash & accounts', href: '/admin/dashboard/cash', page: 'cash' },
    { id: 'customers', label: 'Customers', href: '/admin/dashboard/customers', page: 'customers' },
    { id: 'expenses', label: 'Expenses', href: '/admin/dashboard/expenses', page: 'expenses' },
  ]},
  { group: 'Menu', items: [
    { id: 'menu-items', label: 'Menu Items', href: '/admin/dashboard/menu-items', page: 'menu' },
    { id: 'categories', label: 'Categories & tags', href: '/admin/dashboard/categories', page: ['categories', 'tags'] },
  ]},
  { group: 'Back office', items: [
    { id: 'inventory', label: 'Inventory', href: '/admin/dashboard/inventory', page: 'inventory' },
    { id: 'staff', label: 'Staff', href: '/admin/dashboard/users', page: ['staff', 'payroll'] },
  ]},
  { group: 'Insights', items: [
    { id: 'reports', label: 'Reports', href: '/admin/dashboard/reports', page: 'reports' },
  ]},
  { group: 'System', items: [
    { id: 'settings', label: 'Settings', children: [
      { href: '/admin/dashboard/settings/general', label: 'General', page: 'settings' },
      { href: '/admin/dashboard/settings/money', label: 'Money', page: 'settings' },
      { href: '/admin/dashboard/settings/access', label: 'Staff access', roles: MANAGER },
      { href: '/admin/dashboard/settings/audit', label: 'Audit log', roles: MANAGER },
    ]},
  ]},
];

const PAGE_HEAD = {
  '/admin/dashboard': { title: 'Overview', sub: 'The business at a glance', action: { label: 'New order', href: '/admin/dashboard/pos' } },
  '/admin/dashboard/pos': { title: 'Register', sub: 'Point of sale · counter' },
  '/admin/dashboard/orders': { title: 'Orders', sub: 'Online & counter · live triage', action: { label: 'New counter order', href: '/admin/dashboard/pos' } },
  '/admin/dashboard/tables': { title: 'Tables', sub: 'Your tables and which have an unpaid tab' },
  '/admin/dashboard/sales': { title: 'Sales history', sub: 'Every sale and the items sold · search by order ID, receipt, customer or table' },
  '/admin/dashboard/cash': { title: 'Cash & accounts', sub: 'Balances, the cash book, collections and transfers' },
  '/admin/dashboard/customers': { title: 'Customers', sub: 'Accounts, invoices & balances owed' },
  '/admin/dashboard/reports/sales': { title: 'Sales report', sub: 'How much, when, how customers paid — and every dish' },
  '/admin/dashboard/reports/inventory': { title: 'Inventory report', sub: 'Purchases, usage & waste' },
  '/admin/dashboard/reports/financial': { title: 'Financial report', sub: 'Profit & loss' },
  '/admin/dashboard/reports/employees': { title: 'Employee report', sub: 'Sales, voids & edits per person' },
  '/admin/dashboard/reports': { title: 'Reports', sub: '' },
  '/admin/dashboard/performance': { title: 'My Performance', sub: 'Your numbers' },
  '/admin/dashboard/inventory': { title: 'Inventory', sub: 'Stock & movements' },
  '/admin/dashboard/expenses': { title: 'Expenses', sub: 'Costs & spending' },
  '/admin/dashboard/users': { title: 'Staff', sub: 'Team, roles & payroll' },
  '/admin/dashboard/menu-items': { title: 'Menu Items', sub: 'Dishes, options & extras' },
  '/admin/dashboard/categories': { title: 'Categories & tags', sub: 'Menu sections and the labels on dishes' },
  '/admin/dashboard/settings/general': { title: 'Settings · General', sub: 'Receipt & business details, delivery and social links' },
  '/admin/dashboard/settings/money': { title: 'Settings · Money', sub: 'Business accounts, tax, calendar & opening balances' },
  '/admin/dashboard/settings/access': { title: 'Settings · Staff access', sub: 'Which pages each role can view or change' },
  '/admin/dashboard/settings/audit': { title: 'Settings · Audit log', sub: 'Who changed what, and when' },
  '/admin/dashboard/settings': { title: 'Settings', sub: '' },
};

function initials(s) {
  if (!s) return 'MP';
  const parts = s.trim().split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || s.slice(0, 2).toUpperCase();
}

function ThemeIcon({ dark }) {
  return dark
    ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
    : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
}

function DashboardLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);
  const [me, setMe] = useState(null);
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute('data-admin', 'true');
    let stored = 'light';
    try { stored = localStorage.getItem('hj_theme') || 'light'; } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync of persisted theme on mount
    setTheme(stored);
    html.setAttribute('data-theme', stored);
    return () => { html.removeAttribute('data-admin'); html.removeAttribute('data-theme'); };
  }, []);

  useEffect(() => {
    // Who is signed in decides which pages this browser may show. A missing or
    // expired session → login. The API still authorizes every request itself.
    fetch('/api/auth/me')
      .then((r) => {
        if (r.status === 401) { router.replace('/admin/login'); return null; }
        return r.ok ? r.json() : null;
      })
      .then((d) => { if (d && d.role) setMe(d); })
      .catch(() => {});
  }, [router]); // router is stable — this still runs once

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('hj_theme', next); } catch {}
  };

  const role = me?.role || null;
  const perms = me?.permissions || null;
  // Badge numbers: counts, never the order list — for whoever may open Orders.
  // Live: an SSE nudge refetches them (and every open Orders/Tables screen)
  // the moment orders change; polling stays as the fallback.
  const seesOrders = Boolean(role) && canSee(perms, role, 'orders');
  const { pending, stuckPayments } = useOrderCounts({ enabled: seesOrders });
  useLiveOrders(seesOrders);
  // Page-level gate: content renders only once the role is known and allowed
  // here, so a forbidden page never flashes before the redirect.
  const allowed = Boolean(role) && canView(pathname, role, perms);
  useEffect(() => {
    if (role && !canView(pathname, role, perms)) router.replace(homeFor(role, perms));
  }, [role, perms, pathname, router]);
  const isActive = (item) => item.exact ? pathname === item.href : (pathname === item.href || pathname.startsWith(item.href + '/'));
  const head = PAGE_HEAD[pathname] || PAGE_HEAD[Object.keys(PAGE_HEAD).find((k) => k !== '/admin/dashboard' && pathname.startsWith(k))] || { title: '', sub: '' };

  const shows = (it) => Boolean(role) && (it.roles
    ? it.roles.includes(role)
    : [].concat(it.page).some((p) => canSee(perms, role, p)));
  const groups = NAV.map((g) => ({
    ...g,
    items: g.items
      .map((it) => (it.children ? { ...it, children: it.children.filter(shows) } : it))
      .filter((it) => (it.children ? it.children.length > 0 : shows(it))),
  })).filter((g) => g.items.length);
  // Dropdowns: explicit toggles win; otherwise a menu is open while one of its pages is showing.
  const [expanded, setExpanded] = useState({});
  const childActive = (c) => pathname === c.href || pathname.startsWith(c.href + '/');
  const menuOpen = (it) => expanded[it.id] ?? it.children.some(childActive);
  // Orders badge: online orders to decide + online payments stuck without an order.
  const badges = { pending: pending + stuckPayments };

  const handleLogout = async () => { await fetch('/api/auth/login', { method: 'DELETE' }); router.push('/admin/login'); };
  const closeNav = () => setNavOpen(false);

  return (
    <div className="jz" data-theme={theme}>
      <div className={`app${navOpen ? ' nav-open' : ''}`}>
        <div className="scrim" onClick={closeNav} />

        <aside className="side">
          <div className="side-head">
            <span className="brand-chip"><Image src="/logo-icon.png" alt="Maqaaxi Pos" width={30} height={30} style={{ width: 30, height: 30, objectFit: 'contain' }} /></span>
            <div>
              <div className="brand-name">Maqaaxi Pos</div>
            </div>
          </div>

          <div className="side-scroll">
            {groups.map((g) => (
              <div className="nav-group" key={g.group}>
                <div className="nav-label">{g.group}</div>
                {g.items.map((item) => item.children ? (
                  <div className={`nav-menu${menuOpen(item) ? ' open' : ''}`} key={item.id}>
                    <button type="button" className={`nav-link nav-parent${item.children.some(childActive) ? ' has-active' : ''}`} aria-expanded={menuOpen(item)} aria-controls={`nav-sub-${item.id}`}
                      onClick={() => setExpanded((e) => ({ ...e, [item.id]: !menuOpen(item) }))}>
                      {svg(item.id)}{item.label}
                      {!menuOpen(item) && item.children.some((c) => c.badge && badges[c.badge] > 0) && <span className="nl-badge amber">{item.children.reduce((n, c) => n + (c.badge ? badges[c.badge] : 0), 0)}</span>}
                      <svg className="nav-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m6 9 6 6 6-6" /></svg>
                    </button>
                    {menuOpen(item) && (
                      <div className="nav-sub" id={`nav-sub-${item.id}`}>
                        {item.children.map((c) => (
                          <Link key={c.href} href={c.href} onClick={closeNav} className={`nav-sublink${childActive(c) ? ' active' : ''}`} aria-current={childActive(c) ? 'page' : undefined}>
                            {c.label}
                            {c.badge && badges[c.badge] > 0 && <span className={`nl-badge${c.badge === 'pending' ? ' amber' : ''}`}>{badges[c.badge]}</span>}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <Link key={item.href} href={item.href} onClick={closeNav} className={`nav-link${isActive(item) ? ' active' : ''}`}>
                    {svg(item.id)}{item.label}
                    {item.badge && badges[item.badge] > 0 && <span className="nl-badge amber">{badges[item.badge]}</span>}
                  </Link>
                ))}
              </div>
            ))}
          </div>

          <div className="side-foot">
            <button className="side-user" onClick={handleLogout}>
              <span className="avatar">{initials(me?.name || me?.email)}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="su-nm">{me?.name || me?.email || 'Signed in'}</span>
                <span className="su-role">{role || '—'} · sign out</span>
              </span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="1.7"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
            </button>
          </div>
        </aside>

        <div className="main">
          <header className="topbar">
            <button className="icon-btn menu-btn" onClick={() => setNavOpen((v) => !v)} aria-label="Menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 12h18M3 6h18M3 18h18" /></svg></button>
            <div className="tb-head">
              <div className="tb-title">{head.title}</div>
              {head.sub && <div className="tb-sub">{head.sub}</div>}
            </div>
            <div className="tb-spacer" />
            <GlobalSearch />
            <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle theme"><ThemeIcon dark={theme === 'dark'} /></button>
            <Link className="icon-btn" href="/admin/dashboard/orders" aria-label="Orders">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
              {pending > 0 && <span className="dot-badge" />}
            </Link>
            {head.action && (
              <Link className="btn btn-primary" href={head.action.href}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 5v14M5 12h14" /></svg><span className="tb-act-l">{head.action.label}</span>
              </Link>
            )}
          </header>

          <div className={`page${(pathname.startsWith('/admin/dashboard/pos') || pathname.startsWith('/admin/dashboard/orders')) ? ' bleed' : ''}`}>
            <AccessContext.Provider value={{ role, permissions: perms }}>{allowed ? children : null}</AccessContext.Provider>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardLayoutWithProviders({ children }) {
  return (
    <AdminProviders>
      <ConnectionBanner />
      <DashboardLayout>{children}</DashboardLayout>
    </AdminProviders>
  );
}
