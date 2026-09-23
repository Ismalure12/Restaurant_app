import { Page, Skeleton, Card, RowSkeletons } from '@/components/admin/ui';

export default function CategoriesLoading() {
  return (
    <Page>
      <div className="flex gap-2.5 items-center">
        <Skeleton className="h-10 w-[200px] rounded-lg" />
        <span className="flex-1" />
        <Skeleton className="h-[38px] w-[140px] rounded-lg" />
      </div>
      <Card className="overflow-hidden">
        <div className="px-4 py-[13px] bg-mq-cream border-b border-mq-line"><Skeleton className="h-4 w-40" /></div>
        <RowSkeletons rows={7} />
      </Card>
    </Page>
  );
}
