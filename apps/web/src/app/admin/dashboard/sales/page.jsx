'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import SaleDrawer from '@/components/admin/orders/SaleDrawer';
import { payPill } from '@/components/admin/orders/orderUi';
import {
  Page, Toolbar, Card, CardHeader, CountPill, Chip, Kpi, KpiGrid, KpiSkeletons, Segmented, SearchInput,
  Table, Th, Td, Tr, TotalRow, EmptyRow, LoadMoreBar, RowSkeletons, ErrorState,
} from '@/components/admin/ui';
import {
  ActiveFilters, ChannelSelect, ExportBar, FilterSelect, FiltersButton, PeriodPicker, PrintHead, ReportPrintCss,
  labelOf, money, num, useAccountOptions, useReportParams,
} from '@/components/admin/reports/ReportKit';

const API = '/api/admin/sales';
const FILTERS = ['q', 'status', 'staffId', 'waiterId', 'account', 'channel', 'view'];
const COLS = 8;
const when = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const whereOf = (o) => (o.tableNumber ? `Table ${o.tableNumber}` : o.customer || (o.orderType === 'delivery' ? 'Delivery' : 'Walk-in'));
const plural = (n, one, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;
const VIEWS = [{ value: 'sales', label: 'Sales' }, { value: 'items', label: 'Items sold' }];
// "Completed" (not "Paid"): On-account sales count as sales but aren't paid yet.
const STATUSES = [{ value: 'all', label: 'All' }, { value: 'completed', label: 'Completed' }, { value: 'voided', label: 'Voided' }];

/**
 * Money › Sales history — every closed sale, searchable by order ID, receipt #,
 * customer or table, with the report filters, and the items sold across the
 * same sales (?view=items). Cashiers use it to find and reprint any sale (the
 * drawer). Everyone allowed on the page gets the same view — KPI strip, total
 * in view, filters and exports; a waiter's view is only their own sales (the
 * API enforces it) and opening one follows the Orders permission.
 * Filters live in the URL, so a view can be shared and the full sale page
 * (?back=) returns to it. Cursor paging (Load more), never numbered pages.
 */
function SalesHistory() {
  const sp = useSearchParams();
  const { preset, range, filters, set, query } = useReportParams('today', FILTERS);
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => fetchJson('/api/auth/me'), staleTime: 5 * 60 * 1000 });
  const isWaiter = me?.role === 'waiter';
  const itemsView = filters.view === 'items';
  const status = filters.status || 'completed';
  const [openId, setOpenId] = useState(null);

  // Search box: type freely, the URL (and the request) follows 300ms later.
  const [term, setTerm] = useState(filters.q || '');
  useEffect(() => {
    const t = setTimeout(() => { if ((filters.q || '') !== term.trim()) set({ q: term.trim() }); }, 300);
    return () => clearTimeout(t);
  }, [term, filters.q, set]);

  const { data: cashierList = [] } = useQuery({ queryKey: ['sales-cashiers'], queryFn: () => fetchJson(`${API}/cashiers`), enabled: !!me, staleTime: 60 * 1000 });
  const { data: waiterList = [] } = useQuery({ queryKey: ['pos-waiters'], queryFn: () => fetchJson('/api/admin/waiters?active=1'), enabled: !!me && !isWaiter });
  const accounts = useAccountOptions();
  const opt = (u) => ({ value: String(u.id), label: u.name || u.email });
  const cashiers = cashierList.map(opt);
  const waiters = waiterList.map(opt);

  // The API query: everything but the view switch.
  const apiQuery = (() => { const p = new URLSearchParams(query); p.delete('view'); return p.toString(); })();
  // The list runs in both views (it carries the KPI summary).
  const list = useInfiniteQuery({
    queryKey: ['sales', apiQuery],
    queryFn: ({ pageParam }) => fetchJson(`${API}?${apiQuery}&limit=50${pageParam ? `&cursor=${pageParam}` : ''}`),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: !!me,
  });
  const sold = useQuery({
    queryKey: ['sales-items', apiQuery],
    queryFn: () => fetchJson(`${API}/items?${apiQuery}`),
    enabled: !!me && itemsView,
  });
  const rows = list.data?.pages.flatMap((p) => p.rows) ?? [];
  const summary = list.data?.pages[0]?.summary;
  const back = sp.toString() ? `?back=${encodeURIComponent(`?${sp.toString()}`)}` : '';
  const saleHref = (id) => `/admin/dashboard/sales/${id}${back}`;
  const exportBase = itemsView ? `${API}/items?${apiQuery}` : `${API}?${apiQuery}`;
  const exportLinks = {
    excel: `${exportBase}&format=xlsx`,
    csv: [{ label: itemsView ? 'Items sold' : 'Every sale in view', href: `${exportBase}&format=csv` }],
  };

  const labelIn = (list_, v) => list_.find((o) => o.value === v)?.label;
  const active = [
    filters.staffId && { key: 'staffId', label: `Cashier: ${labelIn(cashiers, filters.staffId) || '…'}`, onRemove: () => set({ staffId: '' }) },
    filters.waiterId && { key: 'waiterId', label: `Served by: ${labelIn(waiters, filters.waiterId) || '…'}`, onRemove: () => set({ waiterId: '' }) },
    filters.account && { key: 'account', label: `Account: ${labelIn(accounts, filters.account) || filters.account}`, onRemove: () => set({ account: '' }) },
    filters.channel && { key: 'channel', label: `Channel: ${labelOf('channel', filters.channel)}`, onRemove: () => set({ channel: '' }) },
  ].filter(Boolean);
  const clearFilters = () => set({ staffId: '', waiterId: '', account: '', channel: '' });

  const emptyText = filters.q
    ? `No ${itemsView ? 'items in sales' : 'sale'} matching “${filters.q}” in this range.`
    : status === 'voided' ? `No voided sales in this range.` : itemsView ? 'No items sold in this range.' : 'No sales in this range.';

  return (
    <Page>
      <ReportPrintCss />
      {(list.isLoading || !summary ? (list.isError ? null : <KpiSkeletons count={4} min={210} />) : (
        <KpiGrid min={210}>
          <Kpi label="Sales in view" value={money(summary.sales.total)} foot={`${plural(summary.sales.count, 'sale')} · ${num(summary.voided.count)} voided`} />
          <Kpi label="On account" value={money(summary.onAccount.total)} foot={`${plural(summary.onAccount.count, 'sale')} owed by customers`} />
          <Kpi label="Items sold" value={num(summary.itemsSold)} foot={`across ${plural(summary.dishes, 'dish', 'dishes')}`} />
          <Kpi
            label="Voided"
            value={money(summary.voided.total)}
            foot={`${plural(summary.voided.count, 'sale')}${summary.sales.total > 0 ? ` · ${((summary.voided.total / summary.sales.total) * 100).toFixed(1)}% of takings` : ''}`}
          />
        </KpiGrid>
      ))}

      <Toolbar className="rpt-noprint">
        <PeriodPicker preset={preset} range={range} set={set} />
      </Toolbar>
      <Toolbar className="rpt-noprint">
        <Segmented label="Show" options={VIEWS} value={itemsView ? 'items' : 'sales'} onChange={(v) => set({ view: v === 'items' ? 'items' : '' })} />
        <Segmented label="Which sales" options={STATUSES} value={status} onChange={(v) => set({ status: v === 'completed' ? '' : v })} />
        <SearchInput
          className="flex-[1_1_220px] h-[38px]"
          value={term}
          onChange={setTerm}
          placeholder="Order ID, receipt #, customer, phone or table"
          aria-label="Search sales"
          maxLength={80}
        />
        <FiltersButton active={active.length} onClear={clearFilters}>
          <FilterSelect label="Cashier" value={filters.staffId} options={cashiers} onChange={(v) => set({ staffId: v })} />
          {!isWaiter && <FilterSelect label="Served by" value={filters.waiterId} options={waiters} onChange={(v) => set({ waiterId: v })} />}
          <FilterSelect label="Account" value={filters.account} options={accounts} onChange={(v) => set({ account: v })} />
          <ChannelSelect value={filters.channel} onChange={(v) => set({ channel: v })} />
        </FiltersButton>
        <ExportBar {...exportLinks} />
      </Toolbar>
      <ActiveFilters items={active} onClear={clearFilters} />

      <PrintHead title={itemsView ? 'Sales history · Items sold' : 'Sales history'} range={range} preset={preset} filters={{
        Search: filters.q ? `“${filters.q}”` : '',
        Status: labelOf('status', filters.status),
        Cashier: labelIn(cashiers, filters.staffId),
        'Served by': labelIn(waiters, filters.waiterId),
        Account: labelIn(accounts, filters.account),
        Channel: labelOf('channel', filters.channel),
      }} />

      {itemsView ? (
        <Card className="overflow-hidden">
          <CardHeader
            title={`Items sold${sold.data ? ` · ${plural(sold.data.units, 'unit')}` : ''}`}
            actions={sold.data ? <CountPill>{plural(sold.data.items.length, 'dish', 'dishes')}</CountPill> : null}
          />
          {sold.isError ? (
            <div className="p-4"><ErrorState error={sold.error} onRetry={() => sold.refetch()} /></div>
          ) : sold.isLoading || !me ? <RowSkeletons rows={6} /> : (
            <Table maxH={460} label="Items sold">
              <thead><tr><Th>Item</Th><Th align="right">Qty</Th><Th align="right">Sales</Th></tr></thead>
              <tbody>
                {!sold.data.items.length ? <EmptyRow cols={3}>{emptyText}</EmptyRow> : sold.data.items.map((it) => (
                  <Tr key={it.name}><Td strong>{it.name}</Td><Td money>{num(it.qty)}</Td><Td money>{money(it.total)}</Td></Tr>
                ))}
              </tbody>
              {sold.data.items.length > 0 && (
                <tfoot><TotalRow><Td>Total</Td><Td money>{num(sold.data.units)}</Td><Td money>{money(sold.data.total)}</Td></TotalRow></tfoot>
              )}
            </Table>
          )}
          <p className="m-0 px-4 py-2.5 border-t border-mq-line bg-mq-cream rounded-b-xl text-xs text-mq-muted">Item prices before any order discount or delivery fee.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader
            title="Sales"
            actions={summary ? <CountPill>{plural(summary.count, 'sale')}</CountPill> : null}
          />
          {list.isError ? (
            <div className="p-4"><ErrorState error={list.error} onRetry={() => list.refetch()} /></div>
          ) : list.isLoading || !me ? <RowSkeletons rows={6} /> : (
            <Table maxH={480} minW={900} label="Sales">
              <thead>
                <tr>
                  <Th>Order ID</Th><Th>Receipt</Th><Th>Closed</Th><Th>Customer / table</Th><Th>Status</Th><Th>Served by</Th><Th>Account</Th><Th align="right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? <EmptyRow cols={COLS}>{emptyText}</EmptyRow> : rows.map((o) => {
                  const off = o.status === 'voided' || o.status === 'declined';
                  // Same chip as Orders (Paid · On account · Refunded); a voided/declined sale says so instead.
                  const pay = off ? { tone: 'off', label: o.status === 'declined' ? 'Declined' : 'Voided' } : payPill(o);
                  return (
                    <Tr
                      key={o.id}
                      dim={off}
                      selected={openId === o.id}
                      onClick={isWaiter ? undefined : () => setOpenId(o.id)}
                      label={isWaiter ? undefined : `Open sale ${o.code}`}
                    >
                      <Td mono className="text-mq-ink font-medium whitespace-nowrap">{o.code}</Td>
                      <Td mono>{o.receiptNo ?? '—'}</Td>
                      <Td className="whitespace-nowrap">{when(o.closedAt)}</Td>
                      <Td>{whereOf(o)}</Td>
                      <Td><Chip tone={pay.tone} small strike={off}>{pay.label}</Chip></Td>
                      <Td>{o.waiter || '—'}</Td>
                      <Td>{o.accountLabel}</Td>
                      <Td money className={off ? 'line-through !text-mq-muted' : undefined}>{money(o.total)}</Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          )}
          {!list.isLoading && !list.isError && (
            <LoadMoreBar
              shown={rows.length}
              total={summary?.count}
              hasMore={!!list.hasNextPage}
              loading={list.isFetchingNextPage}
              onMore={() => list.fetchNextPage()}
              noun={summary?.count === 1 || (!summary && rows.length === 1) ? 'sale' : 'sales'}
            />
          )}
        </Card>
      )}

      {!isWaiter && (
        <SaleDrawer orderId={openId} onClose={() => setOpenId(null)} href={openId != null ? saleHref(openId) : undefined} />
      )}
    </Page>
  );
}

export default function SalesHistoryPage() {
  return <Suspense fallback={<RowSkeletons rows={6} />}><SalesHistory /></Suspense>;
}
