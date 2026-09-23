'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { fetchJson } from '@/lib/apiError';
import { ErrorNote, money } from '@/components/admin/reports/ReportKit';
import {
  Button, Card, CardHeader, EmptyState, Icon, RowSkeletons, Table, Td, Th, Tr, cx,
} from '@/components/admin/ui';

const signed = (n) => (Number(n) < 0 ? '-' : '+') + money(Math.abs(Number(n)));
const dayHref = (day) => `/admin/dashboard/cash?tab=day-close&day=${day}`;
const when = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

/**
 * Archive of closed days (GET /api/admin/day-close). A row opens the frozen
 * Z-report on Cash & accounts › Day close — one closed-day view, not two.
 * Not date-ranged: a close is a fact about one day, newest first.
 */
export default function DayClosesReportPage() {
  const router = useRouter();
  const q = useInfiniteQuery({
    queryKey: ['rpt-day-closes'],
    initialPageParam: null,
    queryFn: ({ pageParam }) => fetchJson(`/api/admin/day-close${pageParam ? `?cursor=${pageParam}` : ''}`),
    getNextPageParam: (last) => last.nextCursor || undefined,
  });
  const rows = q.data?.pages.flatMap((p) => p.closed) || [];
  const unclosed = q.data?.pages[0]?.unclosed || [];

  return (
    <>
      {q.isError && <ErrorNote error={q.error} />}
      {unclosed.length > 0 && (
        <div className="flex items-center gap-3.5 flex-wrap border border-mq-warn-line bg-mq-warn-bg rounded-xl px-4 py-3.5 rpt-noprint" role="status">
          <span className="text-[13.5px] font-semibold text-mq-warn-ink" style={{ flex: '1 1 240px' }}>
            {unclosed.length} finished {unclosed.length === 1 ? 'day is' : 'days are'} not closed yet, starting <span className="font-mq-mono">{unclosed[0]}</span>.
          </span>
          <Button href={dayHref(unclosed[0])} variant="primary" size="lg">Close {unclosed[0]}</Button>
        </div>
      )}
      <Card className="overflow-hidden">
        <CardHeader eyebrow="Archive" title="Closed days" />
        {q.isLoading ? <RowSkeletons rows={5} /> : rows.length === 0 ? (
          <EmptyState icon="calendar" title="No day has been closed yet" action={<Button href="/admin/dashboard/cash?tab=day-close" variant="soft" size="sm">Day close</Button>}>
            Days are closed in Cash & accounts › Day close.
          </EmptyState>
        ) : (
          <>
            <Table maxH={460} minW={620} label="Closed days">
              <thead><tr>
                <Th>Day</Th><Th>Closed by</Th><Th align="right">Sales</Th><Th align="right">Net sales</Th><Th align="right">Over / short</Th>
                <Th className="w-8"><span className="sr-only">Open</span></Th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <Tr key={r.day} onClick={() => router.push(dayHref(r.day))} label={`Open the Z-report for ${r.day}`}>
                    <Td>
                      <span className="flex flex-col gap-px">
                        <span className="font-mq-mono text-[12.5px] font-semibold text-mq-primary">{r.day}</span>
                        <span className="text-xs text-mq-muted">{when(r.closedAt)}</span>
                      </span>
                    </Td>
                    <Td>{r.closedBy || '—'}</Td>
                    <Td mono align="right">{r.sales}</Td>
                    <Td money>{money(r.net)}</Td>
                    <Td money className={cx('font-semibold', r.difference < 0 ? '!text-mq-danger-ink' : r.difference > 0 ? '!text-mq-ok-ink' : '')}>
                      {r.difference === 0 ? '$0.00' : signed(r.difference)}
                    </Td>
                    <Td className="text-mq-faint"><Icon name="chevRight" size={15} stroke={2} /></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            {q.hasNextPage && (
              <div className="flex justify-center px-4 py-2.5 bg-mq-cream border-t border-mq-line rounded-b-xl rpt-noprint">
                <Button variant="secondary" size="xs" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>{q.isFetchingNextPage ? 'Loading…' : 'Load older days'}</Button>
              </div>
            )}
          </>
        )}
      </Card>
    </>
  );
}
