import { Button, EmptyState, Page } from '@/components/admin/ui';

export default function DashboardNotFound() {
  return (
    <Page>
      <div className="bg-white border border-mq-line rounded-xl">
        <EmptyState
          icon="search"
          title="Page not found"
          action={<Button href="/admin/dashboard" variant="soft" size="sm">Back to the dashboard</Button>}
        >
          This address doesn’t match any page. It may have moved in the new layout — use the sidebar to find it.
        </EmptyState>
      </div>
    </Page>
  );
}
