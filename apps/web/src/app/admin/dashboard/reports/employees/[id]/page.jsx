'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import Bk from '@/components/admin/Bk';
import { KpiRowSkeleton, RowsSkeleton } from '@/components/admin/Skeletons';
import {
  Card, DayBars, Empty, ErrorNote, Kpi, PrintHead, RangePicker, Toolbar, money, num, useReportParams,
} from '@/components/admin/reports/ReportKit';

const when = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

export default function EmployeeReportPage() {
  const { id } = useParams();
  const { preset, range, set, query } = useReportParams('30d');
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
  const backQs = new URLSearchParams({ preset, ...(preset === 'custom' ? range : {}) }).toString();

  return (
    <>
      <div className="adm-crumb rpt-noprint" style={{ marginBottom: 10 }}>
        <Link href={`/admin/dashboard/reports/employees?${backQs}`}>Employees</Link> › <span>{e?.name || '…'}</span>
      </div>
      <Toolbar exports={[{ label: 'Their orders', href: `/api/admin/sales?${query}&personId=${id}&format=csv` }]}>
        <RangePicker preset={preset} range={range} set={set} />
      </Toolbar>
      <PrintHead title={`Employee report · ${e?.name || ''}`} range={range} preset={preset} />
      {isError && <ErrorNote error={error} />}

      {isLoading ? <KpiRowSkeleton count={4} style={{ marginBottom: 16 }} /> : e && (
        <div className="kpi-row rpt-kpis">
          <Kpi label="Rang up" tone="green" value={money(e.taken.total)} foot={`${num(e.taken.orders)} orders · avg ${money(e.taken.avgTicket)}`} />
          <Kpi label="Served (waiter)" value={money(e.served.total)} foot={`${num(e.served.orders)} orders`} />
          <Kpi label="Invoice money collected" value={money(e.invoiceCollected)} foot="from customer accounts" />
          <Kpi label="Voids · edits" tone="rose" value={`${num(e.voids.count)} · ${num(e.edits)}`} foot={`${money(e.discounts)} discounts given`} />
        </div>
      )}

      <div className="grid2 rpt-grid">
        <Card eyebrow="Trend" title="Rang up by day">
          {isLoading ? <RowsSkeleton rows={3} /> : <DayBars rows={(r?.byDay || []).map((d) => ({ day: d.day, total: d.taken + d.served, orders: d.takenOrders + d.servedOrders }))} label="Sales" />}
        </Card>
        <Card eyebrow="Money" title="Accounts their sales went into">
          <Bk loading={isLoading} rows={(r?.byAccount || []).map((a) => ({ l: a.label, v: a.total, fmt: `${money(a.total)} · ${a.orders}` }))} />
        </Card>
      </div>

      <Card flush title="Their orders">
        {orders.isLoading ? <RowsSkeleton className="card-pad" /> : rows.length === 0 ? <Empty>No sales in this range.</Empty> : (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Order ID</th><th>Receipt</th><th>Closed</th><th>Role</th><th>Account</th><th className="num">Total</th></tr></thead>
              <tbody>{rows.map((o) => (
                <tr key={o.id}>
                  <td className="mono strong"><Link href={`/admin/dashboard/sales/${o.id}`}>{o.code}</Link></td>
                  <td className="mono">{o.receiptNo ?? '—'}</td>
                  <td>{when(o.closedAt)}</td>
                  <td>{o.staffId === Number(id) ? 'Rang up' : 'Served'}</td>
                  <td>{o.accountLabel}</td>
                  <td className="num">{money(o.total)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {orders.hasNextPage && (
          <div className="card-foot rpt-noprint"><button className="btn btn-ghost btn-sm" onClick={() => orders.fetchNextPage()} disabled={orders.isFetchingNextPage}>{orders.isFetchingNextPage ? 'Loading…' : 'Load more'}</button></div>
        )}
      </Card>

    </>
  );
}
