'use client';

import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import { useFormValidation } from '@/lib/formValidation';
import { takePaymentSchema } from '@/lib/schemas/sales';
import Field from '@/components/admin/Field';
import CustomerPicker from '@/components/admin/CustomerPicker';
import { Modal, ModalSpacer, Button } from '@/components/admin/ui';
import PaymentFields, { usePayment, paymentBody, paymentProblem } from './PaymentFields';
import { DiscountRow, TotalsBlock } from './RegisterTotals';
import { money } from '@/lib/money';


/**
 * Settle an open dine-in tab: discount, how it was paid (Cash, a business
 * wallet, the card, split), who took the money (the table's waiter by
 * default), cash tendered, or bill it On account. The server recomputes the
 * total from the tab's stored lines — the figures here are a preview.
 *
 * onPaid(order) receives the closed order (with its receipt #).
 */
export default function TakePaymentModal({ tab, onClose, onPaid }) {
  const formId = useId();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => fetchJson('/api/admin/settings'), staleTime: 5 * 60 * 1000 });
  const pay = usePayment(settings?.moneyAccounts);
  const [discount, setDiscount] = useState({ type: 'fixed', value: '' });
  const [invoiceCustomer, setInvoiceCustomer] = useState({ customerId: null, customer: null });
  const [busy, setBusy] = useState(false);

  const opt = pay.opt;
  const items = Array.isArray(tab.items) ? tab.items : [];
  const subtotal = items.reduce((s, l) => s + Number(l.unitPrice) * Number(l.quantity), 0);
  const dv = Number(discount.value);
  const discountAmount = dv > 0 ? Math.min(discount.type === 'percent' ? (subtotal * dv) / 100 : dv, subtotal) : 0;
  const total = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);
  const problem = paymentProblem(pay, total);
  const isInvoice = opt.method === 'invoice';

  const form = useFormValidation(takePaymentSchema, {
    isInvoice,
    invoiceCustomerId: invoiceCustomer.customerId ?? null,
    payProblem: problem,
    discountType: discount.type,
    discountValue: discount.value,
  });
  const firstIssue = Object.values(form.errors)[0];

  const submit = async (e) => {
    e?.preventDefault();
    if (!form.check() || busy) return;
    setBusy(true);
    try {
      const d = await fetchJson(`/api/admin/orders/${tab.id}/pay`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...paymentBody(pay),
          discountType: dv > 0 ? discount.type : null,
          discountValue: dv > 0 ? dv : null,
          invoiceCustomerId: isInvoice ? invoiceCustomer.customerId : null,
        }),
      });
      onPaid({ ...d.order, invoiceId: d.invoiceId ?? d.order.invoice?.id ?? null });
    } catch (err) {
      notify.error(err, { title: 'Could not take the payment' });
    } finally { setBusy(false); }
  };

  return (
    <Modal
      eyebrow={`${tab.code}${tab.tableNumber ? ` · Table ${tab.tableNumber}` : ''}`}
      title="Take payment"
      icon="cash"
      onClose={onClose}
      busy={busy}
      width={500}
      footer={(
        <>
          {!form.valid && !busy && firstIssue && <span className="text-xs text-mq-muted min-w-0" role="status">{firstIssue}</span>}
          <ModalSpacer />
          <Button size="lg" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button size="lg" variant="primary" type="submit" form={formId} disabled={busy || !form.valid}>
            {busy ? 'Saving…' : isInvoice ? `Bill ${money(total)} & print` : `Paid ${money(total)} · print receipt`}
          </Button>
        </>
      )}
    >
      {/* data-autofocus: the dialog focuses the form, not the discount box (no keyboard popping up on a tablet). */}
      <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-3.5 outline-none" data-autofocus tabIndex={-1}>
        <Field {...form.fieldProps('discountValue')}>
          {(a) => <DiscountRow a11y={a} discount={discount} setDiscount={setDiscount} disabled={busy} />}
        </Field>
        <TotalsBlock
          rows={discountAmount > 0 ? [['Subtotal', money(subtotal)], ['Discount', `−${money(discountAmount)}`]] : []}
          total={total}
        />

        <PaymentFields
          pay={pay}
          total={total}
          label="Paid with"
          disabled={busy}
        />
        {isInvoice && (
          <div className="flex flex-col gap-2">
            <p className="m-0 text-[12.5px] text-mq-muted">Bill this customer instead of collecting payment now.</p>
            <Field label="Customer" required {...form.fieldProps('invoiceCustomer')}>
              <CustomerPicker customerId={invoiceCustomer.customerId} customer={invoiceCustomer.customer} onChange={setInvoiceCustomer} disabled={busy} />
            </Field>
          </div>
        )}
      </form>
    </Modal>
  );
}
