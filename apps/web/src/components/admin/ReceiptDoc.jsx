'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { useIsClient, useBusiness, includedTax, printDate, printTime } from './printShared';

/**
 * 80mm thermal print documents, built to use as little paper as possible.
 *
 *   kind="customer" — the customer's receipt (the owner's sample layout):
 *     SHOP NAME → Served by · Order ID · Receipt # · Pay to · Date
 *     → Qty / Item / Price → TOTAL → Thank you!
 *     A Subtotal line appears ONLY when something sits between it and the
 *     total (discount, delivery fee, included tax) — otherwise it would just
 *     repeat the total.
 *   kind="bill"     — the check for an unpaid order, before payment: same layout,
 *     no receipt # (it's assigned when the tab is paid) and "NOT PAID".
 *   Both print ONE "Pay to:" block listing every business wallet, 2–3 per
 *   line, using the collector's own number where they have one — but never
 *   whose number it is, and no "Account:" row (owner, 2026-09-22).
 *   kind="kitchen"  — the kitchen ticket: service, order ID, time, table,
 *     server, then big "2x Item" lines with options/notes. No prices. When
 *     order.addedLines is set (items added to an unpaid order) only those lines
 *     print, under an ADDED band.
 *
 *   kind="invoice"  — a customer invoice on the same 80mm roll (pass `invoice`).
 *
 * Rendered hidden on screen. usePrintDoc() copies the rendered markup + the
 * RECEIPT_CSS below into a tiny hidden iframe and prints THAT — so the print
 * preview never has to lay out (or load the images of) the page behind it.
 * Pure black on white in a monospace face: thermal heads dither greys into
 * mud, and proportional type breaks the price column.
 *
 * order: { id, code, receiptNo, status?, source?, orderType, tableNumber,
 *          items[], addedLines?, total, discount, deliveryFee, contactName,
 *          contactPhone, address, waiterName, cashierName, paymentMethod,
 *          paymentAccount, amountReceived, change?, invoiceId, createdAt,
 *          closedAt }
 */

// Receipt money: plain 2-decimals in the item column (as on the sample), $ on totals.
const amt = (n) => Number(n || 0).toFixed(2);
const usd = (n) => `$${amt(n)}`;
// Short order ID from the API (KFG-260919-0101); older payloads fall back to the id.
const orderId = (order) => order.code || `#${order.id}`;

/**
 * The business wallets customers can pay into (Settings money accounts of kind
 * 'wallet', in their order). Shares the ['settings'] cache with useBusiness();
 * falls back to the legacy `paymentAccounts` list when the new field is absent.
 */
export function useWallets() {
  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: () => fetchJson('/api/admin/settings'),
    staleTime: 5 * 60 * 1000,
  });
  return useMemo(() => {
    if (Array.isArray(data?.moneyAccounts)) {
      return data.moneyAccounts.filter((a) => a.kind === 'wallet').map((a) => ({ id: a.id, label: a.label, number: a.number }));
    }
    return Array.isArray(data?.paymentAccounts) ? data.paymentAccounts.map((a) => ({ id: null, ...a })) : [];
  }, [data]);
}

/**
 * Owner's rule: every business wallet, in order — the collector's own number
 * where they have one for that wallet, the business number otherwise.
 * payTo = { name, numbers:[{accountId,label,number}] } | null.
 */
export function payToAccounts(wallets, payTo) {
  const mine = new Map((Array.isArray(payTo?.numbers) ? payTo.numbers : []).map((n) => [String(n.accountId), n.number]));
  return wallets
    .map((w) => ({ label: w.label, number: (w.id != null && mine.get(String(w.id))) || w.number }))
    .filter((a) => a.label && a.number);
}

/**
 * The "Pay to:" block for a .rc-kv grid, spanning both columns: the accounts
 * flow inline ("A/C 521436  E/d 748079  My Cash 937875"), each label+number
 * kept together, so 2–3 fit on a line and the rest wrap to the next.
 */
export function PayToRow({ accounts }) {
  if (!accounts.length) return null;
  return (
    <div className="rc-payto">
      <span className="k">Pay to:</span>
      {accounts.map((a, i) => <span className="rc-acc" key={i}>{a.label} {a.number}</span>)}
    </div>
  );
}

