'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import Bk from '@/components/admin/Bk';
import TopNList from '@/components/admin/TopNList';
import { KpiRowSkeleton, RowsSkeleton } from '@/components/admin/Skeletons';

const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (n) => Number(n || 0).toLocaleString('en-US');
const METHOD_LABEL = { cash: 'Cash', card: 'Card', evc: 'EVC', invoice: 'Invoice', unspecified: 'Unspecified' };
const PRESETS = [{ v: 'today', l: 'Today' }, { v: 'yesterday', l: 'Yesterday' }, { v: '7d', l: '7 days' }, { v: '30d', l: '30 days' }, { v: 'custom', l: 'Custom' }];

function toISODate(d) { return d.toISOString().slice(0, 10); }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d; }

const Ic = {
  money: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>,
  doc: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>,
  tag: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><path d="M7 7h.01" /></svg>,
  online: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" /></svg>,
  counter: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="4" y="3" width="16" height="18" rx="2" /><rect x="7" y="6" width="10" height="4" rx="1" /><path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01M16 17h.01" /></svg>,
};

function Kpi({ ic, tone, label, children, foot }) {
  return (
    <div className="kpi">
      <div className="kpi-top"><div className={`kpi-ic ${tone}`}>{ic}</div><span className="kpi-k">{label}</span></div>
      <div className="kpi-v">{children}</div>
      <div className="kpi-foot"><span>{foot}</span></div>
    </div>
  );
}

