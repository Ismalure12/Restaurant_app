'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import useStaffList from '@/hooks/useStaffList';
import { Columns, Donut, Sparkline, StackBar } from '@/components/admin/reports/Charts';
import {
  ActiveFilters, ChannelSelect, ErrorNote, ExportBar, FilterSelect, FiltersButton, HourBars, PeriodPicker, PrintHead, RangeNote,
  compareLabel, comparisonRange, labelOf, money, num, useAccountOptions, useReportParams,
} from '@/components/admin/reports/ReportKit';
import {
  Alert, Button, Card, CardHeader, Delta, Icon, Kpi, KpiGrid, KpiSkeletons, ProgressBar, RowSkeletons, SearchInput,
  Skeleton, Table, Td, Th, Tr, EmptyRow, cx, selectCls,
} from '@/components/admin/ui';

const FILTERS = ['staffId', 'waiterId', 'account', 'channel'];
const API = '/api/admin/reports/sales';
const HISTORY = '/admin/dashboard/sales';
const SORTS = { revenue: 'Value', quantity: 'Quantity', name: 'Name' };
const TOPS = ['10', '20'];
const CHANNEL_COLOR = { dine_in: '#850D33', delivery: '#B06A00', online: '#1F6FB2' };
const DONUT = ['#850D33', '#1F6FB2', '#0E7C5A', '#B06A00', '#6B5CA5'];
const pct = (n) => `${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
const hh = (h) => `${String(h).padStart(2, '0')}:00`;
const dayTick = (d) => `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`;
const dayName = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const sales = (n) => `${num(n)} ${n === 1 ? 'sale' : 'sales'}`;
const compact = (n) => (Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(1)}k` : money(n));
// The dishes-table header selects: 36 high, as wide as their label (design).
const selectSm = selectCls({ size: 'sm', className: 'w-auto max-w-full text-[13px]' });

/**
 * The Sales report, one page over the period and filters: KPIs against the
 * comparison period, sales by day (by hour for one day), how customers paid,
 * busiest hours, which channel — then what sold: every dish (search / sort /
 * top-N; the Category filter narrows only this part) and the dishes that
 * never sold. Per-person totals live in the Employees report;
 * every single sale in Sales history (the links keep these filters).
 */
