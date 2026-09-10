'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';

const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const num = (n) => Number(n || 0).toLocaleString('en-US');
function toISODate(d) { return d.toISOString().slice(0, 10); }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d; }

function sortRows(rows, key, dir) {
  return [...rows].sort((a, b) => (dir === 'asc' ? a[key] - b[key] : b[key] - a[key]));
}

function SortTh({ k, sortKey, sortDir, onSort, children }) {
  return (
    <th className="num" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => onSort(k)}>
      {children}{sortKey === k ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
    </th>
  );
}

function StaffTable({ title, rows, idKey, emptyMsg, style, className = '' }) {
  const [sortKey, setSortKey] = useState('total');
  const [sortDir, setSortDir] = useState('desc');
  const sorted = useMemo(() => sortRows(rows, sortKey, sortDir), [rows, sortKey, sortDir]);
  const toggleSort = (key) => { if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc')); else { setSortKey(key); setSortDir('desc'); } };

  return (
    <div className={`card ${className}`.trim()} style={{ overflow: 'hidden', marginBottom: 16, ...style }}>
      <div style={{ padding: '14px 18px', fontWeight: 620, borderBottom: '1px solid var(--line)' }}>{title}</div>
      <div style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead><tr>
            <th>Name</th>
            <SortTh k="orders" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Orders</SortTh>
            <SortTh k="total" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Sales</SortTh>
            <SortTh k="avgTicket" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Avg ticket</SortTh>
            <th />
          </tr></thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>{emptyMsg}</td></tr>
            ) : sorted.map((r) => (
              <tr key={r[idKey] ?? 'none'}>
                <td style={{ fontWeight: 560, color: 'var(--ink)' }}>{r.name}</td>
                <td className="num">{num(r.orders)}</td>
                <td className="num">{money(r.total)}</td>
                <td className="num">{money(r.avgTicket)}</td>
                <td style={{ textAlign: 'right' }}>
                  {r[idKey] != null ? <Link href={`/admin/dashboard/insights/staff/${r[idKey]}`} className="btn btn-ghost btn-sm">View →</Link> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AllStaffPerformancePage() {
  const [preset, setPreset] = useState('30d');

  const params = useMemo(() => {
    if (preset === 'today') return { from: toISODate(new Date()), to: toISODate(new Date()) };
    if (preset === '7d') return { from: toISODate(daysAgo(6)), to: toISODate(new Date()) };
    return { from: toISODate(daysAgo(29)), to: toISODate(new Date()) };
  }, [preset]);

  const { data: rep, isLoading } = useQuery({
    queryKey: ['rep-summary-staff', params],
    queryFn: () => fetchJson(`/api/admin/reports/summary?${new URLSearchParams(params)}`),
  });

  const waiters = (rep?.waiterPerformance || []).filter((w) => w.waiterId != null);
  const staff = (rep?.salesByStaff || []).filter((s) => s.staffId != null);
  const topPerformer = useMemo(() => {
    const all = [...waiters, ...staff];
    if (all.length === 0) return null;
    return all.reduce((best, r) => (r.total > (best?.total ?? -Infinity) ? r : best), null);
  }, [waiters, staff]);

  return (
    <div style={{ maxWidth: 1200 }}>
      <nav className="adm-crumb" style={{ marginBottom: 14 }}>
        <Link href="/admin/dashboard/insights">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
          Insights
        </Link>
        <span className="sep">/</span>
        <span>All staff performance</span>
      </nav>

      <div className="toolbar reveal" style={{ marginBottom: 16 }}>
        <div className="seg">
          {[{ v: 'today', l: 'Today' }, { v: '7d', l: '7 days' }, { v: '30d', l: '30 days' }].map((p) => (
            <button key={p.v} className={preset === p.v ? 'active' : ''} onClick={() => setPreset(p.v)}>{p.l}</button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="card" style={{ overflow: 'hidden' }}>{[1, 2, 3].map((n) => <div key={n} className="sk" style={{ height: 52, margin: 12, borderRadius: 'var(--r-sm)' }} />)}</div>
      ) : (
        <>
          <div className="kpi-row reveal" style={{ marginBottom: 16 }}>
            <div className="kpi">
              <div className="kpi-top"><div className="kpi-ic gold"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" /><line x1="16" y1="8" x2="2" y2="22" /><line x1="17.5" y1="15" x2="9" y2="15" /></svg></div><span className="kpi-k">Waiters</span></div>
              <div className="kpi-v">{num(waiters.length)}</div>
            </div>
            <div className="kpi">
              <div className="kpi-top"><div className="kpi-ic sky"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="2" /></svg></div><span className="kpi-k">Cashiers &amp; managers</span></div>
              <div className="kpi-v">{num(staff.length)}</div>
            </div>
            <div className="kpi">
              <div className="kpi-top"><div className="kpi-ic green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2l3 7h7l-5.5 4.5L18.5 21 12 16.5 5.5 21l2-7.5L2 9h7z" /></svg></div><span className="kpi-k">Top performer</span></div>
              <div className="kpi-v" style={{ fontSize: 19 }}>{topPerformer?.name || '—'}</div>
              <div className="kpi-foot"><span>{topPerformer ? money(topPerformer.total) : 'No sales in range'}</span></div>
            </div>
          </div>
          <StaffTable title="Waiters" rows={waiters} idKey="waiterId" emptyMsg="No waiter sales in range" style={{ animationDelay: '.08s' }} className="reveal" />
          <StaffTable title="Cashiers & managers" rows={staff} idKey="staffId" emptyMsg="No staff sales in range" style={{ animationDelay: '.12s' }} className="reveal" />
        </>
      )}
    </div>
  );
}
