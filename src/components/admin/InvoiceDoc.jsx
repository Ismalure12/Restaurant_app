'use client';

import { createPortal } from 'react-dom';
import { useIsClient, useBusiness, printMoney as money, printDate } from './printShared';

/**
 * A4 customer invoice following the conventional structure: business header
 * with logo · INVOICE title with number and dates · Bill-to and balance-due
 * panel · itemised table · notes/terms beside the totals block (Balance Due
 * emphasised) · payments received · footer.
 *
 * Portalled into document.body and hidden on screen; printing hides every
 * other body child so only this document reaches the page.
 *
 * invoice: the GET /api/admin/invoices/[id] payload.
 */
const STATUS_LABEL = { unpaid: 'Unpaid', partial: 'Partially paid', paid: 'Paid', void: 'Void' };
const METHOD_LABEL = { cash: 'Cash', card: 'Card', evc: 'EVC Plus' };
const DEFAULT_TERMS = 'Payment is due by the due date shown above. Please quote the invoice number with your payment.';

export default function InvoiceDoc({ invoice }) {
  const isClient = useIsClient();
  const biz = useBusiness();
  if (!invoice || !isClient) return null;

  const number = `INV-${String(invoice.id).padStart(5, '0')}`;
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const subtotal = Number(invoice.subtotal || 0);
  const discount = Number(invoice.discount || 0);
  const total = Number(invoice.total || 0);
  const paid = Number(invoice.amountPaid || 0);
  const balance = Number(invoice.balance || 0);
  // Invoices cut from a delivery order carry the fee inside `total` with no
  // column of its own; print it as a line so the arithmetic on paper adds up.
  const otherCharges = Math.round((total - (subtotal - discount)) * 100) / 100;
  const payments = Array.isArray(invoice.payments) ? invoice.payments : [];
  const status = invoice.status || 'unpaid';

  return createPortal(
    <div className="invd-root" aria-hidden="true">
      <div className="invd">
        {(status === 'paid' || status === 'void') && <div className={`iv-mark ${status}`}>{status === 'paid' ? 'PAID' : 'VOID'}</div>}

        <header className="iv-top">
          <div className="iv-brand">
            {/* eslint-disable-next-line @next/next/no-img-element -- print-only document; next/image adds nothing on paper */}
            <img src="/logo-icon.png" alt="" className="iv-logo" />
            <div>
              <div className="iv-biz">{biz.name}</div>
              {biz.address && <div className="iv-muted">{biz.address}</div>}
              {biz.phone && <div className="iv-muted">Tel {biz.phone}</div>}
              {biz.taxId && <div className="iv-muted">Tax ID {biz.taxId}</div>}
            </div>
          </div>
          <div className="iv-titlebox">
            <div className="iv-title">INVOICE</div>
            <table className="iv-kv">
              <tbody>
                <tr><th>Invoice no.</th><td>{number}</td></tr>
                <tr><th>Issue date</th><td>{invoice.createdAt ? printDate(invoice.createdAt) : '—'}</td></tr>
                <tr><th>Due date</th><td>{invoice.dueDate ? printDate(invoice.dueDate) : 'On receipt'}</td></tr>
                {invoice.order?.reference && <tr><th>Order ref</th><td>{invoice.order.reference.slice(-12)}</td></tr>}
              </tbody>
            </table>
          </div>
        </header>

        <div className="iv-accent" />

        <section className="iv-parties">
          <div>
            <div className="iv-label">Bill to</div>
            <div className="iv-party">{invoice.customer?.name}</div>
            {invoice.customer?.phone && <div>{invoice.customer.phone}</div>}
            {invoice.customer?.address && <div className="iv-muted">{invoice.customer.address}</div>}
            {invoice.tableNumber && <div className="iv-muted">Table {invoice.tableNumber}</div>}
          </div>
          <div className="iv-due">
            <div className="iv-label">Balance due</div>
            <div className="iv-due-amt">{money(status === 'void' ? 0 : balance)}</div>
            <div className={`iv-status s-${status}`}>{STATUS_LABEL[status] || status}</div>
          </div>
        </section>

        <table className="iv-items">
          <thead>
            <tr><th className="c-n">#</th><th>Description</th><th className="c-r">Qty</th><th className="c-r">Unit price</th><th className="c-r">Amount</th></tr>
          </thead>
          <tbody>
            {items.map((l, i) => {
              const qty = Number(l.quantity || 0);
              const unit = Number(l.unitPrice || 0);
              return (
                <tr key={i}>
                  <td className="c-n">{i + 1}</td>
                  <td>{l.description || l.name}{l.optionName && <div className="iv-sub">{l.optionName}</div>}</td>
                  <td className="c-r">{qty}</td>
                  <td className="c-r">{money(unit)}</td>
                  <td className="c-r">{money(qty * unit)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <section className="iv-bottom">
          <div className="iv-notes">
            {invoice.note && (<><div className="iv-label">Note</div><p>{invoice.note}</p></>)}
            <div className="iv-label">Payment terms</div>
            <p>{biz.terms || DEFAULT_TERMS}</p>
            {biz.evcAccount && status !== 'void' && status !== 'paid' && (
              <>
                <div className="iv-label">Pay by EVC Plus</div>
                <p className="iv-evc">{biz.evcAccount} <span>· {biz.name}</span></p>
              </>
            )}
          </div>
          <table className="iv-totals">
            <tbody>
              <tr><th>Subtotal</th><td>{money(subtotal)}</td></tr>
              {discount > 0 && <tr><th>Discount</th><td>-{money(discount)}</td></tr>}
              {otherCharges > 0 && <tr><th>Delivery &amp; other charges</th><td>{money(otherCharges)}</td></tr>}
              <tr className="t"><th>Total</th><td>{money(total)}</td></tr>
              <tr><th>Amount paid</th><td>-{money(paid)}</td></tr>
              <tr className="due"><th>Balance due</th><td>{money(status === 'void' ? 0 : balance)}</td></tr>
            </tbody>
          </table>
        </section>

        {payments.length > 0 && (
          <section className="iv-section">
            <div className="iv-label">Payments received</div>
            <table className="iv-pay">
              <thead><tr><th>Date</th><th>Method</th><th>Recorded by</th><th className="c-r">Amount</th></tr></thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}><td>{printDate(p.paidAt)}</td><td>{METHOD_LABEL[p.method] || p.method}</td><td>{p.recordedByName || '—'}</td><td className="c-r">{money(p.amount)}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <footer className="iv-foot">
          <div><b>{biz.footer || 'Thank you for your business.'}</b></div>
          <div>{number} · Maqaaxi POS</div>
        </footer>
      </div>

      <style jsx global>{`
        .invd-root { display: none; }

        @media print {
          body > *:not(.invd-root) { display: none !important; }
          .invd-root { display: block !important; }
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
          @page { size: A4; margin: 14mm 14mm 16mm; }
        }

        .invd { position: relative; font-family: var(--font-geist), "Helvetica Neue", Arial, sans-serif; color: #14201a; font-size: 10.5pt; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .invd * { box-sizing: border-box; }
        .iv-mark { position: absolute; top: 40%; left: 50%; transform: translate(-50%, -50%) rotate(-24deg); font-size: 110pt; font-weight: 900; letter-spacing: .1em; opacity: .07; pointer-events: none; }
        .iv-mark.paid { color: #1f6b4f; }
        .iv-mark.void { color: #b03a26; }
        .iv-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
        .iv-brand { display: flex; gap: 12px; align-items: flex-start; max-width: 55%; }
        .iv-logo { width: 48px; height: 48px; object-fit: contain; flex-shrink: 0; }
        .iv-biz { font-size: 17pt; font-weight: 700; letter-spacing: -0.01em; line-height: 1.15; margin-bottom: 3px; }
        .iv-muted { color: #5b6b63; font-size: 9.5pt; }
        .iv-titlebox { text-align: right; }
        .iv-title { font-size: 28pt; font-weight: 800; letter-spacing: .18em; color: #1f6b4f; line-height: 1; margin-bottom: 10px; }
        .iv-kv { margin-left: auto; border-collapse: collapse; font-size: 9.5pt; }
        .iv-kv th { text-align: left; font-weight: 500; color: #5b6b63; padding: 1px 16px 1px 0; }
        .iv-kv td { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
        .iv-accent { height: 3px; background: #1f6b4f; margin: 16px 0 18px; border-radius: 2px; }
        .iv-label { font-size: 8pt; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: #5b6b63; margin-bottom: 4px; }
        .iv-parties { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-bottom: 20px; }
        .iv-party { font-size: 13pt; font-weight: 700; }
        .iv-due { text-align: right; min-width: 190px; background: #f1f6f3; border: 1px solid #cfe3d8; border-radius: 6px; padding: 10px 14px; }
        .iv-due-amt { font-size: 21pt; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.1; }
        .iv-status { display: inline-block; margin-top: 5px; font-size: 8pt; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; padding: 2px 9px; border-radius: 20px; border: 1px solid currentColor; }
        .iv-status.s-paid { color: #1f6b4f; }
        .iv-status.s-partial { color: #9a6a10; }
        .iv-status.s-unpaid { color: #b03a26; }
        .iv-status.s-void { color: #6b6b6b; }
        .iv-items { width: 100%; border-collapse: collapse; font-size: 10pt; }
        .iv-items thead th { background: #14201a; color: #fff; text-align: left; font-size: 8pt; letter-spacing: .1em; text-transform: uppercase; font-weight: 700; padding: 7px 10px; }
        .iv-items td { padding: 8px 10px; border-bottom: 1px solid #e3e9e5; vertical-align: top; }
        .iv-items tbody tr:nth-child(even) td { background: #f7f9f8; }
        .iv-items tr { page-break-inside: avoid; }
        .iv-items .c-r, .iv-items thead th.c-r { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .iv-items .c-n { width: 30px; color: #5b6b63; }
        .iv-items thead th.c-n { color: #fff; }
        .iv-sub { font-size: 8.5pt; color: #5b6b63; }
        .iv-bottom { display: flex; justify-content: space-between; align-items: flex-start; gap: 28px; margin-top: 18px; page-break-inside: avoid; }
        .iv-notes { flex: 1; font-size: 9.5pt; }
        .iv-notes p { margin: 0 0 12px; color: #2c3b34; }
        .iv-evc { font-size: 13pt; font-weight: 800; letter-spacing: .04em; color: #14201a; }
        .iv-evc span { font-size: 9.5pt; font-weight: 500; letter-spacing: 0; color: #5b6b63; }
        .iv-totals { border-collapse: collapse; min-width: 260px; font-size: 10pt; }
        .iv-totals th { text-align: left; font-weight: 500; color: #2c3b34; padding: 4px 18px 4px 0; }
        .iv-totals td { text-align: right; font-variant-numeric: tabular-nums; padding: 4px 0; white-space: nowrap; }
        .iv-totals tr.t th, .iv-totals tr.t td { border-top: 1.5px solid #14201a; font-weight: 700; padding-top: 7px; }
        .iv-totals tr.due th, .iv-totals tr.due td { background: #1f6b4f; color: #fff; font-weight: 800; font-size: 11.5pt; padding: 8px 10px; }
        .iv-section { margin-top: 20px; page-break-inside: avoid; }
        .iv-pay { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-top: 4px; }
        .iv-pay th { text-align: left; font-size: 8pt; letter-spacing: .1em; text-transform: uppercase; color: #5b6b63; border-bottom: 1px solid #cfd8d3; padding: 4px 8px 4px 0; font-weight: 700; }
        .iv-pay td { padding: 5px 8px 5px 0; border-bottom: 1px solid #eef1ef; }
        .iv-pay .c-r { text-align: right; font-variant-numeric: tabular-nums; }
        .iv-foot { margin-top: 28px; padding-top: 10px; border-top: 1px solid #e3e9e5; display: flex; justify-content: space-between; gap: 16px; font-size: 8.5pt; color: #5b6b63; }
        .iv-foot b { color: #14201a; font-weight: 600; }
      `}</style>
    </div>,
    document.body,
  );
}
