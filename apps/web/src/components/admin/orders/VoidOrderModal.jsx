'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { reportSaveError } from '@/lib/saveError';
import { useFormValidation } from '@/lib/formValidation';
import { voidOrderSchema } from '@/lib/schemas/sales';
import Field from '@/components/admin/Field';
import { Modal, ModalSpacer, Button, ChoiceChip, textareaCls } from '@/components/admin/ui';
import { money, whoOf } from './orderUi';

// Preset reasons fill the (required) free-text reason — the server validates it.
const PRESETS = ['Wrong item rung up', 'Customer cancelled', 'Duplicate order'];

/** Void / refund a whole order (manager). Void vs refund is decided server-side. */
export default function VoidOrderModal({ order, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const form = useFormValidation(voidOrderSchema, { reason });
  const wasPaid = order.paymentStatus === 'paid';
  const inv = order.invoice && order.invoice.status !== 'void' ? order.invoice : null;
  const total = money(order.total);
  const name = order.receiptNo ? `receipt ${order.receiptNo}` : (order.code || `order #${order.id}`);

  const voidIt = useMutation({
    mutationFn: () => fetchJson(`/api/admin/orders/${order.id}/void`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.trim() }) }),
    onSuccess: onDone,
    onError: (e) => reportSaveError(e, { form, title: 'Could not void the order' }),
  });

  const submit = (e) => {
    e?.preventDefault();
    if (!form.check() || voidIt.isPending) return;
    form.setServerErrors(null);
    voidIt.mutate();
  };

  const sub = order.status === 'open'
    ? `This cancels the unpaid ${total} tab for ${whoOf(order)} and is written to the audit log. It can’t be undone.`
    : wasPaid
      ? `This reverses ${total} from the takings (on the day you void it) and is written to the audit log. It can’t be undone.`
      : `This cancels ${total} for ${whoOf(order)} and is written to the audit log. It can’t be undone.`;

  return (
    <Modal
      title={`Void ${name}?`}
      eyebrow={order.code}
      sub={sub}
      icon="trash"
      tone="danger"
      width={480}
      onClose={onClose}
      busy={voidIt.isPending}
      footer={(
        <>
          <ModalSpacer />
          <Button variant="secondary" size="lg" onClick={onClose} disabled={voidIt.isPending}>Keep order</Button>
          <Button variant="danger" size="lg" type="submit" form="void-order-form" disabled={voidIt.isPending || !form.valid}>
            {voidIt.isPending ? 'Voiding…' : `Void ${total}`}
          </Button>
        </>
      )}
    >
      <form id="void-order-form" noValidate onSubmit={submit} className="flex flex-col gap-3.5">
        {(wasPaid || inv) && (
          <dl className="m-0 flex flex-col gap-1.5 rounded-[10px] border border-mq-line bg-mq-cream px-3.5 py-3 text-[13px]">
            {wasPaid && <Row k="Refund owed to the customer" v={total} danger />}
            {inv && <Row k={`Invoice #${inv.id} will be voided`} v={`${money(inv.balance)} cleared`} />}
            {inv && Number(inv.amountPaid) > 0 && <Row k="Already paid on the invoice" v={money(inv.amountPaid)} danger />}
          </dl>
        )}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Common reasons">
          {PRESETS.map((p) => (
            <ChoiceChip key={p} size="sm" active={reason.trim() === p} onClick={() => setReason(p)}>{p}</ChoiceChip>
          ))}
        </div>
        <Field label="Reason" required {...form.fieldProps('reason')}>
          <textarea className={textareaCls()} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer rejected the order" />
        </Field>
        <p className="m-0 text-xs text-mq-muted leading-normal">The order stays on record as voided and drops out of the sales figures. Any refund is handed back at the counter.</p>
      </form>
    </Modal>
  );
}

function Row({ k, v, danger }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-mq-muted">{k}</dt>
      <dd className={`m-0 font-mq-mono tabular-nums whitespace-nowrap ${danger ? 'text-mq-danger-ink' : 'text-mq-ink'}`}>{v}</dd>
    </div>
  );
}
