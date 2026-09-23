'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { money } from '@/lib/money';
import {
  Page, Card, CardHeader, Kpi, KpiGrid, KpiSkeletons, Table, Th, Td, Tr, TotalRow, EmptyState, RowSkeletons, ErrorState, Overline,
} from '@/components/admin/ui';

const count = (n) => Number(n || 0).toLocaleString('en-US');
const plural = (n, one, many) => `${count(n)} ${Number(n) === 1 ? one : many}`;
const shortDay = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const when = (d) => new Date(d).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const service = (o) => {
  const type = o.orderType === 'dine_in' ? 'Dine-in' : o.orderType === 'delivery' ? 'Delivery' : (o.orderType || '').replace('_', '-');
  return o.tableNumber ? `${type} · ${/^\d+$/.test(String(o.tableNumber)) ? `Table ${o.tableNumber}` : o.tableNumber}` : type;
};

/**
 * Home › My Performance (cashier / waiter): my own salary, my sales, what
 * customers paid me today (handed over automatically) and my recent orders.
 * Every number is the caller's own — the API reads the session, never a param.
 */
export default function PerformancePage() {
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => fetchJson('/api/auth/me'), staleTime: 5 * 60 * 1000 });
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['my-performance'], queryFn: () => fetchJson('/api/admin/me/performance') });
  const d = data || {};
  const recent = d.recent || [];
  // Own salary only (the API reads the caller's id, never a parameter).
  const { data: salary } = useQuery({ queryKey: ['my-salary'], queryFn: () => fetchJson('/api/admin/me/salary') });
  const thisMonth = salary?.months?.[0];
  const lastMonth = salary?.months?.[1];

  return (
    <Page narrow>
      {salary && thisMonth && (salary.salary > 0 || thisMonth.payment) && (
        <Card className="flex items-center justify-between gap-3.5 flex-wrap px-4 py-3.5">
          <span className="flex flex-col gap-0.5">
            <Overline>Salary · {thisMonth.label}</Overline>
            <span className={thisMonth.payment ? 'text-[17px] font-semibold text-mq-ok-ink' : 'text-[17px] font-semibold text-mq-ink'}>
              {thisMonth.payment ? <>Paid <span className="font-mq-mono">{money(thisMonth.payment.amount)}</span></> : 'Not paid yet'}
            </span>
          </span>
          <span className="text-[13px] text-mq-on-tint text-right">
            {thisMonth.payment
              ? `on ${shortDay(thisMonth.payment.paidAt)}${thisMonth.payment.note ? ` · ${thisMonth.payment.note}` : ''}`
              : salary.salary > 0 ? <>Monthly salary <span className="font-mq-mono">{money(salary.salary)}</span></> : null}
            {lastMonth?.payment && <> · {lastMonth.label}: paid <span className="font-mq-mono">{money(lastMonth.payment.amount)}</span></>}
          </span>
        </Card>
      )}

      {isError ? <ErrorState error={error} onRetry={refetch} /> : isLoading ? <KpiSkeletons count={4} min={210} /> : (
        <KpiGrid min={210}>
          <Kpi label="Sales today" value={money(d.todaySales)} foot={plural(d.todayOrders, 'order', 'orders')} />
          <Kpi label="Orders today" value={count(d.todayOrders)} foot="closed today" />
          <Kpi label="Sales · 7 days" value={money(d.weekSales)} foot={plural(d.weekOrders, 'order', 'orders')} />
          <Kpi label="All-time sales" value={money(d.totalSales)} foot={plural(d.totalOrders, 'order', 'orders')} />
        </KpiGrid>
      )}

      {d.collectedToday && (
        <Card className="overflow-hidden">
          <CardHeader title="Today I collected" sub="Handed over to the business automatically at the end of the day" />
          {d.collectedToday.accounts.length === 0 ? (
            <EmptyState icon="cash" title="Nothing collected yet today">Money customers pay you shows up here.</EmptyState>
          ) : (
            <Table label="Today I collected">
              <tbody>
                {d.collectedToday.accounts.map((a) => (
                  <Tr key={a.id}><Td>{a.kind === 'cash' ? 'Cash' : a.label}</Td><Td money>{money(a.amount)}</Td></Tr>
                ))}
                <TotalRow><Td>Total</Td><Td money>{money(d.collectedToday.total)}</Td></TotalRow>
              </tbody>
            </Table>
          )}
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardHeader title="My recent orders" sub={me ? `${me.name || me.email}${me.role ? ` · ${me.role[0].toUpperCase()}${me.role.slice(1)}` : ''}` : undefined} />
        {isLoading ? <RowSkeletons rows={4} /> : recent.length === 0 ? (
          <EmptyState icon="orders" title="No orders yet">Orders you take or serve will show up here. Ring one up in the Register.</EmptyState>
        ) : (
          <Table label="My recent orders" minW={480} maxH={480}>
            <thead><tr><Th>Order</Th><Th>Service</Th><Th>When</Th><Th align="right">Total</Th></tr></thead>
            <tbody>
              {recent.map((o) => (
                <Tr key={o.id}>
                  <Td mono className="text-mq-ink">{o.code || `#${o.id}`}</Td>
                  <Td>{service(o)}</Td>
                  <Td mono muted>{when(o.createdAt)}</Td>
                  <Td money>{money(o.total)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </Page>
  );
}
