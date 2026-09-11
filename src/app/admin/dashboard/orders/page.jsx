'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchJson, parseApiError } from '@/lib/apiError';
import { computeOrderTotals } from '@/lib/orderTotals';
import ReceiptDoc from '@/components/admin/ReceiptDoc';
import { RowsSkeleton } from '@/components/admin/Skeletons';

const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cap = (t) => ({ dine_in: 'Dine-in', delivery: 'Delivery' }[t] || t);
const initials = (s) => (s || '').replace(/[^a-zA-Z0-9 ]/g, '').split(' ').map((x) => x[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '#';
const dt = (d) => new Date(d).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
function ago(date) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const MANAGER_ROLES = ['admin', 'manager'];
const METHOD_LABEL = { cash: 'Cash', card: 'Card', evc: 'EVC', invoice: 'Invoice', waafi: 'Waafi' };
const STATUS = {
  pending: { label: 'Awaiting', cls: 'pill-amber', color: 'var(--amber)' },
  confirmed: { label: 'Confirmed', cls: 'pill-green', color: 'var(--primary)' },
  declined: { label: 'Declined', cls: 'pill-rose', color: 'var(--rose)' },
  voided: { label: 'Voided', cls: 'pill-ghost', color: 'var(--faint)' },
};
const PAY_PILL = { paid: ['pill-green', 'Paid'], unpaid: ['pill-amber', 'Unpaid'], refunded: ['pill-rose', 'Refunded'] };
const whoOf = (o) => o.contactName || o.customer?.name || (o.orderType === 'delivery' ? 'Delivery' : (o.tableNumber ? `Table ${o.tableNumber}` : 'Walk-in'));

const Ic = {
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 6 9 17l-5-5" /></svg>,
  x: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg>,
  pen: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>,
  print: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" /></svg>,
  back: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>,
};

// Mirrors the PATCH / void routes' refusals so buttons explain themselves
// instead of failing on click. The server remains the authority.
function editBlocker(o) {
  if (o.status === 'pending') return 'Accept or decline this order before editing it.';
  if (o.status !== 'confirmed') return `A ${o.status} order can’t be edited.`;
  if (o.paymentStatus === 'refunded') return 'A refunded order can’t be edited.';
  if (o.paymentMethod === 'waafi' && o.paymentStatus === 'paid') return 'Paid through Waafi, which has no partial refunds — void the order instead of editing it.';
  if (o.invoice?.status === 'void') return 'This order’s invoice is void.';
  return null;
}

const toReceipt = (o) => ({
  id: o.id, reference: o.reference, status: o.status, orderType: o.orderType, tableNumber: o.tableNumber,
  items: Array.isArray(o.items) ? o.items : [], total: o.total, discount: o.discount, deliveryFee: o.deliveryFee,
  contactName: o.contactName || o.customer?.name || null, contactPhone: o.contactPhone,
  address: o.orderType === 'delivery' ? o.address : null,
  waiterName: o.waiterName, cashierName: o.staffName, createdAt: o.createdAt,
  paymentMethod: o.paymentMethod, amountReceived: o.amountReceived, invoiceId: o.invoice?.id ?? null,
});

export default function OrdersPage() {
  const qc = useQueryClient();
  const [fSrc, setFSrc] = useState('all');
  const [search, setSearch] = useState('');
  const [selId, setSelId] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [voiding, setVoiding] = useState(null);

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => fetchJson('/api/auth/me'), staleTime: 5 * 60 * 1000 });
  const canManage = MANAGER_ROLES.includes(me?.role);
  const { data: orders = [], isLoading, isError, error } = useQuery({ queryKey: ['orders-all'], queryFn: () => fetchJson('/api/admin/orders'), refetchInterval: 8000 });

  const replaceOrder = (updated) => qc.setQueryData(['orders-all'], (list) => (Array.isArray(list) ? list.map((x) => (x.id === updated.id ? updated : x)) : list));
  const refreshRelated = () => {
    qc.invalidateQueries({ queryKey: ['orders-all'] });
    qc.invalidateQueries({ queryKey: ['invoices'] });
    qc.invalidateQueries({ queryKey: ['customers'] });
    qc.invalidateQueries({ queryKey: ['daily-report'] });
  };

  const act = useMutation({
    mutationFn: ({ id, kind }) => fetchJson(`/api/admin/orders/${id}/${kind}`, { method: 'POST' }),
    onSuccess: (d, v) => { toast.success(v.kind === 'accept' ? 'Accepted — payment captured' : 'Declined — hold released'); if (d?.order) replaceOrder(d.order); refreshRelated(); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const counts = useMemo(() => ({
    all: orders.length,
    online: orders.filter((o) => o.source === 'online').length,
    pos: orders.filter((o) => o.source === 'pos').length,
  }), [orders]);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = orders.filter((o) => {
      if (fSrc !== 'all' && o.source !== fSrc) return false;
      if (!q) return true;
      return whoOf(o).toLowerCase().includes(q) || String(o.id).includes(q) || (o.contactPhone || '').includes(q) || (o.reference || '').toLowerCase().includes(q);
    });
    return [
      { key: 'pending', title: 'Needs action', items: filtered.filter((o) => o.status === 'pending') },
      { key: 'done', title: 'Completed', items: filtered.filter((o) => o.status === 'confirmed') },
      { key: 'closed', title: 'Declined & voided', items: filtered.filter((o) => o.status === 'declined' || o.status === 'voided') },
    ].filter((g) => g.items.length);
  }, [orders, fSrc, search]);

  const sel = orders.find((o) => o.id === selId);
  const selectOrder = (id) => { setSelId(id); setDetailOpen(true); };

  return (
    <div className={`ord${detailOpen ? ' detail-open' : ''}`}>
      <section className="ord-list">
        <div className="ol-top">
          <div className="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, order no., phone" aria-label="Search orders" /></div>
          <div className="ol-filters">
            {[['all', 'All'], ['online', 'Online'], ['pos', 'Counter']].map(([v, l]) => (
              <button key={v} className={fSrc === v ? 'on' : ''} onClick={() => setFSrc(v)}><span className="n">{counts[v]}</span><span>{l}</span></button>
            ))}
          </div>
        </div>
        <div className="ol-scroll">
          {isLoading ? (
            <div style={{ padding: 16 }}><RowsSkeleton rows={6} height={52} /></div>
          ) : isError ? (
            <div className="ol-empty">Couldn&rsquo;t load orders. {parseApiError(error)}</div>
          ) : groups.length === 0 ? (
            <div className="ol-empty">{orders.length ? 'No matching orders' : 'No orders yet'}</div>
          ) : groups.map((g) => (
            <div key={g.key}>
              <div className="ol-group-h">{g.title}<span className="cnt">{g.items.length}</span></div>
              {g.items.map((o) => {
                const st = STATUS[o.status] || STATUS.confirmed;
                const icStyle = o.source === 'online' ? { background: 'var(--sky-soft)', color: 'var(--sky)' } : { background: 'var(--primary-soft)', color: 'var(--primary)' };
                return (
                  <button type="button" key={o.id} className={`oli${o.id === selId ? ' sel' : ''}${o.status === 'voided' ? ' voided' : ''}`} onClick={() => selectOrder(o.id)} style={{ width: '100%', textAlign: 'left' }}>
                    <div className="oli-ic" style={icStyle}>{initials(whoOf(o))}</div>
                    <div className="oli-main">
                      <div className="oli-top"><span className="blip" style={{ background: st.color }} /><span className="oli-who">{whoOf(o)}</span></div>
                      <div className="oli-sub">{o.source === 'online' ? 'Online' : 'Counter'} · {cap(o.orderType)} · #{o.id}{o.editedAt ? ' · edited' : ''}</div>
                    </div>
                    <div className="oli-r"><div className="oli-amt">{money(o.total)}</div><div className="oli-time">{ago(o.createdAt)}</div></div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      <section className="ord-detail">
        {!sel ? (
          <div className="od-empty">
            <div>
              <div className="empty-ring"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="2" /><path d="M9 12h6M9 16h4" /></svg></div>
              <div className="empty-title">Select an order</div>
              <div className="empty-sub">Pick a ticket on the left to see details and take action.</div>
            </div>
          </div>
        ) : (
          <OrderDetail
            o={sel}
            canManage={canManage}
            busy={act.isPending}
            onBack={() => setDetailOpen(false)}
            onAct={(kind) => act.mutate({ id: sel.id, kind })}
            onPrint={() => window.print()}
            onEdit={() => setEditing(sel)}
            onVoid={() => setVoiding(sel)}
          />
        )}
      </section>

      {editing && (
        <EditOrderModal
          order={editing}
          onClose={() => setEditing(null)}
          onSaved={(d) => {
            replaceOrder(d.order);
            setEditing(null);
            const delta = Number(d.totalDelta);
            toast.success(delta === 0 ? 'Order updated' : `Order updated · total ${delta < 0 ? 'down' : 'up'} ${money(Math.abs(delta))}`);
            refreshRelated();
          }}
        />
      )}
      {voiding && (
        <VoidOrderModal
          order={voiding}
          onClose={() => setVoiding(null)}
          onDone={(d) => {
            replaceOrder(d.order);
            setVoiding(null);
            const owed = Number(d.refund.orderAmount) + Number(d.refund.invoiceCollected);
            toast.success(owed > 0 ? `Order voided · refund ${money(owed)} to the customer` : 'Order voided');
            refreshRelated();
          }}
        />
      )}

      <ReceiptDoc order={sel ? toReceipt(sel) : null} />
    </div>
  );
}

function Timeline({ status }) {
  const step = (cls, dot, label) => <div className={`tlstep ${cls}`}><div className="dot">{dot}</div><span className="lb">{label}</span></div>;
  if (status === 'declined') {
    return <div className="od-timeline">{step('done', Ic.check, 'Received')}<div className="tlconn" />{step('bad', Ic.x, 'Declined')}</div>;
  }
  if (status === 'voided') {
    return <div className="od-timeline">{step('done', Ic.check, 'Received')}<div className="tlconn done" />{step('done', Ic.check, 'Confirmed')}<div className="tlconn" />{step('bad', Ic.x, 'Voided')}</div>;
  }
  const done = status === 'confirmed';
  return <div className="od-timeline">{step('done', Ic.check, 'Received')}<div className={`tlconn${done ? ' done' : ''}`} />{step(done ? 'done' : 'cur', done ? Ic.check : 2, done ? 'Confirmed' : 'Awaiting')}</div>;
}

function OrderDetail({ o, canManage, busy, onBack, onAct, onPrint, onEdit, onVoid }) {
  const st = STATUS[o.status] || STATUS.confirmed;
  const pay = PAY_PILL[o.paymentStatus];
  const items = Array.isArray(o.items) ? o.items : [];
  const units = items.reduce((s, i) => s + Number(i.quantity || 0), 0);
  const sub = items.reduce((s, i) => s + Number(i.unitPrice) * Number(i.quantity), 0);
  const disc = Number(o.discount || 0);
  const fee = Number(o.deliveryFee || 0);
  const total = Number(o.total || 0);
  const received = o.amountReceived != null ? Number(o.amountReceived) : null;
  const isDelivery = o.orderType === 'delivery';
  const blocker = editBlocker(o);

  return (
    <>
      <div className="od-scroll">
        <button className="btn btn-ghost btn-sm od-back" onClick={onBack} style={{ marginBottom: 14 }}>{Ic.back}All orders</button>
        <div className="od-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="od-ref">#{o.id} · {o.reference}</div>
            <div className="od-who">{whoOf(o)}</div>
            <div className="od-tags">
              {o.source === 'online' ? <span className="pill pill-sky">Online order</span> : <span className="pill pill-green">Counter order</span>}
              <span className="pill pill-ghost">{cap(o.orderType)}</span>
              <span className={`pill ${st.cls}`}><span className="pdot" />{st.label}</span>
              {pay && o.status !== 'pending' && <span className={`pill ${pay[0]}`}>{pay[1]}</span>}
              {o.editedAt && <span className="pill pill-sky">Edited</span>}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}><div className="od-ref">Total</div><div className="od-total-v">{money(total)}</div></div>
        </div>

        <Timeline status={o.status} />

        <div className="od-cards">
          {isDelivery ? (
            <>
              <div className="od-card"><div className="l">Phone</div><div className="v mono">{o.contactPhone || '—'}</div></div>
              <div className="od-card"><div className="l">Address</div><div className="v sm">{o.address || '—'}</div></div>
            </>
          ) : (
            <>
              <div className="od-card"><div className="l">Table</div><div className="v">{o.tableNumber || '—'}</div></div>
              <div className="od-card"><div className="l">Served by</div><div className="v sm">{o.waiter || o.staff || '—'}</div></div>
            </>
          )}
          <div className="od-card"><div className="l">Payment</div><div className="v">{METHOD_LABEL[o.paymentMethod] || '—'}</div></div>
          <div className="od-card" title={dt(o.createdAt)}><div className="l">Placed</div><div className="v sm">{dt(o.createdAt)}</div></div>
          {o.invoice && (
            <Link className="od-card" href={o.customer?.id ? `/admin/dashboard/customers/${o.customer.id}/invoices/${o.invoice.id}` : `/admin/dashboard/invoices/${o.invoice.id}`}>
              <div className="l">Invoice #{o.invoice.id} · {o.invoice.status}</div>
              <div className="v mono" style={{ color: Number(o.invoice.balance) > 0 ? 'var(--rose)' : undefined }}>{money(o.invoice.balance)} due</div>
            </Link>
          )}
          {!isDelivery && o.address && <div className="od-card"><div className="l">Note</div><div className="v sm">{o.address}</div></div>}
        </div>

        <div className="od-items">
          <div className="od-items-h">Items · {units}</div>
          {items.map((i, idx) => (
            <div className="odl" key={i.uid || idx}>
              <span className="odl-q">{i.quantity}×</span>
              <div style={{ minWidth: 0 }}>
                <div className="odl-nm">{i.name}</div>
                {(i.optionName || (i.extras && i.extras.length) || i.notes) && <div className="odl-opt">{[i.optionName, i.extras?.map((e) => e.name).join(', '), i.notes && `“${i.notes}”`].filter(Boolean).join(' · ')}</div>}
              </div>
              <span className="odl-pr">{money(Number(i.unitPrice) * Number(i.quantity))}</span>
            </div>
          ))}
          <div className="od-tot">
            <div className="r"><span>Subtotal</span><span className="mono">{money(sub)}</span></div>
            {disc > 0 && <div className="r"><span>Discount</span><span className="mono rose">−{money(disc)}</span></div>}
            {fee > 0 && <div className="r"><span>Delivery fee</span><span className="mono">{money(fee)}</span></div>}
            <div className="r t"><span>Total</span><span className="mono">{money(total)}</span></div>
            {received != null && <div className="r"><span>Cash received</span><span className="mono">{money(received)}</span></div>}
            {received != null && received > total && <div className="r"><span>Change</span><span className="mono">{money(received - total)}</span></div>}
          </div>
        </div>

        {(o.editedAt || o.voidedAt) && (
          <div className="od-audit">
            {o.voidedAt && (
              <div className="od-audit-row void">{Ic.x}<div><b>Voided</b> by {o.voidedBy || 'a manager'} <span className="when">· {dt(o.voidedAt)}</span><div>{o.voidReason}</div></div></div>
            )}
            {o.editedAt && (
              <div className="od-audit-row">{Ic.pen}<div><b>Last edited</b> by {o.editedBy || 'a manager'} <span className="when">· {dt(o.editedAt)}</span><div>{o.editReason}</div></div></div>
            )}
          </div>
        )}
      </div>

      <div className="od-actions">
        {o.status === 'pending' ? (
          o.paymentTransactionId ? (
            <>
              <button className="btn btn-danger" disabled={busy} onClick={() => onAct('decline')}>{Ic.x}Decline &amp; release hold</button>
              <div className="grow" />
              <button className="btn btn-primary" disabled={busy} onClick={() => onAct('accept')}>{Ic.check}Accept &amp; capture</button>
            </>
          ) : <span className="od-state">Awaiting payment confirmation</span>
        ) : (
          <>
            {o.status === 'confirmed' && <span className="od-state ok">{Ic.check}{o.paymentStatus === 'paid' ? 'Completed & paid' : o.invoice ? 'Billed to invoice' : 'Completed'}</span>}
            {o.status === 'declined' && <span className="od-state bad">{Ic.x}Declined · hold released</span>}
            {o.status === 'voided' && <span className="od-state bad">{Ic.x}{o.paymentStatus === 'refunded' ? 'Voided · refund owed' : 'Voided'}</span>}
            <div className="grow" />
            {o.status !== 'declined' && <button className="btn btn-ghost" onClick={onPrint}>{Ic.print}Reprint</button>}
            {canManage && o.status === 'confirmed' && (
              <>
                <button className="btn btn-ghost" onClick={onEdit} disabled={Boolean(blocker)}>{Ic.pen}Edit order</button>
                <button className="btn btn-danger" onClick={onVoid}>{Ic.x}Void</button>
              </>
            )}
            {canManage && o.status === 'confirmed' && blocker && <div className="note" style={{ width: '100%' }}>{blocker}</div>}
          </>
        )}
      </div>
    </>
  );
}

function EditOrderModal({ order, onClose, onSaved }) {
  const [lines, setLines] = useState(() => (Array.isArray(order.items) ? order.items : []).map((l, i) => ({
    ...l,
    uid: String(l.uid || `l${i}`),
    quantity: Number(l.quantity) || 1,
    unitPrice: Number(l.unitPrice) || 0,
    extras: Array.isArray(l.extras) ? l.extras : [],
    notes: l.notes || '',
  })));
  const isDel = order.orderType === 'delivery';
  const [orderType, setOrderType] = useState(isDel ? 'delivery' : 'dine_in');
  const [tableNumber, setTableNumber] = useState(order.tableNumber || '');
  const [notes, setNotes] = useState(isDel ? '' : (order.address || ''));
  const [contactName, setContactName] = useState(order.contactName || '');
  const [contactPhone, setContactPhone] = useState(order.contactPhone || '');
  const [address, setAddress] = useState(isDel ? (order.address || '') : '');
  // The original discount type isn't stored — only the resolved amount — so
  // the edit starts from that flat amount.
  const [discType, setDiscType] = useState('fixed');
  const [discValue, setDiscValue] = useState(Number(order.discount) > 0 ? String(Number(order.discount)) : '');
  const [fee, setFee] = useState(Number(order.deliveryFee) > 0 ? String(Number(order.deliveryFee)) : '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [adding, setAdding] = useState({ itemId: '', opts: {} });

  const { data: menu = [] } = useQuery({ queryKey: ['pos-items'], queryFn: () => fetchJson('/api/menu-items') });
  const activeMenu = menu.filter((m) => m.isActive !== false);
  const addItem = activeMenu.find((m) => String(m.id) === String(adding.itemId));

  // Preview with the exact function the server uses; the server still
  // reprices every line from the database on save.
  const subCents = Math.round(lines.reduce((s, l) => s + Number(l.unitPrice) * l.quantity, 0) * 100);
  const dv = Number(discValue);
  const preview = computeOrderTotals({
    totalCents: subCents,
    discountType: dv > 0 ? discType : null,
    discountValue: dv > 0 ? dv : null,
    orderType,
    deliveryFee: orderType === 'delivery' ? Number(fee) || 0 : null,
  });
  const newTotal = preview.error ? 0 : preview.total;
  const prevTotal = Number(order.total);
  const delta = Math.round((newTotal - prevTotal) * 100) / 100;
  const inv = order.invoice && order.invoice.status !== 'void' ? order.invoice : null;
  const paidOnInvoice = inv ? Number(inv.amountPaid) : 0;
  const belowPaid = Boolean(inv) && !preview.error && newTotal < paidOnInvoice - 0.004;
  const wasPaid = order.paymentStatus === 'paid';

  const setQty = (uid, d) => setLines((ls) => ls.map((l) => (l.uid === uid ? { ...l, quantity: Math.min(99, Math.max(1, l.quantity + d)) } : l)));
  const removeLine = (uid) => setLines((ls) => ls.filter((l) => l.uid !== uid));
  const confirmAdd = () => {
    if (!addItem) return;
    const parts = (addItem.optionGroups || [])
      .map((g) => (g.options || []).find((o) => String(o.id) === String(adding.opts[g.id] ?? g.options?.[0]?.id)))
      .filter(Boolean);
    const unitPrice = Number(addItem.price) + parts.reduce((s, o) => s + Number(o.priceAdd), 0);
    setLines((ls) => [...ls, {
      uid: `n${Date.now()}`, itemId: addItem.id, name: addItem.name, imageUrl: addItem.imageUrl ?? null,
      optionName: parts.map((p) => p.name).join(' · ') || null, extras: [], notes: '', unitPrice, quantity: 1,
    }]);
    setAdding({ itemId: '', opts: {} });
  };

  const save = useMutation({
    mutationFn: (payload) => fetchJson(`/api/admin/orders/${order.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
    onSuccess: onSaved,
    onError: (e) => setError(parseApiError(e)),
  });

  const submit = (e) => {
    e.preventDefault(); setError('');
    if (lines.length === 0) { setError('An order needs at least one item. To cancel the whole order, void it instead.'); return; }
    if (orderType === 'delivery' && (!contactPhone.trim() || !address.trim())) { setError('Delivery needs a phone and an address.'); return; }
    if (preview.error) { setError(preview.error); return; }
    if (belowPaid) { setError(`The new total can’t go below the ${money(paidOnInvoice)} already paid on invoice #${inv.id}.`); return; }
    if (reason.trim().length < 3) { setError('Give a reason for the edit.'); return; }
    save.mutate({
      items: lines.map((l) => ({
        uid: String(l.uid), itemId: Number(l.itemId), name: l.name, imageUrl: l.imageUrl ?? null,
        optionName: l.optionName || null,
        extras: (l.extras || []).map((x) => ({ name: x.name, priceAdd: Number(x.priceAdd) || 0 })),
        notes: l.notes || '', unitPrice: Number(l.unitPrice) || 0, quantity: Number(l.quantity),
      })),
      orderType,
      tableNumber: orderType === 'dine_in' ? (tableNumber.trim() || null) : null,
      discountType: dv > 0 ? discType : null,
      discountValue: dv > 0 ? dv : null,
      deliveryFee: orderType === 'delivery' ? Math.max(Number(fee) || 0, 0) : null,
      contactName: contactName.trim() || null,
      contactPhone: contactPhone.trim() || null,
      address: address.trim() || null,
      notes: notes.trim() || null,
      editReason: reason.trim(),
    });
  };

  return (
    <div className="jz-modal-bk open" onClick={(e) => { if (e.target === e.currentTarget && !save.isPending) onClose(); }}>
      <div className="modal" style={{ width: 'min(640px, 100%)' }} role="dialog" aria-modal="true" aria-label={`Edit order #${order.id}`}>
        <div className="modal-h">
          <div className="mt"><div className="eyebrow">Manager edit · order #{order.id}</div><div className="h-1" style={{ marginTop: 3 }}>{whoOf(order)}</div></div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">{Ic.x}</button>
        </div>
        <form onSubmit={submit} style={{ display: 'contents' }}>
          <div className="modal-b">
            <div className="ff">
              <label>Service</label>
              <div className="seg seg-full">
                <button type="button" className={orderType === 'dine_in' ? 'active' : ''} onClick={() => setOrderType('dine_in')}>Dine-in</button>
                <button type="button" className={orderType === 'delivery' ? 'active' : ''} onClick={() => setOrderType('delivery')}>Delivery</button>
              </div>
            </div>

            {orderType === 'dine_in' ? (
              <div className="form-grid">
                <div className="ff"><label htmlFor="ed-table">Table</label><input id="ed-table" className="input" value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} placeholder="Optional" /></div>
                <div className="ff"><label htmlFor="ed-note">Note</label><input id="ed-note" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></div>
              </div>
            ) : (
              <>
                <div className="form-grid">
                  <div className="ff"><label htmlFor="ed-cname">Customer name</label><input id="ed-cname" className="input" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Optional" /></div>
                  <div className="ff"><label htmlFor="ed-cphone">Phone</label><input id="ed-cphone" className="input" type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} /></div>
                </div>
                <div className="ff"><label htmlFor="ed-addr">Delivery address</label><input id="ed-addr" className="input" value={address} onChange={(e) => setAddress(e.target.value)} /></div>
              </>
            )}

            <div className="ff">
              <label>Items</label>
              <div className="od-items">
                {lines.length === 0 ? (
                  <div className="note" style={{ padding: '12px 14px' }}>No items left. Add one below, or close this and void the order instead.</div>
                ) : lines.map((l) => (
                  <div className="tline" key={l.uid}>
                    <span className="tline-q">{l.quantity}×</span>
                    <div className="tline-main">
                      <div className="tline-nm">{l.name}</div>
                      {(l.optionName || l.extras.length > 0 || l.notes) && <div className="tline-opt">{[l.optionName, l.extras.map((x) => x.name).join(', '), l.notes && `“${l.notes}”`].filter(Boolean).join(' · ')}</div>}
                    </div>
                    <div className="tline-r">
                      <span className="tline-pr">{money(l.unitPrice * l.quantity)}</span>
                      <span className="tline-acts">
                        <span className="tline-steps">
                          <button type="button" onClick={() => setQty(l.uid, -1)} disabled={l.quantity <= 1} aria-label={`Decrease ${l.name}`}>−</button>
                          <span>{l.quantity}</span>
                          <button type="button" onClick={() => setQty(l.uid, 1)} disabled={l.quantity >= 99} aria-label={`Increase ${l.name}`}>+</button>
                        </span>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => removeLine(l.uid)} aria-label={`Remove ${l.name}`}>Remove</button>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="ed-add">
                <select className="input" value={adding.itemId} onChange={(e) => setAdding({ itemId: e.target.value, opts: {} })} aria-label="Add a menu item">
                  <option value="">Add an item…</option>
                  {activeMenu.map((m) => <option key={m.id} value={m.id}>{m.name} · {money(m.price)}</option>)}
                </select>
                <button type="button" className="btn btn-soft" onClick={confirmAdd} disabled={!addItem}>Add</button>
              </div>
              {addItem?.optionGroups?.length > 0 && (
                <div className="form-grid">
                  {addItem.optionGroups.map((g) => (
                    <div className="ff" key={g.id}>
                      <label>{g.title}</label>
                      <select className="input" value={adding.opts[g.id] ?? g.options?.[0]?.id ?? ''} onChange={(e) => setAdding((a) => ({ ...a, opts: { ...a.opts, [g.id]: e.target.value } }))}>
                        {(g.options || []).map((o) => <option key={o.id} value={o.id}>{o.name}{Number(o.priceAdd) > 0 ? ` +${money(o.priceAdd)}` : ''}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="form-grid">
              <div className="ff">
                <label htmlFor="ed-disc">Discount</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input id="ed-disc" className="input" type="number" min="0" step="0.01" value={discValue} onChange={(e) => setDiscValue(e.target.value)} placeholder="0" />
                  <div className="seg" style={{ flexShrink: 0 }}>
                    <button type="button" className={discType === 'fixed' ? 'active' : ''} onClick={() => setDiscType('fixed')} aria-label="Fixed amount">$</button>
                    <button type="button" className={discType === 'percent' ? 'active' : ''} onClick={() => setDiscType('percent')} aria-label="Percent">%</button>
                  </div>
                </div>
              </div>
              {orderType === 'delivery' && (
                <div className="ff"><label htmlFor="ed-fee">Delivery fee</label><input id="ed-fee" className="input" type="number" min="0" step="0.5" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0" /></div>
              )}
            </div>

            <div className="od-tot boxed">
              <div className="r"><span>Subtotal</span><span className="mono">{money(subCents / 100)}</span></div>
              {!preview.error && preview.discount > 0 && <div className="r"><span>Discount</span><span className="mono rose">−{money(preview.discount)}</span></div>}
              {!preview.error && preview.delivery > 0 && <div className="r"><span>Delivery fee</span><span className="mono">{money(preview.delivery)}</span></div>}
              <div className="r t"><span>New total</span><span className="mono">{preview.error ? '—' : money(newTotal)}</span></div>
              <div className="r"><span>Was</span><span className="mono">{money(prevTotal)}</span></div>
              {!preview.error && delta !== 0 && (
                <div className="r">
                  <span>{delta < 0 ? (wasPaid ? 'Hand back to customer' : 'Reduction') : (wasPaid ? 'Collect from customer' : 'Increase')}</span>
                  <span className={`mono ${delta < 0 ? 'rose' : 'green'}`}>{delta < 0 ? '−' : '+'}{money(Math.abs(delta))}</span>
                </div>
              )}
            </div>
            <div className="note">Prices are re-checked against the current menu when you save.</div>
            {inv && (
              <div className={`note${belowPaid ? ' warn' : ''}`}>
                Invoice #{inv.id} will be updated to match. {money(paidOnInvoice)} is already paid on it{belowPaid ? ' — the new total can’t go below that. Void the order instead.' : '.'}
              </div>
            )}

            <div className="ff">
              <label htmlFor="ed-reason">Reason for the edit</label>
              <textarea id="ed-reason" className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer returned the fries" />
            </div>
            {error && <div className="adm-error-banner">{error}</div>}
          </div>
          <div className="modal-f">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={save.isPending}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={save.isPending || belowPaid || lines.length === 0}>{save.isPending ? 'Saving…' : 'Save changes'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function VoidOrderModal({ order, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const wasPaid = order.paymentStatus === 'paid';
  const inv = order.invoice && order.invoice.status !== 'void' ? order.invoice : null;

  const voidIt = useMutation({
    mutationFn: () => fetchJson(`/api/admin/orders/${order.id}/void`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.trim() }) }),
    onSuccess: onDone,
    onError: (e) => setError(parseApiError(e)),
  });

  const submit = (e) => {
    e.preventDefault(); setError('');
    if (reason.trim().length < 3) { setError('Give a reason for voiding.'); return; }
    voidIt.mutate();
  };

  return (
    <div className="jz-modal-bk open" onClick={(e) => { if (e.target === e.currentTarget && !voidIt.isPending) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Void order #${order.id}`}>
        <div className="modal-h">
          <div className="mt"><div className="eyebrow">Void order #{order.id}</div><div className="h-1" style={{ marginTop: 3 }}>{whoOf(order)}</div></div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">{Ic.x}</button>
        </div>
        <form onSubmit={submit} style={{ display: 'contents' }}>
          <div className="modal-b">
            <div className="od-tot boxed">
              <div className="r t" style={{ borderTop: 'none', marginTop: 0, paddingTop: 0 }}><span>Order total</span><span className="mono">{money(order.total)}</span></div>
              {wasPaid && <div className="r"><span>Refund owed to customer</span><span className="mono rose">{money(order.total)}</span></div>}
              {inv && <div className="r"><span>Invoice #{inv.id} will be voided</span><span className="mono">{money(inv.balance)} cleared</span></div>}
              {inv && Number(inv.amountPaid) > 0 && <div className="r"><span>Already paid on the invoice</span><span className="mono rose">{money(inv.amountPaid)}</span></div>}
            </div>
            <div className="note">The order stays on record marked as voided and drops out of revenue reports. Any refund is handed back at the counter. This can&rsquo;t be undone.</div>
            <div className="ff">
              <label htmlFor="void-reason">Reason</label>
              <textarea id="void-reason" className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer rejected the order" autoFocus />
            </div>
            {error && <div className="adm-error-banner">{error}</div>}
          </div>
          <div className="modal-f">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={voidIt.isPending}>Cancel</button>
            <button type="submit" className="btn btn-danger" disabled={voidIt.isPending}>{voidIt.isPending ? 'Voiding…' : 'Void order'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
