'use client';

import { useState, useMemo, useRef } from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import { useFormValidation } from '@/lib/formValidation';
import { registerSchema } from '@/lib/schemas/sales';
import Field from '@/components/admin/Field';
import ReceiptDoc, { receiptFromOrder } from '@/components/admin/ReceiptDoc';
import { usePrintDoc } from '@/components/admin/printShared';
import CustomerPicker from '@/components/admin/CustomerPicker';
import ItemCustomizer, { buildLine, needsChoices } from '@/components/admin/ItemCustomizer';
import TablePicker from '@/components/admin/TablePicker';
import useTables, { tableKey } from '@/hooks/useTables';
import PaymentFields, { usePayment, paymentBody, paymentProblem, collectorChoices } from '@/components/admin/PaymentFields';
import { money } from '@/lib/money';


function PCardImg({ src }) {
  const [ok, setOk] = useState(Boolean(src));
  if (ok) return <img src={src} alt="" loading="lazy" onError={() => setOk(false)} />;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z" /><path d="M6 1v3M10 1v3M14 1v3" /></svg>;
}

// Ticket width (the menu | ticket divider) — dragged by the user, kept per computer.
const TICKET_KEY = 'mx_pos_ticket_w';
const TICKET_DEFAULT = 400;
const TICKET_MIN = 320;
const ticketMax = () => Math.max(TICKET_MIN, Math.min(720, Math.round(window.innerWidth * 0.6)));

