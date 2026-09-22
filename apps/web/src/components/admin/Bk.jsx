'use client';

import { RowsSkeleton } from './Skeletons';

const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

// Shared horizontal bar-chart primitive against jazeera's .bk-row/.bk-bar
// classes. `loading` renders placeholder bars so a card never flashes
// "No data in range." before its query resolves.
export default function Bk({ rows, color = 'var(--primary)', loading = false, empty = 'No data in range.' }) {
  if (loading) return <RowsSkeleton rows={3} height={22} gap={14} />;
  if (!rows || rows.length === 0) return <div className="sub">{empty}</div>;
  const max = Math.max(...rows.map((r) => r.v), 1);
  return rows.map((r, i) => (
    <div className="bk-row" key={i}>
      <span className="bk-l">{r.l}</span>
      <div className="bk-bar"><i className="anim-grow-x" style={{ width: `${Math.round((r.v / max) * 100)}%`, background: r.c || color, '--draw-delay': `${i * 0.06}s` }} /></div>
      <span className="bk-v">{r.fmt || money(r.v)}</span>
    </div>
  ));
}
