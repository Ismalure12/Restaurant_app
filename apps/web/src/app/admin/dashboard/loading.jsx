import { Page, KpiSkeletons, Skeleton } from '@/components/admin/ui';

// Route-level fallback for every dashboard page: a KPI strip and a card.
export default function DashboardLoading() {
  return (
    <Page>
      <div className="flex items-center gap-2.5">
        <Skeleton className="h-9 w-64 max-w-full rounded-lg" />
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>
      <KpiSkeletons count={4} min={216} />
      <div className="flex flex-col gap-3 bg-white border border-mq-line rounded-xl p-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-[220px] rounded-lg" />
      </div>
    </Page>
  );
}