export default function SalesReportPage() {
  const sp = useSearchParams();
  const { preset, range, filters, set, query } = useReportParams('7d', FILTERS);
  const category = sp.get('category') || '';
  const apiQuery = category ? `${query}&category=${encodeURIComponent(category)}` : query;
  // The category narrows only `items`; summary, trend, accounts and channels ignore it.
  const { data: r, isLoading, isError, error } = useQuery({ queryKey: ['rpt-sales', apiQuery], queryFn: () => fetchJson(`${API}?${apiQuery}`) });

  const { staff } = useStaffList();
  const opt = (u) => ({ value: String(u.id), label: u.name || u.email });
  const cashiers = staff.filter((u) => u.role !== 'waiter' && u.role !== 'user').map(opt);
  const waiters = staff.filter((u) => u.role === 'waiter').map(opt);
  const accounts = useAccountOptions(r?.byAccount);
  const nameOf = (list, v) => list.find((x) => x.value === v)?.label;
  const activeFilters = FILTERS.filter((k) => filters[k]).length + (category ? 1 : 0);
  const clearFilters = () => set({ category: '', staffId: '', waiterId: '', account: '', channel: '' });
  const chips = [
    category && { key: 'category', label: `Category: ${category}`, onRemove: () => set({ category: '' }) },
    filters.staffId && { key: 'staffId', label: `Cashier: ${nameOf(cashiers, filters.staffId) || '…'}`, onRemove: () => set({ staffId: '' }) },
    filters.waiterId && { key: 'waiterId', label: `Served by: ${nameOf(waiters, filters.waiterId) || '…'}`, onRemove: () => set({ waiterId: '' }) },
    filters.account && { key: 'account', label: `Account: ${nameOf(accounts, filters.account) || filters.account}`, onRemove: () => set({ account: '' }) },
    filters.channel && { key: 'channel', label: `Channel: ${labelOf('channel', filters.channel)}`, onRemove: () => set({ channel: '' }) },
  ].filter(Boolean);

  const csv = (table) => `${API}?${apiQuery}&format=csv&table=${table}`;
  const exports = [
    { label: 'Every sale (ledger)', href: `/api/admin/sales?${query}&format=csv` },
    ...(range.from === range.to ? [] : [{ label: 'Sales by day', href: csv('days') }]),
    { label: 'Sales by account', href: csv('accounts') },
    { label: 'Dishes', href: csv('items') },
    { label: 'Never sold', href: csv('never') },
  ];
  const categoryOptions = useMemo(() => {
    const names = new Set(r?.items?.categoryOptions || []);
    if (category) names.add(category);
    return [...names].map((c) => ({ value: c, label: c }));
  }, [r, category]);

  return (
    <>
      <div className="flex items-center gap-2.5 flex-wrap rpt-noprint">
        <PeriodPicker preset={preset} range={range} set={set} />
        <FiltersButton active={activeFilters} onClear={clearFilters}>
          <FilterSelect label="Category" value={category} options={categoryOptions} onChange={(v) => set({ category: v })} all="All categories" />
          <FilterSelect label="Cashier" value={filters.staffId} options={cashiers} onChange={(v) => set({ staffId: v })} all="Everyone" />
          <FilterSelect label="Served by" value={filters.waiterId} options={waiters} onChange={(v) => set({ waiterId: v })} all="Everyone" />
          <FilterSelect label="Account" value={filters.account} options={accounts} onChange={(v) => set({ account: v })} all="All accounts" />
          <ChannelSelect value={filters.channel} onChange={(v) => set({ channel: v })} />
        </FiltersButton>
        <span className="flex-1" />
        <RangeNote preset={preset} range={range} />
        <ExportBar exports={exports} />
      </div>
      <ActiveFilters items={chips} onClear={clearFilters} />
      <PrintHead title="Sales report" range={range} preset={preset} filters={{
        Cashier: nameOf(cashiers, filters.staffId), 'Served by': nameOf(waiters, filters.waiterId), Account: nameOf(accounts, filters.account),
        Channel: labelOf('channel', filters.channel), Category: category,
      }} />
      {isError && <ErrorNote error={error} />}

      <SummaryView r={r} isLoading={isLoading} preset={preset} range={range} query={query} filters={filters} />
      <ItemsView r={r} isLoading={isLoading} category={category} set={set} range={range} />
    </>
  );
}

