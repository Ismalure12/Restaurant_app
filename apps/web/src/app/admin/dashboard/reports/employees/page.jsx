'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import {
  ActiveFilters, ErrorNote, ExportBar, FilterSelect, FiltersButton, PeriodPicker, PrintHead, RangeNote, labelOf, money, num, periodParams, useReportParams,
} from '@/components/admin/reports/ReportKit';
import {
  Card, CardHeader, Chip, EmptyRow, Kpi, KpiGrid, KpiSkeletons, RowSkeletons, Table, Td, Th, Tr,
} from '@/components/admin/ui';

const API = '/api/admin/reports/employees';
const ROLES = [
  { value: 'cashier', label: 'Cashiers' }, { value: 'waiter', label: 'Waiters' },
  { value: 'manager', label: 'Managers' }, { value: 'admin', label: 'Admins' },
];

/** Role as a quiet chip ("Cashier"). */
function RoleChip({ role }) {
  return <Chip tone="plain" dot={false} small className="capitalize">{role}</Chip>;
}

/** Employees report: sales, voids and edits per person. A row opens their own report. */
export default function EmployeesReportPage() {
  const router = useRouter();
  const { preset, range, filters, set, query } = useReportParams('30d', ['role']);
  const { data: r, isLoading, isError, error } = useQuery({ queryKey: ['rpt-employees', query], queryFn: () => fetchJson(`${API}?${query}`) });
  const rows = useMemo(() => r?.rows || [], [r]);
  const rangeQs = new URLSearchParams(periodParams(preset, range)).toString();
  const clearRole = () => set({ role: '' });
  const chips = filters.role ? [{ key: 'role', label: `Role: ${labelOf('role', filters.role) || filters.role}`, onRemove: clearRole }] : [];

  // The tiles are read off the table itself (same rows, nothing extra fetched).
  const k = useMemo(() => {
    const withSales = rows.filter((e) => e.taken.orders > 0 || e.served.orders > 0).length;
    const active = rows.filter((e) => e.isActive).length;
    const top = rows.reduce((best, e) => (e.taken.total > (best?.taken.total ?? 0) ? e : best), null);
    const voids = rows.reduce((n, e) => n + e.voids.count, 0);
    const voidTotal = rows.reduce((n, e) => n + e.voids.total, 0);
    const edits = rows.reduce((n, e) => n + (e.edits || 0), 0);
    const editors = rows.filter((e) => e.edits > 0).length;
    return { withSales, active, top, voids, voidTotal, edits, editors };
  }, [rows]);

  return (
    <>
      <div className="flex items-center gap-2.5 flex-wrap rpt-noprint">
        <PeriodPicker preset={preset} range={range} set={set} />
        <FiltersButton active={filters.role ? 1 : 0} onClear={clearRole}>
          <FilterSelect label="Role" value={filters.role} options={ROLES} onChange={(v) => set({ role: v })} all="All roles" />
        </FiltersButton>
        <span className="flex-1" />
        <RangeNote preset={preset} range={range} compare={false} />
        <ExportBar excel={`${API}?${query}&format=xlsx`} csv={[{ label: 'Staff table', href: `${API}?${query}&format=csv` }]} />
      </div>
      <ActiveFilters items={chips} onClear={clearRole} />
      <PrintHead title="Employee report" range={range} preset={preset} filters={{ Role: labelOf('role', filters.role) }} />
      {isError && <ErrorNote error={error} />}

      {isLoading ? <KpiSkeletons count={4} min={180} /> : r && (
        <KpiGrid min={180}>
          <Kpi label="People with sales" value={num(k.withSales)} foot={`of ${num(k.active)} active`} />
          <Kpi label="Top seller" value={k.top ? k.top.name : '—'} foot={k.top ? `${money(k.top.taken.total)} rung up` : 'no sales rung up'} />
          <Kpi label="Voids" value={num(k.voids)} foot={k.voids ? money(k.voidTotal) : 'no voids'} />
          <Kpi label="Edits after send" value={num(k.edits)} foot={k.edits ? `by ${num(k.editors)} ${k.editors === 1 ? 'person' : 'people'}` : 'no edits'} />
        </KpiGrid>
      )}

      <Card className="overflow-hidden">
        <CardHeader eyebrow="Staff" title="Click a person for their own report" count={isLoading ? null : rows.length} />
        {isLoading ? <RowSkeletons /> : (
          <Table maxH={520} minW={820} label="Sales per person">
            <thead><tr>
              <Th>Name</Th><Th>Role</Th><Th align="right">Rang up</Th><Th align="right">Avg ticket</Th><Th align="right">Served</Th>
              <Th align="right">Discounts</Th><Th align="right">Voids</Th><Th align="right">Edits</Th>
            </tr></thead>
            <tbody>
              {!rows.length ? <EmptyRow cols={8}>No staff activity in this range.</EmptyRow> : rows.map((e) => {
                const href = `/admin/dashboard/reports/employees/${e.id}?${rangeQs}`;
                return (
                  <Tr key={e.id} onClick={() => router.push(href)} dim={!e.isActive} label={`Open ${e.name}'s report`}>
                    <Td strong>{e.name}{!e.isActive && <span className="block text-xs font-normal text-mq-muted">inactive</span>}</Td>
                    <Td><RoleChip role={e.role} /></Td>
                    <Td money>{money(e.taken.total)}<span className="block text-xs font-normal text-mq-muted">{num(e.taken.orders)} orders</span></Td>
                    <Td money>{e.taken.orders ? money(e.taken.avgTicket) : '—'}</Td>
                    <Td money>{e.served.orders ? <>{money(e.served.total)}<span className="block text-xs font-normal text-mq-muted">{num(e.served.orders)} orders</span></> : '—'}</Td>
                    <Td money>{e.discounts ? money(e.discounts) : '—'}</Td>
                    <Td mono align="right" className={e.voids.count ? 'text-mq-danger-ink' : undefined}>{e.voids.count ? `${e.voids.count} · ${money(e.voids.total)}` : '—'}</Td>
                    <Td mono align="right">{e.edits || '—'}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
