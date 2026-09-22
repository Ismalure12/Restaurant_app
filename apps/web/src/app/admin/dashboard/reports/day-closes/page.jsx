'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchJson } from '@/lib/apiError';
import { RowsSkeleton } from '@/components/admin/Skeletons';
import { Card, Empty, ErrorNote, money } from '@/components/admin/reports/ReportKit';

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
        <div className="card card-pad-lg cash-prompt" style={{ marginBottom: 16 }}>
          <div className="note">{unclosed.length} finished {unclosed.length === 1 ? 'day is' : 'days are'} not closed yet, starting {unclosed[0]}.</div>
          <Link href={dayHref(unclosed[0])} className="btn btn-primary">Close {unclosed[0]}</Link>
        </div>
      )}
      <Card eyebrow="Archive" title="Closed days" flush>
        {q.isLoading ? <RowsSkeleton className="card-pad" rows={5} /> : rows.length === 0 ? <Empty>No day has been closed yet.</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Day</th><th>Closed by</th><th className="num">Sales</th><th className="num">Net sales</th><th className="num">Over / short</th><th className="rpt-row-go" aria-hidden="true" /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.day} className="rpt-row-link" onClick={() => router.push(dayHref(r.day))}>
                    <td className="mono strong"><Link className="rpt-row-a" href={dayHref(r.day)} onClick={(e) => e.stopPropagation()}>{r.day}</Link><div className="sub">{when(r.closedAt)}</div></td>
                    <td>{r.closedBy || '—'}</td>
                    <td className="num">{r.sales}</td>
                    <td className="num">{money(r.net)}</td>
                    <td className={`num strong ${r.difference < 0 ? 'cash-neg' : r.difference > 0 ? 'cash-pos' : ''}`}>{r.difference === 0 ? '$0.00' : signed(r.difference)}</td>
                    <td className="rpt-row-go" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 6l6 6-6 6" /></svg></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {q.hasNextPage && (
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <button className="btn btn-ghost" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>{q.isFetchingNextPage ? 'Loading…' : 'Load more'}</button>
        </div>
      )}
    </>
  );
}