/** An admin API order (serializeOrder shape) → the props a print document reads. */
export const receiptFromOrder = (o, extra = {}) => ({
  id: o.id, code: o.code, receiptNo: o.receiptNo, status: o.status, source: o.source, paymentStatus: o.paymentStatus,
  orderType: o.orderType, tableNumber: o.tableNumber,
  items: Array.isArray(o.items) ? o.items : [], total: o.total, discount: o.discount, deliveryFee: o.deliveryFee,
  contactName: o.contactName || o.customer?.name || null, contactPhone: o.contactPhone,
  address: o.orderType === 'delivery' ? o.address : null,
  waiterName: o.waiterName, cashierName: o.staffName, createdAt: o.createdAt, closedAt: o.closedAt,
  paymentMethod: o.paymentMethod, paymentAccount: o.paymentAccount, amountReceived: o.amountReceived,
  payTo: o.payTo ?? null, payments: Array.isArray(o.payments) ? o.payments : [],
  // Names only on paper — never a login email.
  invoiceId: o.invoiceId ?? o.invoice?.id ?? null,
  invoiceStatus: o.invoice?.status ?? null,
  invoiceBalance: o.invoice?.balance ?? null,
  ...extra,
});

export default function ReceiptDoc({ order, invoice, kind = 'customer' }) {
  const isClient = useIsClient();
  const biz = useBusiness();
  const wallets = useWallets();
  const doc = kind === 'invoice' ? invoice : order;
  if (!doc || !isClient) return null;

  return (
    <div className="rcpt-root" data-print-doc hidden aria-hidden="true">
      {kind === 'kitchen' ? <KitchenTicket order={order} />
        : kind === 'invoice' ? <InvoiceReceipt invoice={invoice} biz={biz} wallets={wallets} />
          : <CustomerReceipt order={order} biz={biz} wallets={wallets} bill={kind === 'bill'} />}
    </div>
  );
}

function servedBy(order) {
  return order.waiterName || order.cashierName || (order.source === 'online' ? 'Online order' : '');
}

function lineMods(line) {
  const extras = Array.isArray(line.extras) && line.extras.length ? `+ ${line.extras.map((e) => e.name).join(', ')}` : '';
  return [line.optionName, extras, line.notes ? `* ${line.notes}` : ''].filter(Boolean);
}

