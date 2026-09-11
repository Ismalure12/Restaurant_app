'use client';

import { createPortal } from 'react-dom';
import { useIsClient, useBusiness, printMoney as money, printDate, printTime } from './printShared';

/**
 * 80mm thermal receipt, laid out in the standard restaurant order: business
 * header → document band → order meta → items with a fixed right-hand price
 * column → totals → payment → status stamp → footer.
 *
 * Rendered into document.body via a portal and hidden on screen. When
 * window.print() runs, every other body child is display:none, so the
 * dashboard can't add blank paper to the roll.
 *
 * Pure black on white with a monospace face: thermal heads dither greys into
 * mud, and proportional type breaks the price column.
 *
 * order: { id, reference, status?, orderType, tableNumber, items[], total,
 *          discount, deliveryFee, contactName, contactPhone, address,
 *          waiterName, cashierName, paymentMethod, amountReceived, change?,
 *          invoiceId, createdAt }
 */
const METHOD_LABEL = { cash: 'Cash', card: 'Card', evc: 'EVC Plus', invoice: 'On account', waafi: 'Waafi' };

export default function ReceiptDoc({ order }) {
  const isClient = useIsClient();
  const biz = useBusiness();
  if (!order || !isClient) return null;

  const items = Array.isArray(order.items) ? order.items : [];
  const when = order.createdAt ? new Date(order.createdAt) : new Date();
  const discount = Number(order.discount || 0);
  const deliveryFee = Number(order.deliveryFee || 0);
  const total = Number(order.total || 0);
  const subtotal = items.reduce((s, l) => s + Number(l.unitPrice) * Number(l.quantity), 0);
  const units = items.reduce((s, l) => s + Number(l.quantity || 0), 0);
  // Don't infer delivery from a phone number — public dine-in orders carry one too.
  const isDelivery = order.orderType === 'delivery' || deliveryFee > 0;
  const isInvoice = Boolean(order.invoiceId);
  const voided = order.status === 'voided';
  const received = order.amountReceived != null && order.amountReceived !== '' ? Number(order.amountReceived) : null;
  const change = order.change != null ? Number(order.change) : (received != null ? Math.max(0, received - total) : null);
  const title = voided ? 'VOID' : isInvoice ? 'INVOICE SALE' : isDelivery ? 'DELIVERY RECEIPT' : 'SALES RECEIPT';
  const hasDeliveryContact = isDelivery && (order.contactName || order.contactPhone || order.address);

  return createPortal(
    <div className="rcpt-root" aria-hidden="true">
      <div className="rcpt">
        <header className="rc-head">
          <div className="rc-name">{biz.name}</div>
          {biz.address && <div className="rc-line">{biz.address}</div>}
          {biz.phone && <div className="rc-line">Tel {biz.phone}</div>}
          {biz.taxId && <div className="rc-line">Tax ID {biz.taxId}</div>}
        </header>

        <div className="rc-band">{title}</div>

        <div className="rc-meta">
          <div><span>Order</span><b>#{order.id}</b></div>
          <div><span>Date</span><span>{printDate(when)} {printTime(when)}</span></div>
          <div><span>Service</span><span>{isDelivery ? 'Delivery' : 'Dine-in'}{!isDelivery && order.tableNumber ? ` · Table ${order.tableNumber}` : ''}</span></div>
          {order.waiterName && <div><span>Server</span><span>{order.waiterName}</span></div>}
          {order.cashierName && <div><span>Cashier</span><span>{order.cashierName}</span></div>}
        </div>

        {hasDeliveryContact && (
          <>
            <div className="rc-rule" />
            <div className="rc-sec">DELIVER TO</div>
            <div className="rc-meta">
              {order.contactName && <div><span>Name</span><span>{order.contactName}</span></div>}
              {order.contactPhone && <div><span>Phone</span><span>{order.contactPhone}</span></div>}
              {order.address && <div className="rc-addr">{order.address}</div>}
            </div>
          </>
        )}

        <div className="rc-rule" />
        <div className="rc-cols"><span>QTY</span><span>ITEM</span><span>AMOUNT</span></div>
        <div className="rc-rule thin" />

        {items.map((line, i) => {
          const qty = Number(line.quantity);
          const unit = Number(line.unitPrice);
          const extras = Array.isArray(line.extras) && line.extras.length ? line.extras.map((e) => e.name).join(', ') : '';
          return (
            <div className="rc-item" key={line.uid || i}>
              <span className="q">{qty}</span>
              <span className="n">
                {line.name}
                {line.optionName && <span className="mod">{line.optionName}</span>}
                {extras && <span className="mod">+ {extras}</span>}
                {line.notes && <span className="mod">* {line.notes}</span>}
                {qty > 1 && <span className="mod">@ {money(unit)} each</span>}
              </span>
              <span className="a">{money(unit * qty)}</span>
            </div>
          );
        })}

        <div className="rc-rule" />
        <div className="rc-sum"><span>Items</span><span>{units}</span></div>
        <div className="rc-sum"><span>Subtotal</span><span>{money(subtotal)}</span></div>
        {discount > 0 && <div className="rc-sum"><span>Discount</span><span>-{money(discount)}</span></div>}
        {deliveryFee > 0 && <div className="rc-sum"><span>Delivery fee</span><span>{money(deliveryFee)}</span></div>}

        <div className="rc-total"><span>TOTAL</span><span>{money(total)}</span></div>

        {order.paymentMethod && !isInvoice && (
          <>
            <div className="rc-sum"><span>Paid by</span><span>{METHOD_LABEL[order.paymentMethod] || order.paymentMethod}</span></div>
            {received != null && <div className="rc-sum"><span>Tendered</span><span>{money(received)}</span></div>}
            {change != null && change > 0 && <div className="rc-sum strong"><span>Change</span><span>{money(change)}</span></div>}
          </>
        )}

        {biz.evcAccount && !voided && (order.paymentMethod === 'evc' || isInvoice) && (
          <div className="rc-evc">
            <div className="rc-sec">PAY BY EVC PLUS</div>
            <div className="rc-evc-no">{biz.evcAccount}</div>
            <div className="rc-line">{biz.name}</div>
          </div>
        )}

        {voided
          ? <div className="rc-stamp">*** VOID · NOT A VALID RECEIPT ***</div>
          : isInvoice
            ? <div className="rc-stamp">BALANCE DUE · INVOICE #{order.invoiceId}</div>
            : <div className="rc-stamp">PAID IN FULL</div>}

        <div className="rc-rule" />
        <footer className="rc-foot">
          <div className="rc-msg">{biz.footer || 'Thank you for dining with us!'}</div>
          {order.reference && <div className="rc-ref">Ref {order.reference}</div>}
          <div className="rc-ref">Maqaaxi POS</div>
        </footer>
      </div>

      <style jsx global>{`
        .rcpt-root { display: none; }

        @media print {
          body > *:not(.rcpt-root) { display: none !important; }
          .rcpt-root { display: block !important; }
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
          @page { size: 80mm auto; margin: 0; }
        }

        .rcpt {
          width: 80mm;
          padding: 5mm 4mm 8mm;
          box-sizing: border-box;
          font-family: "Consolas", "Lucida Console", "Menlo", "Courier New", monospace;
          font-size: 12.5px;
          line-height: 1.35;
          color: #000;
          background: #fff;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .rcpt * { box-sizing: border-box; }
        .rc-head { text-align: center; margin-bottom: 6px; }
        .rc-name { font-size: 18px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; line-height: 1.2; overflow-wrap: anywhere; }
        .rc-line { font-size: 11.5px; margin-top: 2px; overflow-wrap: anywhere; }
        .rc-band { background: #000; color: #fff; text-align: center; font-weight: 700; letter-spacing: .2em; font-size: 12px; padding: 4px 0; margin: 6px 0 8px; }
        .rc-meta > div { display: flex; justify-content: space-between; gap: 10px; }
        .rc-meta > div > :first-child { flex-shrink: 0; }
        .rc-meta > div > :last-child { text-align: right; overflow-wrap: anywhere; }
        .rc-meta .rc-addr { display: block; text-align: left; overflow-wrap: anywhere; }
        .rc-sec { font-weight: 700; letter-spacing: .12em; font-size: 11px; margin-bottom: 2px; }
        .rc-rule { border-top: 1px dashed #000; margin: 7px 0; }
        .rc-rule.thin { margin: 3px 0 6px; }
        .rc-cols, .rc-item { display: grid; grid-template-columns: 3.5ch 1fr auto; column-gap: 8px; }
        .rc-cols { font-size: 11px; font-weight: 700; letter-spacing: .06em; }
        .rc-cols > :last-child, .rc-item .a { text-align: right; }
        .rc-item { margin-bottom: 6px; align-items: start; }
        .rc-item .q { font-weight: 700; }
        .rc-item .n { font-weight: 600; overflow-wrap: anywhere; }
        .rc-item .a { white-space: nowrap; font-weight: 600; }
        .rc-item .mod { display: block; font-weight: 400; font-size: 11.5px; }
        .rc-sum { display: flex; justify-content: space-between; gap: 10px; }
        .rc-sum.strong { font-weight: 700; }
        .rc-total { display: flex; justify-content: space-between; gap: 10px; font-size: 17px; font-weight: 800; border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 5px 0; margin: 7px 0; }
        .rc-evc { text-align: center; border: 1.5px dashed #000; padding: 6px 4px; margin: 9px 0 2px; }
        .rc-evc .rc-sec { margin-bottom: 1px; }
        .rc-evc-no { font-size: 17px; font-weight: 800; letter-spacing: .06em; overflow-wrap: anywhere; }
        .rc-stamp { text-align: center; font-weight: 800; letter-spacing: .08em; border: 1.5px solid #000; padding: 5px 4px; margin: 9px 0 2px; font-size: 12.5px; }
        .rc-foot { text-align: center; }
        .rc-msg { font-weight: 600; margin-bottom: 4px; overflow-wrap: anywhere; }
        .rc-ref { font-size: 10.5px; overflow-wrap: anywhere; }
      `}</style>
    </div>,
    document.body,
  );
}
