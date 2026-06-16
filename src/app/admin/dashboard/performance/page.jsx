'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

export default function PerformancePage() {
  const [me, setMe] = useState(null);
  useEffect(() => { fetch('/api/auth/me').then((r) => r.json()).then(setMe).catch(() => {}); }, []);
  const { data, isLoading } = useQuery({ queryKey: ['my-performance'], queryFn: () => fetchJson('/api/admin/me/performance') });
  const d = data || {};

  const kpis = [
    { k: 'Sales today', v: money(d.todaySales), sub: `${d.todayOrders || 0} orders`, ic: 'green' },
    { k: 'Orders today', v: d.todayOrders ?? 0, sub: 'placed today', ic: 'sky' },
    { k: 'Sales · 7 days', v: money(d.weekSales), sub: `${d.weekOrders || 0} orders`, ic: 'gold' },
    { k: 'All-time sales', v: money(d.totalSales), sub: `${d.totalOrders || 0} orders`, ic: 'ink' },
  ];

  return (
    <div style={{ maxWidth: 980 }}>
      <div className="kpi-row reveal" style={{ marginBottom: 16 }}>
        {kpis.map((kpi) => (
          <div key={kpi.k} className="kpi">
            <div className="kpi-top"><div className={`kpi-ic ${kpi.ic}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 5-6" /></svg></div><span className="kpi-k">{kpi.k}</span></div>
            <div className="kpi-v">{kpi.v}</div>
            <div className="kpi-foot"><span>{kpi.sub}</span></div>
          </div>
        ))}
      </div>

      <div className="card reveal" style={{ overflow: 'hidden', animationDelay: '.08s' }}>
        <div className="card-pad" style={{ paddingBottom: 8 }}><div className="eyebrow">{me ? `${me.name || me.email} · ${me.role || ''}` : 'You'}</div><div className="h-2" style={{ marginTop: 2 }}>Recent orders</div></div>
        {isLoading ? (
          <div className="card-pad">{[1, 2, 3].map((n) => <div key={n} className="sk" style={{ height: 16, marginBottom: 10 }} />)}</div>
        ) : (d.recent || []).length === 0 ? (
          <div className="empty" style={{ padding: '40px 20px' }}><p className="empty-sub">No orders attributed to you yet. Ring one up in the Register.</p></div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table"><thead><tr><th>Ref</th><th>Type</th><th>When</th><th className="num">Total</th></tr></thead>
              <tbody>
                {d.recent.map((o) => (
                  <tr key={o.id}><td className="mono">#{o.id}</td><td style={{ textTransform: 'capitalize', color: 'var(--muted)' }}>{(o.orderType || '').replace('_', '-')}{o.tableNumber ? ` · ${o.tableNumber}` : ''}</td><td style={{ color: 'var(--muted)' }}>{new Date(o.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td><td className="num">{money(o.total)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
