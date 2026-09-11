'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { KpiRowSkeleton, RowsSkeleton } from '@/components/admin/Skeletons';

const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n) => `$${fmt(n)}`;
const MoneyIc = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>;
const ListIc = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="2" /></svg>;
const ChartIc = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 5-6" /></svg>;

export default function PerformancePage() {
  const [me, setMe] = useState(null);
  useEffect(() => { fetch('/api/auth/me').then((r) => r.json()).then(setMe).catch(() => {}); }, []);
  const { data, isLoading } = useQuery({ queryKey: ['my-performance'], queryFn: () => fetchJson('/api/admin/me/performance') });
  const d = data || {};

  const kpis = [
    { k: 'Sales today', money: d.todaySales, sub: `${d.todayOrders || 0} orders`, ic: 'green', icon: MoneyIc },
    { k: 'Orders today', count: d.todayOrders ?? 0, sub: 'placed today', ic: 'sky', icon: ListIc },
    { k: 'Sales · 7 days', money: d.weekSales, sub: `${d.weekOrders || 0} orders`, ic: 'gold', icon: ChartIc },
    { k: 'All-time sales', money: d.totalSales, sub: `${d.totalOrders || 0} orders`, ic: 'ink', icon: MoneyIc },
  ];
  const recent = d.recent || [];

  return (
    <div className="wrap">
      {isLoading ? <KpiRowSkeleton count={4} style={{ marginBottom: 16 }} /> : (
        <div className="kpi-row reveal" style={{ marginBottom: 16 }}>
          {kpis.map((kpi) => (
            <div key={kpi.k} className="kpi">
              <div className="kpi-top"><div className={`kpi-ic ${kpi.ic}`}>{kpi.icon}</div><span className="kpi-k">{kpi.k}</span></div>
              <div className="kpi-v">{kpi.money !== undefined ? <><small>$</small>{fmt(kpi.money)}</> : kpi.count}</div>
              <div className="kpi-foot"><span>{kpi.sub}</span></div>
            </div>
          ))}
        </div>
      )}

      <div className="card reveal" style={{ overflow: 'hidden', animationDelay: '.08s' }}>
        <div className="card-h">
          <div>
            <div className="ttl">Recent orders</div>
            <div className="note" style={{ textTransform: 'capitalize' }}>{me ? `${me.name || me.email} · ${me.role || ''}` : 'Your sales'}</div>
          </div>
        </div>
        {isLoading ? (
          <RowsSkeleton rows={4} className="card-pad" />
        ) : recent.length === 0 ? (
          <div className="empty">
            <div className="empty-ring">{ListIc}</div>
            <p className="empty-title">No orders yet</p>
            <p className="empty-sub">Orders you take or serve will show up here. Ring one up in the Register.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table" style={{ marginTop: 12 }}>
              <thead><tr><th>Order</th><th>Service</th><th>When</th><th className="num">Total</th></tr></thead>
              <tbody>
                {recent.map((o) => (
                  <tr key={o.id}>
                    <td className="mono strong">#{o.id}</td>
                    <td className="muted" style={{ textTransform: 'capitalize' }}>{(o.orderType || '').replace('_', '-')}{o.tableNumber ? ` · Table ${o.tableNumber}` : ''}</td>
                    <td className="muted">{new Date(o.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="num">{money(o.total)}</td>
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