// ── Money and time ───────────────────────────────────────────────────────────────
function SummaryView({ r, isLoading, preset, range, query, filters }) {
  const router = useRouter();
  const cmp = comparisonRange(preset, range);
  const vs = compareLabel(preset);
  const cmpQuery = new URLSearchParams({ from: cmp.from, to: cmp.to, ...filters }).toString();
  // Only the comparison totals and per-day/hour series are used from this.
  const prev = useQuery({ queryKey: ['rpt-sales', cmpQuery], queryFn: () => fetchJson(`${API}?${cmpQuery}`) });
  const p = prev.data;
  const s = r?.summary;
  const oneDay = range.from === range.to;
  const history = (patch = {}) => {
    const q = new URLSearchParams(query);
    for (const [k, v] of Object.entries(patch)) q.set(k, v);
    return `${HISTORY}?${q}`;
  };

  const dayRows = useMemo(() => (r?.byDay || []).map((d, i) => {
    const pd = p?.byDay?.[i];
    return { key: d.day, tick: dayTick(d.day), name: dayName(d.day), value: d.total, sub: sales(d.orders), prev: pd ? pd.total : undefined, prevName: pd ? dayName(pd.day) : undefined };
  }), [r, p]);
  const hourRows = useMemo(() => {
    const now = new Map((r?.byHour || []).map((h) => [h.hour, h]));
    const before = new Map((oneDay ? p?.byHour || [] : []).map((h) => [h.hour, h]));
    const hours = [...now.keys(), ...before.keys()];
    if (!hours.length) return [];
    const first = Math.min(...hours);
    const last = Math.max(...hours);
    return Array.from({ length: last - first + 1 }, (_, i) => {
      const h = first + i;
      const x = now.get(h);
      return { key: h, tick: hh(h), name: `${hh(h)}–${hh(h + 1)}`, value: x?.total || 0, sub: x ? sales(x.orders) : undefined, prev: oneDay && p ? before.get(h)?.total || 0 : undefined };
    });
  }, [r, p, oneDay]);

  // Top 5 + "Other" — but never an "Other" of just one account.
  const accountSegs = useMemo(() => {
    const list = r?.byAccount || [];
    const cut = list.length <= 6 ? list.length : 5;
    const segs = list.slice(0, cut).map((a, i) => ({ label: a.label, value: a.total, color: DONUT[i] }));
    const rest = list.slice(cut);
    if (rest.length) segs.push({ label: `Other (${rest.length})`, value: rest.reduce((n, a) => n + a.total, 0), color: '#9A9A93' });
    return segs;
  }, [r]);
  const channelSegs = (r?.byChannel || []).map((c) => ({ label: c.label, value: c.total, sub: sales(c.orders), color: CHANNEL_COLOR[c.channel] }));
  const vsFoot = (before, fmt = money) => (p ? `${vs} · ${fmt(before)}` : ' ');

  return (
    <>
      {isLoading ? <KpiSkeletons count={5} min={180} /> : s && (
        <KpiGrid min={180}>
          <Kpi
            label="Net sales" value={money(s.netSales)}
            badge={p && <Delta value={s.netSales} previous={p.summary.netSales} />}
            visual={!oneDay && <Sparkline values={(r.byDay || []).map((d) => d.total)} prev={(p?.byDay || []).map((d) => d.total)} />}
            foot={vsFoot(p?.summary.netSales)}
          />
          <Kpi
            label="Orders" value={num(s.orders)}
            badge={p && <Delta value={s.orders} previous={p.summary.orders} />}
            foot={<>avg ticket <b className="font-mq-mono font-medium text-mq-body">{money(s.avgTicket)}</b>{p && <> · {vs} {num(p.summary.orders)}</>}</>}
          />
          <Kpi
            label="On account" value={money(s.onAccount?.total)}
            foot={`${sales(s.onAccount?.orders || 0)} owed by customers`}
            href={s.onAccount?.orders ? history({ account: 'invoice' }) : undefined}
          />
          <Kpi
            label="Items sold" value={num(s.itemsSold)}
            foot={`across ${num(s.dishesSold)} ${s.dishesSold === 1 ? 'dish' : 'dishes'}`}
            href={s.itemsSold ? '#sr-dishes' : undefined}
          />
          <Kpi
            label="Voided" value={money(s.voids.total)}
            foot={s.voids.count > 0 ? `${sales(s.voids.count)}${s.refundsOwed ? ` · ${money(s.refundsOwed)} refunds owed` : ''}` : 'no voids'}
            href={s.voids.count > 0 ? history({ status: 'voided' }) : undefined}
          />
        </KpiGrid>
      )}

      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 flex-wrap px-4 py-[13px] border-b border-mq-chip">
          <div className="flex flex-col gap-px min-w-0 flex-1">
            <h3 className="m-0 text-sm font-semibold tracking-[-.01em] text-mq-ink">{oneDay ? 'Sales by hour' : 'Sales by day'}</h3>
            <span className="text-xs text-mq-muted">{oneDay ? 'Every hour with a sale on this day' : 'Click a column to open that day’s sales'}</span>
          </div>
          <Button href={history()} variant="ghost" size="xs" iconRight="arrowRight" className="rpt-noprint">Every sale</Button>
        </div>
        <div className="px-4 pt-[18px] pb-3.5">
          {isLoading ? <Skeleton className="h-[220px]" /> : (
            <Columns
              rows={oneDay ? hourRows : dayRows} fmt={money} label="Sales" unit={oneDay ? 'hour' : 'day'}
              compareLabel={p ? vs : undefined}
              onSelect={oneDay ? undefined : (row) => router.push(history({ preset: 'custom', from: row.key, to: row.key }))}
            />
          )}
        </div>
      </Card>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))' }}>
        <ChartCard title="How customers paid" sub="Takings by account">
          {isLoading ? <RowSkeletons rows={4} className="!p-0" /> : (
            <Donut segments={accountSegs} fmt={money} centre={compact(s?.netSales || 0)} centreLabel="TAKINGS" size={132} />
          )}
        </ChartCard>
        {!oneDay && (
          <ChartCard title="Busiest hours" sub="Sales by hour of day, across the period">
            {isLoading ? <Skeleton className="h-[200px]" /> : <HourBars rows={r?.byHour} />}
          </ChartCard>
        )}
        <ChartCard title="Where the sales came from" sub="Dine-in and Delivery are rung up in the restaurant; Online is ordered through the online menu (eaten in or delivered).">
          {isLoading ? <RowSkeletons rows={2} className="!p-0" /> : <StackBar segments={channelSegs} fmt={money} />}
        </ChartCard>
      </div>
    </>
  );
}

