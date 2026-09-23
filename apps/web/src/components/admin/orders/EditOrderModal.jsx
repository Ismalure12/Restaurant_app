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
import { Modal, ModalSpacer, Button, Segmented, Select, Overline, inputCls, selectCls, textareaCls, cx } from '@/components/admin/ui';
import { Stepper } from './AddItemsModal';
import { money, whoOf } from './orderUi';

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

  const line = (l) => [l.optionName, l.extras.map((x) => x.name).join(', '), l.notes && `“${l.notes}”`].filter(Boolean).join(' · ');

  return (
    <Modal
      title={whoOf(order)}
      eyebrow={`Manager edit · ${order.code || `order #${order.id}`}`}
      icon="pen"
      width={640}
      onClose={onClose}
      busy={save.isPending}
      footer={(
        <>
          <ModalSpacer />
          <Button variant="secondary" size="lg" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button variant="primary" size="lg" type="submit" form="edit-order-form" disabled={save.isPending || !form.valid}>{save.isPending ? 'Saving…' : 'Save changes'}</Button>
        </>
      )}
    >
      <form id="edit-order-form" noValidate onSubmit={submit} className="flex flex-col gap-4">
        {!isTab && (
          <div className="flex flex-col gap-1.5">
            <Overline>Service</Overline>
            <Segmented
              label="Service"
              value={orderType}
              onChange={setOrderType}
              options={[{ value: 'dine_in', label: 'Dine-in' }, { value: 'delivery', label: 'Delivery' }]}
            />
          </div>
        )}

        {orderType === 'dine_in' ? (
          <div className="grid gap-3 tab:grid-cols-2">
            <Field label="Table">{(a) => <TablePicker {...a} value={tableNumber} onChange={setTableNumber} placeholder="Optional" />}</Field>
            <Field label="Note"><input className={inputCls({ size: 'lg' })} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></Field>
          </div>
        ) : (
          <>
            <div className="grid gap-3 tab:grid-cols-2">
              <Field label="Customer name"><input className={inputCls({ size: 'lg' })} value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Optional" /></Field>
              <Field label="Phone" required {...form.fieldProps('contactPhone')}><input className={inputCls({ size: 'lg' })} type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} /></Field>
            </div>
            <Field label="Delivery address" required {...form.fieldProps('address')}><input className={inputCls({ size: 'lg' })} value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
          </>
        )}

        <div className="flex flex-col gap-2">
          <Overline>Items</Overline>
          <div className="rounded-[10px] border border-mq-line">
            {lines.length === 0 ? (
              <p className="m-0 px-3.5 py-3 text-[13px] text-mq-muted">No items left. Add one below, or close this and void the order instead.</p>
            ) : lines.map((l) => (
              <div key={l.uid} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5 border-b border-mq-chip last:border-b-0">
                <div className="flex-1 min-w-[150px]">
                  <div className="text-sm font-medium text-mq-ink">{l.name}</div>
                  {line(l) && <div className="text-xs text-mq-muted">{line(l)}</div>}
                </div>
                <span className="font-mq-mono text-[13px] tabular-nums text-mq-ink">{money(l.unitPrice * l.quantity)}</span>
                <Stepper value={l.quantity} name={l.name} min={1} onStep={(d) => setQty(l.uid, d)} />
                <Button variant="danger-soft" size="xs" onClick={() => removeLine(l.uid)} aria-label={`Remove ${l.name}`}>Remove</Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Select size="lg" className="flex-1 min-w-0" value={adding.itemId} onChange={(e) => setAdding({ itemId: e.target.value, opts: {} })} aria-label="Add a menu item">
              <option value="">Add an item…</option>
              {activeMenu.map((m) => <option key={m.id} value={m.id}>{m.name} · {money(m.price)}</option>)}
            </Select>
            <Button variant="soft" size="lg" onClick={confirmAdd} disabled={!addItem}>Add</Button>
          </div>
          {addItem?.optionGroups?.length > 0 && (
            <div className="grid gap-3 tab:grid-cols-2">
              {addItem.optionGroups.map((g) => (
                <Field label={g.title} key={g.id}>
                  <select className={selectCls({ size: 'lg' })} value={adding.opts[g.id] ?? g.options?.[0]?.id ?? ''} onChange={(e) => setAdding((a) => ({ ...a, opts: { ...a.opts, [g.id]: e.target.value } }))}>
                    {(g.options || []).map((o) => <option key={o.id} value={o.id}>{o.name}{Number(o.priceAdd) > 0 ? ` +${money(o.priceAdd)}` : ''}</option>)}
                  </select>
                </Field>
              ))}
            </div>
          )}
        </div>

        {!isTab && (
          <div className="grid gap-3 tab:grid-cols-2">
            <Field label="Discount" {...form.fieldProps('discountValue')}>
              {(a) => (
                <div className="flex gap-2">
                  <input {...a} className={inputCls({ size: 'lg', mono: true, className: 'flex-1 min-w-0' })} type="number" min="0" step="0.01" inputMode="decimal" value={discValue} onChange={(e) => setDiscValue(e.target.value)} placeholder="0" />
                  <Segmented
                    label="Discount type"
                    value={discType}
                    onChange={setDiscType}
                    className="flex-none"
                    options={[{ value: 'fixed', label: '$' }, { value: 'percent', label: '%' }]}
                  />
                </div>
              )}
            </Field>
            {orderType === 'delivery' && (
              <Field label="Delivery fee" {...form.fieldProps('fee')}><input className={inputCls({ size: 'lg', mono: true })} type="number" min="0" step="0.5" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0" /></Field>
            )}
          </div>
        )}

        <dl className="m-0 flex flex-col gap-1.5 rounded-[10px] border border-mq-line bg-mq-cream px-3.5 py-3 text-[13.5px]">
          <Sum k="Subtotal" v={money(subCents / 100)} />
          {!preview.error && preview.discount > 0 && <Sum k="Discount" v={`−${money(preview.discount)}`} tone="text-mq-danger-ink" />}
          {!preview.error && preview.delivery > 0 && <Sum k="Delivery fee" v={money(preview.delivery)} />}
          <div className="flex items-baseline justify-between gap-3 border-t border-mq-line mt-1 pt-2 text-base font-semibold text-mq-ink">
            <dt>New total</dt><dd className="m-0 font-mq-mono tabular-nums">{preview.error ? '—' : money(newTotal)}</dd>
          </div>
          <Sum k="Was" v={money(prevTotal)} />
          {!preview.error && delta !== 0 && (
            <Sum
              k={delta < 0 ? (wasPaid ? 'Hand back to customer' : 'Reduction') : (wasPaid ? 'Collect from customer' : 'Increase')}
              v={`${delta < 0 ? '−' : '+'}${money(Math.abs(delta))}`}
              tone={delta < 0 ? 'text-mq-danger-ink' : 'text-mq-ok-ink'}
            />
          )}
        </dl>
        {totalProblem && <div className="text-xs font-medium text-mq-danger-ink" role="alert">{totalProblem}</div>}
        <p className="m-0 text-xs text-mq-muted">Prices are re-checked against the current menu when you save.</p>
        {inv && (
          <p className={cx('m-0 text-xs', belowPaid ? 'text-mq-warn-ink font-medium' : 'text-mq-muted')}>
            Invoice #{inv.id} will be updated to match. {money(paidOnInvoice)} is already paid on it{belowPaid ? ' — the new total can’t go below that. Void the order instead.' : '.'}
          </p>
        )}

        <Field label="Reason for the edit" required {...form.fieldProps('reason')}>
          <textarea className={textareaCls()} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer returned the fries" />
        </Field>
      </form>
    </Modal>
  );
}

function Sum({ k, v, tone = 'text-mq-ink' }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-mq-muted">{k}</dt>
      <dd className={cx('m-0 font-mq-mono tabular-nums', tone)}>{v}</dd>
    </div>
  );
}
