'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import AdminProviders from '@/app/admin/providers';
import ConnectionBanner from '@/components/admin/ConnectionBanner';
import GlobalSearch from '@/components/admin/GlobalSearch';
import { canSee, canView, homeFor } from '@/lib/adminAccess';
import { AccessContext } from '@/hooks/useAccess';
import useNavCounts from '@/hooks/useNavCounts';
import useLiveOrders from '@/hooks/useLiveOrders';
import useConfirm from '@/hooks/useConfirm';
import { Icon, IconButton, Button, Popover, useBreakpoint, cx } from '@/components/admin/ui';

// Sidebar (docs/admin-design-system.md §11). `page` is the permission key
// (Settings › Staff access decides who sees it); `roles` is a fixed rule
// outside the matrix. The API enforces both. Every entry is one link — pages
// with sections have their own tabs; Settings' four sections are a left menu
// inside the page. Sell / Money / Menu / Back office groups fold open/closed.
const MANAGER = ['admin', 'manager'];
const D = '/admin/dashboard';
const NAV = [
  { group: 'Home', items: [
    { id: 'overview', icon: 'overview', label: 'Overview', href: D, exact: true, page: 'overview' },
    // Staff's own numbers + salary; managers read the Employee report instead.
    { id: 'performance', icon: 'performance', label: 'My Performance', href: `${D}/performance`, roles: ['cashier', 'waiter'] },
  ]},
  { group: 'Sell', fold: 'sell', items: [
    { id: 'pos', icon: 'pos', label: 'Register', href: `${D}/pos`, page: 'pos' },
    { id: 'orders', icon: 'orders', label: 'Orders', href: `${D}/orders`, page: 'orders', badge: 'orders' },
    { id: 'tables', icon: 'tables', label: 'Tables', href: `${D}/tables`, page: 'tables', badge: 'tables' },
  ]},
  { group: 'Money', fold: 'money', items: [
    { id: 'sales', icon: 'sales', label: 'Sales history', href: `${D}/sales`, page: 'sales' },
    { id: 'cash', icon: 'cash', label: 'Cash & accounts', href: `${D}/cash`, page: 'cash', badge: 'cash' },
    { id: 'customers', icon: 'customers', label: 'Customers', href: `${D}/customers`, page: 'customers' },
    { id: 'expenses', icon: 'expenses', label: 'Expenses', href: `${D}/expenses`, page: 'expenses' },
  ]},
  { group: 'Menu', fold: 'menu', items: [
    { id: 'menu-items', icon: 'menu', label: 'Menu items', href: `${D}/menu-items`, page: 'menu' },
    { id: 'categories', icon: 'categories', label: 'Categories & tags', href: `${D}/categories`, page: ['categories', 'tags'] },
  ]},
  { group: 'Back office', fold: 'back', items: [
    { id: 'inventory', icon: 'inventory', label: 'Inventory', href: `${D}/inventory`, page: 'inventory', badge: 'inventory' },
    { id: 'staff', icon: 'staff', label: 'Staff & payroll', href: `${D}/users`, page: ['staff', 'payroll'] },
  ]},
  { group: 'Insights', items: [
    { id: 'reports', icon: 'reports', label: 'Reports', href: `${D}/reports`, page: 'reports' },
  ]},
  { group: 'System', items: [
    { id: 'settings', icon: 'settings', label: 'Settings', href: `${D}/settings`, page: 'settings', orRoles: MANAGER },
  ]},
];

// Topbar crumb + title, first prefix match wins (most specific first).
const TITLES = [
  [`${D}/performance`, 'Home', 'My Performance'],
  [`${D}/pos`, 'Sell', 'Register'],
  [`${D}/orders`, 'Sell', 'Orders'],
  [`${D}/tables`, 'Sell', 'Tables'],
  [`${D}/sales`, 'Money', 'Sales history'],
  [`${D}/cash`, 'Money', 'Cash & accounts'],
  [`${D}/customers`, 'Money', 'Customers & invoices'],
  [`${D}/expenses`, 'Money', 'Expenses & suppliers'],
  [`${D}/menu-items`, 'Menu', 'Menu items'],
  [`${D}/categories`, 'Menu', 'Categories & tags'],
  [`${D}/inventory`, 'Back office', 'Inventory'],
  [`${D}/users`, 'Back office', 'Staff & payroll'],
  [`${D}/reports`, 'Insights', 'Reports'],
  [`${D}/settings`, 'System', 'Settings'],
];
const titleFor = (p) => (p === D ? ['Home', 'Overview'] : (TITLES.find(([k]) => p === k || p.startsWith(`${k}/`)) || [null, '', '']).slice(1));

const FOLD_KEY = 'mq-nav-groups';
const FOLD_DEFAULT = { sell: true, money: true, menu: false, back: false };

