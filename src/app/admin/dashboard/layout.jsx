'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import AdminProviders from '@/app/admin/providers';
import '@/app/admin/jazeera.css';

const I = {
  overview: (<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>),
  pos: (<><rect x="4" y="3" width="16" height="18" rx="2" /><rect x="7" y="6" width="10" height="4" rx="1" /><path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01M16 17h.01" /></>),
  orders: (<><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="2" /><path d="M9 12h6M9 16h4" /></>),
  insights: (<><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 5-6" /></>),
  performance: (<><path d="M3 3v18h18" /><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14" /></>),
  inventory: (<><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="M3.3 7L12 12l8.7-5M12 22V12" /></>),
  staff: (<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>),
  'menu-items': (<><path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z" /><path d="M6 1v3M10 1v3M14 1v3" /></>),
  categories: (<><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></>),
  settings: (<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>),
};
const svg = (k) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">{I[k]}</svg>;

// Grouped nav matching the design IA. `roles` gates visibility; a waiter only
// sees Register + My Performance. Server enforcement lives in middleware.js.
const NAV = [
  { group: 'Main', items: [
    { id: 'overview', label: 'Overview', href: '/admin/dashboard', exact: true, roles: ['admin', 'manager', 'cashier'] },
    { id: 'pos', label: 'Register', href: '/admin/dashboard/pos', roles: ['admin', 'manager', 'cashier', 'waiter'] },
    { id: 'orders', label: 'Orders', href: '/admin/dashboard/orders', roles: ['admin', 'manager', 'cashier'], badge: 'pending' },
    { id: 'insights', label: 'Insights', href: '/admin/dashboard/insights', roles: ['admin', 'manager'] },
    { id: 'performance', label: 'My Performance', href: '/admin/dashboard/performance', roles: ['admin', 'manager', 'cashier', 'waiter'] },
  ]},
  { group: 'Operations', items: [
    { id: 'inventory', label: 'Inventory', href: '/admin/dashboard/inventory', roles: ['admin', 'manager', 'cashier'] },
    { id: 'staff', label: 'Staff', href: '/admin/dashboard/users', roles: ['admin', 'manager'] },
  ]},
  { group: 'Catalog', items: [
    { id: 'menu-items', label: 'Menu Items', href: '/admin/dashboard/menu-items', roles: ['admin', 'manager'] },
    { id: 'categories', label: 'Categories', href: '/admin/dashboard/categories', roles: ['admin', 'manager'] },
  ]},
  { group: 'System', items: [
    { id: 'settings', label: 'Settings', href: '/admin/dashboard/settings', roles: ['admin', 'manager'] },
  ]},
];

const PAGE_HEAD = {
  '/admin/dashboard': { title: 'Overview', sub: 'Live', action: { label: 'New order', href: '/admin/dashboard/pos' } },
  '/admin/dashboard/pos': { title: 'Register', sub: 'Point of sale · counter' },
  '/admin/dashboard/orders': { title: 'Orders', sub: 'Online & counter · live triage', action: { label: 'New counter order', href: '/admin/dashboard/pos' } },
  '/admin/dashboard/insights': { title: 'Insights', sub: 'Profit & operations' },
  '/admin/dashboard/performance': { title: 'My Performance', sub: 'Your numbers' },
  '/admin/dashboard/inventory': { title: 'Inventory', sub: 'Stock & movements' },
  '/admin/dashboard/users': { title: 'Staff', sub: 'Roles, shifts & sales' },
  '/admin/dashboard/menu-items': { title: 'Menu Items', sub: 'Dishes, options & extras' },
  '/admin/dashboard/categories': { title: 'Categories', sub: 'Menu sections' },
  '/admin/dashboard/settings': { title: 'Settings', sub: 'Delivery, social links & tags' },
};

function initials(s) {
  if (!s) return 'HJ';
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
  const [pending, setPending] = useState(0);

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
    fetch('/api/auth/me').then((r) => r.json()).then((d) => { if (d && d.role) setMe(d); }).catch(() => {});
    fetch('/api/admin/orders?source=online').then((r) => r.ok ? r.json() : []).then((rows) => {
      if (Array.isArray(rows)) setPending(rows.filter((o) => o.status === 'pending').length);
    }).catch(() => {});
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('hj_theme', next); } catch {}
  };

  const role = me?.role || null;
  const isActive = (item) => item.exact ? pathname === item.href : (pathname === item.href || pathname.startsWith(item.href + '/'));
  const head = PAGE_HEAD[pathname] || PAGE_HEAD[Object.keys(PAGE_HEAD).find((k) => k !== '/admin/dashboard' && pathname.startsWith(k))] || { title: '', sub: '' };

  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((it) => role && it.roles.includes(role)) })).filter((g) => g.items.length);

  const handleLogout = async () => { await fetch('/api/auth/login', { method: 'DELETE' }); router.push('/admin/login'); };
  const closeNav = () => setNavOpen(false);

  return (
    <div className="jz" data-theme={theme}>
      <div className={`app${navOpen ? ' nav-open' : ''}`}>
        <div className="scrim" onClick={closeNav} />

        <aside className="side">
          <div className="side-head">
            <span className="brand-chip"><Image src="/logo-transparent.png" alt="KFG" width={30} height={30} style={{ width: 30, height: 30, objectFit: 'contain' }} /></span>
            <div>
              <div className="brand-name">Restaurant management system</div>
            </div>
          </div>

          <div className="side-scroll">
            {groups.map((g) => (
              <div className="nav-group" key={g.group}>
                <div className="nav-label">{g.group}</div>
                {g.items.map((item) => (
                  <Link key={item.href} href={item.href} onClick={closeNav} className={`nav-link${isActive(item) ? ' active' : ''}`}>
                    {svg(item.id)}{item.label}
                    {item.badge === 'pending' && pending > 0 && <span className="nl-badge amber">{pending}</span>}
                  </Link>
                ))}
              </div>
            ))}
          </div>

          <div className="side-foot">
            <button className="side-user" onClick={toggleTheme} aria-label="Toggle theme">
              <span className="avatar" style={{ background: 'var(--surface-3)', color: 'var(--muted)' }}><ThemeIcon dark={theme === 'dark'} /></span>
              <span style={{ flex: 1 }}>
                <span style={{ fontSize: '12.5px', fontWeight: 600, display: 'block' }}>Appearance</span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{theme === 'dark' ? 'Dark' : 'Light'}</span>
              </span>
            </button>
            <button className="side-user" onClick={handleLogout}>
              <span className="avatar">{initials(me?.name || me?.email)}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: '12.5px', fontWeight: 600, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{me?.name || me?.email || 'Signed in'}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'capitalize' }}>{role || '—'} · sign out</span>
              </span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="1.7"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
            </button>
          </div>
        </aside>

        <div className="main">
          <header className="topbar">
            <button className="icon-btn menu-btn" onClick={() => setNavOpen((v) => !v)} aria-label="Menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 12h18M3 6h18M3 18h18" /></svg></button>
            <div>
              <div className="tb-title">{head.title}</div>
              {head.sub && <div className="tb-sub">{head.sub}</div>}
            </div>
            <div className="tb-spacer" />
            <div className="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg><input placeholder="Search…" /><kbd>⌘K</kbd></div>
            <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle theme"><ThemeIcon dark={theme === 'dark'} /></button>
            <Link className="icon-btn" href="/admin/dashboard/orders" aria-label="Orders">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
              {pending > 0 && <span className="dot-badge" />}
            </Link>
            {head.action && (
              <Link className="btn btn-primary" href={head.action.href}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 5v14M5 12h14" /></svg>{head.action.label}
              </Link>
            )}
          </header>

          <div className={`page${(pathname.startsWith('/admin/dashboard/pos') || pathname.startsWith('/admin/dashboard/orders')) ? ' bleed' : ''}`}>{children}</div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardLayoutWithProviders({ children }) {
  return (
    <AdminProviders>
      <DashboardLayout>{children}</DashboardLayout>
    </AdminProviders>
  );
}
