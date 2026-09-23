'use client';

import Link from 'next/link';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import Bk from '@/components/admin/Bk';
import { KpiRowSkeleton, RowsSkeleton } from '@/components/admin/Skeletons';
import {
  Card, Empty, ErrorNote, FilterSelect, Kpi, PrintHead, RangePicker, Toolbar, labelOf, money, num, useReportParams,
} from '@/components/admin/reports/ReportKit';

const API = '/api/admin/reports/inventory';
const TYPES = [
  { value: 'purchase', label: 'Purchases' }, { value: 'usage', label: 'Usage' },
  { value: 'waste', label: 'Waste' }, { value: 'adjustment', label: 'Adjustments' },
];

export default function InventoryReportPage() {
  const { preset, range, filters, set, query } = useReportParams('30d', ['itemId', 'type']);
  const { data: r, isLoading, isError, error } = useQuery({ queryKey: ['rpt-inventory', query], queryFn: () => fetchJson(`${API}?${query}`) });
  // The item filter's options come from the unfiltered stock list.
  const { data: stock = [] } = useQuery({ queryKey: ['inventory-items'], queryFn: () => fetchJson('/api/admin/inventory'), staleTime: 60 * 1000 });

  const moves = useInfiniteQuery({
    queryKey: ['rpt-movements', query],
    queryFn: ({ pageParam }) => fetchJson(`${API}/movements?${query}&limit=50${pageParam ? `&cursor=${pageParam}` : ''}`),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const moveRows = moves.data?.pages.flatMap((p) => p.rows) ?? [];
  const s = r?.summary;
  const items = r?.items || [];
  const itemOptions = (Array.isArray(stock) ? stock : stock.items || []).map((i) => ({ value: String(i.id), label: i.name }));

  const exports = [
    { label: 'Movement totals by item', href: `${API}?${query}&format=csv&table=stock` },
    { label: 'Movement ledger', href: `${API}/movements?${query}&format=csv` },
    { label: 'Purchases by supplier', href: `${API}?${query}&format=csv&table=suppliers` },
  ];

  return (
    <>
      <Toolbar exports={exports}>
        <RangePicker preset={preset} range={range} set={set} />
        <FilterSelect label="Item" value={filters.itemId} options={itemOptions} onChange={(v) => set({ itemId: v })} />
        <FilterSelect label="Movement" value={filters.type} options={TYPES} onChange={(v) => set({ type: v })} />
      </Toolbar>
      <PrintHead title="Inventory report" range={range} preset={preset} filters={{ Item: itemOptions.find((o) => o.value === filters.itemId)?.label, Movement: labelOf('movement', filters.type) }} />
      {isError && <ErrorNote error={error} />}

      {/* Stock on hand, its value and low-stock counts live on the Inventory page. */}
      {isLoading ? <KpiRowSkeleton count={3} style={{ marginBottom: 16 }} /> : s && (
        <div className="kpi-row rpt-kpis">
          <Kpi label="Purchases" tone="green" value={money(s.purchases)} foot="bought in range" />
          <Kpi label="Used" value={money(s.usageValue)} foot="logged usage at cost" />
          <Kpi label="Wasted" tone="rose" value={money(s.wasteValue)} foot="logged waste at cost" />
        </div>
      )}

      <Card eyebrow="Suppliers" title="Purchases by supplier">
        <Bk loading={isLoading} rows={(r?.bySupplier || []).map((x) => ({ l: x.supplier, v: x.cost, fmt: `${money(x.cost)} · ${x.items} items` }))} empty="No purchases with a cost in this range." />
      </Card>

      <Card flush title="Movements by item" action={<Link className="btn btn-ghost btn-sm rpt-noprint" href="/admin/dashboard/inventory">Stock on hand →</Link>}>
        {isLoading ? <RowsSkeleton className="card-pad" /> : (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Item</th><th className="num">Bought</th><th className="num">Used</th><th className="num">Wasted</th></tr></thead>
              <tbody>
                {items.length === 0 ? <tr><td colSpan={4} className="td-empty">No stock items</td></tr> : items.map((i) => (
                  <tr key={i.id}>
                    <td className="strong">{i.name}{i.supplier ? <div className="sub">{i.supplier}</div> : null}</td>
                    <td className="num">{i.purchasedQty ? `${num(i.purchasedQty)} ${i.unit} · ${money(i.purchaseCost)}` : '—'}</td>
                    <td className="num">{i.usedQty ? `${num(i.usedQty)} ${i.unit}` : '—'}</td>
                    <td className="num">{i.wastedQty ? `${num(i.wastedQty)} ${i.unit}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card flush title="Movement ledger">
        {moves.isLoading ? <RowsSkeleton className="card-pad" /> : moveRows.length === 0 ? <Empty>No stock movements in this range.</Empty> : (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>When</th><th>Item</th><th>Type</th><th className="num">Quantity</th><th className="num">Cost</th><th>By</th><th>Note</th></tr></thead>
              <tbody>
                {moveRows.map((m) => (
                  <tr key={m.id}>
                    <td>{new Date(m.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="strong">{m.item}</td>
                    <td style={{ textTransform: 'capitalize' }}>{m.type}</td>
                    <td className="num">{m.quantity > 0 ? '+' : ''}{num(m.quantity)} {m.unit}</td>
                    <td className="num">{m.totalCost != null ? money(m.totalCost) : '—'}</td>
                    <td>{m.staff || '—'}</td>
                    <td>{m.note || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {moves.hasNextPage && (
          <div className="card-foot rpt-noprint">
            <button className="btn btn-ghost btn-sm" onClick={() => moves.fetchNextPage()} disabled={moves.isFetchingNextPage}>{moves.isFetchingNextPage ? 'Loading…' : 'Load more'}</button>
          </div>
        )}
      </Card>
    </>
  );
}
