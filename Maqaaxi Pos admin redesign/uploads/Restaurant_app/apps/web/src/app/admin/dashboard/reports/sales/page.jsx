'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import useStaffList from '@/hooks/useStaffList';
import { Columns, HBars, Sparkline, StackBar } from '@/components/admin/reports/Charts';
import { KpiRowSkeleton, RowsSkeleton } from '@/components/admin/Skeletons';
import {
  Card, ChannelSelect, Delta, ErrorNote, FilterSelect, FiltersButton, PeriodPicker, PrintHead, Toolbar,
  compareLabel, comparisonRange, labelOf, money, num, useAccountOptions, useReportParams,
} from '@/components/admin/reports/ReportKit';

const FILTERS = ['staffId', 'waiterId', 'account', 'channel'];
const API = '/api/admin/reports/sales';
const SORTS = { revenue: 'Value', quantity: 'Quantity', name: 'Name' };
const CHANNEL_COLOR = { dine_in: 'var(--primary)', delivery: 'var(--gold)', online: 'var(--sky)' };
const Chevron = <svg className="r6-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>;
const pct = (n) => `${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
const hh = (h) => `${String(h).padStart(2, '0')}:00`;
const dayTick = (d) => `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`;
const dayName = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const sales = (n) => `${num(n)} ${n === 1 ? 'sale' : 'sales'}`;

/**
 * The Sales report, one page over the period and filters: how much and when
 * (by day against a comparison period, or by hour for one day), how customers
 * paid, which channel, top 5 — then what sold: menu value by category, every
 * dish (search / sort / top-N, `category` narrows only this part) and the
 * dishes that never sold. Per-person totals live in the Employees report;
 * every single sale in Sales history (the link keeps these filters).
 */
export default function SalesReportPage() {
  const sp = useSearchParams();
  const { preset, range, filters, set, query } = useReportParams('7d', FILTERS);
  const category = sp.get('category') || '';
  const apiQuery = category ? `${query}&category=${encodeURIComponent(category)}` : query;
  // The category narrows only `items`; summary, trend, accounts and channels ignore it.
  const { data: r, isLoading, isError, error } = useQuery({ queryKey: ['rpt-sales', apiQuery], queryFn: () => fetchJson(`${API}?${apiQuery}`) });
  // With a category picked, the categories chart still shows every category.
  const all = useQuery({ queryKey: ['rpt-sales', query], queryFn: () => fetchJson(`${API}?${query}`), enabled: !!category });

  const { staff } = useStaffList();
  const opt = (u) => ({ value: String(u.id), label: u.name || u.email });
  const cashiers = staff.filter((u) => u.role !== 'waiter' && u.role !== 'user').map(opt);
  const waiters = staff.filter((u) => u.role === 'waiter').map(opt);
  const accounts = useAccountOptions(r?.byAccount);
  const nameOf = (list, v) => list.find((x) => x.value === v)?.label;
  const activeFilters = FILTERS.filter((k) => filters[k]).length;

  const csv = (table) => `${API}?${apiQuery}&format=csv&table=${table}`;
  const exports = [
    { label: 'Every sale (ledger)', href: `/api/admin/sales?${query}&format=csv` },
    ...(range.from === range.to ? [] : [{ label: 'Sales by day', href: csv('days') }]),
    { label: 'Sales by account', href: csv('accounts') },
    { label: 'Dishes', href: csv('items') },
    { label: 'Categories', href: csv('categories') },
    { label: 'Never sold', href: csv('never') },
  ];
  const categoryOptions = useMemo(() => {
    const names = new Set(r?.items?.categoryOptions || []);
    if (category) names.add(category);
    return [...names].map((c) => ({ value: c, label: c }));
  }, [r, category]);

  return (
    <>
      <Toolbar exports={exports}>
        <PeriodPicker preset={preset} range={range} set={set} />
        <FilterSelect label="Category" value={category} options={categoryOptions} onChange={(v) => set({ category: v })} />
        <FiltersButton active={activeFilters} onClear={() => set({ staffId: '', waiterId: '', account: '', channel: '' })}>
          <FilterSelect label="Cashier" value={filters.staffId} options={cashiers} onChange={(v) => set({ staffId: v })} />
          <FilterSelect label="Served by" value={filters.waiterId} options={waiters} onChange={(v) => set({ waiterId: v })} />
          <FilterSelect label="Account" value={filters.account} options={accounts} onChange={(v) => set({ account: v })} />
          <ChannelSelect value={filters.channel} onChange={(v) => set({ channel: v })} />
        </FiltersButton>
      </Toolbar>
      <PrintHead title="Sales report" range={range} preset={preset} filters={{
        Cashier: nameOf(cashiers, filters.staffId), 'Served by': nameOf(waiters, filters.waiterId), Account: nameOf(accounts, filters.account),
        Channel: labelOf('channel', filters.channel), Category: category,
      }} />
      {isError && <ErrorNote error={error} />}

      <SummaryView r={r} isLoading={isLoading} preset={preset} range={range} query={query} filters={filters} allItems={category ? all.data?.items?.items : r?.items?.items} />
      <ItemsView r={r} isLoading={isLoading} category={category} set={set} range={range} allCategories={category ? all.data?.items?.categories : r?.items?.categories} />
    </>
  );
}

// ── Money and time ───────────────────────────────────────────────────────────────
function SummaryView({ r, isLoading, preset, range, query, filters, allItems }) {
  const cmp = comparisonRange(preset, range);
  const vs = compareLabel(preset);
  const cmpQuery = new URLSearchParams({ from: cmp.from, to: cmp.to, ...filters }).toString();
  // Only the comparison totals and per-day/hour series are used from this.
  const prev = useQuery({ queryKey: ['rpt-sales', cmpQuery], queryFn: () => fetchJson(`${API}?${cmpQuery}`) });
  const p = prev.data;
  const s = r?.summary;
  const oneDay = range.from === range.to;
  const historyHref = `/admin/dashboard/sales?${query}`;

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

  const accountRows = useMemo(() => {
    const list = r?.byAccount || [];
    const total = list.reduce((n, a) => n + a.total, 0) || 1;
    // Top 5 + "Other" — but never an "Other" of just one account.
    const cut = list.length <= 6 ? list.length : 5;
    const top = list.slice(0, cut);
    const rest = list.slice(cut);
    const rows = top.map((a) => ({ label: a.label, value: a.total, sub: `${sales(a.orders)} · ${pct((a.total / total) * 100)}` }));
    if (rest.length) {
      const t = rest.reduce((n, a) => n + a.total, 0);
      rows.push({ label: `Other (${rest.length})`, value: t, sub: `${sales(rest.reduce((n, a) => n + a.orders, 0))} · ${pct((t / total) * 100)} · ${rest.map((a) => a.label).join(', ')}`, color: 'var(--faint)' });
    }
    return rows;
  }, [r]);
  const channelSegs = (r?.byChannel || []).map((c) => ({ label: c.label, value: c.total, sub: sales(c.orders), color: CHANNEL_COLOR[c.channel] }));
  const topItems = (allItems || []).slice(0, 5).map((i) => ({ label: i.name, value: i.revenue, sub: `${num(i.quantity)} sold${i.category ? ` · ${i.category}` : ''}` }));

  return (
    <>
      {isLoading ? <KpiRowSkeleton count={5} className="kpi-row r6-kpis5" style={{ marginBottom: 16 }} /> : s && (
        <div className="kpi-row r6-kpis5">
          <div className="kpi r6-kpi-main">
            <div className="kpi-top"><span className="kpi-dot green" /><span className="kpi-k">Net sales</span></div>
            <div className="kpi-v r6-v">{money(s.netSales)}</div>
            <Sparkline values={(r.byDay || []).map((d) => d.total)} />
            <div className="kpi-foot">{p ? <Delta now={s.netSales} before={p.summary.netSales} vs={vs} zero="no sales before" /> : <span>&nbsp;</span>}</div>
          </div>
          <div className="kpi">
            <div className="kpi-top"><span className="kpi-dot" /><span className="kpi-k">Orders</span></div>
            <div className="kpi-v r6-v">{num(s.orders)}</div>
            <div className="kpi-foot"><span>avg ticket <b className="mono">{money(s.avgTicket)}</b></span></div>
          </div>
          <div className="kpi">
            <div className="kpi-top"><span className="kpi-dot sky" /><span className="kpi-k">On account</span></div>
            <div className="kpi-v r6-v">{money(s.onAccount?.total)}</div>
            <div className="kpi-foot"><Link href="/admin/dashboard/customers?owing=1">customers owe {money(s.receivable?.owed)}</Link></div>
          </div>
          <div className="kpi">
            <div className="kpi-top"><span className="kpi-dot amber" /><span className="kpi-k">Discounts</span></div>
            <div className="kpi-v r6-v">{money(s.discounts)}</div>
            <div className="kpi-foot"><span>on {money(s.grossSales)} before discounts</span></div>
          </div>
          <div className="kpi">
            <div className="kpi-top"><span className="kpi-dot rose" /><span className="kpi-k">Voided</span></div>
            <div className="kpi-v r6-v">{money(s.voids.total)}</div>
            <div className="kpi-foot">
              {s.voids.count > 0
                ? <Link href={`/admin/dashboard/sales?${query}&status=voided`}>{num(s.voids.count)} {s.voids.count === 1 ? 'void' : 'voids'}{s.refundsOwed ? ` · ${money(s.refundsOwed)} refunds owed` : ''}</Link>
                : <span>no voids</span>}
            </div>
          </div>
        </div>
      )}

      <Card eyebrow="Trend" title={oneDay ? 'Sales by hour' : 'Sales by day'} action={<Link className="btn btn-ghost btn-sm rpt-noprint" href={historyHref}>Every sale →</Link>}>
        {isLoading ? <RowsSkeleton rows={1} height={220} /> : (
          <Columns rows={oneDay ? hourRows : dayRows} fmt={money} label="Sales" unit={oneDay ? 'hour' : 'day'} compareLabel={p ? vs : undefined} />
        )}
      </Card>

      <div className="r6-grid3">
        <Card eyebrow="Money" title="How customers paid">
          {isLoading ? <RowsSkeleton rows={4} height={34} /> : <HBars rows={accountRows} fmt={money} empty="No sales in this range." />}
        </Card>
        <Card eyebrow="Channel" title="Where the sales came from">
          {isLoading ? <RowsSkeleton rows={2} height={34} /> : (
            <>
              <StackBar segments={channelSegs} fmt={money} />
              <p className="note r6-note">Dine-in and Delivery are rung up in the restaurant; Online is ordered through the online menu (eaten in or delivered).</p>
            </>
          )}
        </Card>
        <Card eyebrow="Best sellers" title="Top 5 items" action={<a className="btn btn-ghost btn-sm rpt-noprint" href="#dishes">See all dishes ↓</a>}>
          {isLoading ? <RowsSkeleton rows={5} height={30} /> : <HBars rows={topItems} fmt={money} empty="Nothing sold in this range." />}
        </Card>
      </div>
    </>
  );
}

// ── What sold ─────────────────────────────────────────────────────────────────
function ItemsView({ r, isLoading, category, set, range, allCategories }) {
  const sp = useSearchParams();
  const q = sp.get('q') || '';
  const sort = SORTS[sp.get('sort')] ? sp.get('sort') : 'revenue';
  const top = sp.get('top') === '10' || sp.get('top') === '25' ? Number(sp.get('top')) : 0;

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
  const cats = (allCategories || it?.categories || []).map((c) => ({ label: c.category, value: c.revenue, sub: `${num(c.quantity)} sold · ${num(c.dishes)} ${c.dishes === 1 ? 'dish' : 'dishes'} · ${pct(c.share)}` }));

  return (
    <>
      {it?.truncated && (
        <div className="stm-callout tone-warn" role="status">This range has more dishes than the report can list, so the smallest sellers are left out. Choose a shorter range for the full list.</div>
      )}

      <Card eyebrow="Categories" title="Menu value by category" action={category ? <button type="button" className="btn btn-ghost btn-sm rpt-noprint" onClick={() => set({ category: '' })}>All categories</button> : null}>
        {isLoading ? <RowsSkeleton rows={4} height={34} /> : (
          <>
            <HBars rows={cats} fmt={money} active={category} onSelect={(row) => set({ category: category === row.label ? '' : row.label })} empty="Nothing sold in this range." />
            {cats.length > 1 && <p className="note r6-note rpt-noprint">Tap a category to see only its dishes.</p>}
          </>
        )}
      </Card>

      <Card flush id="dishes" title={`Dishes${category ? ` · ${category}` : ''}`} action={
        <div className="r6-tools rpt-noprint">
          <label className="search r6-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
            <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search dishes" aria-label="Search dishes" maxLength={80} />
          </label>
          <select className="input" value={sort} onChange={(e) => set({ sort: e.target.value === 'revenue' ? '' : e.target.value })} aria-label="Sort dishes">
            {Object.entries(SORTS).map(([v, l]) => <option key={v} value={v}>Sort: {l}</option>)}
          </select>
          <select className="input" value={top || ''} onChange={(e) => set({ top: e.target.value })} aria-label="How many dishes">
            <option value="">Show: All</option>
            <option value="10">Show: Top 10</option>
            <option value="25">Show: Top 25</option>
          </select>
        </div>
      }>
        {isLoading ? <RowsSkeleton className="card-pad" /> : (
          <div className="table-scroll">
            <table className="table r6-dishes">
              <thead><tr><th className="num r6-rank">#</th><th>Dish</th><th className="r6-cat">Category</th><th className="num">Qty</th><th className="num">Value</th><th className="r6-sharecol">Share</th></tr></thead>
              <tbody>
                {!shown.length ? <tr><td colSpan={6} className="td-empty">{ranked.length ? 'No dish matches your search' : 'Nothing sold in this range'}</td></tr>
                  : shown.map((d) => (
                    <tr key={d.menuItemId ?? d.name}>
                      <td className="num r6-rank">{d.rank}</td>
                      <td className="strong">{d.name}<span className="r6-cat-inline">{d.category}</span></td>
                      <td className="r6-cat">{d.category}</td>
                      <td className="num">{num(d.quantity)}</td>
                      <td className="num">{money(d.revenue)}</td>
                      <td className="r6-sharecol">
                        <div className="r6-share"><div className="r6-bar" aria-hidden="true"><i style={{ width: `${Math.round((d.share / maxShare) * 100)}%` }} /></div><span>{pct(d.share)}</span></div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {!isLoading && it && (
        <details className="card rpt-card r6-never">
          <summary>
            <span><span className="eyebrow">Prune the menu</span><span className="h-2">Never sold{category ? ` · ${category}` : ''} <span className="r6-count">{num(it.neverSold.length)}</span></span></span>
            {Chevron}
          </summary>
          <div className="r6-never-body">
            {!it.neverSold.length ? <div className="sub">Every active dish sold at least once.</div> : (
              <>
                <p className="note">{num(it.neverSold.length)} active {it.neverSold.length === 1 ? 'dish' : 'dishes'} with no sales between {range.from} and {range.to}. <Link href="/admin/dashboard/menu-items">Menu Items →</Link></p>
                <ul className="r6-never-list">
                  {it.neverSold.map((d) => <li key={d.id}><span className="strong">{d.name}</span><span className="sub">{d.category}</span></li>)}
                </ul>
              </>
            )}
          </div>
        </details>
      )}
    </>
  );
}