export default function DailyReportPage() {
  const [preset, setPreset] = useState('today');
  const [customFrom, setCustomFrom] = useState(toISODate(daysAgo(7)));
  const [customTo, setCustomTo] = useState(toISODate(new Date()));

  const params = useMemo(() => {
    if (preset === 'today') return { date: toISODate(new Date()) };
    if (preset === 'yesterday') return { date: toISODate(daysAgo(1)) };
    if (preset === '7d') return { from: toISODate(daysAgo(6)), to: toISODate(new Date()) };
    if (preset === '30d') return { from: toISODate(daysAgo(29)), to: toISODate(new Date()) };
    return { from: customFrom, to: customTo };
  }, [preset, customFrom, customTo]);

  const { data: report, isLoading, isError } = useQuery({
    queryKey: ['daily-report', params],
    queryFn: () => fetchJson(`/api/admin/reports/daily?${new URLSearchParams(params)}`),
  });

  const topline = report?.topline || {};
  const revenueByMethod = report?.revenueByMethod || [];
  const bySource = report?.bySource || { online: { count: 0, total: 0 }, pos: { count: 0, total: 0 } };
  const itemsSold = report?.itemsSold || [];
  const stockConsumed = report?.stockConsumed || [];
  const staffBreakdown = report?.staffBreakdown || { waiters: [], staff: [] };
  const invoiceActivity = report?.invoiceActivity || {};
  const collectedByMethod = invoiceActivity.collectedByMethod || [];
  const waiterRows = staffBreakdown.waiters.filter((w) => w.waiterId != null);
  const unitsSold = itemsSold.reduce((s, i) => s + i.qty, 0);

  return (
    <div className="wrap">
      <div className="toolbar">
        <div className="seg">
          {PRESETS.map((p) => <button key={p.v} className={preset === p.v ? 'active' : ''} onClick={() => setPreset(p.v)}>{p.l}</button>)}
        </div>
        {preset === 'custom' && (
          <>
            <input className="input" type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} aria-label="From date" />
            <span className="sub">to</span>
            <input className="input" type="date" value={customTo} min={customFrom} onChange={(e) => setCustomTo(e.target.value)} aria-label="To date" />
          </>
        )}
      </div>

      {isError && <div className="adm-error-banner" style={{ marginBottom: 16 }}>Couldn&rsquo;t load the report for this range. Try a shorter range.</div>}

      {isLoading ? (
        <KpiRowSkeleton count={6} style={{ marginBottom: 16 }} />
      ) : (
        <div className="kpi-row reveal" style={{ marginBottom: 16 }}>
          <Kpi ic={Ic.money} tone="green" label="Revenue collected" foot={`${num(topline.totalOrders)} paid orders · avg ${money(topline.avgTicket)}`}>
            <small>$</small>{num(Math.round(topline.totalRevenue || 0))}
          </Kpi>
          <Kpi ic={Ic.doc} tone="amber" label="Invoiced" foot={`${num(topline.invoicedCount)} invoices created`}>
            <small>$</small>{num(Math.round(topline.invoicedTotal || 0))}
          </Kpi>
          <Kpi ic={Ic.check} tone="sky" label="Collected on invoices" foot="payments received in range">
            <small>$</small>{num(Math.round(topline.collectedFromInvoicesToday || 0))}
          </Kpi>
          <Kpi ic={Ic.tag} tone="ink" label="Items sold" foot={`across ${num(itemsSold.length)} menu items`}>
            {num(unitsSold)}
          </Kpi>
          <Kpi ic={Ic.online} tone="sky" label="Online orders" foot={money(bySource.online.total)}>
            {num(bySource.online.count)}
          </Kpi>
          <Kpi ic={Ic.counter} tone="gold" label="Counter orders" foot={money(bySource.pos.total)}>
            {num(bySource.pos.count)}
          </Kpi>
        </div>
      )}

      <div className="grid3 reveal" style={{ animationDelay: '.08s' }}>
        <div className="card card-pad">
          <div className="pad-h"><div><div className="eyebrow">Revenue</div><div className="h-2">By payment method</div></div></div>
          <Bk loading={isLoading} rows={revenueByMethod.map((r) => ({ l: METHOD_LABEL[r.method] || r.method, v: r.total, fmt: money(r.total) }))} />
        </div>
        <div className="card card-pad">
          <div className="pad-h"><div><div className="eyebrow">Staff</div><div className="h-2">Top waiters</div></div></div>
          <TopNList rows={waiterRows} n={3} toBar={(w) => ({ l: w.name, v: w.total })} viewAllHref="/admin/dashboard/insights/staff" />
        </div>
        <div className="card card-pad">
          <div className="pad-h"><div><div className="eyebrow">Staff</div><div className="h-2">Top cashiers</div></div></div>
          <TopNList rows={staffBreakdown.staff} n={3} toBar={(s) => ({ l: s.name, v: s.total })} viewAllHref="/admin/dashboard/insights/staff" />
        </div>
      </div>

      <div className="card card-pad reveal" style={{ marginTop: 16, animationDelay: '.12s' }}>
        <div className="pad-h">
          <div><div className="eyebrow">Invoicing</div><div className="h-2">Invoice activity</div></div>
          <Link href="/admin/dashboard/invoices" className="btn btn-ghost btn-sm">Open Invoicing</Link>
        </div>
        <div className="grid3">
          <div className="sc-stat"><div className="v">{money(invoiceActivity.invoicedTotal)}</div><div className="k">New invoices in range</div></div>
          <div className="sc-stat"><div className="v">{money(invoiceActivity.collectedTotal)}</div><div className="k">Payments collected</div></div>
          <div className="sc-stat">
            <div className="k">Collected by method</div>
            {collectedByMethod.length === 0 ? (
              <div className="v">—</div>
            ) : (
              <div className="kv-list">
                {collectedByMethod.map((m) => (
                  <div className="kv" key={m.method}><span className="kvl">{METHOD_LABEL[m.method] || m.method}</span><span className="kvv">{money(m.total)}</span></div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card reveal" style={{ marginTop: 16, animationDelay: '.16s', overflow: 'hidden' }}>
        <div className="card-h">
          <div>
            <div className="ttl">Items sold</div>
            {report?.itemsSoldTruncated
              ? <div className="note warn">Partial list — this range has too many orders to scan fully. Pick a shorter range.</div>
              : <div className="note">{num(unitsSold)} units across {num(itemsSold.length)} items</div>}
          </div>
        </div>
        {isLoading ? (
          <RowsSkeleton className="card-pad" />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Item</th><th className="num">Qty sold</th><th className="num">Revenue</th></tr></thead>
              <tbody>
                {itemsSold.length === 0
                  ? <tr><td colSpan={3} className="td-empty">No sales in this range</td></tr>
                  : itemsSold.map((it, i) => <tr key={i}><td className="strong">{it.name}</td><td className="num">{num(it.qty)}</td><td className="num">{money(it.total)}</td></tr>)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card reveal" style={{ marginTop: 16, animationDelay: '.2s', overflow: 'hidden' }}>
        <div className="card-h">
          <div>
            <div className="ttl">Stock consumed</div>
            {report?.stockConsumedNote && <div className="note">{report.stockConsumedNote}</div>}
          </div>
        </div>
        {isLoading ? (
          <RowsSkeleton rows={3} className="card-pad" />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Item</th><th>Type</th><th className="num">Quantity</th></tr></thead>
              <tbody>
                {stockConsumed.length === 0
                  ? <tr><td colSpan={3} className="td-empty">No usage or waste logged in this range</td></tr>
                  : stockConsumed.map((s, i) => (
                    <tr key={i}>
                      <td className="strong">{s.name}</td>
                      <td><span className={`pill ${s.type === 'waste' ? 'pill-rose' : 'pill-ghost'}`} style={{ textTransform: 'capitalize' }}>{s.type}</span></td>
                      <td className="num">{s.quantity} {s.unit}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