export default function PosPage() {
  const qc = useQueryClient();
  // Same ['me'] cache as TakePaymentModal (one key, one shape).
  const { data: me = null } = useQuery({ queryKey: ['me'], queryFn: () => fetchJson('/api/auth/me'), staleTime: 5 * 60 * 1000 });
  const [activeCat, setActiveCat] = useState('all');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);

  const [service, setService] = useState('dine_in');
  const [tableNumber, setTableNumber] = useState('');
  const [waiterId, setWaiterId] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [address, setAddress] = useState('');
  const [deliveryFee, setDeliveryFee] = useState('');
  const [discount, setDiscount] = useState({ type: 'percent', value: '' });
  const deliveryOn = service === 'delivery';
  const { tables, hasTables } = useTables();

  // The server is the source of truth on who gets attributed as the waiter
  // and who collected the money — a logged-in waiter is always themselves,
  // regardless of anything sent here.
  // Dine-in defaults to Pay later: the kitchen gets it now, the guests pay at
  // the end and the order waits in Orders as Unpaid.
  const [payLaterMode, setPayLaterMode] = useState(true);
  const [invoiceCustomer, setInvoiceCustomer] = useState({ customerId: null, customer: null });
  const [invoiceDueDate, setInvoiceDueDate] = useState('');
  const isWaiterSelf = me?.role === 'waiter';

  const [customizing, setCustomizing] = useState(null);

  // Resizable ticket (desktop only — below 1081px the ticket stacks under the menu).
  const posRef = useRef(null);
  const [ticketW, setTicketW] = useState(() => {
    try { return Number(localStorage.getItem(TICKET_KEY)) || TICKET_DEFAULT; } catch { return TICKET_DEFAULT; }
  });
  const saveTicketW = (w) => { try { localStorage.setItem(TICKET_KEY, String(w)); } catch { /* private mode */ } };
  const clampW = (w) => Math.round(Math.min(Math.max(w, TICKET_MIN), ticketMax()));
  const startResize = (e) => {
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const right = posRef.current.getBoundingClientRect().right;
    let last = ticketW;
    const move = (ev) => { last = clampW(right - ev.clientX); setTicketW(last); };
    const up = () => { handle.removeEventListener('pointermove', move); saveTicketW(last); };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up, { once: true });
  };
  const keyResize = (e) => {
    const step = e.key === 'ArrowLeft' ? 16 : e.key === 'ArrowRight' ? -16 : 0;
    if (!step) return;
    e.preventDefault();
    const w = clampW(ticketW + step);
    setTicketW(w); saveTicketW(w);
  };

  // placed = { kind: 'paid' | 'later', order } after a submit.
  const [placed, setPlaced] = useState(null);
  const [placing, setPlacing] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [printKind, printDoc] = usePrintDoc();

  const canOpenOrders = Boolean(me) && me.role !== 'waiter';

  const { data: categories = [] } = useQuery({ queryKey: ['pos-categories'], queryFn: () => fetchJson('/api/categories') });
  const { data: items = [], isLoading } = useQuery({ queryKey: ['pos-items'], queryFn: () => fetchJson('/api/menu-items') });
  const { data: waiters = [] } = useQuery({ queryKey: ['pos-waiters'], queryFn: () => fetchJson('/api/admin/waiters?active=1') });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => fetchJson('/api/admin/settings'), staleTime: 5 * 60 * 1000 });
  // How the customer pays: Cash, a business wallet (A/C, E/d, My Cash…), the
  // Mastercard, split, or On account — and who took the money.
  const pay = usePayment(settings?.moneyAccounts);
  const paymentMethod = pay.opt.method;

  const defaultFee = settings?.deliveryFee != null ? String(settings.deliveryFee) : '0';
  // A waiter is always attributed to their own sale server-side — the picker
  // is for a cashier/manager ringing up on a waiter's behalf, so it's hidden
  // for a waiter's own session rather than shown-but-ignored.
  const effWaiterId = isWaiterSelf ? String(me.userId) : waiterId;
  const effFee = deliveryFee === '' ? defaultFee : deliveryFee;

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (activeCat !== 'all' && it.categoryId !== activeCat) return false;
      if (q && !it.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, activeCat, search]);

  const subtotal = useMemo(() => cart.reduce((s, l) => s + Number(l.unitPrice) * l.quantity, 0), [cart]);
  const discountAmount = useMemo(() => {
    const v = Number(discount.value);
    if (!v || v <= 0) return 0;
    const d = discount.type === 'percent' ? (subtotal * v) / 100 : v;
    return Math.min(Math.max(d, 0), subtotal);
  }, [discount, subtotal]);
  const delivery = deliveryOn ? Math.max(Number(effFee) || 0, 0) : 0;
  const total = Math.max(0, subtotal - discountAmount + delivery);
  const orderType = service;
  // Pay later (dine-in only): to the kitchen now, paid in Orders at the end.
  const flow = orderType === 'dine_in' && payLaterMode ? 'later' : 'pay';
  const needsWaiter = orderType === 'dine_in' && !isWaiterSelf;
  const isInvoice = paymentMethod === 'invoice';
  const tableChosen = !hasTables || tables.some((t) => tableKey(t.name) === tableKey(tableNumber));

  // Required-field rules (lib/schemas/sales.js): the ticket's fields show what is
  // still needed directly under themselves, and the button waits until it is all there.
  const form = useFormValidation(registerSchema, {
    cartCount: cart.length,
    orderType,
    tableRequired: hasTables,
    tableChosen,
    needsWaiter,
    waiterId,
    contactPhone,
    address,
    deliveryFee: effFee,
    flow,
    isInvoice,
    invoiceCustomerId: invoiceCustomer.customerId ?? null,
    payProblem: flow === 'pay' ? paymentProblem(pay, total) : null,
    discountType: discount.type,
    discountValue: discount.value,
  });
  const firstIssue = Object.values(form.errors)[0];
  const { collectors, defaultCollector } = collectorChoices(
    me,
    waiters,
    orderType === 'dine_in' && waiterId ? waiters.find((w) => String(w.id) === String(waiterId)) : null,
  );

  const openItem = (item) => {
    if (placed) return;
    if (!needsChoices(item)) { setCart((prev) => [...prev, buildLine(item)]); return; }
    setCustomizing(item);
  };

  // Minus on the last one removes the line.
  const changeQty = (lineUid, delta) => setCart((prev) => prev
    .map((l) => (l.uid === lineUid ? { ...l, quantity: Math.min(99, l.quantity + delta) } : l))
    .filter((l) => l.quantity > 0));

  const resetOrder = () => {
    setCart([]); setService('dine_in'); setTableNumber(''); setWaiterId(''); setContactName(''); setContactPhone('');
    setAddress(''); setDeliveryFee(''); setDiscount({ type: 'percent', value: '' }); setPayLaterMode(true);
    pay.reset(); setInvoiceCustomer({ customerId: null, customer: null }); setInvoiceDueDate('');
    setPlaced(null); setReceipt(null); form.reset();
  };
  // Print right away: flush the receipt into the DOM first, then print it.
  const printNow = (order, kind) => {
    flushSync(() => setReceipt(receiptFromOrder(order)));
    printDoc(kind);
  };

  const lineBody = () => cart.map(({ uid: _u, ...l }) => ({ uid: _u, ...l }));

  const placeOrder = async () => {
    if (placing || !form.check()) return;
    form.setServerErrors(null);
    setPlacing(true);
    try {
      const order = await fetchJson('/api/admin/pos/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: lineBody(),
          orderType,
          tableNumber: orderType === 'dine_in' ? tableNumber.trim() : null,
          waiterId: effWaiterId ? Number(effWaiterId) : null,
          payNow: flow === 'pay',
          discountType: flow === 'pay' && Number(discount.value) > 0 ? discount.type : null,
          discountValue: flow === 'pay' && Number(discount.value) > 0 ? Number(discount.value) : null,
          deliveryFee: deliveryOn ? Math.max(Number(effFee) || 0, 0) : null,
          contactName: deliveryOn ? contactName.trim() || null : null,
          contactPhone: deliveryOn ? contactPhone.trim() || null : null,
          address: deliveryOn ? address.trim() || null : null,
          ...(flow === 'pay' ? {
            ...paymentBody(pay),
            invoiceCustomerId: isInvoice ? invoiceCustomer.customerId : null,
            invoiceDueDate: isInvoice && invoiceDueDate ? new Date(invoiceDueDate).toISOString() : null,
          } : {}),
        }),
      });
      // Print first — the receipt is built from this response (server receipt #,
      // order code), so it prints the moment the sale is saved; the rest follows.
      printNow(order, flow === 'later' ? 'kitchen' : 'customer');
      qc.invalidateQueries({ queryKey: ['orders-all'] });
      if (flow === 'later') {
        setPlaced({ kind: 'later', order });
        notify.success(`Sent to the kitchen · ${order.code} · unpaid`);
      } else {
        setPlaced({ kind: 'paid', order });
        notify.success(order.invoiceId ? `Invoice #${order.invoiceId} created` : `Paid · receipt ${order.receiptNo}`);
      }
    } catch (err) {
      if (err?.details && typeof err.details === 'object' && !Array.isArray(err.details)) form.setServerErrors(err.details);
      notify.error(err, { title: 'Could not place the order' });
    } finally { setPlacing(false); }
  };

  const activeCats = categories.filter((c) => c.isActive);

  return (
    <div className="pos" ref={posRef} style={{ '--ticket-w': `${ticketW}px` }}>
      {/* LEFT — menu */}
      <section className="pos-menu">
        <div className="pos-menu-top">
          <div className="search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search the menu…" aria-label="Search the menu" />
          </div>
          <div className="pos-cats">
            <button className={`pos-cat${activeCat === 'all' ? ' on' : ''}`} onClick={() => setActiveCat('all')}>All</button>
            {activeCats.map((c) => <button key={c.id} className={`pos-cat${activeCat === c.id ? ' on' : ''}`} onClick={() => setActiveCat(c.id)}>{c.name}</button>)}
          </div>
        </div>
        <div className="pos-grid">
          {isLoading
            ? [1, 2, 3, 4, 5, 6].map((n) => <div key={n} className="sk" style={{ height: 180, borderRadius: 'var(--r-md)' }} />)
            : visibleItems.length === 0
              ? <div className="empty"><div className="empty-ring"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg></div><p className="empty-title">No items found</p><p className="empty-sub">Try another search or category.</p></div>
              : visibleItems.map((item) => {
                const hasChoices = item.optionGroups?.length > 0 || item.extras?.length > 0;
                return (
                  <button key={item.id} className={`pcard${item.isActive === false ? ' off' : ''}`} onClick={() => openItem(item)} title={`Add ${item.name}`}>
                    <div className="pcard-img"><PCardImg src={item.imageUrl} />{hasChoices && <span className="pcard-tag">Options</span>}</div>
                    <div className="pcard-b">
                      <div className="pcard-nm">{item.name}</div>
                      <div className="pcard-row"><span className="pcard-pr">{money(item.price)}</span><span className="pcard-add"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 5v14M5 12h14" /></svg></span></div>
                    </div>
                  </button>
                );
              })}
        </div>
      </section>

      {/* RIGHT — ticket */}
      <aside className="pos-ticket">
        <div
          className="pos-resize" role="separator" aria-orientation="vertical" aria-label="Resize the ticket — drag, or use the arrow keys"
          aria-valuemin={TICKET_MIN} aria-valuenow={ticketW} tabIndex={0}
          onPointerDown={startResize} onKeyDown={keyResize}
          onDoubleClick={() => { setTicketW(TICKET_DEFAULT); saveTicketW(TICKET_DEFAULT); }}
        />
        {!placed && (
          <div className="ticket-top">
            <div className="ticket-svc">
              <button className={service === 'dine_in' ? 'on' : ''} onClick={() => setService('dine_in')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 2v7c0 1.1.9 2 2 2a2 2 0 0 0 2-2V2M5 2v20M11 2v20M11 8a4 4 0 0 0 4 4V2" /></svg>Dine-in
              </button>
              <button className={service === 'delivery' ? 'on' : ''} onClick={() => { setService('delivery'); setTableNumber(''); }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 18V6a2 2 0 0 0-2-2H3v12M14 9h4l3 3v6M3 18h11" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></svg>Delivery
              </button>
            </div>
            <div className="ticket-meta">
              {!deliveryOn ? (
                <>
                  <Field {...form.fieldProps('table')}>
                    <TablePicker value={tableNumber} onChange={(v) => { setTableNumber(v); form.touch('table'); }} invalid={Boolean(form.fieldProps('table').error)} required={hasTables} />
                  </Field>
                  {/* A waiter's own sale is always attributed to them — no picker needed. */}
                  {!isWaiterSelf && (
                    waiters.length > 0 ? (
                      <Field {...form.fieldProps('waiter')}>
                        <select className="input" value={waiterId} onChange={(e) => { setWaiterId(e.target.value); form.touch('waiter'); }}>
                          <option value="">Waiter — required</option>
                          {waiters.map((w) => <option key={w.id} value={w.id}>{w.label || w.name}</option>)}
                        </select>
                      </Field>
                    ) : <div className="field-err">No active waiters — add one in Staff before taking dine-in orders.</div>
                  )}
                </>
              ) : (
                <>
                  <input className="input" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Customer name (optional)" aria-label="Customer name" />
                  <Field {...form.fieldProps('contactPhone')}>
                    <input className="input" type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="Phone — required" aria-label="Customer phone" />
                  </Field>
                  <Field {...form.fieldProps('address')}>
                    <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Delivery address — required" aria-label="Delivery address" />
                  </Field>
                  <Field {...form.fieldProps('deliveryFee')}>
                    {(a) => <div className="fee-field"><span className="fee-lbl">Delivery fee</span><input {...a} className={`input${a['aria-invalid'] ? ' input-err' : ''}`} type="number" min="0" step="0.5" inputMode="decimal" value={effFee} onChange={(e) => setDeliveryFee(e.target.value)} aria-label="Delivery fee" /><span className="fee-hint">default from Settings</span></div>}
                  </Field>
                </>
              )}
            </div>
          </div>
        )}

        {cart.length === 0 && !placed ? (
          <div className="ticket-lines">
            <div className="ticket-empty">
              <div className="er"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="26" height="26"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" /></svg></div>
              <div className="et">Ticket is empty</div>
              <div className="sub">Tap a menu item to start the order.</div>
            </div>
          </div>
        ) : placed ? (
          <PlacedPanel
            placed={placed}
            canOpenOrders={canOpenOrders}
            onPrint={(kind) => printNow(placed.order, kind)}
            onNew={resetOrder}
          />
        ) : (
          <div className="ticket-lines">
            {cart.map((l) => (
              <div className="tline" key={l.uid}>
                <span className="tline-q">{l.quantity}×</span>
                <div className="tline-main">
                  <div className="tline-nm">{l.name}</div>
                  {(l.optionName || l.extras.length > 0 || l.notes) && (
                    <div className="tline-opt">{[l.optionName, l.extras.map((e) => e.name).join(', '), l.notes && `“${l.notes}”`].filter(Boolean).join(' · ')}</div>
                  )}
                </div>
                <div className="tline-r">
                  <span className="tline-pr">{money(l.unitPrice * l.quantity)}</span>
                  <span className="tline-steps">
                    <button onClick={() => changeQty(l.uid, -1)} aria-label={`Decrease ${l.name}`}>−</button>
                    <span>{l.quantity}</span>
                    <button onClick={() => changeQty(l.uid, 1)} aria-label={`Increase ${l.name}`}>+</button>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {cart.length > 0 && !placed && (
          <div className="ticket-foot">
            {orderType === 'dine_in' && (
              <div className="seg seg-full" style={{ marginBottom: 10 }} role="group" aria-label="When do the guests pay?">
                <button type="button" className={flow === 'pay' ? 'active' : ''} onClick={() => setPayLaterMode(false)} aria-pressed={flow === 'pay'}>Pay now</button>
                <button type="button" className={flow === 'later' ? 'active' : ''} onClick={() => setPayLaterMode(true)} aria-pressed={flow === 'later'}>Pay later</button>
              </div>
            )}
            {flow === 'later' ? (
              <>
                <div className="tf-row total"><span>Total</span><span className="v">{money(subtotal)}</span></div>
                <div className="note" style={{ marginTop: 8 }}>The kitchen gets it now. It waits in Orders as <b>Unpaid</b> until the guests pay.</div>
                <button className="btn btn-primary btn-block btn-lg" style={{ marginTop: 12 }} disabled={placing || !form.valid} onClick={placeOrder}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14M13 6l6 6-6 6" /></svg>{placing ? 'Sending…' : 'Send to kitchen'}
                </button>
                {!form.valid && !placing && firstIssue && <div className="fld-note g3-why" role="status">{firstIssue}</div>}
              </>
            ) : (<>
            <Field {...form.fieldProps('discountValue')}>
              {(a) => (
              <div className="disc-row">
                <input {...a} className={`input${a['aria-invalid'] ? ' input-err' : ''}`} type="number" min="0" inputMode="decimal" value={discount.value} onChange={(e) => setDiscount((d) => ({ ...d, value: e.target.value }))} placeholder="Discount (optional)" aria-label="Discount" />
                <div className="seg" style={{ flexShrink: 0 }}>
                  <button type="button" className={discount.type === 'percent' ? 'active' : ''} onClick={() => setDiscount((d) => ({ ...d, type: 'percent' }))}>%</button>
                  <button type="button" className={discount.type === 'fixed' ? 'active' : ''} onClick={() => setDiscount((d) => ({ ...d, type: 'fixed' }))}>$</button>
                </div>
              </div>
              )}
            </Field>
            {(discountAmount > 0 || delivery > 0) && <div className="tf-row"><span>Subtotal</span><span className="v">{money(subtotal)}</span></div>}
            {discountAmount > 0 && <div className="tf-row"><span>Discount</span><span className="v" style={{ color: 'var(--rose)' }}>−{money(discountAmount)}</span></div>}
            {delivery > 0 && <div className="tf-row"><span>Delivery fee</span><span className="v">{money(delivery)}</span></div>}
            <div className="tf-row total"><span>Total</span><span className="v">{money(total)}</span></div>

            <PaymentFields
              pay={pay}
              total={total}
              accounts={settings?.moneyAccounts}
              collectors={collectors}
              defaultCollector={defaultCollector}
              disabled={placing}
            />

            {isInvoice && (
              <div className="ticket-sec">
                <div className="note">Bill this customer instead of collecting payment now.</div>
                <Field {...form.fieldProps('invoiceCustomer')}>
                  <CustomerPicker
                    customerId={invoiceCustomer.customerId}
                    customer={invoiceCustomer.customer}
                    onChange={setInvoiceCustomer}
                    disabled={placing}
                  />
                </Field>
                <div>
                  <div className="field-l" style={{ marginTop: 0 }}>Due date (optional)</div>
                  <input className="input" type="date" value={invoiceDueDate} onChange={(e) => setInvoiceDueDate(e.target.value)} aria-label="Invoice due date" />
                </div>
              </div>
            )}

            <button className="btn btn-primary btn-block btn-lg" style={{ marginTop: 12 }} disabled={placing || !form.valid} onClick={placeOrder}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14M13 6l6 6-6 6" /></svg>{placing ? 'Placing…' : isInvoice ? 'Bill to account & print' : 'Paid · print receipt'}
            </button>
            {!form.valid && !placing && firstIssue && <div className="fld-note g3-why" role="status">{firstIssue}</div>}
            </>)}
          </div>
        )}
      </aside>

      {customizing && (
        <ItemCustomizer
          item={customizing}
          eyebrow={activeCats.find((c) => c.id === customizing.categoryId)?.name || 'Item'}
          onClose={() => setCustomizing(null)}
          onAdd={(line) => { setCart((prev) => [...prev, line]); setCustomizing(null); }}
        />
      )}

      <ReceiptDoc order={receipt} kind={printKind} />
    </div>
  );
}

function PlacedPanel({ placed, canOpenOrders, onPrint, onNew }) {
  const { kind, order } = placed;
  const later = kind === 'later';
  const title = later
    ? `Sent to kitchen · ${order.tableNumber ? `Table ${order.tableNumber}` : order.code}`
    : (order.invoiceId ? `Invoice #${order.invoiceId} created` : `Paid · receipt ${order.receiptNo}`);
  const sub = later
    ? `${order.code} is Unpaid — take payment in Orders when the guests ask for the bill.`
    : (order.invoiceId ? 'Balance due from the customer — receipt sent to the printer.' : `${order.code} · receipt sent to the printer.`);
  return (
    <div className="pos-placed">
      <div className="pos-placed-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ width: 26, height: 26 }}><path d="M20 6 9 17l-5-5" /></svg></div>
      <div className="h-2">{title}</div>
      <div className="sub">{sub}</div>
      <div className="acts">
        {later ? (
          <>
            <button className="btn btn-ghost" onClick={() => onPrint('kitchen')}>Kitchen ticket</button>
            <button className="btn btn-ghost" onClick={() => onPrint('bill')}>Print bill</button>
            {canOpenOrders && <Link className="btn btn-soft" href={`/admin/dashboard/orders/${order.id}`}>Open order</Link>}
          </>
        ) : (
          <>
            <button className="btn btn-ghost" onClick={() => onPrint('customer')}>Customer receipt</button>
            <button className="btn btn-ghost" onClick={() => onPrint('kitchen')}>Kitchen ticket</button>
          </>
        )}
        <button className="btn btn-primary" onClick={onNew}>New order</button>
      </div>
    </div>
  );
}
