'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import { reportSaveError } from '@/lib/saveError';
import { useFormValidation } from '@/lib/formValidation';
import { invoicePaymentSchema } from '@/lib/schemas/sales';
import Field from '@/components/admin/Field';
import useConfirm from '@/hooks/useConfirm';
import ReceiptDoc from '@/components/admin/ReceiptDoc';
import { usePrintDoc } from '@/components/admin/printShared';
import { paymentOptions, findOption } from '@/components/admin/paymentOptions';
import { money } from '@/lib/money';
import {
  Page, Button, Card, CardHeader, Chip, ChoiceChip, Kpi, KpiGrid, KpiSkeletons, EmptyState, Icon,
  Table, Th, Td, Tr, RowSkeletons, inputCls,
} from '@/components/admin/ui';

const STATUS = {
  unpaid: ['danger', 'Unpaid'],
  partial: ['warn', 'Partially paid'],
  paid: ['ok', 'Paid'],
  void: ['off', 'Void'],
};
const METHOD_LABEL = { cash: 'Cash', card: 'Card', evc: 'EVC' };
const VOID_ROLES = ['admin', 'manager'];
const date = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// Customers › name › Invoice. Invoices live inside the customer's account.
function Crumb({ customer, label }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 flex-wrap text-[12.5px] text-mq-muted">
      <Link href="/admin/dashboard/customers" className="inline-flex items-center gap-1 font-semibold text-mq-cta hover:text-mq-primary">
        <Icon name="chevLeft" size={14} stroke={2.2} />Customers
      </Link>
      {customer?.id && (
        <>
          <span aria-hidden="true">/</span>
          <Link href={`/admin/dashboard/customers/${customer.id}`} className="font-semibold text-mq-cta hover:text-mq-primary">{customer.name}</Link>
        </>
      )}
      <span aria-hidden="true">/</span>
      <span className="text-mq-body">{label}</span>
    </nav>
  );
}

function TotalLine({ label, value, className = '', strong }) {
  return (
    <div className={`flex items-center justify-between gap-4 ${strong ? 'text-[15px] font-semibold text-mq-ink' : 'text-[13px] text-mq-body'}`}>
      <span>{label}</span>
      <span className={`font-mq-mono tabular-nums ${className}`}>{value}</span>
    </div>
  );
}

/**
 * One invoice, shown inside its customer's account
 * (/customers/[customerId]/invoices/[invoiceId]). Payments, void and print live here.
 */
