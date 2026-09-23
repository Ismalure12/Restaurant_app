import { Page, KpiSkeletons, Skeleton, Card } from '@/components/admin/ui';

export default function MenuItemsLoading() {
  return (
    <Page>
      <KpiSkeletons count={4} min={210} />
      <div className="flex gap-2.5 flex-wrap">
        <Skeleton className="h-[38px] flex-[1_1_220px] rounded-lg" />
        <Skeleton className="h-10 w-[170px] rounded-lg" />
        <Skeleton className="h-[38px] w-[110px] rounded-lg" />
      </div>
      <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(224px, 100%), 1fr))' }}>
        {Array.from({ length: 8 }, (_, n) => (
          <Card key={n} className="overflow-hidden">
            <Skeleton className="h-28 !rounded-none" />
            <div className="flex flex-col gap-2 p-3.5"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /><Skeleton className="h-5 w-1/3 mt-3" /></div>
          </Card>
        ))}
      </div>
    </Page>
  );
}
