'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import Bk from '@/components/admin/Bk';
import { KpiRowSkeleton, RowsSkeleton } from '@/components/admin/Skeletons';

const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (n) => Number(n || 0).toLocaleString('en-US');
const METHOD_LABEL = { cash: 'Cash', card: 'Card', evc: 'EVC', invoice: 'Invoice', waafi: 'Waafi', unspecified: 'Unspecified' };
const PRESETS = [{ v: 'today', l: 'Today' }, { v: '7d', l: '7 days' }, { v: '30d', l: '30 days' }];
function toISODate(d) { return d.toISOString().slice(0, 10); }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d; }

function Crumb({ name }) {
  return (
    <nav className="adm-crumb">
      <Link href="/admin/dashboard/insights/staff">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
        Staff performance
      </Link>
      <span className="sep">/</span>
      <span>{name}</span>
    </nav>
  );
}

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

  if (isLoading) {
    return (
      <div className="wrap-narrow">
        <Crumb name="Loading…" />
        <div className="sk" style={{ height: 58, marginBottom: 16 }} />
        <KpiRowSkeleton count={4} style={{ marginBottom: 16 }} />
        <div className="card card-pad"><RowsSkeleton rows={4} /></div>
      </div>
    );
  }
  if (isError || !perf) {
    return (
      <div className="wrap-narrow">
        <Crumb name="Not found" />
        <div className="card card-pad-lg">
          <div className="empty">
            <div className="empty-ring"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg></div>
            <p className="empty-title">Staff member not found</p>
            <p className="empty-sub">They may have been removed. Go back to the staff list.</p>
          </div>
        </div>
      </div>
    );
  }

  const presetLabel = PRESETS.find((p) => p.v === preset)?.l.toLowerCase();

  return (
    <div className="wrap-narrow">
      <Crumb name={perf.staff.name} />

      <div className="detail-h">
        <div>
          <div className="eyebrow">Staff performance</div>
          <div className="h-1">{perf.staff.name}</div>
          <div className="od-tags">
            <span className={`pill role-${(perf.staff.role || 'user').toLowerCase()}`} style={{ textTransform: 'capitalize' }}>{perf.staff.role?.toLowerCase()}</span>
            {!perf.staff.isActive && <span className="pill pill-rose">Inactive</span>}
          </div>
        </div>
        <div className="acts">
          <div className="seg">
            {PRESETS.map((p) => <button key={p.v} className={preset === p.v ? 'active' : ''} onClick={() => setPreset(p.v)}>{p.l}</button>)}
          </div>
        </div>
      </div>

      <div className="kpi-row reveal" style={{ marginBottom: 16 }}>
        <div className="kpi"><div className="kpi-top"><div className="kpi-ic green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg></div><span className="kpi-k">Sales</span></div><div className="kpi-v"><small>$</small>{num(Math.round(perf.total))}</div><div className="kpi-foot"><span>paid orders · {presetLabel}</span></div></div>
        <div className="kpi"><div className="kpi-top"><div className="kpi-ic sky"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="2" /></svg></div><span className="kpi-k">Orders</span></div><div className="kpi-v">{num(perf.orders)}</div><div className="kpi-foot"><span>taken or served</span></div></div>
        <div className="kpi"><div className="kpi-top"><div className="kpi-ic gold"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 5-6" /></svg></div><span className="kpi-k">Avg ticket</span></div><div className="kpi-v"><small>$</small>{Number(perf.avgTicket || 0).toFixed(2)}</div><div className="kpi-foot"><span>per paid order</span></div></div>
        <div className="kpi"><div className="kpi-top"><div className="kpi-ic amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg></div><span className="kpi-k">Invoices created</span></div><div className="kpi-v">{num(perf.invoicesCreated.count)}</div><div className="kpi-foot"><span>{money(perf.invoicesCreated.total)} billed</span></div></div>
      </div>

      <div className="card card-pad reveal" style={{ animationDelay: '.08s', marginBottom: 16 }}>
        <div className="pad-h"><div><div className="eyebrow">Payments</div><div className="h-2">Payment method mix</div></div></div>
        <Bk rows={perf.paymentMethodMix.map((m) => ({ l: METHOD_LABEL[m.method] || m.method, v: m.total, fmt: `${money(m.total)} · ${m.orders}` }))} />
      </div>

      <div className="card reveal" style={{ overflow: 'hidden', animationDelay: '.12s' }}>
        <div className="card-h"><div><div className="ttl">Recent orders</div><div className="note">Latest paid orders in range</div></div></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Ref</th><th>Service</th><th>Method</th><th>When</th><th className="num">Total</th></tr></thead>
            <tbody>
              {perf.recent.length === 0 ? (
                <tr><td colSpan={5} className="td-empty">No orders in this range</td></tr>
              ) : perf.recent.map((o) => (
                <tr key={o.id}>
                  <td className="mono">{o.reference}</td>
                  <td style={{ textTransform: 'capitalize' }}>{o.orderType?.replace('_', '-')}{o.tableNumber ? ` · T${o.tableNumber}` : ''}</td>
                  <td>{METHOD_LABEL[o.paymentMethod] || '—'}</td>
                  <td className="muted">{new Date(o.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
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
