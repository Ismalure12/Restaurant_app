'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import Bk from '@/components/admin/Bk';
import {
  ActiveFilters, ErrorNote, ExportBar, FilterSelect, FiltersButton, PeriodPicker, PrintHead, RangeNote, labelOf, money, num, useReportParams,
} from '@/components/admin/reports/ReportKit';
import {
  Button, Card, CardHeader, EmptyRow, EmptyState, Kpi, KpiGrid, KpiSkeletons, LoadMoreBar, RowSkeletons,
  Table, Td, Th, Tr,
} from '@/components/admin/ui';

const API = '/api/admin/reports/inventory';
const TYPES = [
  { value: 'purchase', label: 'Purchases' }, { value: 'usage', label: 'Usage' },
  { value: 'waste', label: 'Waste' }, { value: 'adjustment', label: 'Adjustments' },
];
const when = (d) => new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Inventory report: purchases, usage and waste in the range. Stock on hand,
 * its value and low stock live on the Inventory page only.
 */
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
  const itemName = itemOptions.find((o) => o.value === filters.itemId)?.label;
  const active = ['itemId', 'type'].filter((k) => filters[k]).length;
  const clearFilters = () => set({ itemId: '', type: '' });
  const chips = [
    filters.itemId && { key: 'itemId', label: `Item: ${itemName || '…'}`, onRemove: () => set({ itemId: '' }) },
    filters.type && { key: 'type', label: `Movement: ${TYPES.find((t) => t.value === filters.type)?.label || filters.type}`, onRemove: () => set({ type: '' }) },
  ].filter(Boolean);

  const exports = [
    { label: 'Movement totals by item', href: `${API}?${query}&format=csv&table=stock` },
    { label: 'Movement ledger', href: `${API}/movements?${query}&format=csv` },
    { label: 'Purchases by supplier', href: `${API}?${query}&format=csv&table=suppliers` },
  ];

  return (
    <>
      <div className="flex items-center gap-2.5 flex-wrap rpt-noprint">
        <PeriodPicker preset={preset} range={range} set={set} />
        <FiltersButton active={active} onClear={clearFilters}>
          <FilterSelect label="Item" value={filters.itemId} options={itemOptions} onChange={(v) => set({ itemId: v })} all="All items" />
          <FilterSelect label="Movement" value={filters.type} options={TYPES} onChange={(v) => set({ type: v })} all="All movements" />
        </FiltersButton>
        <span className="flex-1" />
        <RangeNote preset={preset} range={range} compare={false} />
        <ExportBar exports={exports} />
      </div>
      <ActiveFilters items={chips} onClear={clearFilters} />
      <PrintHead title="Inventory report" range={range} preset={preset} filters={{ Item: itemName, Movement: labelOf('movement', filters.type) }} />
      {isError && <ErrorNote error={error} />}

      {/* Stock on hand, its value and low-stock counts live on the Inventory page. */}
      {isLoading ? <KpiSkeletons count={3} min={180} /> : s && (
        <KpiGrid min={180}>
          <Kpi label="Purchases" value={money(s.purchases)} foot="bought in range, at cost" />
          <Kpi label="Usage" value={money(s.usageValue)} foot="logged usage at cost" />
          <Kpi label="Waste" value={money(s.wasteValue)} foot="logged waste at cost" />
        </KpiGrid>
      )}

      <Card className="overflow-hidden">
        <CardHeader eyebrow="Purchases by supplier" title="What each supplier delivered with a cost" />
        <div className="p-4">
          <Bk loading={isLoading} rows={(r?.bySupplier || []).map((x) => ({ l: x.supplier, v: x.cost, fmt: `${money(x.cost)} · ${x.items} items` }))} empty="No purchases with a cost in this range." />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          eyebrow="Movement totals" title="By item" count={isLoading ? null : items.length}
          actions={<Button href="/admin/dashboard/inventory" variant="ghost" size="xs" iconRight="arrowRight" className="rpt-noprint">Stock on hand</Button>}
        />
        {isLoading ? <RowSkeletons /> : (
          <Table maxH={460} minW={520} label="Movement totals by item">
            <thead><tr><Th>Item</Th><Th align="right">Bought</Th><Th align="right">Used</Th><Th align="right">Wasted</Th></tr></thead>
            <tbody>
              {items.length === 0 ? <EmptyRow cols={4}>No stock items.</EmptyRow> : items.map((i) => (
                <Tr key={i.id}>
                  <Td strong>{i.name}{i.supplier && <span className="block text-xs font-normal text-mq-muted">{i.supplier}</span>}</Td>
                  <Td mono align="right">{i.purchasedQty ? <>{num(i.purchasedQty)} {i.unit}<span className="block text-xs text-mq-muted">{money(i.purchaseCost)}</span></> : '—'}</Td>
                  <Td mono align="right">{i.usedQty ? `${num(i.usedQty)} ${i.unit}` : '—'}</Td>
                  <Td mono align="right">{i.wastedQty ? `${num(i.wastedQty)} ${i.unit}` : '—'}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader eyebrow="Movement ledger" title="Every movement in the period" />
        {moves.isLoading ? <RowSkeletons /> : moves.isError ? <div className="p-4"><ErrorNote error={moves.error} /></div> : moveRows.length === 0 ? (
          <EmptyState icon="inventory" title="No stock movements">Nothing was bought, used, wasted or adjusted in this range.</EmptyState>
        ) : (
          <>
            <Table maxH={480} minW={760} label="Movement ledger">
              <thead><tr><Th>When</Th><Th>Item</Th><Th>Type</Th><Th align="right">Quantity</Th><Th align="right">Cost</Th><Th>By</Th><Th>Note</Th></tr></thead>
              <tbody>
                {moveRows.map((m) => (
                  <Tr key={m.id}>
                    <Td mono className="whitespace-nowrap">{when(m.createdAt)}</Td>
                    <Td strong>{m.item}</Td>
                    <Td className="capitalize">{m.type}</Td>
                    <Td mono align="right" className="whitespace-nowrap">{m.quantity > 0 ? '+' : ''}{num(m.quantity)} {m.unit}</Td>
                    <Td money>{m.totalCost != null ? money(m.totalCost) : '—'}</Td>
                    <Td>{m.staff || '—'}</Td>
                    <Td muted>{m.note || ''}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <div className="rpt-noprint">
              <LoadMoreBar shown={moveRows.length} hasMore={moves.hasNextPage} loading={moves.isFetchingNextPage} onMore={() => moves.fetchNextPage()} noun="movements" />
            </div>
          </>
        )}
      </Card>
    </>
  );
}
