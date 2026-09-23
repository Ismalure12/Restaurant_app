'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import OrderPage from '@/components/admin/orders/OrderPage';
import { Page, RowSkeletons } from '@/components/admin/ui';

// One sale opened from Sales history (or the Sales report's ledger). `?back=`
// carries the list's filters so the breadcrumb returns to exactly that view.
function SaleDetail() {
  const { id } = useParams();
  const back = useSearchParams().get('back');
  const rootHref = `/admin/dashboard/sales${back && back.startsWith('?') ? back : ''}`;
  return <OrderPage id={id} rootHref={rootHref} rootLabel="Sales history" />;
}

export default function SaleDetailPage() {
  return <Suspense fallback={<Page><RowSkeletons rows={5} /></Page>}><SaleDetail /></Suspense>;
}
