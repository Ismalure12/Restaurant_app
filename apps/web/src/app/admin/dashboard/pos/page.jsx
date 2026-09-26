'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { srcSetFor } from '@/lib/menu/imageSrc';
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
import useAccess from '@/hooks/useAccess';
import PaymentFields, { usePayment, paymentBody, paymentProblem } from '@/components/admin/PaymentFields';
import { DiscountRow, TotalsBlock } from '@/components/admin/RegisterTotals';
import {
  Alert, Button, ChoiceChip, EmptyState, Icon, SearchInput, Skeleton, Toggle,
  cx, inputCls, selectCls, useBreakpoint, usePanelWidth,
} from '@/components/admin/ui';
import { money } from '@/lib/money';


// Ticket width (the menu | ticket divider) — dragged by the user, kept per viewer (`mq-panels`).
// Module-level so usePanelWidth's clamp stays stable between renders.
const TICKET_MIN = 320;
const ticketMax = () => Math.max(TICKET_MIN, Math.min(720, Math.round(window.innerWidth * 0.6)));
// Ticket: by default the payment area shows in full and the lines take the
// rest; the handle between them lets staff give the lines more room (the
// payment then scrolls). The primary button sits below, always in view.
const PAY_AREA_MIN = 110;
const LINES_MIN = 104; // ≈ two ticket lines

const LABEL = 'text-[11px] font-semibold uppercase tracking-[.09em] text-mq-muted';

/** Menu card picture: the real image, else the striped placeholder with the category name. */
function CardImage({ src, cat }) {
  const [ok, setOk] = useState(Boolean(src));
  // Plain <img>: menu images come from any host and fall back to the placeholder on error.
  // eslint-disable-next-line @next/next/no-img-element
  if (ok) return <img src={src} srcSet={srcSetFor(src)} sizes="280px" alt="" loading="lazy" decoding="async" onError={() => setOk(false)} className="w-full h-full object-cover" />;
  return (
    <span className="w-full h-full grid place-items-center px-2 text-center bg-mq-chip [background-image:repeating-linear-gradient(135deg,transparent_0_11px,rgba(26,26,24,.045)_11px_12px)] text-mq-chip-ink font-mq-mono text-[10.5px] tracking-[.04em] truncate">
      {cat || 'Menu'}
    </span>
  );
}

