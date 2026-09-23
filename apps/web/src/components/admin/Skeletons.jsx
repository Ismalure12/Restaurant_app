'use client';

import { Skeleton, KpiSkeletons } from '@/components/admin/ui/Feedback';

// Loading placeholders shaped like what they replace, so a page doesn't
// jump when data lands (and never flashes "$0" / "No data").

export function KpiRowSkeleton({ count = 4 }) {
  return <KpiSkeletons count={count} />;
}

export function RowsSkeleton({ rows = 4, height = 40, gap = 8, className = '' }) {
  return (
    <div className={`flex flex-col ${className}`} style={{ gap }} aria-busy="true">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="rounded-lg" style={{ height }} />)}
    </div>
  );
}