function CustomerReceipt({ order, biz, wallets, bill }) {
  const items = Array.isArray(order.items) ? order.items : [];
  const stamp = order.closedAt || order.createdAt;
  const when = stamp ? new Date(stamp) : new Date();
  const discount = Number(order.discount || 0);
  const deliveryFee = Number(order.deliveryFee || 0);
  const total = Number(order.total || 0);
  const subtotal = items.reduce((s, l) => s + Number(l.unitPrice) * Number(l.quantity), 0);
  const tax = includedTax(total, biz.taxRate);
  const showSubtotal = discount > 0 || deliveryFee > 0 || tax > 0;
  const voided = order.status === 'voided';
  const isInvoice = Boolean(order.invoiceId);
  const received = order.amountReceived != null && order.amountReceived !== '' ? Number(order.amountReceived) : null;
  const change = order.change != null ? Number(order.change) : (received != null ? Math.max(0, received - total) : null);
  const server = servedBy(order);
  const parts = !bill && Array.isArray(order.payments) ? order.payments : [];
  // Unpaid: the bill of an open tab, or any receipt with no payment recorded
  // (legacy unpaid delivery orders).
  const unpaid = bill || (!isInvoice && !voided && parts.length === 0 && !order.paymentMethod && order.paymentStatus !== 'paid');
  // Owner's rule, paid AND unpaid: one "Pay to:" block with every business
  // wallet — the collector's own number where they have one, never their name.
  const payAccounts = voided ? [] : payToAccounts(wallets, order.payTo);
  // The line under TOTAL is for cash only (received / change).
  const cashLine = !unpaid && !isInvoice && order.paymentMethod === 'cash' && received != null;
  const invoicePaid = isInvoice && (order.invoiceStatus === 'paid' || (order.invoiceStatus !== 'void' && order.invoiceBalance != null && Number(order.invoiceBalance) <= 0));

  return (
    <div className="rcpt">
      <div className="rc-name">{biz.name}</div>
      <div className="rc-rule" />
      <div className="rc-kv">
        {server && <><span className="k">Served by:</span><span className="v">{server}</span></>}
        <span className="k">Order ID:</span><span className="v">{orderId(order)}</span>
        {!bill && order.receiptNo && <><span className="k">Receipt #:</span><span className="v">{order.receiptNo}</span></>}
        <PayToRow accounts={payAccounts} />
        {bill && order.tableNumber && <><span className="k">Table:</span><span className="v">{order.tableNumber}</span></>}
        <span className="k">Date:</span><span className="v">{printDate(when)}</span>
      </div>
      <div className="rc-rule" />
      <div className="rc-cols"><span>Qty</span><span>Item</span><span>Price</span></div>
      {items.map((line, i) => {
        const qty = Number(line.quantity);
        const mods = lineMods(line);
        return (
          <div className="rc-item" key={line.uid || i}>
            <span>{qty}</span>
            <span className="n">
              {line.name}
              {mods.length > 0 && <span className="mod">{mods.join(' · ')}</span>}
            </span>
            <span className="a">{amt(Number(line.unitPrice) * qty)}</span>
          </div>
        );
      })}
      <div className="rc-rule" />
      {showSubtotal && (
        <>
          <div className="rc-sum"><span>Subtotal</span><span>{amt(subtotal)}</span></div>
          {discount > 0 && <div className="rc-sum"><span>Discount</span><span>-{amt(discount)}</span></div>}
          {deliveryFee > 0 && <div className="rc-sum"><span>Delivery</span><span>{amt(deliveryFee)}</span></div>}
          {tax > 0 && <div className="rc-sum"><span>Tax {biz.taxRate}% (incl.)</span><span>{amt(tax)}</span></div>}
          <div className="rc-rule solid" />
        </>
      )}
      <div className="rc-total"><span>TOTAL</span><span>{usd(total)}</span></div>
      {cashLine && (
        <div className="rc-sum">
          <span>Cash {amt(received)}</span>
          {change != null && change > 0 && <span>Change {amt(change)}</span>}
        </div>
      )}
      {unpaid && !voided && <div className="rc-status">{bill ? 'NOT PAID · BILL' : 'NOT PAID'}</div>}
      {voided && <div className="rc-status">*** VOID ***</div>}
      {!voided && isInvoice && <div className="rc-status">{invoicePaid ? `INVOICE #${order.invoiceId} · PAID` : `BALANCE DUE · INVOICE #${order.invoiceId}`}</div>}
      <div className="rc-center">{biz.footer || 'Thank you!'}</div>
    </div>
  );
}

function KitchenTicket({ order }) {
  const added = Array.isArray(order.addedLines) && order.addedLines.length > 0;
  const items = added ? order.addedLines : (Array.isArray(order.items) ? order.items : []);
  const stamp = added ? order.addedLines[0].addedAt : order.createdAt;
  const when = stamp ? new Date(stamp) : new Date();
  const isDelivery = order.orderType === 'delivery' || Number(order.deliveryFee || 0) > 0;
  const server = servedBy(order);

  return (
    <div className="rcpt">
      <div className="kt-band">{added ? 'ADDED · ' : 'KITCHEN · '}{isDelivery ? 'DELIVERY' : 'DINE IN'}</div>
      <div className="kt-meta rc-kv">
        <span className="k">{orderId(order)}</span><span className="v">{printTime(when)}</span>
        {!isDelivery && order.tableNumber && <><span className="k">Table</span><span className="v"><b>{order.tableNumber}</b></span></>}
        {server && <><span className="k">Served by</span><span className="v">{server}</span></>}
      </div>
      {order.status === 'voided' && <div className="rc-status">*** VOID — DO NOT PREPARE ***</div>}
      <div className="rc-rule solid" />
      {items.map((line, i) => {
        const mods = lineMods(line);
        return (
          <div className="kt-item" key={line.uid || i}>
            {Number(line.quantity)}x {line.name}
            {mods.map((m) => <span className="mod" key={m}>{m}</span>)}
          </div>
        );
      })}
      {isDelivery && (order.contactName || order.contactPhone || order.address) && (
        <>
          <div className="rc-rule solid" />
          <div className="kt-meta">
            <b>Deliver to:</b> {[order.contactName, order.contactPhone].filter(Boolean).join(' · ')}
            {order.address && <div>{order.address}</div>}
          </div>
        </>
      )}
    </div>
  );
}

const invNo = (id) => `INV-${String(id).padStart(5, '0')}`;
const INV_STATUS = { unpaid: 'UNPAID', partial: 'PART PAID', paid: 'PAID', void: '*** VOID ***' };

/** A customer invoice on the 80mm roll — same type and rules as the receipt. */
function InvoiceReceipt({ invoice, biz, wallets }) {
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const subtotal = Number(invoice.subtotal || 0);
  const discount = Number(invoice.discount || 0);
  const total = Number(invoice.total || 0);
  const paid = Number(invoice.amountPaid || 0);
  const isVoid = invoice.status === 'void';
  const balance = isVoid ? 0 : Math.max(0, total - paid);
  const payments = Array.isArray(invoice.payments) ? invoice.payments : [];
  const METHOD = { cash: 'Cash', card: 'Card', evc: 'EVC' };
  // Pay to: every business wallet, with the invoice's collector's own number
  // where they have one (same rule as the receipt).
  const payTo = invoice.payTo ?? invoice.order?.payTo ?? null;
  const payAccounts = payToAccounts(wallets, payTo);

  return (
    <div className="rcpt">
      <div className="rc-name">{biz.name}</div>
      <div className="rc-status">INVOICE</div>
      <div className="rc-rule" />
      <div className="rc-kv">
        <span className="k">Customer:</span><span className="v">{invoice.customer?.name}</span>
        {invoice.customer?.phone && <><span className="k">Phone:</span><span className="v">{invoice.customer.phone}</span></>}
        <span className="k">Invoice #:</span><span className="v">{invNo(invoice.id)}</span>
        {invoice.order?.code && <><span className="k">Order ID:</span><span className="v">{invoice.order.code}</span></>}
        <span className="k">Date:</span><span className="v">{printDate(invoice.createdAt)}</span>
        <span className="k">Due:</span><span className="v">{invoice.dueDate ? printDate(invoice.dueDate) : 'On receipt'}</span>
      </div>
      <div className="rc-rule" />
      <div className="rc-cols"><span>Qty</span><span>Item</span><span>Price</span></div>
      {items.map((line, i) => {
        const qty = Number(line.quantity);
        const mods = lineMods(line);
        return (
          <div className="rc-item" key={i}>
            <span>{qty}</span>
            <span className="n">{line.description || line.name}{mods.length > 0 && <span className="mod">{mods.join(' · ')}</span>}</span>
            <span className="a">{amt(Number(line.unitPrice) * qty)}</span>
          </div>
        );
      })}
      <div className="rc-rule" />
      {discount > 0 && (
        <>
          <div className="rc-sum"><span>Subtotal</span><span>{amt(subtotal)}</span></div>
          <div className="rc-sum"><span>Discount</span><span>-{amt(discount)}</span></div>
          <div className="rc-rule solid" />
        </>
      )}
      <div className="rc-total"><span>TOTAL</span><span>{usd(total)}</span></div>
      {paid > 0 && <div className="rc-sum"><span>Paid</span><span>-{amt(paid)}</span></div>}
      <div className="rc-total"><span>BALANCE DUE</span><span>{usd(balance)}</span></div>
      <div className="rc-status">{INV_STATUS[invoice.status] || invoice.status}</div>
      {payments.length > 0 && (
        <>
          <div className="rc-rule" />
          {payments.map((p) => (
            <div className="rc-sum" key={p.id}>
              <span>{printDate(p.paidAt)} {p.account || METHOD[p.method] || p.method}</span><span>{amt(p.amount)}</span>
            </div>
          ))}
        </>
      )}
      {balance > 0 && payAccounts.length > 0 && (
        <>
          <div className="rc-rule" />
          <div className="rc-kv">
            <PayToRow accounts={payAccounts} />
          </div>
        </>
      )}
      <div className="rc-center">{biz.footer || 'Thank you!'}</div>
    </div>
  );
}