function initials(s) {
  if (!s) return 'MP';
  const parts = s.trim().split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || s.slice(0, 2).toUpperCase();
}

function Badge({ kind, n }) {
  if (!n) return null;
  const cls = {
    orders: 'bg-mq-warn-solid text-white',
    tables: 'bg-mq-chip text-mq-chip-ink',
    inventory: 'bg-mq-warn-bg text-mq-warn-ink',
  }[kind];
  return <span className={cx('ml-auto font-mq-mono text-[11px] font-semibold rounded-full px-[7px] py-px min-w-[18px] text-center tabular-nums', cls)}>{n}</span>;
}

function LogoTile({ size = 30, img = 22 }) {
  return (
    <span className="grid place-items-center bg-white border border-mq-line rounded-[9px] overflow-hidden flex-none" style={{ width: size, height: size }}>
      <Image src="/admin/logo-icon.png" alt="Maqaaxi Pos" width={img} height={img} className="object-contain" style={{ width: img, height: img }} priority />
    </span>
  );
}

function DashboardLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const bp = useBreakpoint();
  const phone = bp === 'phone';
  const touch = bp !== 'desktop';
  const [navOpen, setNavOpen] = useState(bp === 'desktop');
  const [me, setMe] = useState(null);
  const [folds, setFolds] = useState(FOLD_DEFAULT);
  const { confirm, dialog } = useConfirm();

  // Each band starts in its designed state: full sidebar on desktop, the icon
  // rail on narrow/tablet, a closed drawer on phones.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on band change only
  useEffect(() => { setNavOpen(bp === 'desktop'); }, [bp]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(FOLD_KEY) || 'null');
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of a per-viewer preference
      if (saved && typeof saved === 'object') setFolds({ ...FOLD_DEFAULT, ...saved });
    } catch { /* storage unavailable: defaults */ }
  }, []);

  useEffect(() => {
    // Who is signed in decides which pages this browser may show. A missing or
    // expired session → login. The API still authorizes every request itself.
    fetch('/api/auth/me')
      .then((r) => {
        if (r.status === 401) { router.replace('/admin/login?expired=1'); return null; }
        return r.ok ? r.json() : null;
      })
      .then((d) => { if (d && d.role) setMe(d); })
      .catch(() => {});
  }, [router]); // router is stable — this still runs once

  const role = me?.role || null;
  const perms = me?.permissions || null;
  const sees = (page) => Boolean(role) && canSee(perms, role, page);
  // Badge numbers: counts only, and only the groups this role may view.
  const counts = useNavCounts({ enabled: Boolean(role) });
  const live = useLiveOrders(sees('orders'));
  // Page-level gate: content renders only once the role is known and allowed
  // here, so a forbidden page never flashes before the redirect.
  const allowed = Boolean(role) && canView(pathname, role, perms);
  useEffect(() => {
    if (role && !canView(pathname, role, perms)) router.replace(homeFor(role, perms));
  }, [role, perms, pathname, router]);

  const isActive = (item) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));
  const shows = (it) => Boolean(role) && (
    it.roles ? it.roles.includes(role) : ([].concat(it.page).some((p) => canSee(perms, role, p)) || (it.orRoles || []).includes(role))
  );
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter(shows) })).filter((g) => g.items.length);
  const badgeOf = {
    orders: counts.pending + counts.stuckPayments,
    tables: counts.openTabs,
    inventory: counts.lowStock,
  };
  const toggleFold = (k) => setFolds((f) => {
    const next = { ...f, [k]: !f[k] };
    try { localStorage.setItem(FOLD_KEY, JSON.stringify(next)); } catch { /* not remembered */ }
    return next;
  });

  const [crumb, title] = titleFor(pathname);
  const closeOnPhone = () => { if (phone) setNavOpen(false); };
  const signOut = async () => {
    const ok = await confirm({ title: 'Sign out?', body: 'You’ll need your email and password to sign back in.', confirmLabel: 'Sign out', tone: 'primary' });
    if (!ok) return;
    await fetch('/api/auth/login', { method: 'DELETE' });
    router.push('/admin/login');
  };

  // Bell: everything that wants attention, from the same counts.
  const alerts = [
    counts.stuckPayments > 0 && { key: 'stuck', tone: 'danger', n: counts.stuckPayments, label: counts.stuckPayments === 1 ? 'Online payment with no order' : 'Online payments with no order', href: `${D}/orders` },
    counts.pending > 0 && { key: 'pending', tone: 'warn', n: counts.pending, label: 'Online orders to accept', href: `${D}/orders` },
    counts.outOfStock > 0 && { key: 'out', tone: 'danger', n: counts.outOfStock, label: 'Items out of stock', href: `${D}/inventory` },
    counts.lowStock - counts.outOfStock > 0 && { key: 'low', tone: 'warn', n: counts.lowStock - counts.outOfStock, label: 'Items low on stock', href: `${D}/inventory` },
    counts.unclosedDays > 0 && { key: 'days', tone: 'warn', n: counts.unclosedDays, label: counts.unclosedDays === 1 ? 'Day not closed' : 'Days not closed', href: `${D}/cash?tab=day-close` },
    counts.openTabs > 0 && { key: 'tabs', tone: 'info', n: counts.openTabs, label: 'Unpaid tabs', href: `${D}/orders?pay=unpaid` },
  ].filter(Boolean);
  const urgent = alerts.some((a) => a.tone !== 'info');

  const navItem = (item) => {
    const on = isActive(item);
    return (
      <Link
        key={item.id}
        href={item.href}
        onClick={closeOnPhone}
        aria-current={on ? 'page' : undefined}
        className={cx(
          'flex items-center gap-2.5 px-2.5 rounded-lg text-[13.5px] transition-colors',
          touch ? 'min-h-12' : 'min-h-9',
          on ? 'bg-mq-soft text-mq-primary font-semibold' : 'text-mq-body font-medium hover:bg-mq-soft',
        )}
      >
        <Icon name={item.icon} size={17} />
        <span className="truncate">{item.label}</span>
        {item.badge === 'cash'
          ? counts.unclosedDays > 0 && <span className="ml-auto w-[7px] h-[7px] rounded-full bg-mq-warn flex-none" title={`${counts.unclosedDays} day${counts.unclosedDays === 1 ? '' : 's'} not closed`} />
          : <Badge kind={item.badge} n={badgeOf[item.badge]} />}
      </Link>
    );
  };

  const sidebar = (
    <aside
      data-admin-chrome
      className={cx(
        'flex flex-col bg-white border-r border-mq-line h-screen',
        phone ? 'fixed top-0 left-0 z-50 w-[264px] shadow-mq-nav animate-mq-in' : 'sticky top-0 w-[236px] flex-none',
      )}
    >
      <div className="flex items-center gap-2.5 px-3.5 pt-3.5 pb-3 border-b border-[#EFEFEA]">
        <LogoTile />
        <span className="flex-1 min-w-0 text-sm font-semibold tracking-[-.01em]">Maqaaxi Pos</span>
        <IconButton icon="chevLeft" label="Collapse navigation" variant="ghost" size={32} iconSize={15} onClick={() => setNavOpen(false)} />
      </div>
      <nav className="flex-1 overflow-y-auto p-2" aria-label="Main">
        {groups.map((g) => {
          const open = !g.fold || folds[g.fold] || g.items.some(isActive);
          return (
            <div key={g.group} className="flex flex-col gap-px">
              {g.fold ? (
                <button
                  type="button"
                  onClick={() => toggleFold(g.fold)}
                  aria-expanded={open}
                  className="flex items-center gap-1.5 w-full min-h-9 px-2 pt-2.5 pb-1 text-left text-[10.5px] font-semibold uppercase tracking-[.13em] text-mq-muted hover:text-mq-ink"
                >
                  {g.group}
                  <span className={cx('transition-transform duration-[180ms]', !open && '-rotate-90')}><Icon name="chevDown" size={12} stroke={2.4} /></span>
                </button>
              ) : (
                <span className="px-2 pt-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-[.13em] text-mq-muted">{g.group}</span>
              )}
              {open && g.items.map(navItem)}
            </div>
          );
        })}
      </nav>
      <div className="flex items-center gap-2.5 p-2.5 border-t border-[#EFEFEA]">
        <span className="grid place-items-center w-[30px] h-[30px] rounded-[9px] bg-mq-deep text-mq-cream text-xs font-semibold flex-none">{initials(me?.name || me?.email)}</span>
        <span className="flex flex-col min-w-0 flex-1">
          <span className="text-[13px] font-semibold truncate">{me?.name || me?.email || 'Signed in'}</span>
          <span className="text-[11.5px] text-mq-on-tint capitalize">{role || '—'}</span>
        </span>
        <IconButton icon="signOut" label="Sign out" variant="ghost" size={32} iconSize={15} onClick={signOut} />
      </div>
    </aside>
  );

  const railItems = groups.flatMap((g, gi) => [
    ...(gi > 0 ? [<span key={`d-${g.group}`} className="w-6 h-px bg-mq-line my-[3px]" aria-hidden="true" />] : []),
    ...g.items.map((item) => {
      const on = isActive(item);
      const dot = (item.badge === 'orders' && badgeOf.orders > 0) || (item.badge === 'cash' && counts.unclosedDays > 0);
      return (
        <Link
          key={item.id}
          href={item.href}
          title={item.label}
          aria-label={item.label}
          aria-current={on ? 'page' : undefined}
          className={cx('relative grid place-items-center w-[38px] h-[38px] rounded-[9px] flex-none transition-colors', on ? 'bg-mq-soft text-mq-primary' : 'text-mq-muted hover:bg-mq-chip hover:text-mq-ink')}
        >
          <Icon name={item.icon} size={18} />
          {dot && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-mq-warn ring-2 ring-white" />}
        </Link>
      );
    }),
  ]);
  const rail = (
    <aside data-admin-chrome className="sticky top-0 self-start h-screen w-[60px] flex-none flex flex-col items-center gap-1 py-2.5 bg-white border-r border-mq-line overflow-y-auto overflow-x-hidden">
      <button type="button" onClick={() => setNavOpen(true)} title="Expand navigation" aria-label="Expand navigation" className="mb-1.5 rounded-[9px] focus-visible:outline-none focus-visible:shadow-mq-focus">
        <LogoTile size={32} img={24} />
      </button>
      {railItems}
      <span className="flex-1" />
      <span className="grid place-items-center w-[30px] h-[30px] rounded-[9px] bg-mq-deep text-mq-cream text-xs font-semibold flex-none" title={me?.name || me?.email || ''}>{initials(me?.name || me?.email)}</span>
    </aside>
  );

  return (
    <div className="flex min-h-screen bg-mq-canvas font-mq text-mq-ink antialiased">
      {phone && navOpen && <div data-admin-chrome className="fixed inset-0 z-40 bg-[rgba(26,26,24,.42)]" onClick={() => setNavOpen(false)} aria-hidden="true" />}
      {(navOpen || !phone) && (navOpen ? sidebar : rail)}

      <div data-admin-main className="flex-1 min-w-0 flex flex-col">
        <header data-admin-chrome className="sticky top-0 z-20 flex items-center gap-3 min-h-[60px] px-3 tab:px-5 py-2.5 bg-[rgba(244,244,242,.88)] backdrop-blur-[10px] backdrop-saturate-150 border-b border-mq-line">
          {phone && <IconButton icon="menuLines" label="Menu" onClick={() => setNavOpen(true)} />}
          <div className="flex-1 min-w-0 overflow-hidden">
            {crumb && <div className="text-[10.5px] font-semibold uppercase tracking-[.12em] text-mq-muted truncate">{crumb}</div>}
            <div className="text-lg font-semibold tracking-[-.02em] leading-tight truncate">{title}</div>
          </div>
          {live && (
            <span className="max-desk:hidden inline-flex items-center gap-[7px] h-8 px-[11px] rounded-full border border-mq-ok-line bg-mq-ok-bg text-xs font-semibold text-mq-ok-ink whitespace-nowrap flex-none">
              <span className="w-1.5 h-1.5 rounded-full bg-mq-ok animate-mq-pulse motion-reduce:animate-none" />Live
            </span>
          )}
          <GlobalSearch />
          <Popover
            align="right"
            width={300}
            trigger={({ open, toggle }) => (
              <IconButton icon="bell" label={alerts.length ? `Notifications (${alerts.length})` : 'Notifications'} onClick={toggle} aria-expanded={open} iconSize={17}>
                {urgent && <span className="absolute top-[7px] right-2 w-[7px] h-[7px] rounded-full bg-mq-danger ring-2 ring-white" />}
              </IconButton>
            )}
          >
            {({ close }) => (
              <div>
                <div className="px-2.5 pt-1.5 pb-2 text-[10.5px] font-semibold uppercase tracking-[.12em] text-mq-muted">Needs attention</div>
                {alerts.length === 0 && <div className="px-2.5 pb-3 text-[13px] text-mq-muted">All clear — nothing waiting.</div>}
                {alerts.map((a) => (
                  <Link key={a.key} href={a.href} onClick={close} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-mq-canvas text-[13.5px] text-mq-ink">
                    <span className={cx('w-2 h-2 rounded-full flex-none', { danger: 'bg-mq-danger', warn: 'bg-mq-warn', info: 'bg-mq-info' }[a.tone])} />
                    <span className="flex-1 min-w-0">{a.label}</span>
                    <span className="font-mq-mono text-xs font-semibold tabular-nums text-mq-muted">{a.n}</span>
                  </Link>
                ))}
              </div>
            )}
          </Popover>
          {sees('pos') && !pathname.startsWith(`${D}/pos`) && (
            <Button href={`${D}/pos`} variant="primary" size="sm" icon="plus" aria-label="New order" className="max-desk:w-9 max-desk:px-0">
              <span className="max-desk:hidden">New order</span>
            </Button>
          )}
        </header>

        <main className="flex-1 min-w-0">
          <AccessContext.Provider value={{ role, permissions: perms }}>
            {allowed ? children : null}
          </AccessContext.Provider>
        </main>
      </div>
      {dialog}
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
