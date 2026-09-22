'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import useStaffList from '@/hooks/useStaffList';
import { RowsSkeleton } from '@/components/admin/Skeletons';
import {
  Card, ChannelSelect, Empty, ErrorNote, FilterSelect, FiltersButton, PeriodPicker, PrintHead, ReportPrintCss, Toolbar, labelOf, money, num, useReportParams,
} from '@/components/admin/reports/ReportKit';

const API = '/api/admin/sales';
const FILTERS = ['q', 'status', 'staffId', 'waiterId', 'account', 'channel'];
const MANAGER = ['admin', 'manager'];
const when = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const whereOf = (o) => (o.tableNumber ? `Table ${o.tableNumber}` : o.customer || (o.orderType === 'delivery' ? 'Delivery' : 'Walk-in'));

/**
 * POS › Sales history — every closed sale, searchable by order ID, receipt #,
 * customer or table, with the report filters, and the items sold across the
 * same sales (?view=items). Cashiers use it to find and reprint any sale;
 * waiters see only their own sales (the API enforces it) and can't open one;
 * managers also see the total in view and CSV (busy hours: Sales report). Filters live in the
 * URL, so a view can be shared and the way back from a sale returns to it.
 */
function SalesHistory() {
  const router = useRouter();
  const sp = useSearchParams();
  const { preset, range, filters, set, query } = useReportParams('today', FILTERS);
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => fetchJson('/api/auth/me'), staleTime: 5 * 60 * 1000 });
  const isManager = MANAGER.includes(me?.role);
  const isWaiter = me?.role === 'waiter';
  const itemsView = sp.get('view') === 'items';

  // Search box: type freely, the URL (and the request) follows 300ms later.
  const [term, setTerm] = useState(filters.q || '');
  useEffect(() => {
    const t = setTimeout(() => { if ((filters.q || '') !== term.trim()) set({ q: term.trim() }); }, 300);
    return () => clearTimeout(t);
  }, [term, filters.q, set]);

  const { staff } = useStaffList({ enabled: isManager });
  const { data: waiterList = [] } = useQuery({ queryKey: ['pos-waiters'], queryFn: () => fetchJson('/api/admin/waiters?active=1'), enabled: !!me && !isManager && !isWaiter });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => fetchJson('/api/admin/settings'), staleTime: 5 * 60 * 1000 });
  const opt = (u) => ({ value: String(u.id), label: u.name || u.email });
  const cashiers = staff.filter((u) => u.role !== 'waiter' && u.role !== 'user').map(opt);
  const waiters = isManager ? staff.filter((u) => u.role === 'waiter').map(opt) : waiterList.map(opt);
  const accounts = useMemo(() => [
    { value: 'cash', label: 'Cash' }, { value: 'card', label: 'Card' },
    ...(settings?.paymentAccounts || []).map((a) => ({ value: `acct:${a.label}`, label: a.label })),
    { value: 'invoice', label: 'On account' },
  ], [settings]);

  const list = useInfiniteQuery({
    queryKey: ['sales', query],
    queryFn: ({ pageParam }) => fetchJson(`${API}?${query}&limit=50${pageParam ? `&cursor=${pageParam}` : ''}`),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: !!me && !itemsView,
  });
  const sold = useQuery({
    queryKey: ['sales-items', query],
    queryFn: () => fetchJson(`${API}/items?${query}`),
    enabled: !!me && itemsView,
  });
  const rows = list.data?.pages.flatMap((p) => p.rows) ?? [];
  const summary = list.data?.pages[0]?.summary;
  const voided = filters.status === 'voided';
  const saleHref = (id) => `/admin/dashboard/sales/${id}${sp.toString() ? `?back=${encodeURIComponent(`?${sp.toString()}`)}` : ''}`;
  const exports = isManager ? [{ label: 'Every sale in view (CSV)', href: `${API}?${query}&format=csv` }] : [];

  return (
    <div className="sh">
      <Toolbar exports={itemsView ? [] : exports}>
        <div className="seg sh-view" role="group" aria-label="Show">
          <button type="button" className={!itemsView ? 'active' : ''} aria-pressed={!itemsView} onClick={() => set({ view: '' })}>Sales</button>
          <button type="button" className={itemsView ? 'active' : ''} aria-pressed={itemsView} onClick={() => set({ view: 'items' })}>Items sold</button>
        </div>
        <label className="search sh-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Order ID, receipt #, customer, phone or table" aria-label="Search sales" maxLength={80} />
        </label>
        <PeriodPicker preset={preset} range={range} set={set} />
        <div className="seg sh-status" role="group" aria-label="Which sales">
          <button type="button" className={!voided ? 'active' : ''} onClick={() => set({ status: '' })}>Completed</button>
          <button type="button" className={voided ? 'active' : ''} onClick={() => set({ status: 'voided' })}>Voided</button>
        </div>
        <FiltersButton active={['staffId', 'waiterId', 'account', 'channel'].filter((k) => filters[k]).length} onClear={() => set({ staffId: '', waiterId: '', account: '', channel: '' })}>
          {isManager && <FilterSelect label="Cashier" value={filters.staffId} options={cashiers} onChange={(v) => set({ staffId: v })} />}
          {!isWaiter && <FilterSelect label="Served by" value={filters.waiterId} options={waiters} onChange={(v) => set({ waiterId: v })} />}
          <FilterSelect label="Account" value={filters.account} options={accounts} onChange={(v) => set({ account: v })} />
          <ChannelSelect value={filters.channel} onChange={(v) => set({ channel: v })} />
        </FiltersButton>
      </Toolbar>
      <ReportPrintCss />
      <PrintHead title={itemsView ? 'Sales history · Items sold' : 'Sales history'} range={range} preset={preset} filters={{
        Search: filters.q ? `“${filters.q}”` : '',
        Status: labelOf('status', filters.status),
        Cashier: cashiers.find((o) => o.value === filters.staffId)?.label,
        'Served by': waiters.find((o) => o.value === filters.waiterId)?.label,
        Account: accounts.find((o) => o.value === filters.account)?.label,
        Channel: labelOf('channel', filters.channel),
      }} />
      {!itemsView && list.isError && <ErrorNote error={list.error} />}
      {itemsView && sold.isError && <ErrorNote error={sold.error} />}

      {itemsView ? (
        <Card flush title={`Items sold${sold.data ? ` · ${num(sold.data.units)} ${sold.data.units === 1 ? 'unit' : 'units'}` : ''}`}>
          {sold.isLoading || !me ? <RowsSkeleton className="card-pad" rows={6} /> : !sold.data?.items.length ? (
            <Empty>{filters.q ? `No items in sales matching “${filters.q}” in this range.` : voided ? 'No items in voided sales in this range.' : 'No items sold in this range.'}</Empty>
          ) : (
            <div className="table-scroll">
              <table className="table sh-items">
                <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Sales</th></tr></thead>
                <tbody>
                  {sold.data.items.map((it) => (
                    <tr key={it.name}><td className="strong">{it.name}</td><td className="num">{num(it.qty)}</td><td className="num">{money(it.total)}</td></tr>
                  ))}
                </tbody>
                <tfoot><tr><td className="strong">Total</td><td className="num strong">{num(sold.data.units)}</td><td className="num strong">{money(sold.data.total)}</td></tr></tfoot>
              </table>
            </div>
          )}
          <div className="sub sh-note">Item prices before any order discount or delivery fee.</div>
        </Card>
      ) : (<>
      {isManager && summary && (
        <div className="card card-pad sh-totals sh-top">
          <div className="eyebrow">{voided ? 'Voided in view' : 'Sales in view'}</div>
          <div className="sh-total mono">{money(summary.total)}</div>
          <div className="sub">{num(summary.count)} {summary.count === 1 ? 'sale' : 'sales'}{summary.count ? ` · avg ${money(summary.total / summary.count)}` : ''}</div>
        </div>
      )}

      <div className="card sh-list">
        {list.isLoading || !me ? <RowsSkeleton className="card-pad" rows={6} /> : rows.length === 0 ? (
          <Empty>{filters.q ? `No sale matches “${filters.q}” in this range.` : voided ? 'No voided sales in this range.' : 'No sales in this range.'}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table sh-table">
              <thead>
                <tr><th>Order ID</th><th>Receipt</th><th>Closed</th><th>Customer / table</th><th>Cashier</th><th>Served by</th><th>Account</th><th className="num">Total</th></tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id} className={isWaiter ? undefined : 'rpt-row-link'} onClick={isWaiter ? undefined : () => router.push(saleHref(o.id))}>
                    <td className="mono strong" data-l="Order">
                      {isWaiter ? o.code : <Link href={saleHref(o.id)} onClick={(e) => e.stopPropagation()}>{o.code}</Link>}
                      {o.status === 'voided' && <span className="pill pill-xs pill-rose">Voided</span>}
                      {o.status === 'declined' && <span className="pill pill-xs pill-rose">Declined</span>}
                    </td>
                    <td className="mono" data-l="Receipt">{o.receiptNo ?? '—'}</td>
                    <td data-l="Closed">{when(o.closedAt)}</td>
                    <td data-l="Customer">{whereOf(o)}</td>
                    <td data-l="Cashier">{o.cashier || (o.source === 'online' ? 'Online' : '—')}</td>
                    <td data-l="Served by">{o.waiter || '—'}</td>
                    <td data-l="Account">{o.accountLabel}</td>
                    <td className="num strong" data-l="Total">{money(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.hasNextPage && (
          <div className="card-foot">
            <button className="btn btn-ghost btn-sm" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
              {list.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </div>
      </>)}
    </div>
  );
}

export default function SalesHistoryPage() {
  return <Suspense fallback={<RowsSkeleton rows={6} />}><SalesHistory /></Suspense>;
}
