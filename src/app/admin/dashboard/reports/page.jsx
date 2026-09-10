'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import Bk from '@/components/admin/Bk';
import TopNList from '@/components/admin/TopNList';

const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const num = (n) => Number(n || 0).toLocaleString('en-US');
const METHOD_LABEL = { cash: 'Cash', card: 'Card', evc: 'EVC', invoice: 'Invoice', unspecified: 'Unspecified' };

function toISODate(d) { return d.toISOString().slice(0, 10); }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d; }

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

  const { data: report, isLoading } = useQuery({
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
  const waiterRows = staffBreakdown.waiters.filter((w) => w.waiterId != null);

  return (
    <div style={{ maxWidth: 1200 }}>
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div className="seg">
          {[{ v: 'today', l: 'Today' }, { v: 'yesterday', l: 'Yesterday' }, { v: '7d', l: '7 days' }, { v: '30d', l: '30 days' }, { v: 'custom', l: 'Custom' }].map((p) => (
            <button key={p.v} className={preset === p.v ? 'active' : ''} onClick={() => setPreset(p.v)}>{p.l}</button>
          ))}
        </div>
        {preset === 'custom' && (
          <>
            <input className="input" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={{ width: 150 }} />
            <span className="sub">to</span>
            <input className="input" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={{ width: 150 }} />
          </>
        )}
      </div>

      {isLoading ? (
        <div className="kpi-row reveal" style={{ marginBottom: 16 }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div className="kpi" key={i}>
              <div className="kpi-top">
                <div className="sk" style={{ width: 30, height: 30, borderRadius: 9 }} />
                <div className="sk" style={{ width: 90, height: 11, borderRadius: 4 }} />
              </div>
              <div className="sk" style={{ width: 100, height: 27, borderRadius: 6, marginTop: 2 }} />
              <div className="sk" style={{ width: 130, height: 11, borderRadius: 4, marginTop: 11 }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="kpi-row reveal" style={{ marginBottom: 16 }}>
          <div className="kpi">
            <div className="kpi-top"><div className="kpi-ic green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg></div><span className="kpi-k">Revenue collected</span></div>
            <div className="kpi-v"><small>$</small>{num(Math.round(topline.totalRevenue || 0))}</div>
            <div className="kpi-foot"><span>{num(topline.totalOrders || 0)} paid orders · avg {money(topline.avgTicket)}</span></div>
          </div>
          <div className="kpi">
            <div className="kpi-top"><div className="kpi-ic amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg></div><span className="kpi-k">Invoiced</span></div>
            <div className="kpi-v"><small>$</small>{num(Math.round(topline.invoicedTotal || 0))}</div>
            <div className="kpi-foot"><span>{num(topline.invoicedCount || 0)} invoices created</span></div>
          </div>
          <div className="kpi">
            <div className="kpi-top"><div className="kpi-ic sky"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg></div><span className="kpi-k">Collected on invoices</span></div>
            <div className="kpi-v"><small>$</small>{num(Math.round(topline.collectedFromInvoicesToday || 0))}</div>
            <div className="kpi-foot"><span>payments received in range</span></div>
          </div>
          <div className="kpi">
            <div className="kpi-top"><div className="kpi-ic ink"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><path d="M7 7h.01" /></svg></div><span className="kpi-k">Items sold</span></div>
            <div className="kpi-v">{num(itemsSold.reduce((s, i) => s + i.qty, 0))}</div>
            <div className="kpi-foot"><span>units</span></div>
          </div>
          <div className="kpi">
            <div className="kpi-top"><div className="kpi-ic sky"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 8h20" /></svg></div><span className="kpi-k">Online orders</span></div>
            <div className="kpi-v">{num(bySource.online.count)}</div>
            <div className="kpi-foot"><span>{money(bySource.online.total)}</span></div>
          </div>
          <div className="kpi">
            <div className="kpi-top"><div className="kpi-ic gold"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></svg></div><span className="kpi-k">Counter orders</span></div>
            <div className="kpi-v">{num(bySource.pos.count)}</div>
            <div className="kpi-foot"><span>{money(bySource.pos.total)}</span></div>
          </div>
        </div>
      )}

      <div className="grid3 reveal" style={{ animationDelay: '.08s' }}>
        <div className="card card-pad">
          <div className="eyebrow" style={{ marginBottom: 12 }}>Revenue by payment method</div>
          <Bk rows={revenueByMethod.map((r) => ({ l: METHOD_LABEL[r.method] || r.method, v: r.total, fmt: `${money(r.total)} · ${r.orders}` }))} />
        </div>
        <div className="card card-pad">
          <div className="eyebrow" style={{ marginBottom: 12 }}>Waiter performance</div>
          <TopNList rows={waiterRows} n={3} toBar={(w) => ({ l: w.name, v: w.total })} viewAllHref="/admin/dashboard/insights/staff" />
        </div>
        <div className="card card-pad">
          <div className="eyebrow" style={{ marginBottom: 12 }}>Sales by cashier</div>
          <TopNList rows={staffBreakdown.staff} n={3} toBar={(s) => ({ l: s.name, v: s.total })} viewAllHref="/admin/dashboard/insights/staff" />
        </div>
      </div>

      <div className="card card-pad reveal" style={{ marginTop: 16, animationDelay: '.12s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div className="h-2">Invoice activity</div>
          <Link href="/admin/dashboard/invoices" className="btn btn-ghost btn-sm">Open Invoicing →</Link>
        </div>
        <div className="grid3">
          <div className="sc-stat"><div className="v">{money(invoiceActivity.invoicedTotal)}</div><div className="k">New invoices, this range</div></div>
          <div className="sc-stat"><div className="v">{money(invoiceActivity.collectedTotal)}</div><div className="k">Payments collected</div></div>
          <div className="sc-stat"><div className="v">{(invoiceActivity.collectedByMethod || []).map((m) => `${METHOD_LABEL[m.method] || m.method} ${money(m.total)}`).join(' · ') || '—'}</div><div className="k">By method</div></div>
        </div>
      </div>

      <div className="card card-pad reveal" style={{ marginTop: 16, animationDelay: '.16s' }}>
        <div className="h-2" style={{ marginBottom: 14 }}>Items sold {report?.itemsSoldTruncated && <span className="pill pill-amber" style={{ marginLeft: 8 }}>partial — range too busy to fully scan</span>}</div>
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1, 2, 3, 4].map((i) => <div key={i} className="sk" style={{ height: 36, borderRadius: 'var(--r-sm)' }} />)}
          </div>
        ) : (
          <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
            <table className="table"><thead><tr><th>Item</th><th className="num">Qty sold</th><th className="num">Revenue</th></tr></thead>
              <tbody>
                {itemsSold.length === 0 ? (
                  <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>No sales in range</td></tr>
                ) : itemsSold.map((it, i) => (
                  <tr key={i}><td>{it.name}</td><td className="num">{num(it.qty)}</td><td className="num">{money(it.total)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card card-pad reveal" style={{ marginTop: 16, animationDelay: '.2s' }}>
        <div className="h-2" style={{ marginBottom: 4 }}>Stock consumed</div>
        <p className="empty-sub" style={{ textAlign: 'left', marginBottom: 12 }}>{report?.stockConsumedNote}</p>
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1, 2, 3].map((i) => <div key={i} className="sk" style={{ height: 36, borderRadius: 'var(--r-sm)' }} />)}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table"><thead><tr><th>Item</th><th>Type</th><th className="num">Quantity</th></tr></thead>
              <tbody>
                {stockConsumed.length === 0 ? (
                  <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>No usage or waste logged in range</td></tr>
                ) : stockConsumed.map((s, i) => (
                  <tr key={i}><td>{s.name}</td><td style={{ textTransform: 'capitalize' }}>{s.type}</td><td className="num">{s.quantity} {s.unit}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
