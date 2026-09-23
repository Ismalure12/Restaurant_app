'use client';

import { useParams } from 'next/navigation';
import OrderPage from '@/components/admin/orders/OrderPage';

// One order, full page — same view as the Orders side panel and the Sales report.
export default function OrderDetailPage() {
  const { id } = useParams();
  return <OrderPage id={id} rootHref="/admin/dashboard/orders" rootLabel="Orders" />;
}
