'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { RowsSkeleton } from '@/components/admin/Skeletons';

// The Menu report was merged into the Sales report (same filters, one source for
// "what sold"). Old links and bookmarks land there with their period + category.
const KEEP = ['preset', 'from', 'to', 'category', 'q', 'sort', 'top'];

export default function MenuReportRedirect() {
  const sp = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    const next = new URLSearchParams();
    for (const k of KEEP) { const v = sp.get(k); if (v) next.set(k, v); }
    router.replace(`/admin/dashboard/reports/sales?${next}#dishes`);
  }, [sp, router]);
  return <RowsSkeleton rows={3} height={80} />;
}
