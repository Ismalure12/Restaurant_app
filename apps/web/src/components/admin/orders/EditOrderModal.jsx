'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { reportSaveError } from '@/lib/saveError';
import { useFormValidation } from '@/lib/formValidation';
import { editOrderSchema } from '@/lib/schemas/sales';
import Field from '@/components/admin/Field';
import { computeOrderTotals } from '@/lib/orderTotals';
import TablePicker from '@/components/admin/TablePicker';
import { Ic, money, whoOf } from './orderUi';

// Manager correction of a sale: full re-statement of items, service,
// discount and contact, with a required reason. The server reprices it.
export default function EditOrderModal({ order, onClose, onSaved }) {
  const [lines, setLines] = useState(() => (Array.isArray(order.items) ? order.items : []).map((l, i) => ({
    ...l,
    uid: String(l.uid || `l${i}`),
    quantity: Number(l.quantity) || 1,
    unitPrice: Number(l.unitPrice) || 0,
    extras: Array.isArray(l.extras) ? l.extras : [],
    notes: l.notes || '',
  })));
  const isDel = order.orderType === 'delivery';
  // An unpaid pay-later order stays dine-in; its discount is applied at payment.
  const isTab = order.status === 'open';
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
    discountType: !isTab && dv > 0 ? discType : null,
    discountValue: !isTab && dv > 0 ? dv : null,
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
  const totalProblem = preview.error
    || (belowPaid ? `The new total can’t go below the ${money(paidOnInvoice)} already paid on invoice #${inv.id}.` : null);

  const form = useFormValidation(editOrderSchema, {
    lineCount: lines.length,
    orderType,
    contactPhone,
    address,
    discountType: discType,
    discountValue: discValue,
    fee,
    totalProblem,
    reason,
  });

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
    onError: (e) => {
      reportSaveError(e, { form, title: 'Could not save the changes' });
    },
  });

  const submit = (e) => {
    e.preventDefault();
    if (!form.check() || save.isPending) return;
    form.setServerErrors(null);
    save.mutate({
      items: lines.map((l) => ({
        uid: String(l.uid), itemId: Number(l.itemId), name: l.name, imageUrl: l.imageUrl ?? null,
        optionName: l.optionName || null,
        extras: (l.extras || []).map((x) => ({ name: x.name, priceAdd: Number(x.priceAdd) || 0 })),
        notes: l.notes || '', unitPrice: Number(l.unitPrice) || 0, quantity: Number(l.quantity),
      })),
      orderType,
      tableNumber: orderType === 'dine_in' ? (tableNumber.trim() || null) : null,
      discountType: !isTab && dv > 0 ? discType : null,
      discountValue: !isTab && dv > 0 ? dv : null,
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
          <div className="mt"><div className="eyebrow">Manager edit · {order.code || `order #${order.id}`}</div><div className="h-1" style={{ marginTop: 3 }}>{whoOf(order)}</div></div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">{Ic.x}</button>
        </div>
        <form noValidate onSubmit={submit} style={{ display: 'contents' }}>
          <div className="modal-b">
            {!isTab && <div className="ff">
              <label>Service</label>
              <div className="seg seg-full">
                <button type="button" className={orderType === 'dine_in' ? 'active' : ''} onClick={() => setOrderType('dine_in')}>Dine-in</button>
                <button type="button" className={orderType === 'delivery' ? 'active' : ''} onClick={() => setOrderType('delivery')}>Delivery</button>
              </div>
            </div>}

            {orderType === 'dine_in' ? (
              <div className="form-grid">
                <div className="ff"><label htmlFor="ed-table">Table</label><TablePicker id="ed-table" value={tableNumber} onChange={setTableNumber} placeholder="Optional" /></div>
                <div className="ff"><label htmlFor="ed-note">Note</label><input id="ed-note" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></div>
              </div>
            ) : (
              <>
                <div className="form-grid">
                  <div className="ff"><label htmlFor="ed-cname">Customer name</label><input id="ed-cname" className="input" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Optional" /></div>
                  <Field label="Phone" required {...form.fieldProps('contactPhone')}><input className="input" type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} /></Field>
                </div>
                <Field label="Delivery address" required {...form.fieldProps('address')}><input className="input" value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
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

            {!isTab && <div className="form-grid">
              <Field label="Discount" {...form.fieldProps('discountValue')}>
                {(a) => (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input {...a} className={`input${a['aria-invalid'] ? ' input-err' : ''}`} type="number" min="0" step="0.01" inputMode="decimal" value={discValue} onChange={(e) => setDiscValue(e.target.value)} placeholder="0" />
                    <div className="seg" style={{ flexShrink: 0 }}>
                      <button type="button" className={discType === 'fixed' ? 'active' : ''} onClick={() => setDiscType('fixed')} aria-label="Fixed amount">$</button>
                      <button type="button" className={discType === 'percent' ? 'active' : ''} onClick={() => setDiscType('percent')} aria-label="Percent">%</button>
                    </div>
                  </div>
                )}
              </Field>
              {orderType === 'delivery' && (
                <Field label="Delivery fee" {...form.fieldProps('fee')}><input className="input" type="number" min="0" step="0.5" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0" /></Field>
              )}
            </div>}

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
            {totalProblem && <div className="field-err" role="alert">{totalProblem}</div>}
            <div className="note">Prices are re-checked against the current menu when you save.</div>
            {inv && (
              <div className={`note${belowPaid ? ' warn' : ''}`}>
                Invoice #{inv.id} will be updated to match. {money(paidOnInvoice)} is already paid on it{belowPaid ? ' — the new total can’t go below that. Void the order instead.' : '.'}
              </div>
            )}

            <Field label="Reason for the edit" required {...form.fieldProps('reason')}>
              <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer returned the fries" />
            </Field>
          </div>
          <div className="modal-f">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={save.isPending}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={save.isPending || !form.valid}>{save.isPending ? 'Saving…' : 'Save changes'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
