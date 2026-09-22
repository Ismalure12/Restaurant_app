import Link from 'next/link';
import { getOrderByRef } from '@/lib/menuServer';
import ClearCartOnConfirm from '@/components/menu/site/ClearCartOnConfirm';
import PendingPayment from '@/components/menu/site/PendingPayment';
import { FMT } from '@/lib/menu/format';

export const metadata = { title: 'Order confirmed — Maqaaxi', robots: { index: false } };

export default async function OrderPage({ params, searchParams }) {
  const { ref } = await params;
  const sp = (await searchParams) || {};
  const pay = typeof sp.pay === 'string' ? sp.pay : null;

  // Sifalo bounced them back before the payment settled: poll client-side
  // rather than showing a confirmation the payment may not justify.
  if (pay === 'pending') return <PendingPayment reference={ref} />;

  const order = await getOrderByRef(ref);

  if (pay === 'failed' || !order) {
    return (
      <section className="mx-section mx-empty">
        <span className="mx-empty-ring mx-empty-ring-neg" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" />
          </svg>
        </span>
        <h1 className="mx-empty-title">
          {pay === 'failed' ? 'Payment didn’t go through' : 'We can’t find that order'}
        </h1>
        <p className="mx-empty-sub">
          {pay === 'failed'
            ? 'You have not been charged. Your order is still in your cart, so you can try again.'
            : 'The link may be old, or the order was never completed.'}
        </p>
        <Link href={pay === 'failed' ? '/checkout' : '/'} className="mx-btn mx-btn-primary">
          {pay === 'failed' ? 'Try payment again' : 'Back to the menu'}
        </Link>
      </section>
    );
  }

  const items = Array.isArray(order.items) ? order.items : [];

  return (
    <section className="mx-section mx-confirmed">
      {/* The order is placed and paid — the basket must not survive it. */}
      <ClearCartOnConfirm />

      <div className="mx-confirm-head">
        <span className="mx-empty-ring mx-empty-ring-pos" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <h1 className="mx-h1">Order confirmed</h1>
        <p className="mx-empty-sub">
          {order.orderType === 'delivery'
            ? 'We’re preparing it now and it’ll be on its way shortly.'
            : `We’re preparing it now${order.tableNumber ? ` for table ${order.tableNumber}` : ''}.`}
        </p>
      </div>

      <div className="mx-receipt">
        <div className="mx-receipt-row">
          <span>Reference</span>
          <span className="tnum">{order.reference}</span>
        </div>
        {order.customer?.name && (
          <div className="mx-receipt-row"><span>Name</span><span>{order.customer.name}</span></div>
        )}
        {order.address && (
          <div className="mx-receipt-row"><span>Deliver to</span><span>{order.address}</span></div>
        )}

        <ul className="mx-receipt-lines">
          {items.map((l, i) => (
            <li key={l.uid || i}>
              <span className="mx-receipt-qty tnum">{l.quantity}&times;</span>
              <span className="mx-receipt-name">
                {l.name}
                {l.optionName && <span className="mx-meta"> {l.optionName}</span>}
              </span>
              <span className="tnum">{FMT((l.unitPrice || 0) * (l.quantity || 1))}</span>
            </li>
          ))}
        </ul>

        <div className="mx-total-row">
          <span className="mx-total-label">Total paid</span>
          <span className="mx-total-value tnum">{FMT(order.total)}</span>
        </div>
      </div>

      <Link href="/" className="mx-btn mx-btn-ghost">Back to the menu</Link>
    </section>
  );
}
