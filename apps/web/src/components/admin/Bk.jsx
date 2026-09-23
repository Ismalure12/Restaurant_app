'use client';

import { RowsSkeleton } from './Skeletons';
import { RAMP } from './reports/Charts';

const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

// Ranked horizontal bars (docs/admin-design-system.md §8): 8px bars on a chip
// track, stepping down the maroon ramp. `loading` renders placeholder bars so
// a card never flashes "No data in range." before its query resolves.
export default function Bk({ rows, color, loading = false, empty = 'No data in range.' }) {
  if (loading) return <RowsSkeleton rows={3} height={22} gap={14} />;
  if (!rows || rows.length === 0) return <div className="text-[12.5px] text-mq-muted py-4">{empty}</div>;
  const max = Math.max(...rows.map((r) => r.v), 1);
  return (
    <ul className="m-0 p-0 list-none flex flex-col gap-2.5">
      {rows.map((r, i) => (
        <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 items-baseline text-[13px]">
          <span className="truncate text-mq-ink">{r.l}</span>
          <span className="font-mq-mono tabular-nums text-mq-ink">{r.fmt || money(r.v)}</span>
          <span className="col-span-2 h-2 rounded bg-mq-chip overflow-hidden">
            <i className="block h-full rounded" style={{ width: `${Math.round((r.v / max) * 100)}%`, background: r.c || color || RAMP[Math.min(i, RAMP.length - 1)] }} />
          </span>
        </li>
      ))}
    </ul>
  );
}
