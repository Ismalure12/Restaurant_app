'use client';

import { useState, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import useConfirm from '@/hooks/useConfirm';
import useMoneyAccounts from '@/hooks/useMoneyAccounts';
import useSuppliers from '@/hooks/useSuppliers';
import useAccess from '@/hooks/useAccess';
import MovementsTab from '@/components/admin/stocktake/MovementsTab';
import CountsTab from '@/components/admin/stocktake/CountsTab';
import { ItemModal, MovementModal } from '@/components/admin/inventory/StockModals';
import { money } from '@/lib/money';
import {
  Page, Toolbar, Card, Kpi, KpiGrid, KpiSkeletons, Button, Chip, Segmented, SearchInput,
  Table, Th, Td, Tr, EmptyState, ErrorState, RowSkeletons, NoAccess, cx,
} from '@/components/admin/ui';

const TABS = [['stock', 'Stock'], ['purchases', 'Purchases'], ['usage', 'Usage & waste'], ['counts', 'Counts']];
const STATUS = {
  out: { label: 'Out', tone: 'danger', bar: 'bg-mq-danger', row: 'bg-mq-danger-bg/40' },
  low: { label: 'Low', tone: 'warn', bar: 'bg-mq-warn', row: 'bg-mq-warn-bg/50' },
  ok: { label: 'In stock', tone: 'ok', bar: 'bg-mq-primary', row: '' },
};
const statusOf = (it) => (Number(it.quantity) <= 0 ? 'out' : it.lowStock ? 'low' : 'ok');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// The topbar search links here with ?q= — the page opens already filtered.
// Keyed on q so a second search while on this page starts fresh.
export default function InventoryRoute() {
  return <Suspense fallback={null}><InventoryPageFromUrl /></Suspense>;
}
function InventoryPageFromUrl() {
  const sp = useSearchParams();
  const q = sp.get('q') || '';
  const t = sp.get('tab');
  return <InventoryPage key={q} initialSearch={q} urlTab={TABS.some(([k]) => k === t) ? t : 'stock'} />;
}

function InventoryPage({ initialSearch = '', urlTab = 'stock' }) {
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  // Writes, purchases, usage/waste and counts need Inventory › Act (Settings ›
  // Staff access); View-only staff get the Stock list alone.
  const { canAct } = useAccess();
  const isManager = canAct('inventory');
  const tab = isManager ? urlTab : 'stock';
  const goTab = (t) => router.replace(t === 'stock' ? pathname : `${pathname}?tab=${t}`, { scroll: false });
  const { accounts } = useMoneyAccounts({ enabled: isManager });
  const { suppliers } = useSuppliers({ enabled: isManager });
  const { confirm, dialog } = useConfirm();

  // Item modal: null = closed, {} = new, {item} = edit.
  const [itemModal, setItemModal] = useState(null);
  // Movement modal: null = closed, {item|null, type}.
  const [moveModal, setMoveModal] = useState(null);
  const [log, setLog] = useState({});

  const [search, setSearch] = useState(initialSearch);
  const [filter, setFilter] = useState('all');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['inventory'],
    queryFn: async () => {
      try {
        const items = await fetchJson('/api/admin/inventory');
        return { denied: false, items: Array.isArray(items) ? items : [] };
      } catch (err) {
        if (err.kind === 'forbidden') return { denied: true, items: [] };
        throw err;
      }
    },
  });

  const accessDenied = data?.denied ?? false;
  const allItems = useMemo(() => data?.items ?? [], [data]);
  const activeItems = useMemo(() => allItems.filter((i) => i.isActive), [allItems]);

  const lowCount = useMemo(() => allItems.filter((i) => statusOf(i) === 'low').length, [allItems]);
  const outCount = useMemo(() => allItems.filter((i) => statusOf(i) === 'out').length, [allItems]);
  const supplierCount = useMemo(() => new Set(allItems.map((i) => i.supplier).filter(Boolean)).size, [allItems]);
  // Uses the API's effectiveCost (weighted-average purchase cost, falling
  // back to the manual estimate) — never a stale client-side costPerUnit.
  const stockValue = useMemo(() => allItems.reduce((s, i) => s + Number(i.quantity) * Number(i.effectiveCost || 0), 0), [allItems]);

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allItems.filter((i) => {
      if (filter !== 'all' && statusOf(i) !== filter) return false;
      if (q && !i.name.toLowerCase().includes(q) && !(i.supplier || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allItems, search, filter]);

  const deleteMutation = useMutation({
    mutationFn: (id) => fetchJson(`/api/admin/inventory/${id}`, { method: 'DELETE' }),
    onSuccess: () => { notify.success('Item deleted'); qc.invalidateQueries({ queryKey: ['inventory'] }); },
    onError: (err) => notify.error(err, { title: 'Could not delete the item' }),
  });

  // Close the item dialog first so Escape on the confirm doesn't hit two dialogs.
  const handleDelete = async (item) => {
    setItemModal(null);
    const ok = await confirm({ title: `Delete ${item.name}?`, body: 'This removes the item and its movement history.', confirmLabel: 'Delete item' });
    if (ok) deleteMutation.mutate(item.id);
  };

  const openMovement = (item, type = 'purchase') => setMoveModal({ item, type });
  const onRecorded = (id, entry) => setLog((prev) => ({ ...prev, [id]: [entry, ...(prev[id] || [])] }));

  if (!isLoading && accessDenied) {
    return <Page><NoAccess what="Inventory" /></Page>;
  }

  const empty = filter === 'low'
    ? ['Nothing low on stock', 'Every item is above its reorder level.']
    : filter === 'out'
      ? ['Nothing out of stock', 'Every item has some on hand.']
      : search
        ? ['No matches', 'Try a different search.']
        : ['No inventory yet', isManager ? 'Add your first stock item.' : 'A manager adds stock items here.'];

  return (
    <Page>
      {dialog}

      {isManager && (
        <Toolbar>
          <Segmented label="Inventory" value={tab} onChange={goTab} options={TABS.map(([k, l]) => ({ value: k, label: l }))} />
          <span className="flex-1" />
          {tab === 'stock' && (
            <div className="flex items-center gap-2.5 flex-wrap ml-auto">
              <Button onClick={() => openMovement(null)} disabled={activeItems.length === 0}>Record movement</Button>
              <Button variant="primary" icon="plus" onClick={() => setItemModal({})}>New item</Button>
            </div>
          )}
        </Toolbar>
      )}

      {tab === 'purchases' && <MovementsTab key="purchases" mode="purchases" items={activeItems} onRecord={openMovement} />}
      {tab === 'usage' && <MovementsTab key="usage" mode="usage" items={activeItems} onRecord={openMovement} />}
      {tab === 'counts' && <CountsTab />}

      {tab === 'stock' && (
        <>
          {isLoading ? <KpiSkeletons count={4} min={210} /> : (
            <KpiGrid min={210}>
              <Kpi label="Tracked items" value={allItems.length} foot={supplierCount ? `across ${plural(supplierCount, 'supplier', 'suppliers')}` : 'no suppliers set'} />
              <Kpi label="Low stock" value={lowCount} foot="at or below reorder point" onClick={lowCount ? () => setFilter('low') : undefined} />
              <Kpi label="Out of stock" value={outCount} foot="needs ordering" onClick={outCount ? () => setFilter('out') : undefined} />
              <Kpi label="Stock value" value={money(stockValue)} foot="at average cost (estimate where no purchase yet)" />
            </KpiGrid>
          )}

          <Toolbar>
            <SearchInput value={search} onChange={setSearch} placeholder="Search items or suppliers…" className="flex-[1_1_220px] !h-[38px]" />
            <Segmented
              label="Stock status"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'low', label: 'Low', count: lowCount || null },
                { value: 'out', label: 'Out', count: outCount || null },
              ]}
            />
          </Toolbar>

          <Card className="overflow-hidden">
            {isLoading ? <RowSkeletons rows={6} /> : isError ? (
              <div className="p-4"><ErrorState error={error} onRetry={refetch} /></div>
            ) : items.length === 0 ? (
              <EmptyState
                icon="inventory"
                title={empty[0]}
                action={filter !== 'all' || search
                  ? <Button variant="soft" size="sm" onClick={() => { setFilter('all'); setSearch(''); }}>Show all items</Button>
                  : isManager && <Button variant="soft" size="sm" icon="plus" onClick={() => setItemModal({})}>New item</Button>}
              >
                {empty[1]}
              </EmptyState>
            ) : (
              <Table label="Stock" maxH={560} minW={isManager ? 820 : 720}>
                <thead>
                  <tr>
                    <Th>Item</Th><Th>On hand</Th><Th>Reorder at</Th><Th>Status</Th><Th align="right">Cost/unit</Th><Th>Supplier</Th>
                    {isManager && <Th align="right"><span className="sr-only">Actions</span></Th>}
                  </tr>
                </thead>
                {/* Cost/unit shows the weighted-average purchase cost (avg) once the
                    item has purchase history, else the manual estimate (est.). */}
                <tbody>
                  {items.map((it) => {
                    const st = statusOf(it);
                    const s = STATUS[st];
                    const qty = Number(it.quantity);
                    const reorder = Number(it.reorderLevel || 0);
                    const pct = reorder > 0 ? Math.min(100, Math.round((qty / (reorder * 2)) * 100)) : (qty > 0 ? 100 : 0);
                    return (
                      <Tr
                        key={it.id}
                        tone={st === 'ok' ? undefined : s.tone}
                        dim={!it.isActive}
                        className={s.row}
                        onClick={isManager ? () => setItemModal({ item: it }) : undefined}
                        label={isManager ? `Edit ${it.name}` : undefined}
                      >
                        <Td strong>
                          {it.name}
                          {!it.isActive && <Chip tone="off" small dot={false} className="ml-2">Inactive</Chip>}
                        </Td>
                        <Td>
                          <span className="inline-flex items-center gap-2.5">
                            <span className="font-mq-mono tabular-nums font-semibold text-mq-ink min-w-[62px] whitespace-nowrap">
                              {it.quantity} <span className="font-normal text-mq-muted">{it.unit}</span>
                            </span>
                            <span className="w-[76px] h-1.5 rounded bg-mq-chip overflow-hidden inline-block" aria-hidden="true">
                              <span className={cx('block h-full rounded', s.bar)} style={{ width: `${pct}%` }} />
                            </span>
                          </span>
                        </Td>
                        <Td mono muted className="whitespace-nowrap">{it.reorderLevel ?? '—'} {it.reorderLevel ? it.unit : ''}</Td>
                        <Td><Chip tone={s.tone} small>{s.label}</Chip></Td>
                        <Td money>
                          {it.effectiveCost ? (
                            <>
                              {money(it.effectiveCost)}{' '}
                              <span className="font-mq text-[10.5px] font-medium text-mq-muted" title={it.avgCost ? 'Average purchase cost' : 'Manual estimate (no purchase yet)'}>
                                {it.avgCost ? 'avg' : 'est.'}
                              </span>
                            </>
                          ) : '—'}
                        </Td>
                        <Td muted>{it.supplier ?? '—'}</Td>
                        {isManager && (
                          <Td align="right" className="whitespace-nowrap">
                            <Button
                              size="xs"
                              className="!text-mq-cta hover:!bg-mq-soft"
                              onClick={(e) => { e.stopPropagation(); openMovement(it); }}
                            >
                              Move
                            </Button>
                          </Td>
                        )}
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      )}

      {itemModal && (
        <ItemModal
          key={itemModal.item?.id ?? 'new'}
          item={itemModal.item}
          suppliers={suppliers}
          onClose={() => setItemModal(null)}
          onDelete={handleDelete}
          deleting={deleteMutation.isPending}
        />
      )}

      {moveModal && (
        <MovementModal
          item={moveModal.item}
          items={allItems}
          initialType={moveModal.type}
          suppliers={suppliers}
          accounts={accounts}
          log={log}
          onRecorded={onRecorded}
          onClose={() => setMoveModal(null)}
        />
      )}
    </Page>
  );
}
