export default function DashboardLoading() {
  return (
    <div>
      {/* Title skeleton */}
      <div className="skeleton rounded" style={{ height: '28px', width: '140px', marginBottom: '24px' }} />

      {/* Stats cards skeleton */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 max-w-lg">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-lg p-4 md:p-6 border" style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}>
            <div className="skeleton rounded" style={{ height: '14px', width: '80px', marginBottom: '10px' }} />
            <div className="skeleton rounded" style={{ height: '32px', width: '60px' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
