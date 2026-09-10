'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import Bk from '@/components/admin/Bk';

const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const num = (n) => Number(n || 0).toLocaleString('en-US');
const METHOD_LABEL = { cash: 'Cash', card: 'Card', evc: 'EVC', invoice: 'Invoice', unspecified: 'Unspecified' };
function toISODate(d) { return d.toISOString().slice(0, 10); }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d; }

export default function StaffPerformanceDetailPage() {
  const { id } = useParams();
  const [preset, setPreset] = useState('30d');

  const params = useMemo(() => {
    if (preset === 'today') return { from: toISODate(new Date()), to: toISODate(new Date()) };
    if (preset === '7d') return { from: toISODate(daysAgo(6)), to: toISODate(new Date()) };
    return { from: toISODate(daysAgo(29)), to: toISODate(new Date()) };
  }, [preset]);

  const { data: perf, isLoading, isError } = useQuery({
    queryKey: ['staff-performance', id, params],
    queryFn: () => fetchJson(`/api/admin/staff/${id}/performance?${new URLSearchParams(params)}`),
  });

  if (isLoading) return <div className="card" style={{ overflow: 'hidden', maxWidth: 900 }}>{[1, 2, 3].map((n) => <div key={n} className="sk" style={{ height: 60, margin: 14, borderRadius: 'var(--r-sm)' }} />)}</div>;
  if (isError || !perf) return <div className="adm-error-banner" style={{ maxWidth: 900 }}>Staff member not found.</div>;

  return (
    <div style={{ maxWidth: 900 }}>
      <nav className="adm-crumb" style={{ marginBottom: 14 }}>
        <Link href="/admin/dashboard/insights/staff">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
          All staff
        </Link>
        <span className="sep">/</span>
        <span>{perf.staff.name}</span>
      </nav>

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div className="h-1">{perf.staff.name} <span className="pill pill-ghost" style={{ marginLeft: 8, textTransform: 'capitalize' }}>{perf.staff.role?.toLowerCase()}</span>{!perf.staff.isActive && <span className="pill pill-rose" style={{ marginLeft: 6 }}>Inactive</span>}</div>
        <div style={{ flex: 1 }} />
        <div className="seg">
          {[{ v: 'today', l: 'Today' }, { v: '7d', l: '7 days' }, { v: '30d', l: '30 days' }].map((p) => (
            <button key={p.v} className={preset === p.v ? 'active' : ''} onClick={() => setPreset(p.v)}>{p.l}</button>
          ))}
        </div>
      </div>

      <div className="kpi-row reveal" style={{ marginBottom: 16 }}>
        <div className="kpi"><div className="kpi-top"><div className="kpi-ic green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg></div><span className="kpi-k">Sales</span></div><div className="kpi-v"><small>$</small>{num(Math.round(perf.total))}</div></div>
        <div className="kpi"><div className="kpi-top"><div className="kpi-ic sky"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="2" /></svg></div><span className="kpi-k">Orders</span></div><div className="kpi-v">{num(perf.orders)}</div></div>
        <div className="kpi"><div className="kpi-top"><div className="kpi-ic gold"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /></svg></div><span className="kpi-k">Avg ticket</span></div><div className="kpi-v">{money(perf.avgTicket)}</div></div>
        <div className="kpi"><div className="kpi-top"><div className="kpi-ic amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg></div><span className="kpi-k">Invoices created</span></div><div className="kpi-v">{num(perf.invoicesCreated.count)}</div><div className="kpi-foot"><span>{money(perf.invoicesCreated.total)}</span></div></div>
      </div>

      <div className="grid3 reveal" style={{ animationDelay: '.08s', marginBottom: 16 }}>
        <div className="card card-pad" style={{ gridColumn: 'span 2' }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Payment method mix</div>
          <Bk rows={perf.paymentMethodMix.map((m) => ({ l: METHOD_LABEL[m.method] || m.method, v: m.total, fmt: `${money(m.total)} · ${m.orders}` }))} />
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', fontWeight: 620, borderBottom: '1px solid var(--line)' }}>Recent orders</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th>Ref</th><th>Service</th><th>Method</th><th>When</th><th className="num">Total</th></tr></thead>
            <tbody>
              {perf.recent.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>No orders in range</td></tr>
              ) : perf.recent.map((o) => (
                <tr key={o.id}>
                  <td className="mono">{o.reference}</td>
                  <td style={{ textTransform: 'capitalize' }}>{o.orderType?.replace('_', '-')}{o.tableNumber ? ` · ${o.tableNumber}` : ''}</td>
                  <td style={{ textTransform: 'capitalize' }}>{o.paymentMethod || '—'}</td>
                  <td style={{ color: 'var(--muted)' }}>{new Date(o.createdAt).toLocaleString()}</td>
                  <td className="num">{money(o.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
