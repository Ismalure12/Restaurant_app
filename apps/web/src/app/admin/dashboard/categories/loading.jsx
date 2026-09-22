export default function CategoriesLoading() {
  return (
    <div>
      {/* Header skeleton */}
      <div className="flex items-center justify-between mb-6">
        <div className="skeleton rounded" style={{ height: '28px', width: '120px' }} />
        <div className="skeleton rounded-lg" style={{ height: '38px', width: '120px' }} />
      </div>

      {/* Desktop table skeleton */}
      <div className="hidden md:block bg-white rounded-lg border overflow-hidden" style={{ borderColor: '#E5E5E5' }}>
        {/* Table header */}
        <div className="flex border-b px-4 py-3 gap-4" style={{ borderColor: '#E5E5E5', backgroundColor: '#F9FAFB' }}>
          <div className="skeleton rounded" style={{ height: '14px', width: '60px' }} />
          <div className="skeleton rounded" style={{ height: '14px', width: '60px' }} />
          <div className="skeleton rounded" style={{ height: '14px', width: '50px' }} />
          <div className="skeleton rounded" style={{ height: '14px', width: '50px' }} />
          <div className="skeleton rounded ml-auto" style={{ height: '14px', width: '60px' }} />
        </div>
        {/* Table rows */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center px-4 py-3 gap-4 border-b last:border-0"
            style={{ borderColor: '#E5E5E5' }}
          >
            <div className="skeleton rounded" style={{ height: '16px', width: '120px' }} />
            <div className="skeleton rounded" style={{ height: '16px', width: '100px' }} />
            <div className="skeleton rounded" style={{ height: '16px', width: '30px' }} />
            <div className="skeleton rounded-full" style={{ height: '24px', width: '60px' }} />
            <div className="flex gap-2 ml-auto">
              <div className="skeleton rounded" style={{ height: '16px', width: '30px' }} />
              <div className="skeleton rounded" style={{ height: '16px', width: '40px' }} />
            </div>
          </div>
        ))}
      </div>

      {/* Mobile cards skeleton */}
      <div className="md:hidden space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg border p-4" style={{ borderColor: '#E5E5E5' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="skeleton rounded" style={{ height: '16px', width: '100px' }} />
              <div className="skeleton rounded-full" style={{ height: '24px', width: '60px' }} />
            </div>
            <div className="flex items-center gap-4 mb-3">
              <div className="skeleton rounded" style={{ height: '12px', width: '80px' }} />
              <div className="skeleton rounded" style={{ height: '12px', width: '60px' }} />
            </div>
            <div className="border-t pt-3" style={{ borderColor: '#E5E5E5' }}>
              <div className="flex gap-3">
                <div className="skeleton rounded" style={{ height: '14px', width: '30px' }} />
                <div className="skeleton rounded" style={{ height: '14px', width: '40px' }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
