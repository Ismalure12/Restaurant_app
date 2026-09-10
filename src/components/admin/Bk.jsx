'use client';

const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

// Shared horizontal bar-chart primitive against jazeera's .bk-row/.bk-bar
// classes. Previously copy-pasted verbatim in reports/page.jsx,
// insights/page.jsx, and insights/staff/[id]/page.jsx — extracted here so
// there's one implementation to fix/extend.
export default function Bk({ rows, color = 'var(--primary)' }) {
  const max = Math.max(...rows.map((r) => r.v), 1);
  return rows.length === 0 ? <div className="sub">No data in range.</div> : rows.map((r, i) => (
    <div className="bk-row" key={i}>
      <span className="bk-l">{r.l}</span>
      <div className="bk-bar"><i className="anim-grow-x" style={{ width: `${Math.round((r.v / max) * 100)}%`, background: r.c || color, '--d': `${i * 0.06}s` }} /></div>
      <span className="bk-v">{r.fmt || money(r.v)}</span>
    </div>
  ));
}
