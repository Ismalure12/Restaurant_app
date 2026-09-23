'use client';

import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson, parseApiError } from '@/lib/apiError';
import { RowsSkeleton } from '@/components/admin/Skeletons';
import OrderDetailView from './OrderDetailView';
import { Ic } from './orderUi';

/**
 * A full-page order: loads GET /api/admin/orders/:id and renders the shared
 * OrderDetailView under a breadcrumb (Orders › KFG-… or Sales report › KFG-…).
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
    <nav className="adm-crumb">
      <Link href={rootHref}>{Ic.back}{rootLabel}</Link>
      <span className="sep">/</span>
      <span>{order?.code || `Order ${id}`}</span>
    </nav>
  );

  if (isLoading) return <div className="wrap odv-page">{crumb}<RowsSkeleton rows={5} height={64} /></div>;
  if (isError) {
    return (
      <div className="wrap odv-page">
        {crumb}
        <div className="adm-error-banner">{error?.status === 404 ? 'This order doesn’t exist.' : parseApiError(error)}</div>
      </div>
    );
  }
  return (
    <div className="wrap odv-page">
      <OrderDetailView order={order} crumb={crumb} onUpdated={onUpdated} />
    </div>
  );
}