/** Chart card as the design draws it: a white title strip over the chart. */
function ChartCard({ title, sub, children }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader chart title={title} sub={sub} />
      <div className="px-4 py-[18px]">{children}</div>
    </Card>
  );
}

// ── What sold ─────────────────────────────────────────────────────────────────
function ItemsView({ r, isLoading, category, set, range }) {
  const sp = useSearchParams();
  const q = sp.get('q') || '';
  const sort = SORTS[sp.get('sort')] ? sp.get('sort') : 'revenue';
  // Old links may carry top=25 (the earlier "Top 25"): read it as the biggest cut.
  const rawTop = sp.get('top');
  const top = TOPS.includes(rawTop) ? Number(rawTop) : rawTop === '25' ? 20 : 0;
  const [neverOpen, setNeverOpen] = useState(false);

  // Search box: type freely, the URL follows 300ms later.
  const [term, setTerm] = useState(q);
  useEffect(() => {
    const t = setTimeout(() => { if (q !== term.trim()) set({ q: term.trim() }); }, 300);
    return () => clearTimeout(t);
  }, [term, q, set]);

  const it = r?.items;
  const ranked = useMemo(() => (it?.items || []).map((d, i) => ({ ...d, rank: i + 1 })), [it]);
  const shown = useMemo(() => {
    const t = q.toLowerCase();
    let list = t ? ranked.filter((d) => d.name.toLowerCase().includes(t) || (d.category || '').toLowerCase().includes(t)) : [...ranked];
    if (sort === 'quantity') list.sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue);
    else if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    if (top) list = list.slice(0, top);
    return list;
  }, [ranked, q, sort, top]);
  const maxShare = Math.max(...ranked.map((d) => d.share), 1);
  const never = it?.neverSold || [];

  return (
    <>
      {it?.truncated && (
        <Alert tone="warn" title="Some small sellers are left out">This range has more dishes than the report can list. Choose a shorter range for the full list.</Alert>
      )}

      <div id="sr-dishes" className="scroll-mt-24">
        <Card id="dishes" className="overflow-hidden scroll-mt-24">
          <div className="flex items-center gap-2.5 flex-wrap px-4 py-3 border-b border-mq-chip">
            <div className="flex flex-col gap-px min-w-0" style={{ flex: '1 1 160px' }}>
              <h3 className="m-0 text-[14.5px] font-semibold tracking-[-.01em] text-mq-ink">{category ? `Every dish · ${category}` : 'Every dish'}</h3>
              <span className="text-xs text-mq-muted">Best and worst performers, one table</span>
            </div>
            <div className="rpt-noprint min-w-0 max-w-[260px]" style={{ flex: '1 1 180px' }}>
              <SearchInput value={term} onChange={setTerm} placeholder="Search dishes" aria-label="Search dishes" maxLength={80} />
            </div>
            <select className={cx(selectSm, 'rpt-noprint')} value={sort} onChange={(e) => set({ sort: e.target.value === 'revenue' ? '' : e.target.value })} aria-label="Sort dishes">
              {Object.entries(SORTS).map(([v, l]) => <option key={v} value={v}>Sort: {l}</option>)}
            </select>
            <select className={cx(selectSm, 'rpt-noprint')} value={top || ''} onChange={(e) => set({ top: e.target.value })} aria-label="How many dishes">
              <option value="">Show: All dishes</option>
              {TOPS.map((n) => <option key={n} value={n}>Show: Top {n}</option>)}
            </select>
          </div>
          {isLoading ? <RowSkeletons /> : (
            <Table maxH={480} minW={560} label="Dishes sold">
              <thead>
                <tr>
                  <Th align="right" className="w-10">#</Th><Th>Dish</Th><Th>Category</Th>
                  <Th align="right">Qty</Th><Th align="right">Value</Th><Th>Share</Th>
                </tr>
              </thead>
              <tbody>
                {!shown.length ? <EmptyRow cols={6}>{ranked.length ? `No dish matches “${q}”.` : 'Nothing sold in this range.'}</EmptyRow>
                  : shown.map((d) => (
                    <Tr key={d.menuItemId ?? d.name}>
                      <Td mono muted align="right" className="!py-2.5 w-10 whitespace-nowrap">{d.rank}</Td>
                      <Td className="!py-2.5 font-medium text-mq-ink">{d.name}</Td>
                      <Td className="!py-2.5 text-mq-on-tint whitespace-nowrap">{d.category}</Td>
                      <Td mono align="right" className="!py-2.5 !text-[13.5px] text-mq-ink whitespace-nowrap">{num(d.quantity)}</Td>
                      <Td mono align="right" className="!py-2.5 !text-[13.5px] text-mq-ink whitespace-nowrap">{money(d.revenue)}</Td>
                      <Td className="!py-2.5 min-w-[130px]">
                        <span className="flex items-center gap-2">
                          <ProgressBar pct={(d.share / maxShare) * 100} tone="bg-mq-cta" className="flex-1" />
                          <span className="font-mq-mono text-xs text-mq-body w-11 text-right tabular-nums">{pct(d.share)}</span>
                        </span>
                      </Td>
                    </Tr>
                  ))}
              </tbody>
            </Table>
          )}
          {!isLoading && ranked.length > 0 && (
            <div className="px-4 py-2.5 border-t border-mq-chip text-xs text-mq-on-tint">
              Showing {num(shown.length)} of {num(ranked.length)} dishes that sold{category ? ` in ${category}` : ''} · {sort === 'revenue' ? 'ranked by value' : `sorted by ${SORTS[sort].toLowerCase()}`}
            </div>
          )}
        </Card>
      </div>

      {!isLoading && it && (
        <Card className="overflow-hidden">
          <button
            type="button"
            onClick={() => setNeverOpen((v) => !v)}
            aria-expanded={neverOpen}
            className="w-full flex items-center gap-2.5 px-4 py-3.5 text-left bg-white hover:bg-mq-cream transition-colors rounded-xl"
          >
            <span className="flex flex-col gap-px flex-1 min-w-0">
              <span className="text-[11px] font-semibold uppercase tracking-[.1em] text-mq-muted">Prune the menu</span>
              <span className="flex items-center gap-2 text-[14.5px] font-semibold text-mq-ink">
                Never sold{category ? ` · ${category}` : ''}
                <span className={cx('inline-grid place-items-center min-w-[22px] h-[22px] px-1.5 rounded-full font-mq-mono text-xs font-bold', never.length ? 'bg-mq-warn-bg text-mq-warn-ink' : 'bg-mq-chip text-mq-chip-ink')}>{num(never.length)}</span>
              </span>
            </span>
            <span className={cx('text-mq-muted transition-transform', neverOpen && 'rotate-180')}><Icon name="chevDown" size={16} stroke={2} /></span>
          </button>
          {neverOpen && (
            <div className="px-4 pb-4 flex flex-col gap-3 border-t border-mq-chip">
              <p className="m-0 pt-3 text-[12.5px] text-mq-on-tint leading-normal">
                {never.length
                  ? `${num(never.length)} active ${never.length === 1 ? 'dish' : 'dishes'} with no sales between ${range.from} and ${range.to}.`
                  : 'Every active dish sold at least once.'}{' '}
                <Link href="/admin/dashboard/menu-items" className="font-semibold text-mq-cta hover:text-mq-primary">Menu items →</Link>
              </p>
              {never.length > 0 && (
                <ul className="m-0 p-0 list-none grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))' }}>
                  {never.map((d) => (
                    <li key={d.id} className="flex flex-col gap-0.5 border border-mq-chip bg-mq-cream rounded-[10px] px-3 py-2.5">
                      <span className="text-[13.5px] font-semibold text-mq-ink">{d.name}</span>
                      <span className="text-xs text-mq-on-tint">{d.category}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>
      )}
    </>
  );
}
