'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { reportSaveError } from '@/lib/saveError';
import { useFormValidation } from '@/lib/formValidation';
import { voidOrderSchema } from '@/lib/schemas/sales';
import Field from '@/components/admin/Field';
import { Ic, money, whoOf } from './orderUi';

// Void / refund a whole order (manager). Void vs refund is decided server-side.
export default function VoidOrderModal({ order, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const form = useFormValidation(voidOrderSchema, { reason });
  const wasPaid = order.paymentStatus === 'paid';
  const inv = order.invoice && order.invoice.status !== 'void' ? order.invoice : null;

  const voidIt = useMutation({
    mutationFn: () => fetchJson(`/api/admin/orders/${order.id}/void`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.trim() }) }),
    onSuccess: onDone,
    onError: (e) => {
      reportSaveError(e, { form, title: 'Could not void the order' });
    },
  });

  const submit = (e) => {
    e.preventDefault();
    if (!form.check() || voidIt.isPending) return;
    form.setServerErrors(null);
    voidIt.mutate();
  };

  return (
    <div className="jz-modal-bk open" onClick={(e) => { if (e.target === e.currentTarget && !voidIt.isPending) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Void order #${order.id}`}>
        <div className="modal-h">
          <div className="mt"><div className="eyebrow">Void {order.code || `order #${order.id}`}</div><div className="h-1" style={{ marginTop: 3 }}>{whoOf(order)}</div></div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">{Ic.x}</button>
        </div>
        <form noValidate onSubmit={submit} style={{ display: 'contents' }}>
          <div className="modal-b">
            <div className="od-tot boxed">
              <div className="r t" style={{ borderTop: 'none', marginTop: 0, paddingTop: 0 }}><span>Order total</span><span className="mono">{money(order.total)}</span></div>
              {wasPaid && <div className="r"><span>Refund owed to customer</span><span className="mono rose">{money(order.total)}</span></div>}
              {inv && <div className="r"><span>Invoice #{inv.id} will be voided</span><span className="mono">{money(inv.balance)} cleared</span></div>}
              {inv && Number(inv.amountPaid) > 0 && <div className="r"><span>Already paid on the invoice</span><span className="mono rose">{money(inv.amountPaid)}</span></div>}
            </div>
            <div className="note">The order stays on record marked as voided and drops out of revenue reports. Any refund is handed back at the counter. This can&rsquo;t be undone.</div>
            <Field label="Reason" required {...form.fieldProps('reason')}>
              <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer rejected the order" autoFocus />
            </Field>
          </div>
          <div className="modal-f">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={voidIt.isPending}>Cancel</button>
            <button type="submit" className="btn btn-danger" disabled={voidIt.isPending || !form.valid}>{voidIt.isPending ? 'Voiding…' : 'Void order'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
