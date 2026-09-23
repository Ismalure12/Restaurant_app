'use client';

import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson, parseApiError } from '@/lib/apiError';
import { Page, Alert, Icon, KpiSkeletons, RowSkeletons } from '@/components/admin/ui';
import OrderDetailView from './OrderDetailView';

/**
 * A full-page order: loads GET /api/admin/orders/:id and renders the shared
 * OrderDetailView under a breadcrumb (Orders › KFG-… or Sales history › KFG-…).
 */
export default function OrderPage({ id, rootHref, rootLabel }) {
  const qc = useQueryClient();
  const { data: order, isLoading, isError, error } = useQuery({
    queryKey: ['order', String(id)],
    queryFn: () => fetchJson(`/api/admin/orders/${id}`),
  });

  const onUpdated = (updated) => {
    qc.setQueryData(['order', String(id)], updated);
    qc.setQueryData(['orders-all'], (list) => (Array.isArray(list) ? list.map((x) => (x.id === updated.id ? updated : x)) : list));
    qc.invalidateQueries({ queryKey: ['sales'] });
  };

  const crumb = (
    <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px] min-w-0">
      <Link href={rootHref} className="inline-flex items-center gap-1.5 min-h-9 font-semibold text-mq-cta hover:text-mq-primary">
        <Icon name="chevLeft" size={15} stroke={2} />{rootLabel}
      </Link>
      <span className="text-mq-faint" aria-hidden="true">/</span>
      <span className="font-mq-mono text-[12.5px] text-mq-muted truncate">{order?.code || `Order ${id}`}</span>
    </nav>
  );

  if (isLoading) {
    return (
      <Page>
        {crumb}
        <KpiSkeletons count={1} />
        <div className="bg-white border border-mq-line rounded-xl"><RowSkeletons rows={6} /></div>
      </Page>
    );
  }
  if (isError) {
    return (
      <Page>
        {crumb}
        <Alert tone="danger" title="Couldn’t open this order">{error?.status === 404 ? 'This order doesn’t exist.' : parseApiError(error)}</Alert>
      </Page>
    );
  }
  return (
    <Page>
      <OrderDetailView order={order} crumb={crumb} onUpdated={onUpdated} />
    </Page>
  );
}