function ItemCard({ item, cat, onAdd }) {
  const hasChoices = needsChoices(item);
  const off = item.isActive === false;
  return (
    <button
      type="button"
      onClick={onAdd}
      title={off ? `${item.name} (hidden from the menu)` : `Add ${item.name}`}
      className={cx(
        'flex flex-col text-left p-0 bg-white border border-mq-line rounded-xl overflow-hidden text-mq-ink transition-[border-color,box-shadow]',
        'hover:border-mq-focus hover:shadow-mq-md focus-visible:outline-none focus-visible:border-mq-focus focus-visible:shadow-mq-focus',
        off && 'opacity-60',
      )}
    >
      <span className="relative block h-24 flex-none overflow-hidden">
        <CardImage src={item.imageUrl} cat={cat} />
        {hasChoices && <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-white/95 border border-mq-line text-[11px] font-semibold text-mq-body">Options</span>}
        {off && <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-mq-chip text-[11px] font-semibold text-mq-chip-ink">Hidden</span>}
      </span>
      <span className="flex flex-col gap-1 flex-1 px-3 pt-2.5 pb-3">
        <span className="text-[13.5px] font-semibold leading-[1.3] min-h-[2.6em] line-clamp-2">{item.name}</span>
        <span className="flex items-center justify-between mt-auto pt-1.5">
          <span className="font-mq-mono tabular-nums font-semibold text-[15px]">{money(item.price)}</span>
          <span className="grid place-items-center w-[30px] h-[30px] rounded-[9px] bg-mq-soft text-mq-primary"><Icon name="plus" size={16} stroke={2.6} /></span>
        </span>
      </span>
    </button>
  );
}

// Service icons from the design (not in the shared icon set).
const DINE_IN = <path d="M3 2v7c0 1.1.9 2 2 2a2 2 0 0 0 2-2V2M5 2v20M11 2v20M11 8a4 4 0 0 0 4 4V2" />;
const DELIVERY = <><path d="M14 18V6a2 2 0 0 0-2-2H3v12M14 9h4l3 3v6M3 18h11" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>;

function ServiceSwitch({ value, onChange }) {
  const opts = [['dine_in', 'Dine-in', DINE_IN], ['delivery', 'Delivery', DELIVERY]];
  return (
    <div role="group" aria-label="Service" className="flex gap-1 p-[2px] bg-mq-chip border border-mq-line rounded-[9px]">
      {opts.map(([v, label, glyph]) => {
        const on = value === v;
        return (
          <button
            key={v} type="button" aria-pressed={on} onClick={() => onChange(v)}
            className={cx(
              'flex-1 inline-flex items-center justify-center gap-1.5 min-h-8 rounded-[7px] text-[13px] font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:shadow-mq-focus',
              on ? 'bg-white text-mq-ink shadow-mq-seg' : 'text-mq-on-tint hover:text-mq-ink',
            )}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{glyph}</svg>
            {label}
          </button>
        );
      })}
    </div>
  );
}

function TicketLine({ line, onQty }) {
  const detail = [line.optionName, line.extras.map((e) => e.name).join(', '), line.notes && `“${line.notes}”`].filter(Boolean).join(' · ');
  const last = line.quantity <= 1;
  const stepBtn = 'grid place-items-center w-9 h-8 text-mq-body hover:bg-mq-chip hover:text-mq-ink focus-visible:outline-none focus-visible:bg-mq-chip';
  // One compact row (name · stepper · price) so several lines fit above the payment.
  return (
    <div className="flex items-center gap-2.5 py-2 border-b border-mq-chip last:border-b-0">
      <span className="flex-1 min-w-0 flex flex-col">
        <span className="text-[13.5px] font-semibold leading-snug break-words">{line.name}</span>
        {detail && <span className="text-[11.5px] text-mq-on-tint leading-[1.35] break-words">{detail}</span>}
      </span>
      <span className="inline-flex items-center flex-none border border-mq-line rounded-lg overflow-hidden bg-white">
        {/* Minus on the last one removes the line (trash glyph says so). */}
        <button type="button" className={cx(stepBtn, last && 'hover:!bg-mq-danger-bg hover:!text-mq-danger-ink')} onClick={() => onQty(-1)} aria-label={last ? `Remove ${line.name}` : `Decrease ${line.name}`}>
          <Icon name={last ? 'trash' : 'minus'} size={last ? 14 : 16} stroke={last ? 2 : 2.4} />
        </button>
        <span className="min-w-[24px] text-center font-mq-mono tabular-nums text-sm font-semibold">{line.quantity}</span>
        <button type="button" className={stepBtn} onClick={() => onQty(1)} aria-label={`Increase ${line.name}`} disabled={line.quantity >= 99}>
          <Icon name="plus" size={16} stroke={2.4} />
        </button>
      </span>
      <span className="w-[62px] flex-none text-right font-mq-mono tabular-nums font-semibold text-[13.5px]">{money(line.unitPrice * line.quantity)}</span>
    </div>
  );
}

// Same dish with the same option, extras and note → one line, higher quantity.
const lineKey = (l) => JSON.stringify([l.itemId, l.optionName || '', (l.extras || []).map((e) => e.name).sort(), (l.notes || '').trim()]);
function addToCart(prev, line) {
  const key = lineKey(line);
  const i = prev.findIndex((l) => lineKey(l) === key);
  if (i < 0) return [...prev, line];
  return prev.map((l, j) => (j === i ? { ...l, quantity: Math.min(99, l.quantity + line.quantity) } : l));
}

/** Read ?table= / ?customer= once (the Tables and Customers pages link here). */
function readPrefill() {
  try {
    const p = new URLSearchParams(window.location.search);
    const table = (p.get('table') || '').trim().slice(0, 40);
    const c = Number(p.get('customer'));
    return { table, customerId: Number.isInteger(c) && c > 0 ? c : null };
  } catch { return { table: '', customerId: null }; }
}

export default function PosPage() {
  const qc = useQueryClient();
  const bp = useBreakpoint();
  const phone = bp === 'phone';
  const resizable = bp === 'desktop' || bp === 'narrow';
  const { canView } = useAccess();
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
  const [discount, setDiscount] = useState({ type: 'fixed', value: '' });
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
  const ticket = usePanelWidth('reg', { initial: 400, min: TICKET_MIN, max: ticketMax, edge: 'left' });
  // Keep ≥ ~2 ticket lines visible however tall the payment area is dragged.
  const topRef = useRef(null);
  const payRef = useRef(null);
  const footRef = useRef(null);
  const payAreaMax = useCallback(() => Math.max(PAY_AREA_MIN, (ticketRef.current?.clientHeight || 800)
    - (topRef.current?.offsetHeight || 0) - (footRef.current?.offsetHeight || 0) - LINES_MIN), []);
  const payArea = usePanelWidth('reg-pay-h', {
    initial: null, min: PAY_AREA_MIN, max: payAreaMax, edge: 'top', measure: () => payRef.current?.offsetHeight,
  });

  // placed = { kind: 'paid' | 'invoice' | 'later', order, dueDate } after a submit.
  const [placed, setPlaced] = useState(null);
  const [placing, setPlacing] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [printKind, printDoc] = usePrintDoc();

  const { data: categories = [] } = useQuery({ queryKey: ['pos-categories'], queryFn: () => fetchJson('/api/categories') });
  const { data: items = [], isLoading } = useQuery({ queryKey: ['pos-items'], queryFn: () => fetchJson('/api/menu-items') });
  const { data: waiters = [] } = useQuery({ queryKey: ['pos-waiters'], queryFn: () => fetchJson('/api/admin/waiters?active=1') });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => fetchJson('/api/admin/settings'), staleTime: 5 * 60 * 1000 });
  // How the customer pays: Cash, a business wallet, the card, split, or On
  // account — and who took the money.
  const pay = usePayment(settings?.moneyAccounts);
  const paymentMethod = pay.opt.method;
  const setPayKey = pay.setKey;

  // ?table=<name> (Tables page) prefills a dine-in table; ?customer=<id>
  // (Customers › Open in Register) bills that customer On account.
  const [prefillCustomerId, setPrefillCustomerId] = useState(null);
  useEffect(() => {
    const { table, customerId } = readPrefill();
    /* eslint-disable react-hooks/set-state-in-effect -- one-time read of the URL after mount */
    if (table) { setService('dine_in'); setTableNumber(table); }
    if (customerId) { setPrefillCustomerId(customerId); setPayLaterMode(false); setPayKey('invoice'); }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [setPayKey]);
  // Same key + shape as the customer detail page (GET /api/admin/customers/:id).
  const { data: prefillCustomer } = useQuery({
    queryKey: ['customer', String(prefillCustomerId)],
    queryFn: () => fetchJson(`/api/admin/customers/${prefillCustomerId}`),
    enabled: Boolean(prefillCustomerId),
    retry: false,
  });
  const prefillApplied = useRef(false);
  useEffect(() => {
    const c = prefillCustomer?.customer;
    if (!c || prefillApplied.current) return;
    prefillApplied.current = true;
    setInvoiceCustomer({ customerId: c.id, customer: { ...c, owedBalance: prefillCustomer.owedBalance } });
  }, [prefillCustomer]);

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
  const itemCount = useMemo(() => cart.reduce((s, l) => s + l.quantity, 0), [cart]);
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
  const shownTotal = flow === 'later' ? subtotal : total;
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

  // Minus on the last one removes the line.
  const changeQty = (lineUid, delta) => setCart((prev) => prev
    .map((l) => (l.uid === lineUid ? { ...l, quantity: Math.min(99, l.quantity + delta) } : l))
    .filter((l) => l.quantity > 0));

  const resetOrder = () => {
    setCart([]); setService('dine_in'); setTableNumber(''); setWaiterId(''); setContactName(''); setContactPhone('');
    setAddress(''); setDeliveryFee(''); setDiscount({ type: 'fixed', value: '' }); setPayLaterMode(true);
    pay.reset(); setInvoiceCustomer({ customerId: null, customer: null }); setInvoiceDueDate('');
    setPlaced(null); setReceipt(null); form.reset();
  };
  // After a sale, tapping a dish starts the next order (same as New order).
  const openItem = (item) => {
    if (placed) resetOrder();
    if (!needsChoices(item)) { setCart((prev) => addToCart(prev, buildLine(item))); return; }
    setCustomizing(item);
  };

  // Print right away: flush the receipt into the DOM first, then print it.
  const printNow = (order, kind) => {
    flushSync(() => setReceipt(receiptFromOrder(order)));
    printDoc(kind);
  };

  const placeOrder = async () => {
    if (placing || !form.check()) return;
    form.setServerErrors(null);
    setPlacing(true);
    try {
      const order = await fetchJson('/api/admin/pos/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart,
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
      // Print first — built from this response (server receipt #, order code),
      // so it prints the moment the sale is saved. Both papers are prepared
      // now and print as two jobs: the one that matters now first (kitchen
      // ticket / the customer's receipt); when its dialog closes, the second
      // (bill / kitchen ticket) opens by itself — print it or cancel it.
      printNow(order, flow === 'later' ? ['kitchen', 'bill'] : ['customer', 'kitchen']);
      qc.invalidateQueries({ queryKey: ['orders-all'] });
      if (flow === 'later') {
        setPlaced({ kind: 'later', order });
        notify.success(`Sent to the kitchen · ${order.code} · unpaid`);
      } else {
        setPlaced({ kind: order.invoiceId ? 'invoice' : 'paid', order, dueDate: isInvoice ? invoiceDueDate : '' });
        notify.success(order.invoiceId ? `Invoice #${order.invoiceId} created` : `Paid · receipt ${order.receiptNo}`);
      }
    } catch (err) {
      if (err?.details && typeof err.details === 'object' && !Array.isArray(err.details)) form.setServerErrors(err.details);
      notify.error(err, { title: 'Could not place the order' });
    } finally { setPlacing(false); }
  };

  const activeCats = categories.filter((c) => c.isActive);
  const catName = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c.name])), [categories]);

  // Phone: the ticket sits under the menu, so a bar at the bottom jumps to it
  // while it is off screen.
  const ticketRef = useRef(null);
  const [ticketInView, setTicketInView] = useState(false);
  useEffect(() => {
    if (!phone || !ticketRef.current || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([e]) => setTicketInView(e.isIntersecting), { threshold: 0.05 });
    io.observe(ticketRef.current);
    return () => io.disconnect();
  }, [phone]);
  const showJump = phone && cart.length > 0 && !placed && !ticketInView;

  const primaryLabel = placing
    ? (flow === 'later' ? 'Sending…' : 'Placing…')
    : flow === 'later' ? 'Send to kitchen' : isInvoice ? `Bill ${money(total)} to account` : `Take ${money(total)}`;

  return (
    <div className={cx('flex flex-col tab:flex-row tab:h-[calc(100dvh-60px)] min-h-0 bg-mq-canvas', showJump && 'pb-20')}>
      {/* LEFT — menu */}
      <section className="flex flex-col flex-1 min-w-0 tab:min-h-0" aria-label="Menu">
        <div className="flex flex-col gap-2.5 px-3 tab:px-[18px] pt-3.5 pb-2.5">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search the menu"
            aria-label="Search the menu"
            className="!h-[46px] !rounded-[10px] !px-[13px]"
          />
          <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-3 px-3 tab:mx-0 tab:px-0 [scrollbar-width:thin]" role="group" aria-label="Categories">
            <ChoiceChip active={activeCat === 'all'} onClick={() => setActiveCat('all')} className="flex-none">All</ChoiceChip>
            {activeCats.map((c) => (
              <ChoiceChip key={c.id} active={activeCat === c.id} onClick={() => setActiveCat(c.id)} className="flex-none">{c.name}</ChoiceChip>
            ))}
          </div>
        </div>
        <div className="tab:flex-1 tab:min-h-0 tab:overflow-y-auto px-3 tab:px-[18px] pt-1 pb-5 grid gap-3 content-start auto-rows-max grid-cols-[repeat(auto-fill,minmax(min(164px,100%),1fr))]">
          {isLoading
            ? [1, 2, 3, 4, 5, 6, 7, 8].map((n) => <Skeleton key={n} className="h-[178px] !rounded-xl" />)
            : visibleItems.length === 0
              ? <EmptyState icon="search" title="No items found" className="col-span-full">Try another search or category.</EmptyState>
              : visibleItems.map((item) => (
                <ItemCard key={item.id} item={item} cat={catName[item.categoryId]} onAdd={() => openItem(item)} />
              ))}
        </div>
      </section>

      {resizable && (
        <div
          {...ticket.handleProps}
          aria-label="Resize the ticket — drag, or use the arrow keys"
          aria-valuemin={TICKET_MIN}
          title="Drag to resize · double-click to reset"
          className="relative z-[6] flex-none flex items-center justify-center w-2.5 -mx-[5px] cursor-col-resize touch-none hover:bg-[rgba(133,13,51,.07)] focus-visible:outline-none focus-visible:bg-[rgba(133,13,51,.07)]"
        >
          <span className="block w-1 h-9 rounded-full bg-mq-line-2" />
        </div>
      )}

      {/* RIGHT — ticket */}
      <aside
        ref={ticketRef}
        aria-label="Ticket"
        className={cx(
          'flex flex-col bg-white border-mq-line min-w-0',
          'border-t tab:border-t-0 tab:border-l tab:min-h-0',
          !resizable && 'tab:flex-[0_1_360px] tab:min-w-[320px]',
        )}
        style={resizable ? { width: ticket.width, flex: 'none' } : undefined}
      >
        {placed ? (
          <PlacedPanel
            placed={placed}
            canOpenOrders={Boolean(me) && me.role !== 'waiter' && canView('orders')}
            canOpenCustomer={canView('customers')}
            onPrint={(kind) => printNow(placed.order, kind)}
            onNew={resetOrder}
          />
        ) : (
          <>
            <div ref={topRef} className="flex flex-col gap-2 px-3.5 py-2.5 border-b border-mq-line flex-none">
              <ServiceSwitch value={service} onChange={(v) => { setService(v); if (v === 'delivery') setTableNumber(''); }} />
              {!deliveryOn ? (
                <div className={cx('grid gap-2', !isWaiterSelf && waiters.length > 0 && 'grid-cols-2')}>
                  {/* No grey "what's needed" hint up here: the same line shows under the
                      primary button, and red errors still appear once touched. */}
                  <Field label="Table" required={hasTables} {...form.fieldProps('table')} requirement={undefined}>
                    <TablePicker size="sm" placeholder="Table no." value={tableNumber} onChange={(v) => { setTableNumber(v); form.touch('table'); }} required={hasTables} />
                  </Field>
                  {/* A waiter's own sale is always attributed to them — no picker needed. */}
                  {!isWaiterSelf && (
                    waiters.length > 0 ? (
                      <Field label="Served by" required {...form.fieldProps('waiter')} requirement={undefined}>
                        <select className={selectCls({ size: 'sm' })} value={waiterId} onChange={(e) => { setWaiterId(e.target.value); form.touch('waiter'); }}>
                          <option value="">Choose…</option>
                          {waiters.map((w) => <option key={w.id} value={w.id}>{w.label || w.name}</option>)}
                        </select>
                      </Field>
                    ) : <Alert tone="warn">No active waiters — add one in Staff before taking dine-in orders.</Alert>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {/* Two compact rows; the "what's needed" line shows under the button. */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <input className={inputCls({ size: 'sm' })} value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Name (optional)" aria-label="Customer name" />
                    <Field {...form.fieldProps('contactPhone')} requirement={undefined}>
                      <input className={inputCls({ size: 'sm' })} type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="Phone *" aria-label="Customer phone" />
                    </Field>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <Field className="flex-1 min-w-0" {...form.fieldProps('address')} requirement={undefined}>
                      <input className={inputCls({ size: 'sm' })} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Delivery address *" aria-label="Delivery address" />
                    </Field>
                    <Field {...form.fieldProps('deliveryFee')}>
                      {(a) => (
                        <div className="flex items-center gap-1.5" title="Delivery fee — default from Settings">
                          <label htmlFor={a.id} className={LABEL}>Fee</label>
                          <input
                            {...a}
                            className={inputCls({ size: 'sm', mono: true, className: 'w-[72px] !px-2 text-right' })}
                            type="number" min="0" step="0.5" inputMode="decimal" value={effFee} onChange={(e) => setDeliveryFee(e.target.value)}
                          />
                        </div>
                      )}
                    </Field>
                  </div>
                </div>
              )}
            </div>

            <div className="tab:flex-1 tab:min-h-[104px] tab:overflow-y-auto min-h-24 px-3.5 py-0.5">
              {cart.length === 0
                ? <EmptyState icon="pos" title="Ticket is empty">Tap a menu item to start the order.</EmptyState>
                : cart.map((l) => <TicketLine key={l.uid} line={l} onQty={(d) => changeQty(l.uid, d)} />)}
            </div>

            {cart.length > 0 && !phone && (
              <div
                {...payArea.handleProps}
                aria-label="Resize the payment area — drag, or use the arrow keys"
                title="Drag to resize · double-click to reset"
                className="relative z-[6] flex-none flex items-center justify-center h-2.5 -my-[5px] cursor-row-resize touch-none hover:bg-[rgba(133,13,51,.07)] focus-visible:outline-none focus-visible:bg-[rgba(133,13,51,.07)]"
              >
                <span className="block h-1 w-9 rounded-full bg-mq-line-2" />
              </div>
            )}

            {cart.length > 0 && (
              <>
              <div
                ref={payRef}
                className="flex flex-col gap-2 px-3.5 pt-2.5 pb-2 border-t border-mq-line bg-mq-cream tab:overflow-y-auto tab:flex-[0_1_auto] tab:min-h-0"
                style={phone || payArea.width == null ? undefined : { maxHeight: payArea.width }}
              >
                {/* Pay later decides everything below it, so it comes first. */}
                {orderType === 'dine_in' && (
                  <label
                    className="flex items-center gap-2 px-2.5 py-1 bg-white border border-mq-line rounded-lg cursor-pointer"
                    title="The kitchen gets it now; the guests settle the tab in Orders at the end."
                  >
                    <Toggle checked={flow === 'later'} onChange={setPayLaterMode} label="Pay later" disabled={placing} />
                    <span className="text-[12.5px] font-semibold flex-none">Pay later</span>
                    <span className="text-[11.5px] text-mq-on-tint truncate min-w-0">kitchen now · pay in Orders</span>
                  </label>
                )}

                {flow === 'pay' && (
                  <Field {...form.fieldProps('discountValue')}>
                    {(a) => <DiscountRow compact a11y={a} discount={discount} setDiscount={setDiscount} disabled={placing} />}
                  </Field>
                )}

                {flow === 'pay' && (
                  <PaymentFields compact pay={pay} total={total} disabled={placing} />
                )}

                {flow === 'pay' && isInvoice && (
                  <div className="flex flex-col gap-1.5">
                    <Field label="Customer" required {...form.fieldProps('invoiceCustomer')} requirement={undefined}>
                      <CustomerPicker
                        customerId={invoiceCustomer.customerId}
                        customer={invoiceCustomer.customer}
                        onChange={setInvoiceCustomer}
                        disabled={placing}
                      />
                    </Field>
                    <Field htmlFor="reg-due">
                      {(a) => (
                        <div className="flex items-center gap-2">
                          <label htmlFor={a.id} className={cx(LABEL, 'flex-none')}>Due (optional)</label>
                          <input {...a} className={inputCls({ size: 'sm', className: 'flex-1 min-w-0 w-auto' })} type="date" value={invoiceDueDate} onChange={(e) => setInvoiceDueDate(e.target.value)} />
                        </div>
                      )}
                    </Field>
                  </div>
                )}
              </div>

              {/* Always in view: the total and the one action. */}
              <div ref={footRef} className="flex flex-col gap-1.5 px-3.5 pt-2 pb-2.5 border-t border-mq-line bg-mq-cream flex-none">
                <TotalsBlock
                  compact
                  total={shownTotal}
                  rows={flow === 'pay' && (discountAmount > 0 || delivery > 0) ? [
                    ['Subtotal', money(subtotal)],
                    discountAmount > 0 && ['Discount', `−${money(discountAmount)}`],
                    delivery > 0 && ['Delivery fee', money(delivery)],
                  ].filter(Boolean) : []}
                />
                <Button
                  variant="primary" block
                  icon={flow === 'later' ? 'arrowRight' : undefined}
                  className="!h-9 !rounded-lg !text-[13.5px]"
                  disabled={placing || !form.valid}
                  onClick={placeOrder}
                >
                  {primaryLabel}
                </Button>
                {!form.valid && !placing && firstIssue && <div className="text-[11.5px] text-mq-muted text-center" role="status">{firstIssue}</div>}
              </div>
              </>
            )}
          </>
        )}
      </aside>

      {showJump && (
        <div className="fixed inset-x-3 bottom-3 z-30">
          <Button
            variant="primary" size="xl" block iconRight="arrowDown"
            className="!h-auto min-h-[52px] !rounded-xl !shadow-mq-toast"
            onClick={() => ticketRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            Ticket · {itemCount} {itemCount === 1 ? 'item' : 'items'} · <span className="font-mq-mono tabular-nums">{money(shownTotal)}</span>
          </Button>
        </div>
      )}

      {customizing && (
        <ItemCustomizer
          item={customizing}
          eyebrow={catName[customizing.categoryId] || 'Item'}
          onClose={() => setCustomizing(null)}
          onAdd={(line) => { setCart((prev) => addToCart(prev, line)); setCustomizing(null); }}
        />
      )}

      <ReceiptDoc order={receipt} kind={printKind} />
    </div>
  );
}

const PLACED_TONE = {
  later: 'bg-mq-info-bg text-mq-info',
  invoice: 'bg-mq-warn-bg text-mq-warn-ink',
  paid: 'bg-mq-ok-bg text-mq-ok',
};

function paymentFact(kind, order, dueDate) {
  if (kind === 'later') return 'Unpaid tab';
  if (kind === 'invoice') {
    const due = dueDate ? new Date(`${dueDate}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : null;
    return `On account${due ? ` · due ${due}` : ''}`;
  }
  const parts = Array.isArray(order.payments) ? order.payments : [];
  const acct = order.paymentAccount || parts[0]?.label || order.paymentMethod || '—';
  const received = Number(order.amountReceived);
  const tot = Number(order.total);
  return received > tot ? `${acct} · ${money(received)} received · change ${money(received - tot)}` : acct;
}

function PlacedPanel({ placed, canOpenOrders, canOpenCustomer, onPrint, onNew }) {
  const { kind, order, dueDate } = placed;
  const lines = Array.isArray(order.items) ? order.items : [];
  const qty = lines.reduce((s, l) => s + Number(l.quantity || 0), 0);
  const dineIn = order.orderType === 'dine_in';
  const where = dineIn
    ? `Dine-in${order.tableNumber ? ` · Table ${order.tableNumber}` : ''}`
    : `Delivery${order.contactName || order.contactPhone ? ` · ${order.contactName || order.contactPhone}` : ''}`;
  const servedBy = dineIn ? (order.waiterName || order.waiter) : (order.staffName || order.staff);

  const title = kind === 'later'
    ? `Sent to kitchen · ${order.tableNumber ? `Table ${order.tableNumber}` : order.code}`
    : kind === 'invoice' ? `Invoice #${order.invoiceId} created` : `Paid · receipt ${order.receiptNo}`;

  const facts = [
    ['Order', <span key="c" className="font-mq-mono tabular-nums text-[12.5px]">{order.code}</span>],
    ['Service', where],
    kind === 'invoice' && order.customer?.name && ['Customer', order.customer.name],
    servedBy && ['Served by', servedBy],
    ['Items', `${qty} ${qty === 1 ? 'item' : 'items'} · ${lines.length} ${lines.length === 1 ? 'dish' : 'dishes'}`],
    ['Payment', paymentFact(kind, order, dueDate)],
    kind === 'paid' && order.collectedBy && ['Collected by', order.collectedBy],
  ].filter(Boolean);

  const act = 'min-h-11 !h-auto !rounded-[10px]';
  return (
    <div className="flex flex-col items-center gap-3.5 flex-1 min-h-0 tab:overflow-y-auto px-5 pt-7 pb-5 text-center animate-mq-in motion-reduce:animate-none">
      <span className={cx('grid place-items-center w-[60px] h-[60px] rounded-full flex-none', PLACED_TONE[kind])}>
        <Icon name="check" size={28} stroke={2.8} />
      </span>
      <span className="text-[19px] font-semibold tracking-[-.01em]">{title}</span>

      <div className="w-full border border-mq-line rounded-xl overflow-hidden text-left">
        {facts.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 px-3.5 py-[9px] border-b border-mq-chip text-[13px]">
            <span className="text-mq-muted flex-none">{k}</span>
            <span className="font-medium text-right min-w-0 break-words">{v}</span>
          </div>
        ))}
        <div className="flex justify-between gap-3 px-3.5 py-[11px] bg-mq-cream">
          <span className="font-semibold">Total</span>
          <span className="font-mq-mono tabular-nums font-semibold text-[15px]">{money(order.total)}</span>
        </div>
      </div>

      <div className="w-full grid gap-2 grid-cols-[repeat(auto-fit,minmax(130px,1fr))]">
        {kind === 'later' ? (
          <>
            <Button icon="print" className={act} onClick={() => onPrint('kitchen')}>Kitchen ticket</Button>
            <Button icon="print" className={act} onClick={() => onPrint('bill')}>Print bill</Button>
            {canOpenOrders && <Button iconRight="arrowRight" className={act} href={`/admin/dashboard/orders/${order.id}`}>Open order</Button>}
          </>
        ) : (
          <>
            <Button icon="print" className={act} onClick={() => onPrint('customer')}>Customer receipt</Button>
            <Button icon="print" className={act} onClick={() => onPrint('kitchen')}>Kitchen ticket</Button>
            {kind === 'invoice' && canOpenCustomer && order.customer?.id && (
              <Button iconRight="arrowRight" className={act} href={`/admin/dashboard/customers/${order.customer.id}`}>Open customer</Button>
            )}
          </>
        )}
      </div>

      <span className="flex-1" />
      <Button variant="primary" size="xl" block icon="plus" className="!h-auto min-h-[52px] !rounded-xl" onClick={onNew}>New order</Button>
    </div>
  );
}
