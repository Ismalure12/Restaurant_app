'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { KpiRowSkeleton, RowsSkeleton } from '@/components/admin/Skeletons';

const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (n) => Number(n || 0).toLocaleString('en-US');
function toISODate(d) { return d.toISOString().slice(0, 10); }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d; }
const PRESETS = [{ v: 'today', l: 'Today' }, { v: '7d', l: '7 days' }, { v: '30d', l: '30 days' }];

function sortRows(rows, key, dir) {
  return [...rows].sort((a, b) => (dir === 'asc' ? a[key] - b[key] : b[key] - a[key]));
}

function SortTh({ k, sortKey, sortDir, onSort, children }) {
  const active = sortKey === k;
  return (
    <th className="num sortable" onClick={() => onSort(k)} aria-sort={active ? (sortDir === 'desc' ? 'descending' : 'ascending') : 'none'}>
      {children}{active && <span className="arr">{sortDir === 'desc' ? '↓' : '↑'}</span>}
    </th>
  );
}

function StaffTable({ title, rows, idKey, emptyMsg, delay }) {
  const [sortKey, setSortKey] = useState('total');
  const [sortDir, setSortDir] = useState('desc');
  const sorted = useMemo(() => sortRows(rows, sortKey, sortDir), [rows, sortKey, sortDir]);
  const toggleSort = (key) => { if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc')); else { setSortKey(key); setSortDir('desc'); } };

  return (
    <div className="card reveal" style={{ overflow: 'hidden', marginBottom: 16, animationDelay: delay }}>
      <div className="card-h">
        <div><div className="ttl">{title}</div><div className="note">{rows.length === 1 ? '1 person' : `${num(rows.length)} people`} with sales in range</div></div>
      </div>
      <div className="table-wrap">
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
              <tr><td colSpan={5} className="td-empty">{emptyMsg}</td></tr>
            ) : sorted.map((r) => (
              <tr key={r[idKey] ?? 'none'}>
                <td className="strong">{r.name}</td>
                <td className="num">{num(r.orders)}</td>
                <td className="num">{money(r.total)}</td>
                <td className="num">{money(r.avgTicket)}</td>
                <td className="act">
                  {r[idKey] != null ? <Link href={`/admin/dashboard/insights/staff/${r[idKey]}`} className="btn btn-ghost btn-sm">Details</Link> : null}
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

  const waiters = useMemo(() => (rep?.waiterPerformance || []).filter((w) => w.waiterId != null), [rep]);
  const staff = useMemo(() => (rep?.salesByStaff || []).filter((s) => s.staffId != null), [rep]);
  const summary = useMemo(() => {
    const all = [...waiters, ...staff];
    const top = all.reduce((best, r) => (r.total > (best?.total ?? -Infinity) ? r : best), null);
    const total = all.reduce((s, r) => s + Number(r.total || 0), 0);
    return { top, total };
  }, [waiters, staff]);
  const presetLabel = PRESETS.find((p) => p.v === preset)?.l.toLowerCase();

  return (
    <div className="wrap">
      <nav className="adm-crumb">
        <Link href="/admin/dashboard/insights">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
          Insights
        </Link>
        <span className="sep">/</span>
        <span>Staff performance</span>
      </nav>

      <div className="toolbar">
        <div className="seg">
          {PRESETS.map((p) => <button key={p.v} className={preset === p.v ? 'active' : ''} onClick={() => setPreset(p.v)}>{p.l}</button>)}
        </div>
      </div>

      {isLoading ? (
        <>
          <KpiRowSkeleton count={3} style={{ marginBottom: 16 }} />
          {[0, 1].map((i) => <div key={i} className="card card-pad" style={{ marginBottom: 16 }}><RowsSkeleton rows={4} /></div>)}
        </>
      ) : (
        <>
          <div className="kpi-row reveal" style={{ marginBottom: 16 }}>
            <div className="kpi">
              <div className="kpi-top"><div className="kpi-ic gold"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg></div><span className="kpi-k">Waiters</span></div>
              <div className="kpi-v">{num(waiters.length)}</div>
              <div className="kpi-foot"><span>with sales · {presetLabel}</span></div>
            </div>
            <div className="kpi">
              <div className="kpi-top"><div className="kpi-ic sky"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="4" y="3" width="16" height="18" rx="2" /><rect x="7" y="6" width="10" height="4" rx="1" /></svg></div><span className="kpi-k">Cashiers &amp; managers</span></div>
              <div className="kpi-v">{num(staff.length)}</div>
              <div className="kpi-foot"><span>{money(summary.total)} combined sales</span></div>
            </div>
            <div className="kpi">
              <div className="kpi-top"><div className="kpi-ic green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2l3 7h7l-5.5 4.5L18.5 21 12 16.5 5.5 21l2-7.5L2 9h7z" /></svg></div><span className="kpi-k">Top performer</span></div>
              <div className="kpi-v is-text">{summary.top?.name || '—'}</div>
              <div className="kpi-foot"><span>{summary.top ? `${money(summary.top.total)} · ${num(summary.top.orders)} orders` : 'No sales in range'}</span></div>
            </div>
          </div>
          <StaffTable title="Waiters" rows={waiters} idKey="waiterId" emptyMsg="No waiter sales in this range" delay=".08s" />
          <StaffTable title="Cashiers & managers" rows={staff} idKey="staffId" emptyMsg="No staff sales in this range" delay=".12s" />
        </>
      )}
    </div>
  );
}
