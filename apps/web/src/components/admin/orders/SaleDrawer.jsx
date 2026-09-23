'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson, parseApiError } from '@/lib/apiError';
import { Drawer, Alert, RowSkeletons, Button } from '@/components/admin/ui';
import OrderDetailView from './OrderDetailView';

/**
 * One sale in the right-hand drawer (Overview recent sales, Sales history,
 * Employee orders). Same component as the full page (OrderDetailView), same
 * query key, so opening the full page after the drawer is instant. The API
 * decides who may read it (waiters can't open a sale) — callers also hide the
 * row click for waiters. `href` = the full page (deep link).
 */
export default function SaleDrawer({ orderId, onClose, href }) {
  const qc = useQueryClient();
  const open = orderId != null;
  const { data: order, isLoading, isError, error } = useQuery({
    queryKey: ['order', String(orderId)],
    queryFn: () => fetchJson(`/api/admin/orders/${orderId}`),
    enabled: open,
  });

  const onUpdated = (updated) => {
    qc.setQueryData(['order', String(updated.id)], updated);
    qc.setQueryData(['orders-all'], (list) => (Array.isArray(list) ? list.map((x) => (x.id === updated.id ? updated : x)) : list));
    qc.invalidateQueries({ queryKey: ['sales'] });
  };

  const ref = order ? [order.receiptNo && `Receipt ${String(order.receiptNo).padStart(4, '0')}`, order.code].filter(Boolean).join(' · ') : '';
  const title = order
    ? (order.contactName || order.customer?.name || (order.tableNumber ? `Table ${order.tableNumber}` : order.orderType === 'delivery' ? 'Delivery' : 'Walk-in'))
    : 'Sale';

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow={ref}
      title={title}
      footer={href && order ? <Button href={href} variant="ghost" size="xs" iconRight="external">Open full page</Button> : null}
    >
      {isLoading && <RowSkeletons rows={6} />}
      {isError && (
        <div className="p-4">
          <Alert tone="danger" title="Couldn’t open this sale">{error?.status === 404 ? 'This sale doesn’t exist.' : parseApiError(error)}</Alert>
        </div>
      )}
      {order && <OrderDetailView order={order} onUpdated={onUpdated} embedded compact />}
    </Drawer>
  );
}
