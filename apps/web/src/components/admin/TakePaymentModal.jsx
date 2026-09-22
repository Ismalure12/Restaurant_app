'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import { useFormValidation } from '@/lib/formValidation';
import { takePaymentSchema } from '@/lib/schemas/sales';
import Field from '@/components/admin/Field';
import CustomerPicker from '@/components/admin/CustomerPicker';
import PaymentFields, { usePayment, paymentBody, paymentProblem, collectorChoices } from './PaymentFields';
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
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => fetchJson('/api/admin/settings'), staleTime: 5 * 60 * 1000 });
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => fetchJson('/api/auth/me'), staleTime: 5 * 60 * 1000 });
  const { data: waiters = [] } = useQuery({ queryKey: ['pos-waiters'], queryFn: () => fetchJson('/api/admin/waiters?active=1') });
  const pay = usePayment(settings?.moneyAccounts);
  const [discount, setDiscount] = useState({ type: 'percent', value: '' });
  const [invoiceCustomer, setInvoiceCustomer] = useState({ customerId: null, customer: null });
  const [busy, setBusy] = useState(false);

  const opt = pay.opt;
  const items = Array.isArray(tab.items) ? tab.items : [];
  const subtotal = items.reduce((s, l) => s + Number(l.unitPrice) * Number(l.quantity), 0);
  const dv = Number(discount.value);
  const discountAmount = dv > 0 ? Math.min(discount.type === 'percent' ? (subtotal * dv) / 100 : dv, subtotal) : 0;
  const total = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);
  const problem = paymentProblem(pay, total);
  const tableWaiter = waiters.find((w) => w.id === tab.waiterId);
  const { collectors, defaultCollector } = collectorChoices(me, waiters, tableWaiter);

  const form = useFormValidation(takePaymentSchema, {
    isInvoice: opt.method === 'invoice',
    invoiceCustomerId: invoiceCustomer.customerId ?? null,
    payProblem: problem,
    discountType: discount.type,
    discountValue: discount.value,
  });

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
          invoiceCustomerId: opt.method === 'invoice' ? invoiceCustomer.customerId : null,
        }),
      });
      onPaid({ ...d.order, invoiceId: d.invoiceId ?? d.order.invoice?.id ?? null });
    } catch (err) {
      notify.error(err, { title: 'Could not take the payment' });
    } finally { setBusy(false); }
  };

  return (
    <div className="jz-modal-bk open" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <form className="modal" noValidate onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="pay-title">
        <div className="modal-h">
          <div className="mt">
            <div className="eyebrow">{tab.code}{tab.tableNumber ? ` · Table ${tab.tableNumber}` : ''}</div>
            <div className="h-1" id="pay-title" style={{ marginTop: 3 }}>Take payment</div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} disabled={busy} aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
        </div>
        <div className="modal-b">
          <Field {...form.fieldProps('discountValue')} className="g3-disc">
            {(a) => (
            <div className="disc-row">
              <input {...a} className={`input${a['aria-invalid'] ? ' input-err' : ''}`} type="number" min="0" inputMode="decimal" value={discount.value} onChange={(e) => setDiscount((x) => ({ ...x, value: e.target.value }))} placeholder="Discount (optional)" aria-label="Discount" />
              <div className="seg" style={{ flexShrink: 0 }}>
                <button type="button" className={discount.type === 'percent' ? 'active' : ''} onClick={() => setDiscount((x) => ({ ...x, type: 'percent' }))}>%</button>
                <button type="button" className={discount.type === 'fixed' ? 'active' : ''} onClick={() => setDiscount((x) => ({ ...x, type: 'fixed' }))}>$</button>
              </div>
            </div>
            )}
          </Field>
          {discountAmount > 0 && (
            <>
              <div className="tf-row"><span>Subtotal</span><span className="v">{money(subtotal)}</span></div>
              <div className="tf-row"><span>Discount</span><span className="v" style={{ color: 'var(--rose)' }}>−{money(discountAmount)}</span></div>
            </>
          )}
          <div className="tf-row total"><span>Total</span><span className="v">{money(total)}</span></div>

          <PaymentFields
            pay={pay}
            total={total}
            accounts={settings?.moneyAccounts}
            label="Paid with"
            collectors={collectors}
            defaultCollector={defaultCollector}
            disabled={busy}
          />
          {opt.method === 'invoice' && (
            <div className="ticket-sec">
              <div className="note">Bill this customer instead of collecting payment now.</div>
              <Field {...form.fieldProps('invoiceCustomer')}>
                <CustomerPicker customerId={invoiceCustomer.customerId} customer={invoiceCustomer.customer} onChange={setInvoiceCustomer} disabled={busy} />
              </Field>
            </div>
          )}
        </div>
        <div className="modal-f">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !form.valid}>
            {busy ? 'Saving…' : opt.method === 'invoice' ? `Bill ${money(total)} & print` : `Paid ${money(total)} · print receipt`}
          </button>
        </div>
      </form>
    </div>
  );
}
