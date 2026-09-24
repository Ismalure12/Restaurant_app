'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import useAccess from '@/hooks/useAccess';
import Bk from '@/components/admin/Bk';
import SaleDrawer from '@/components/admin/orders/SaleDrawer';
import {
  DayBars, ErrorNote, ExportBar, PeriodPicker, PrintHead, RangeNote, money, num, periodParams, useReportParams,
} from '@/components/admin/reports/ReportKit';
import {
  Card, CardHeader, Chip, EmptyState, Icon, Kpi, KpiGrid, KpiSkeletons, LoadMoreBar, RowSkeletons, Skeleton,
  Table, Td, Th, Tr,
} from '@/components/admin/ui';

const when = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

/** One person's report: what they rang up and served, where it went, and every sale (opens in the drawer). */
export default function EmployeeReportPage() {
  const { id } = useParams();
  const { role } = useAccess();
  const { preset, range, set, query } = useReportParams('30d');
  const [openId, setOpenId] = useState(null);
  const { data: r, isLoading, isError, error } = useQuery({
    queryKey: ['rpt-employee', id, query], queryFn: () => fetchJson(`/api/admin/reports/employees/${id}?${query}`),
  });
  const orders = useInfiniteQuery({
    queryKey: ['rpt-employee-orders', id, query],
    queryFn: ({ pageParam }) => fetchJson(`/api/admin/sales?${query}&personId=${id}&summary=0&limit=50${pageParam ? `&cursor=${pageParam}` : ''}`),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const rows = orders.data?.pages.flatMap((p) => p.rows) ?? [];
  const e = r?.employee;
  const backQs = new URLSearchParams(periodParams(preset, range)).toString();
  const noSales = !isLoading && e && !e.taken.orders && !e.served.orders;
  // Waiters never open a sale (the API refuses too).
  const canOpen = role && role !== 'waiter';

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap rpt-noprint">
        <Link href={`/admin/dashboard/reports/employees?${backQs}`} className="inline-flex items-center gap-1 min-h-9 px-2 -ml-2 rounded-lg text-[13.5px] font-semibold text-mq-cta hover:bg-mq-soft">
          <Icon name="chevLeft" size={16} stroke={2} />Employees
        </Link>
        <span className="text-mq-faint" aria-hidden="true">/</span>
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-[15px] font-semibold text-mq-ink truncate">{e?.name || '…'}</span>
          {e && <Chip tone="plain" dot={false} small className="capitalize">{e.role}</Chip>}
          {e && !e.isActive && <Chip tone="off" small>Inactive</Chip>}
        </span>
      </div>
      <div className="flex items-center gap-2.5 flex-wrap rpt-noprint">
        <PeriodPicker preset={preset} range={range} set={set} />
        <span className="flex-1" />
        <RangeNote preset={preset} range={range} compare={false} />
        <ExportBar excel={`/api/admin/sales?${query}&personId=${id}&format=xlsx`} csv={[{ label: 'Their orders', href: `/api/admin/sales?${query}&personId=${id}&format=csv` }]} />
      </div>
      <PrintHead title={`Employee report · ${e?.name || ''}`} range={range} preset={preset} />
      {isError && <ErrorNote error={error} />}

      {isLoading ? <KpiSkeletons count={4} min={180} /> : e && (
        <KpiGrid min={180}>
          <Kpi label="Rang up" value={money(e.taken.total)} foot={`${num(e.taken.orders)} orders · avg ${money(e.taken.avgTicket)}`} />
          <Kpi label="Served (waiter)" value={money(e.served.total)} foot={`${num(e.served.orders)} orders`} />
          <Kpi label="Account money collected" value={money(e.invoiceCollected)} foot="paid on customer accounts" />
          <Kpi label="Voids · edits" value={`${num(e.voids.count)} · ${num(e.edits)}`} foot={`${money(e.voids.total)} voided · ${money(e.discounts)} discounts`} />
        </KpiGrid>
      )}

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))' }}>
        <Card className="overflow-hidden flex flex-col">
          <CardHeader eyebrow="Trend" title="Rang up by day" />
          <div className="p-4">
            {isLoading ? <Skeleton className="h-[200px]" /> : noSales ? <p className="m-0 py-6 text-center text-[13px] text-mq-on-tint">No sales in this range.</p> : (
              <DayBars rows={(r?.byDay || []).map((d) => ({ day: d.day, total: d.taken + d.served, orders: d.takenOrders + d.servedOrders }))} label="Sales" />
            )}
          </div>
        </Card>
        <Card className="overflow-hidden flex flex-col">
          <CardHeader eyebrow="Money" title="Accounts their sales went into" />
          <div className="p-4">
            {noSales ? <p className="m-0 py-6 text-center text-[13px] text-mq-on-tint">No sales in this range.</p> : (
              <Bk loading={isLoading} rows={(r?.byAccount || []).map((a) => ({ l: a.label, v: a.total, fmt: `${money(a.total)} · ${a.orders}` }))} />
            )}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="Their orders" sub={canOpen ? 'Click a sale to open it' : undefined} />
        {orders.isLoading ? <RowSkeletons /> : orders.isError ? <div className="p-4"><ErrorNote error={orders.error} /></div> : rows.length === 0 ? (
          <EmptyState icon="sales" title="No sales in this range.">Pick a longer period to see their sales.</EmptyState>
        ) : (
          <>
            <Table maxH={480} minW={700} label="Their orders">
              <thead><tr><Th>Order ID</Th><Th>Receipt</Th><Th>Closed</Th><Th>Role</Th><Th>Account</Th><Th align="right">Total</Th></tr></thead>
              <tbody>{rows.map((o) => (
                <Tr key={o.id} onClick={canOpen ? () => setOpenId(o.id) : undefined} selected={openId === o.id} label={canOpen ? `Open ${o.code}` : undefined}>
                  <Td mono strong>{o.code}</Td>
                  <Td mono>{o.receiptNo ?? '—'}</Td>
                  <Td mono className="whitespace-nowrap">{when(o.closedAt)}</Td>
                  <Td><Chip tone={o.staffId === Number(id) ? 'brand' : 'info'} dot={false} small>{o.staffId === Number(id) ? 'Rang up' : 'Served'}</Chip></Td>
                  <Td>{o.accountLabel}</Td>
                  <Td money>{money(o.total)}</Td>
                </Tr>
              ))}</tbody>
            </Table>
            <div className="rpt-noprint">
              <LoadMoreBar shown={rows.length} hasMore={orders.hasNextPage} loading={orders.isFetchingNextPage} onMore={() => orders.fetchNextPage()} noun="sales" />
            </div>
          </>
        )}
      </Card>

      {canOpen && <SaleDrawer orderId={openId} onClose={() => setOpenId(null)} href={openId ? `/admin/dashboard/sales/${openId}` : undefined} />}
    </>
  );
}
