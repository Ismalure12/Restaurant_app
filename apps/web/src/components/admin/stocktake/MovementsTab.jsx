'use client';

import { useState } from 'react';
import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { money } from '@/lib/money';
import {
  Toolbar, Card, CardHeader, Segmented, Select, Table, Th, Td, Tr, LoadMoreBar, EmptyState, ErrorState, RowSkeletons,
} from '@/components/admin/ui';


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
      <Toolbar>
        {kinds.length > 1 && (
          <Segmented label="Movement type" value={type} onChange={setType} options={kinds.map(([k, l]) => ({ value: k, label: l }))} />
        )}
        <Select value={range} onChange={(e) => setRange(e.target.value)} aria-label="Date range" className="!w-auto">
          {RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <span className="flex-1" />
        {items.length > 0 && (
          <Select
            value=""
            aria-label="Record a movement"
            className="!w-auto max-w-full"
            onChange={(e) => { const it = items.find((i) => String(i.id) === e.target.value); if (it) onRecord(it, mode === 'purchases' ? 'purchase' : type); }}
          >
            <option value="">{mode === 'purchases' ? 'Record a purchase for…' : 'Record usage or waste for…'}</option>
            {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </Select>
        )}
      </Toolbar>

      <Card className="overflow-hidden">
        <CardHeader title={label} count={q.isLoading ? null : rows.length + (q.hasNextPage ? '+' : '')} sub={`${from} to ${to}`} />
        {q.isLoading ? <RowSkeletons rows={5} /> : q.isError ? (
          <div className="p-4"><ErrorState error={q.error} onRetry={q.refetch} /></div>
        ) : rows.length === 0 ? (
          <EmptyState icon="inventory" title="Nothing recorded">No {label.toLowerCase()} in this period.</EmptyState>
        ) : (
          <Table label={label} maxH={480} minW={costed ? 640 : 560}>
            <thead>
              <tr><Th>Date</Th><Th>Item</Th><Th align="right">Quantity</Th>{costed && <Th align="right">Cost</Th>}<Th>By</Th><Th>Note</Th></tr>
            </thead>
            <tbody>{rows.map((m) => (
              <Tr key={m.id}>
                <Td mono muted className="whitespace-nowrap">{new Date(m.createdAt).toLocaleDateString([], { day: 'numeric', month: 'short' })}</Td>
                <Td strong>{m.item}</Td>
                <Td align="right" className="font-mq-mono tabular-nums whitespace-nowrap">{m.quantity > 0 && m.type === 'adjustment' ? '+' : ''}{qtyText(m.quantity)} <span className="text-mq-muted">{m.unit}</span></Td>
                {costed && <Td money>{m.totalCost != null ? money(m.totalCost) : '—'}</Td>}
                <Td muted>{m.staff || '—'}</Td>
                <Td muted className="max-w-[260px] truncate" title={m.note || undefined}>{m.note || '—'}</Td>
              </Tr>
            ))}</tbody>
          </Table>
        )}
        <LoadMoreBar shown={rows.length} hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onMore={() => q.fetchNextPage()} noun="movements" />
      </Card>
    </>
  );
}
