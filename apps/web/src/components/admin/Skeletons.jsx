'use client';

// Loading placeholders shaped like what they replace, so a page doesn't
// jump when data lands (and never flashes "$0" / "No data").

export function KpiRowSkeleton({ count = 4, className = 'kpi-row', style }) {
  return (
    <div className={className} style={style} aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <div className="kpi" key={i}>
          <div className="kpi-top">
            <div className="sk" style={{ width: 30, height: 30, borderRadius: 9 }} />
            <div className="sk" style={{ width: 96, height: 12 }} />
          </div>
          <div className="sk" style={{ width: 110, height: 30 }} />
          <div className="sk" style={{ width: 140, height: 12, marginTop: 12 }} />
        </div>
      ))}
    </div>
  );
}

export function RowsSkeleton({ rows = 4, height = 40, gap = 8, className = '' }) {
  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap }} aria-busy="true">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="sk" style={{ height, borderRadius: 'var(--r-sm)' }} />)}
    </div>
  );
}
