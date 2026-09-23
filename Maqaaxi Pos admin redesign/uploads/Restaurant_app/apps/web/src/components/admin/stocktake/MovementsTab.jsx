'use client';

import { useState } from 'react';
import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { fetchJson, parseApiError } from '@/lib/apiError';
import { RowsSkeleton } from '@/components/admin/Skeletons';
import { money } from '@/lib/money';


const qtyText = (n) => Number(Number(n).toFixed(3)).toString();
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const RANGES = [['30d', '30 days'], ['month', 'This month'], ['90d', '90 days'], ['year', 'This year']];
function rangeOf(r) {
  const now = new Date();
  const to = iso(now);
  if (r === 'month') return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to };
  if (r === '90d') return { from: iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89)), to };
  if (r === 'year') return { from: iso(new Date(now.getFullYear(), 0, 1)), to };
  return { from: iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)), to };
}
const KINDS = {
  purchases: [['purchase', 'Purchases']],
  usage: [['usage', 'Usage'], ['waste', 'Waste'], ['adjustment', 'Adjustments']],
};

/**
 * Inventory > Purchases | Usage & waste: the stock movement ledger
 * (GET /api/admin/reports/inventory/movements, manager tier), one movement
 * type at a time. `items` fills the "record for…" picker that opens the
 * page's movement sheet.
 */
export default function MovementsTab({ mode, items, onRecord }) {
  const kinds = KINDS[mode];
  const [type, setType] = useState(kinds[0][0]);
  const [range, setRange] = useState('30d');
  const { from, to } = rangeOf(range);

  const q = useInfiniteQuery({
    queryKey: ['inv-movements', { type, from, to }],
    initialPageParam: null,
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams({ from, to, type, limit: '50' });
      if (pageParam) p.set('cursor', String(pageParam));
      return fetchJson(`/api/admin/reports/inventory/movements?${p}`);
    },
    getNextPageParam: (last) => last.nextCursor || undefined,
  });
  const rows = (q.data?.pages || []).flatMap((p) => p.rows || []);
  const costed = type === 'purchase';
  const label = kinds.find(([k]) => k === type)[1];

  return (
    <>
      <div className="toolbar">
        {kinds.length > 1 && (
          <div className="seg">{kinds.map(([k, l]) => <button key={k} className={type === k ? 'active' : ''} onClick={() => setType(k)}>{l}</button>)}</div>
        )}
        <select className="input" style={{ width: 'auto' }} value={range} onChange={(e) => setRange(e.target.value)} aria-label="Date range">
          {RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <select className="input" style={{ width: 'auto', maxWidth: '100%' }} value="" aria-label="Record a movement" onChange={(e) => { const it = items.find((i) => String(i.id) === e.target.value); if (it) onRecord(it, mode === 'purchases' ? 'purchase' : type); }}>
          <option value="">{mode === 'purchases' ? 'Record a purchase for…' : 'Record usage or waste for…'}</option>
          {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      </div>

      <div className="card reveal" style={{ overflow: 'hidden' }}>
        <div className="card-h"><div><div className="ttl">{label}</div><div className="note">{from} to {to}</div></div></div>
        {q.isLoading ? <RowsSkeleton rows={5} className="card-pad" /> : q.isError ? (
          <div className="card-pad"><div className="adm-error-banner">{parseApiError(q.error)}</div></div>
        ) : rows.length === 0 ? (
          <div className="empty"><p className="empty-title">Nothing recorded</p><p className="empty-sub">No {label.toLowerCase()} in this period.</p></div>
        ) : (
          <div className="table-wrap"><table className="table" style={{ marginTop: 12 }}>
            <thead><tr><th>Date</th><th>Item</th><th className="num">Quantity</th>{costed && <th className="num">Cost</th>}<th>By</th><th>Note</th></tr></thead>
            <tbody>{rows.map((m) => (
              <tr key={m.id}>
                <td className="muted" style={{ whiteSpace: 'nowrap' }}>{new Date(m.createdAt).toLocaleDateString([], { day: 'numeric', month: 'short' })}</td>
                <td className="strong">{m.item}</td>
                <td className="num">{m.quantity > 0 && m.type === 'adjustment' ? '+' : ''}{qtyText(m.quantity)} <span className="muted">{m.unit}</span></td>
                {costed && <td className="num">{m.totalCost != null ? money(m.totalCost) : '—'}</td>}
                <td className="muted">{m.staff || '—'}</td>
                <td className="muted">{m.note || '—'}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {q.hasNextPage && (
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <button className="btn btn-ghost" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>{q.isFetchingNextPage ? 'Loading…' : 'Load more'}</button>
        </div>
      )}
    </>
  );
}
