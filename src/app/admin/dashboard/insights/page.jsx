'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import Bk from '@/components/admin/Bk';
import { KpiRowSkeleton, RowsSkeleton } from '@/components/admin/Skeletons';

const METHOD_LABEL = { cash: 'Cash', card: 'Card', evc: 'EVC', invoice: 'Invoice', unspecified: 'Unspecified' };

const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const money2 = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (n) => Number(n || 0).toLocaleString('en-US');
// 0..7 index for the last 8 weeks (7 = current week). Date.now lives here, out of render.
const weekIndex = (d) => 7 - Math.floor((Date.now() - new Date(d).getTime()) / (7 * 86400000));
const todayISO = () => new Date().toISOString().slice(0, 10);
const eightWeeksAgoISO = () => new Date(Date.now() - 56 * 86400000).toISOString().slice(0, 10);

export default function InsightsPage() {
  const { data: fin, isLoading: finLoading } = useQuery({ queryKey: ['fin-summary'], queryFn: () => fetchJson('/api/admin/finance/summary') });
  const { data: rep, isLoading: repLoading } = useQuery({ queryKey: ['rep-summary'], queryFn: () => fetchJson('/api/admin/reports/summary') });
  const { data: orders = [], isLoading: ordersLoading } = useQuery({ queryKey: ['ins-orders'], queryFn: () => fetchJson('/api/admin/orders') });
  // Only the 8-week window the chart needs; managing expenses lives on its own page.
  const { data: expenses = [], isLoading: expLoading } = useQuery({
    queryKey: ['ins-expenses'],
    queryFn: () => fetchJson(`/api/admin/expenses?from=${eightWeeksAgoISO()}&limit=500`).then((d) => d.expenses || []).catch(() => []),
  });
  const { data: today, isLoading: todayLoading } = useQuery({ queryKey: ['daily-report', { date: todayISO() }], queryFn: () => fetchJson(`/api/admin/reports/daily?date=${todayISO()}`) });

  const m = useMemo(() => {
    const paid = orders.filter((o) => o.paymentStatus === 'paid');
    const online = { c: 0, t: 0 }, counter = { c: 0, t: 0 };
    for (const o of paid) { const t = Number(o.total); if (o.source === 'online') { online.c++; online.t += t; } else { counter.c++; counter.t += t; } }
    const rev = new Array(8).fill(0), expw = new Array(8).fill(0);
    for (const o of paid) { const idx = weekIndex(o.createdAt); if (idx >= 0 && idx < 8) rev[idx] += Number(o.total); }
    for (const e of expenses) { const idx = weekIndex(e.incurredAt || e.createdAt); if (idx >= 0 && idx < 8) expw[idx] += Number(e.amount); }
    const maxBar = Math.max(...rev, ...expw, 1);
    return { online, counter, rev, expw, maxBar };
  }, [orders, expenses]);

  const revenue = Number(fin?.revenueTotal || 0);
  const expensesTotal = Number(fin?.expensesTotal || 0);
  const net = Number(fin?.net ?? revenue - expensesTotal);
  const margin = revenue ? Math.round((net / revenue) * 100) : 0;
  const orderCount = fin?.orderCount || 0;
  const tTop = today?.topline || {};
  const tUnits = (today?.itemsSold || []).reduce((s, i) => s + i.qty, 0);

  return (
    <div className="wrap">
      {finLoading ? <KpiRowSkeleton count={4} style={{ marginBottom: 16 }} /> : (
        <div className="kpi-row reveal" style={{ marginBottom: 16 }}>
          <div className="kpi"><div className="kpi-top"><div className="kpi-ic green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg></div><span className="kpi-k">Revenue</span></div><div className="kpi-v"><small>$</small>{num(Math.round(revenue))}</div><div className="kpi-foot"><span>last 30 days</span></div></div>
          <div className="kpi"><div className="kpi-top"><div className="kpi-ic gold"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 3v18h18" /><path d="M18 9l-5 5-3-3-4 4" /></svg></div><span className="kpi-k">Expenses</span></div><div className="kpi-v"><small>$</small>{num(Math.round(expensesTotal))}</div><div className="kpi-foot"><span>last 30 days</span></div></div>
          <div className="kpi"><div className="kpi-top"><div className={`kpi-ic ${net >= 0 ? 'green' : 'rose'}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg></div><span className="kpi-k">Net profit</span></div><div className="kpi-v"><small>$</small>{num(Math.round(net))}</div><div className="kpi-foot"><span className={`pill ${net >= 0 ? 'pill-green' : 'pill-rose'}`}>{margin}% margin</span></div></div>
          <div className="kpi"><div className="kpi-top"><div className="kpi-ic ink"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="2" /></svg></div><span className="kpi-k">Paid orders</span></div><div className="kpi-v">{num(orderCount)}</div><div className="kpi-foot"><span>avg {money2(orderCount ? revenue / orderCount : 0)}</span></div></div>
        </div>
      )}

      <div className="grid-chart reveal" style={{ animationDelay: '.08s' }}>
        <div className="card card-pad">
          <div className="pad-h">
            <div><div className="eyebrow">Revenue vs expenses</div><div className="h-2">Weekly · last 8 weeks</div></div>
            <div className="legend"><span><i style={{ background: 'var(--primary)' }} />Revenue</span><span><i style={{ background: 'var(--gold)' }} />Expenses</span></div>
          </div>
          {ordersLoading || expLoading ? <div className="sk" style={{ height: 230 }} /> : (
            <div className="bars2">
              {m.rev.map((r, i) => (
                <div className="bcol" key={i}><div className="bpair"><i className="rev" style={{ height: `${(r / m.maxBar) * 100}%`, '--d': `${i * 0.05}s` }} /><i className="exp" style={{ height: `${(m.expw[i] / m.maxBar) * 100}%`, '--d': `${i * 0.05 + 0.04}s` }} /></div><span>W{i + 1}</span></div>
              ))}
            </div>
          )}
        </div>
        <div className="card card-pad">
          <div className="pad-h"><div><div className="eyebrow">Channel split</div><div className="h-2">Online vs counter</div></div></div>
          <Bk loading={ordersLoading} rows={[{ l: 'Counter', v: m.counter.t, fmt: `${money(m.counter.t)} · ${m.counter.c}` }, { l: 'Online', v: m.online.t, c: 'var(--sky)', fmt: `${money(m.online.t)} · ${m.online.c}` }]} />
        </div>
      </div>

      <div className="grid3 reveal" style={{ marginTop: 16, animationDelay: '.12s' }}>
        <div className="card card-pad">
          <div className="pad-h">
            <div><div className="eyebrow">Costs</div><div className="h-2">Expenses by category</div></div>
            <Link href="/admin/dashboard/expenses" className="btn btn-ghost btn-sm">Expenses</Link>
          </div>
          <Bk loading={finLoading} color="var(--gold)" empty="No expenses logged." rows={(fin?.expensesByCategory || []).map((r) => ({ l: r.category, v: r.total, c: 'var(--gold)' }))} />
        </div>
        <div className="card card-pad">
          <div className="pad-h">
            <div><div className="eyebrow">Staff</div><div className="h-2">Sales by staff</div></div>
            <Link href="/admin/dashboard/insights/staff" className="btn btn-ghost btn-sm">All staff</Link>
          </div>
          <Bk loading={finLoading} rows={(fin?.salesByStaff || []).slice(0, 5).map((r) => ({ l: r.name, v: r.total }))} />
        </div>
        <div className="card card-pad">
          <div className="pad-h"><div><div className="eyebrow">Menu</div><div className="h-2">Top items</div></div></div>
          <Bk loading={repLoading} rows={(rep?.itemsSold || []).slice(0, 5).map((r) => ({ l: r.name, v: r.total }))} />
        </div>
      </div>

      <div className="grid3 reveal" style={{ marginTop: 16, animationDelay: '.14s' }}>
        <div className="card card-pad">
          <div className="pad-h"><div><div className="eyebrow">Revenue</div><div className="h-2">By payment method</div></div></div>
          <Bk loading={finLoading} rows={(fin?.revenueByMethod || []).map((r) => ({ l: METHOD_LABEL[r.method] || r.method, v: r.total }))} />
        </div>

        <div className="card card-pad">
          <div className="pad-h">
            <div><div className="eyebrow">Invoicing</div><div className="h-2">Customer accounts</div></div>
            <Link href="/admin/dashboard/invoices" className="btn btn-ghost btn-sm">Invoicing</Link>
          </div>
          {finLoading ? <RowsSkeleton rows={2} height={22} gap={14} /> : (
            <div className="kv-list">
              <div className="kv"><span className="kvl">Invoiced · last 30 days</span><span className="kvv">{money2(fin?.invoicedTotal)}</span></div>
              <div className="kv"><span className="kvl">Outstanding now</span><span className={`kvv${Number(fin?.invoiceOutstanding) > 0 ? ' rose' : ''}`}>{money2(fin?.invoiceOutstanding)}</span></div>
              <div className="kv"><span className="kvl">Collected today</span><span className="kvv">{money2(tTop.collectedFromInvoicesToday)}</span></div>
            </div>
          )}
        </div>

        <div className="card card-pad">
          <div className="pad-h">
            <div><div className="eyebrow">Today</div><div className="h-2">Daily report</div></div>
            <Link href="/admin/dashboard/reports" className="btn btn-ghost btn-sm">Full report</Link>
          </div>
          {todayLoading ? <RowsSkeleton rows={3} height={22} gap={14} /> : (
            <div className="kv-list">
              <div className="kv"><span className="kvl">Revenue collected</span><span className="kvv green">{money2(tTop.totalRevenue)}</span></div>
              <div className="kv"><span className="kvl">Paid orders</span><span className="kvv">{num(tTop.totalOrders)}</span></div>
              <div className="kv"><span className="kvl">Items sold</span><span className="kvv">{num(tUnits)}</span></div>
            </div>
          )}
        </div>
      </div>

      <div className="card reveal" style={{ marginTop: 16, animationDelay: '.16s', overflow: 'hidden' }}>
        <div className="card-h">
          <div><div className="ttl">Recent expenses</div><div className="note">{money2(expensesTotal)} in the last 30 days</div></div>
          <Link href="/admin/dashboard/expenses" className="btn btn-ghost btn-sm">Manage expenses</Link>
        </div>
        {expLoading ? <RowsSkeleton rows={3} className="card-pad" /> : (
          <div className="table-wrap">
            <table className="table" style={{ marginTop: 12 }}>
              <thead><tr><th>Date</th><th>Category</th><th>Note</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {expenses.length === 0
                  ? <tr><td colSpan={4} className="td-empty">No expenses in the last 8 weeks</td></tr>
                  : expenses.slice(0, 5).map((e) => (
                    <tr key={e.id}>
                      <td className="muted">{new Date(e.incurredAt || e.createdAt).toLocaleDateString()}</td>
                      <td className="strong" style={{ textTransform: 'capitalize' }}>{e.category}</td>
                      <td className="muted">{e.note || '—'}</td>
                      <td className="num">{money2(e.amount)}</td>
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
