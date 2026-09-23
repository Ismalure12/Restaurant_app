'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import useStaffList from '@/hooks/useStaffList';
import { RowsSkeleton } from '@/components/admin/Skeletons';
import { Card, Empty, ErrorNote, FilterSelect, PeriodPicker, useReportParams } from '@/components/admin/reports/ReportKit';

// Plain-language names for the actions the API records (lib/db/audit.ts callers).
const ACTIONS = {
  'order.void': 'Voided a sale', 'order.edit': 'Edited a sale',
  'account.create': 'Added a money account', 'account.update': 'Changed a money account',
  'cashbook.opening': 'Set opening balances', 'cashbook.transfer': 'Moved money between accounts',
  'cashbook.owner_in': 'Owner put money in', 'cashbook.owner_out': 'Owner took money out',
  'day.close': 'Closed a day', 'day.reopen': 'Reopened a day',
  'month.close': 'Closed a month', 'month.reopen': 'Reopened a month',
  'year.close': 'Closed a year', 'year.reopen': 'Reopened a year',
  'expense-category.kind': 'Changed an expense category',
  'online_payment.dismiss': 'Dismissed an online payment',
  'permissions.update': 'Changed staff access',
  'settings.update': 'Changed settings',
  'staff.accounts': 'Changed staff wallet numbers',
  'stockcount.start': 'Started a stock count', 'stockcount.post': 'Posted a stock count', 'stockcount.discard': 'Discarded a stock count',
  'supplier.create': 'Added a supplier', 'supplier.update': 'Changed a supplier', 'supplier.payment': 'Paid a supplier',
  'table.create': 'Added a table', 'table.update': 'Changed a table', 'table.delete': 'Removed a table',
  'user.create': 'Added a staff account', 'user.update': 'Changed a staff account', 'user.delete': 'Removed a staff account',
};
const actionLabel = (a) => ACTIONS[a] || a.replace(/[._-]+/g, ' ').replace(/^./, (c) => c.toUpperCase());
// The API records the table name (Prisma model); staff read these instead.
const ENTITIES = {
  Order: 'Sale', AccountEntry: 'Cash book', MoneyAccount: 'Money account', AdminUser: 'Staff account',
  DayClose: 'Day close', PeriodClose: 'Month / year close', DiningTable: 'Table', ExpenseCategory: 'Expense category',
  Setting: 'Settings', StockCount: 'Stock count', Supplier: 'Supplier', payment_session: 'Online payment', StaffAccount: 'Staff wallet numbers',
};
const entityLabel = (e) => ENTITIES[e] || e.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, (c) => c.toUpperCase());
const when = (d) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const itemHref = (r) => (r.entity === 'Order' && r.entityId ? `/admin/dashboard/orders/${r.entityId}` : null);

// A value in plain words: lists read "504875 (A/C), …", an empty list "none".
function show(v) {
  if (v == null || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.map((x) => (x && typeof x === 'object' ? Object.values(x).filter((y) => y != null && typeof y !== 'object').join(' ') : String(x))).join(', ') : 'none';
  if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k} ${typeof x === 'object' ? JSON.stringify(x) : x}`).join(', ');
  return String(v);
}
/** meta → readable lines: { role: {from, to} } → "role: waiter → cashier". Nested one level (permissions). */
function metaLines(meta, prefix = '') {
  if (meta == null || typeof meta !== 'object') return meta == null ? [] : [show(meta)];
  const out = [];
  for (const [k, v] of Object.entries(meta)) {
    const key = prefix ? `${prefix} · ${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && 'from' in v && 'to' in v) out.push(`${key}: ${show(v.from)} → ${show(v.to)}`);
    else if (v && typeof v === 'object' && !Array.isArray(v) && !prefix) out.push(...metaLines(v, k));
    else out.push(`${key}: ${show(v)}`);
  }
  return out;
}

function Details({ meta }) {
  const lines = metaLines(meta);
  if (!lines.length) return <span className="sub">—</span>;
  if (lines.length === 1) return <span className="al-meta-one">{lines[0]}</span>;
  return (
    <details className="al-meta">
      <summary>{lines.length} details</summary>
      <ul>{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
    </details>
  );
}

/**
 * Settings › Audit log (admin + manager): who changed money, sales, accounts,
 * settings or staff access, and when. GET /api/admin/audit-log, newest first,
 * 50 a page with "Load more".
 */
export default function AuditLogPage() {
  const { preset, range, filters, set, query } = useReportParams('30d', ['entity', 'actorId', 'q']);
  const { staff } = useStaffList();
  const people = staff.map((u) => ({ value: String(u.id), label: u.name || u.email }));

  // Search box: type freely, the URL follows 300ms later.
  const [term, setTerm] = useState(filters.q || '');
  useEffect(() => {
    const t = setTimeout(() => { if ((filters.q || '') !== term.trim()) set({ q: term.trim() }); }, 300);
    return () => clearTimeout(t);
  }, [term, filters.q, set]);

  const q = useInfiniteQuery({
    queryKey: ['audit-log', query],
    initialPageParam: null,
    queryFn: ({ pageParam }) => fetchJson(`/api/admin/audit-log?${query}${pageParam ? `&cursor=${pageParam}` : ''}`),
    getNextPageParam: (last) => last.nextCursor || undefined,
  });
  const rows = q.data?.pages.flatMap((p) => p.rows) || [];
  const entities = (q.data?.pages[0]?.entities || []).map((e) => ({ value: e, label: entityLabel(e) }));

  return (
    <>
      <div className="toolbar rpt-toolbar al-toolbar">
        <PeriodPicker preset={preset} range={range} set={set} />
        <FilterSelect label="Item" value={filters.entity} options={entities} onChange={(v) => set({ entity: v })} />
        <FilterSelect label="Who" value={filters.actorId} options={people} onChange={(v) => set({ actorId: v })} />
        <label className="search al-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search action or item #" aria-label="Search the audit log" maxLength={80} />
        </label>
      </div>
      {q.isError && <ErrorNote error={q.error} />}

      <Card eyebrow="Who changed what" title="Audit log" flush>
        {q.isLoading ? <RowsSkeleton className="card-pad" rows={6} /> : rows.length === 0 ? <Empty>Nothing was recorded for these filters.</Empty> : (
          <div className="table-wrap">
            <table className="table al-table">
              <thead><tr><th>When</th><th>Who</th><th>What</th><th>Item</th><th>Details</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const href = itemHref(r);
                  const item = `${entityLabel(r.entity)}${r.entityId ? ` #${r.entityId}` : ''}`;
                  return (
                    <tr key={r.id}>
                      <td className="mono al-when" data-label="When">{when(r.at)}</td>
                      <td data-label="Who">{r.actor ? <><span className="strong">{r.actor.name}</span><div className="sub">{r.actor.role}</div></> : <span className="sub">System</span>}</td>
                      <td className="strong al-what" data-label="What">{actionLabel(r.action)}</td>
                      <td data-label="Item">{href ? <Link href={href}>{item}</Link> : item}</td>
                      <td className="al-details" data-label="Details"><Details meta={r.meta} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {q.hasNextPage && (
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <button type="button" className="btn btn-ghost" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>{q.isFetchingNextPage ? 'Loading…' : 'Load more'}</button>
        </div>
      )}
    </>
  );
}
