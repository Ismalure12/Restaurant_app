'use client';

/**
 * 80mm thermal-style receipt. Hidden on screen; only this subtree is visible
 * when window.print() runs. Print styles are scoped here via styled-jsx so the
 * public globals.css is never touched.
 *
 * order shape: { id, reference, orderType, tableNumber, items[], total,
 *                discount, deliveryFee, contactName, contactPhone, address,
 *                paymentMethod, amountReceived, change, cashierName, createdAt }
 */
export default function ReceiptDoc({ order }) {
  if (!order) return null;

  const money = (n) => `$${Number(n).toFixed(2)}`;
  const when = order.createdAt ? new Date(order.createdAt) : new Date();
  const discount = Number(order.discount || 0);
  const deliveryFee = Number(order.deliveryFee || 0);
  const subtotal = order.items.reduce((s, l) => s + Number(l.unitPrice) * l.quantity, 0);
  // Don't infer delivery from a phone number — public dine-in orders also carry one.
  const isDelivery = order.orderType === 'delivery' || deliveryFee > 0;

  return (
    <div className="receipt-print-root">
      <div className="rcpt">
        <div className="rcpt-head">
          <div className="rcpt-brand">KFG</div>
          <div className="rcpt-muted">Restaurant Receipt</div>
        </div>

        <div className="rcpt-meta">
          <div><span>Order</span><span>#{order.id}</span></div>
          <div><span>Ref</span><span>{order.reference}</span></div>
          <div><span>Service</span><span>{isDelivery ? 'Delivery' : 'Dine-in'}</span></div>
          {!isDelivery && order.tableNumber ? <div><span>Table</span><span>{order.tableNumber}</span></div> : null}
          {order.waiterName ? <div><span>Waiter</span><span>{order.waiterName}</span></div> : null}
          {order.cashierName ? <div><span>Cashier</span><span>{order.cashierName}</span></div> : null}
          <div><span>Date</span><span>{when.toLocaleString()}</span></div>
        </div>

        {isDelivery && (order.contactName || order.contactPhone || order.address) ? (
          <>
            <div className="rcpt-rule" />
            <div className="rcpt-meta">
              {order.contactName ? <div><span>Customer</span><span>{order.contactName}</span></div> : null}
              {order.contactPhone ? <div><span>Phone</span><span>{order.contactPhone}</span></div> : null}
              {order.address ? <div className="rcpt-addr"><span>Address</span><span>{order.address}</span></div> : null}
            </div>
          </>
        ) : null}

        <div className="rcpt-rule" />

        <div className="rcpt-lines">
          {order.items.map((line, i) => {
            const lineTotal = Number(line.unitPrice) * line.quantity;
            return (
              <div className="rcpt-line" key={line.uid || i}>
                <div className="rcpt-line-top">
                  <span>{line.quantity}× {line.name}</span>
                  <span>{money(lineTotal)}</span>
                </div>
                {line.optionName ? <div className="rcpt-sub">{line.optionName}</div> : null}
                {line.extras && line.extras.length > 0 ? (
                  <div className="rcpt-sub">+ {line.extras.map((e) => e.name).join(', ')}</div>
                ) : null}
                {line.notes ? <div className="rcpt-sub">Note: {line.notes}</div> : null}
              </div>
            );
          })}
        </div>

        <div className="rcpt-rule" />

        {(discount > 0 || deliveryFee > 0) ? (
          <div className="rcpt-sums">
            <div><span>Subtotal</span><span>{money(subtotal)}</span></div>
            {discount > 0 ? <div><span>Discount</span><span>−{money(discount)}</span></div> : null}
            {deliveryFee > 0 ? <div><span>Delivery</span><span>{money(deliveryFee)}</span></div> : null}
          </div>
        ) : null}

        <div className="rcpt-total">
          <span>TOTAL</span><span>{money(order.total)}</span>
        </div>

        <div className="rcpt-paid">— PAID —</div>

        <div className="rcpt-foot">Thank you · KFG</div>
      </div>

      <style jsx global>{`
        .receipt-print-root { display: none; }

        @media print {
          body * { visibility: hidden; }
          .receipt-print-root,
          .receipt-print-root * { visibility: visible; }
          .receipt-print-root {
            display: block;
            position: absolute;
            top: 0;
            left: 0;
            width: 80mm;
          }
          @page { size: 80mm auto; margin: 0; }
        }

        /* Pure black on white — thermal printers render greys as muddy dither. */
        .rcpt {
          width: 80mm;
          padding: 6mm 4mm;
          box-sizing: border-box;
          font-family: 'Courier New', ui-monospace, monospace;
          color: #000;
          background: #fff;
          font-size: 12px;
          line-height: 1.4;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .rcpt * { color: #000 !important; }
        .rcpt-head { text-align: center; margin-bottom: 6px; }
        .rcpt-brand { font-size: 16px; font-weight: 700; letter-spacing: 1px; }
        .rcpt-muted { font-size: 11px; }
        .rcpt-meta div,
        .rcpt-sums div,
        .rcpt-total { display: flex; justify-content: space-between; gap: 8px; }
        .rcpt-sums { margin-bottom: 4px; }
        .rcpt-addr span:last-child { text-align: right; max-width: 60%; }
        .rcpt-rule { border-top: 1px dashed #000; margin: 6px 0; }
        .rcpt-line { margin-bottom: 4px; }
        .rcpt-line-top { display: flex; justify-content: space-between; gap: 8px; font-weight: 600; }
        .rcpt-sub { font-size: 11px; padding-left: 10px; }
        .rcpt-total { font-weight: 700; font-size: 14px; margin: 4px 0; }
        .rcpt-paid { text-align: center; font-weight: 700; letter-spacing: 2px; margin-top: 8px; font-size: 13px; }
        .rcpt-foot { text-align: center; margin-top: 8px; font-size: 11px; }
      `}</style>
    </div>
  );
}