export default function InvoiceDetailView({ invoiceId, customerId }) {
  const id = String(invoiceId);
  const qc = useQueryClient();
  const [printKind, printDoc] = usePrintDoc('invoice');
  const { confirm, dialog } = useConfirm();

  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [payNote, setPayNote] = useState('');
  const [me, setMe] = useState(null);

  useEffect(() => { fetch('/api/auth/me').then((r) => r.json()).then(setMe).catch(() => {}); }, []);

  const { data: invoice, isLoading, isError } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => fetchJson(`/api/admin/invoices/${id}`),
  });

  const refreshLists = () => {
    qc.invalidateQueries({ queryKey: ['invoices'] });
    qc.invalidateQueries({ queryKey: ['customers'] });
    qc.invalidateQueries({ queryKey: ['customer'] });
  };

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => fetchJson('/api/admin/settings'), staleTime: 5 * 60 * 1000 });
  // Same money chips as the Register, minus On account (this IS the account).
  const payChips = paymentOptions(settings?.moneyAccounts || [], { invoice: false });

  // Amount above zero (and not above what is owed) + an account chosen.
  const payForm = useFormValidation(invoicePaymentSchema, {
    amount: payAmount,
    accountChosen: Boolean(findOption(payChips, payMethod)?.accountId),
    balance: Number(invoice?.balance ?? 0),
  });

  const payMutation = useMutation({
    mutationFn: (payload) => fetchJson(`/api/admin/invoices/${id}/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
    onSuccess: (data) => {
      notify.success('Payment recorded', { title: 'Could not record the payment' });
      payForm.reset();
      setPayAmount(''); setPayNote('');
      // Merge the response straight into cache — a refetch can be superseded
      // by an in-flight request and leave the balance looking stale.
      qc.setQueryData(['invoice', id], (old) => old && ({
        ...old,
        status: data.invoice.status,
        amountPaid: data.invoice.amountPaid,
        balance: data.invoice.balance,
        payments: [{ ...data.payment, note: payNote.trim() || null, recordedBy: me?.name || me?.email || null, recordedByName: me?.name || null }, ...old.payments],
      }));
      refreshLists();
    },
    onError: (err) => {
      reportSaveError(err, { form: payForm, title: 'Could not record the payment' });
    },
  });

  const voidMutation = useMutation({
    mutationFn: () => fetchJson(`/api/admin/invoices/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'void' }) }),
    onSuccess: (data) => { notify.success('Invoice voided'); qc.setQueryData(['invoice', id], data); refreshLists(); },
    onError: (err) => notify.error(err, { title: 'Could not void the invoice' }),
  });

  const handlePay = (e) => {
    e.preventDefault();
    if (!payForm.check() || payMutation.isPending) return;
    payForm.setServerErrors(null);
    // payMethod holds a chip key: cash, card, or acct:<id> — the business account the money went into.
    const opt = findOption(payChips, payMethod);
    payMutation.mutate({ amount: Number(payAmount), accountId: opt.accountId, note: payNote.trim() || null });
  };

  const handleVoid = async () => {
    const ok = await confirm({ title: 'Void this invoice?', body: 'The customer will no longer owe this balance. This cannot be undone.', confirmLabel: 'Void invoice' });
    if (ok) voidMutation.mutate();
  };

  // An invoice opened under the wrong customer is treated as not found, so a
  // hand-edited URL can't show one account's bill inside another's.
  const mismatch = invoice && customerId != null && String(invoice.customer?.id) !== String(customerId);

  if (isLoading) {
    return (
      <Page narrow>
        <Crumb label="Loading…" />
        <KpiSkeletons count={4} min={180} />
        <Card><RowSkeletons rows={5} /></Card>
      </Page>
    );
  }
  if (isError || !invoice || mismatch) {
    return (
      <Page narrow>
        <Crumb label="Not found" />
        <Card>
          <EmptyState
            icon="invoice"
            title="Invoice not found"
            action={<Button variant="soft" size="sm" href="/admin/dashboard/customers">Back to customers</Button>}
          >
            It may have been removed, or it belongs to a different customer.
          </EmptyState>
        </Card>
      </Page>
    );
  }

  const [tone, label] = STATUS[invoice.status] || STATUS.unpaid;
  const overdue = invoice.status !== 'void' && invoice.status !== 'paid' && invoice.dueDate && new Date(invoice.dueDate) < new Date();
  const canVoid = VOID_ROLES.includes(me?.role);
  const canPay = invoice.status !== 'void' && invoice.status !== 'paid';
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const balance = Number(invoice.balance);
  const owing = balance > 0 && invoice.status !== 'void';

  return (
    <Page narrow>
      {dialog}
      <ReceiptDoc kind={printKind} invoice={invoice} />
      <Crumb customer={invoice.customer} label={`Invoice #${invoice.id}`} />

      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-[220px] flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[.1em] text-mq-muted">Invoice <span className="font-mq-mono">#{invoice.id}</span> · billed to</span>
          <h1 className="m-0 text-xl font-semibold tracking-[-.02em] text-mq-ink">{invoice.customer?.name}</h1>
          <div className="text-[13px] text-mq-muted">
            <span className="font-mq-mono">{invoice.customer?.phone}</span>{invoice.customer?.address ? ` · ${invoice.customer.address}` : ''}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
            <Chip tone={tone}>{label}</Chip>
            {overdue && <Chip tone="danger">Overdue</Chip>}
            {invoice.order?.code && (
              <Link href={`/admin/dashboard/orders/${invoice.order.id}`} className="inline-flex items-center rounded-full border border-mq-line bg-white px-2.5 py-[3px] text-xs font-semibold text-mq-cta hover:bg-mq-canvas">
                Order <span className="font-mq-mono ml-1">{invoice.order.code}</span>
              </Link>
            )}
            {invoice.tableNumber && <Chip tone="plain" dot={false}>Table {invoice.tableNumber}</Chip>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canVoid && invoice.status !== 'void' && (
            <Button variant="danger-soft" onClick={handleVoid} disabled={voidMutation.isPending}>{voidMutation.isPending ? 'Voiding…' : 'Void invoice'}</Button>
          )}
          <Button variant="primary" icon="print" onClick={() => printDoc('invoice')}>Print invoice</Button>
        </div>
      </div>

      <KpiGrid min={170}>
        <Kpi label="Total" value={money(invoice.total)} foot={`${items.length} ${items.length === 1 ? 'line' : 'lines'}`} />
        <Kpi label="Paid" value={<span className="text-mq-ok-ink">{money(invoice.amountPaid)}</span>} foot={`${invoice.payments.length} ${invoice.payments.length === 1 ? 'payment' : 'payments'}`} />
        <Kpi label="Balance due" value={<span className={owing ? 'text-mq-danger-ink' : undefined}>{money(balance)}</span>} foot={invoice.status === 'void' ? 'invoice is void' : owing ? 'still owed' : 'settled'} />
        <Kpi
          label="Due date"
          value={<span className={overdue ? 'text-mq-danger-ink' : undefined}>{invoice.dueDate ? date(invoice.dueDate) : 'On receipt'}</span>}
          foot={overdue ? 'past due' : invoice.createdAt ? `issued ${date(invoice.createdAt)}` : undefined}
        />
      </KpiGrid>

      <Card className="overflow-hidden">
        <CardHeader title="Line items" count={items.length} />
        <Table minW={520} label="Line items">
          <thead><tr><Th>Description</Th><Th align="right">Qty</Th><Th align="right">Unit price</Th><Th align="right">Amount</Th></tr></thead>
          <tbody>
            {items.map((l, i) => (
              <Tr key={i}>
                <Td strong>{l.description || l.name}{l.optionName ? <div className="text-xs font-normal text-mq-muted">{l.optionName}</div> : null}</Td>
                <Td money className="!font-normal">{l.quantity}</Td>
                <Td money className="!font-normal">{money(l.unitPrice)}</Td>
                <Td money>{money((l.quantity || 0) * (l.unitPrice || 0))}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        <div className="flex flex-col gap-2 px-4 py-3.5 bg-mq-cream border-t border-mq-line tab:ml-auto tab:w-[360px] tab:border-l tab:rounded-bl-xl">
          <TotalLine label="Subtotal" value={money(invoice.subtotal)} />
          {Number(invoice.discount) > 0 && <TotalLine label="Discount" value={`−${money(invoice.discount)}`} className="text-mq-danger-ink" />}
          <TotalLine label="Total" value={money(invoice.total)} strong />
          <TotalLine label="Paid to date" value={money(invoice.amountPaid)} className="text-mq-ok-ink" />
          <TotalLine label="Balance due" value={money(balance)} className={balance > 0 ? 'text-mq-danger-ink font-semibold' : ''} />
        </div>
        {invoice.note && <div className="px-4 py-3 border-t border-mq-line text-[12.5px] text-mq-muted">Note: {invoice.note}</div>}
      </Card>

      <div className="grid gap-4 grid-cols-1 nar:grid-cols-2 items-start">
        <Card className="overflow-hidden">
          <CardHeader title="Payment history" count={invoice.payments.length} />
          {invoice.payments.length === 0 ? (
            <EmptyState icon="cash" title="No payments yet">Payments recorded here reduce what the customer owes.</EmptyState>
          ) : (
            <ul className="m-0 p-0 list-none">
              {invoice.payments.map((p) => (
                <li key={p.id} className="flex items-start gap-3 px-4 py-3 border-b border-mq-chip last:border-b-0">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-mq-ok flex-none" aria-hidden="true" />
                  <span className="flex-1 min-w-0 text-[13px]">
                    <span className="font-semibold text-mq-ink">{p.account || METHOD_LABEL[p.method] || p.method}</span>
                    {p.recordedBy ? <span className="text-mq-muted"> · {p.recordedBy}</span> : null}
                    {p.note ? <div className="text-xs text-mq-muted">{p.note}</div> : null}
                  </span>
                  <span className="flex flex-col items-end gap-0.5 flex-none">
                    <span className="font-mq-mono text-[13.5px] font-medium text-mq-ink tabular-nums">{money(p.amount)}</span>
                    <span className="font-mq-mono text-[11.5px] text-mq-muted">{date(p.paidAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="Record a payment" />
          <div className="p-4">
            {canPay ? (
              <form noValidate onSubmit={handlePay} className="flex flex-col gap-3.5">
                <Field label={`Amount · balance ${money(balance)}`} required {...payForm.fieldProps('amount')}>
                  {(a) => (
                    <div className="flex gap-2">
                      <input {...a} className={inputCls({ size: 'lg', mono: true, className: a['aria-invalid'] ? '!border-mq-danger' : '' })} type="number" min="0" step="0.01" inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="0.00" />
                      <Button variant="soft" size="lg" onClick={() => setPayAmount(balance.toFixed(2))}>Full</Button>
                    </div>
                  )}
                </Field>
                <Field label="Paid into" required {...payForm.fieldProps('accountChosen')}>
                  {() => (
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Paid into">
                      {payChips.map((o) => (
                        <ChoiceChip key={o.key} active={payMethod === o.key} onClick={() => setPayMethod(o.key)} title={o.hint || undefined}>{o.label}</ChoiceChip>
                      ))}
                    </div>
                  )}
                </Field>
                <Field label="Note (optional)">
                  <input className={inputCls({ size: 'lg' })} value={payNote} onChange={(e) => setPayNote(e.target.value)} />
                </Field>
                <Button variant="primary" size="xl" type="submit" block disabled={payMutation.isPending || !payForm.valid}>
                  {payMutation.isPending ? 'Recording…' : Number(payAmount) > 0 ? `Record ${money(Number(payAmount))}` : 'Record payment'}
                </Button>
              </form>
            ) : (
              <p className="m-0 text-[13px] text-mq-muted">{invoice.status === 'paid' ? 'This invoice is fully paid.' : 'This invoice is void. No more payments can be recorded.'}</p>
            )}
          </div>
        </Card>
      </div>
    </Page>
  );
}
