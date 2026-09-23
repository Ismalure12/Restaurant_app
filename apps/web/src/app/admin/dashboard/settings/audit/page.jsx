'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import useStaffList from '@/hooks/useStaffList';
import { ActiveFilters, FilterSelect, FiltersButton, PeriodPicker, useReportParams } from '@/components/admin/reports/ReportKit';
import { Chip, EmptyRow, ErrorState, LoadMoreBar, RowSkeletons, SearchInput, Table, Th, Td, Tr, Toolbar } from '@/components/admin/ui';
import { SettingsCard } from '@/components/admin/settings/shared';

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

// Action chip tone (status channel): undoing / removing is danger, reopening a
// closed period is warn, closing / posting / paying is ok, other changes plain.
function actionTone(a) {
  if (/(void|delete|discard|dismiss|owner_out)/.test(a)) return 'danger';
  if (/reopen/.test(a)) return 'warn';
  if (/(close|post|payment|owner_in|opening)/.test(a)) return 'ok';
  if (/create|start/.test(a)) return 'info';
  return 'off';
}

function Details({ meta }) {
  const lines = metaLines(meta);
  if (!lines.length) return <span className="text-mq-muted">—</span>;
  if (lines.length === 1) return <span className="break-words">{lines[0]}</span>;
  return (
    <details className="group">
      <summary className="cursor-pointer select-none text-[12.5px] font-semibold text-mq-cta hover:text-mq-primary list-none [&::-webkit-details-marker]:hidden">
        {lines.length} details <span className="inline-block transition-transform group-open:rotate-90">›</span>
      </summary>
      <ul className="m-0 mt-1.5 pl-4 flex flex-col gap-0.5 text-[12.5px] text-mq-on-tint list-disc">{lines.map((l, i) => <li key={i} className="break-words">{l}</li>)}</ul>
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
      <Toolbar>
        <PeriodPicker preset={preset} range={range} set={set} />
        <FiltersButton active={(filters.entity ? 1 : 0) + (filters.actorId ? 1 : 0)} onClear={() => set({ entity: '', actorId: '' })}>
          <FilterSelect label="Item" value={filters.entity} options={entities} onChange={(v) => set({ entity: v })} all="Everything" />
          <FilterSelect label="Who" value={filters.actorId} options={people} onChange={(v) => set({ actorId: v })} all="Everyone" />
        </FiltersButton>
        <SearchInput className="flex-[1_1_200px] h-[38px]" value={term} onChange={setTerm} placeholder="Search action or item #" aria-label="Search the audit log" maxLength={80} />
      </Toolbar>
      <ActiveFilters
        onClear={() => set({ entity: '', actorId: '' })}
        items={[
          filters.entity && { key: 'entity', label: `Item: ${entities.find((e) => e.value === filters.entity)?.label || filters.entity}`, onRemove: () => set({ entity: '' }) },
          filters.actorId && { key: 'actorId', label: `Who: ${people.find((p) => p.value === filters.actorId)?.label || '…'}`, onRemove: () => set({ actorId: '' }) },
        ].filter(Boolean)}
      />
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} title="Couldn’t load the audit log" />}

      <SettingsCard flush title="Audit log" sub="Who changed what, and when">
        {q.isLoading ? <RowSkeletons rows={6} /> : (
          <Table minW={760} maxH={620} label="Audit log">
            <thead><tr><Th>When</Th><Th>Who</Th><Th>What</Th><Th>Item</Th><Th>Details</Th></tr></thead>
            <tbody>
              {rows.length === 0 ? <EmptyRow cols={5}>Nothing was recorded for these filters.</EmptyRow> : rows.map((r) => {
                const href = itemHref(r);
                const item = `${entityLabel(r.entity)}${r.entityId ? ` #${r.entityId}` : ''}`;
                return (
                  <Tr key={r.id}>
                    <Td mono className="whitespace-nowrap !align-top">{when(r.at)}</Td>
                    <Td className="!align-top">
                      {r.actor
                        ? <span className="flex flex-col gap-px"><span className="font-semibold text-mq-ink">{r.actor.name}</span><span className="text-[11.5px] text-mq-muted capitalize">{r.actor.role}</span></span>
                        : <span className="text-mq-muted">System</span>}
                    </Td>
                    <Td className="!align-top"><Chip small tone={actionTone(r.action)} dot={false}>{actionLabel(r.action)}</Chip></Td>
                    <Td className="align-top whitespace-nowrap">{href ? <Link href={href} className="font-semibold text-mq-cta hover:text-mq-primary">{item}</Link> : <span className="text-mq-ink">{item}</span>}</Td>
                    <Td className="align-top max-w-[360px] text-mq-on-tint"><Details meta={r.meta} /></Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <LoadMoreBar shown={rows.length} hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onMore={() => q.fetchNextPage()} noun={rows.length === 1 ? 'entry' : 'entries'} />
      </SettingsCard>
    </>
  );
}
