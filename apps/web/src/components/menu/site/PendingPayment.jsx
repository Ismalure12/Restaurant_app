'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// Sifalo has no webhook, so when the customer lands back before the payment has
// settled we ask the API for the result rather than guessing. Gives up politely
// instead of spinning forever.
const MAX_TRIES = 20;
const EVERY_MS = 3000;

export default function PendingPayment({ reference }) {
  const router = useRouter();
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    let tries = 0;
    let stopped = false;

    const tick = async () => {
      if (stopped) return;
      tries += 1;
      try {
        const res = await fetch('/api/payment/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reference }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.paymentStatus === 'paid') {
          router.replace(`/order/${encodeURIComponent(reference)}`);
          return;
        }
        if (res.ok && (data.paymentStatus === 'failed' || data.paymentStatus === 'cancelled')) {
          router.replace(`/order/${encodeURIComponent(reference)}?pay=failed`);
          return;
        }
      } catch { /* offline or a blip — just try again */ }

      if (tries >= MAX_TRIES) { setGaveUp(true); return; }
      setTimeout(tick, EVERY_MS);
    };

    const id = setTimeout(tick, 1200);
    return () => { stopped = true; clearTimeout(id); };
  }, [reference, router]);

  return (
    <section className="mx-section mx-empty" aria-live="polite">
      {!gaveUp ? (
        <>
          <span className="state-spinner" aria-hidden="true" />
          <h1 className="mx-empty-title">Confirming your payment</h1>
          <p className="mx-empty-sub">
            Approve the request on your phone if you haven&rsquo;t yet. This page updates itself.
          </p>
        </>
      ) : (
        <>
          <h1 className="mx-empty-title">Still waiting on the payment</h1>
          <p className="mx-empty-sub">
            We haven&rsquo;t had a result yet. Your order is safe &mdash; staff can see it and will
            confirm once the payment lands. Show them this reference.
          </p>
          <p className="mx-receipt-row"><span className="tnum">{reference}</span></p>
        </>
      )}
    </section>
  );
}
