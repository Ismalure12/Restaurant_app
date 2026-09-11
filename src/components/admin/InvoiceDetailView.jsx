'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchJson, parseApiError } from '@/lib/apiError';
import useConfirm from '@/hooks/useConfirm';
import { RowsSkeleton } from '@/components/admin/Skeletons';
import InvoiceDoc from '@/components/admin/InvoiceDoc';

const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const shortRef = (ref) => (ref && ref.length > 10 ? `…${ref.slice(-8)}` : ref);
const STATUS_PILL = {
  unpaid: { cls: 'pill-rose', label: 'Unpaid' },
  partial: { cls: 'pill-amber', label: 'Partially paid' },
  paid: { cls: 'pill-green', label: 'Paid' },
  void: { cls: 'pill-ghost', label: 'Void' },
};
const METHOD_LABEL = { cash: 'Cash', card: 'Card', evc: 'EVC' };
const VOID_ROLES = ['admin', 'manager'];
const Arrow = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>;

// The breadcrumb follows how the user got here: from a customer's account it
// reads Customers › name › Invoice, from the Invoicing worklist it reads
// Invoicing › name › Invoice. The customer segment always opens the account.
function Crumb({ from, customer, label }) {
  const root = from === 'invoicing'
    ? { href: '/admin/dashboard/invoices', label: 'Invoicing' }
    : { href: '/admin/dashboard/customers', label: 'Customers' };
  return (
    <nav className="adm-crumb">
      <Link href={root.href}>{Arrow}{root.label}</Link>
      {customer?.id && (
        <>
          <span className="sep">/</span>
          <Link href={`/admin/dashboard/customers/${customer.id}`}>{customer.name}</Link>
        </>
      )}
      <span className="sep">/</span>
      <span>{label}</span>
    </nav>
  );
}

/**
 * One invoice, shown inside its customer's account
 * (/customers/[customerId]/invoices/[invoiceId]). Payments, void and print live here.
 */
export default function InvoiceDetailView({ invoiceId, customerId, from }) {
  const id = String(invoiceId);
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();

  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [payNote, setPayNote] = useState('');
  const [payError, setPayError] = useState('');
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

  const payMutation = useMutation({
    mutationFn: (payload) => fetchJson(`/api/admin/invoices/${id}/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
    onSuccess: (data) => {
      toast.success('Payment recorded');
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
    onError: (err) => setPayError(parseApiError(err)),
  });

  const voidMutation = useMutation({
    mutationFn: () => fetchJson(`/api/admin/invoices/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'void' }) }),
    onSuccess: (data) => { toast.success('Invoice voided'); qc.setQueryData(['invoice', id], data); refreshLists(); },
    onError: (err) => toast.error(parseApiError(err)),
  });

  const handlePay = (e) => {
    e.preventDefault(); setPayError('');
    const amt = Number(payAmount);
    if (!(amt > 0)) { setPayError('Enter a valid amount'); return; }
    payMutation.mutate({ amount: amt, method: payMethod, note: payNote.trim() || null });
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
      <div className="wrap-narrow">
        <Crumb from={from} label="Loading…" />
        <div className="sk" style={{ height: 58, marginBottom: 16 }} />
        <div className="card card-pad"><RowsSkeleton rows={5} /></div>
      </div>
    );
  }
  if (isError || !invoice || mismatch) {
    return (
      <div className="wrap-narrow">
        <Crumb from={from} label="Not found" />
        <div className="card card-pad-lg">
          <div className="empty">
            <div className="empty-ring"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg></div>
            <p className="empty-title">Invoice not found</p>
            <p className="empty-sub">It may have been removed, or it belongs to a different customer.</p>
          </div>
        </div>
      </div>
    );
  }

  const st = STATUS_PILL[invoice.status] || STATUS_PILL.unpaid;
  const overdue = invoice.status !== 'void' && invoice.status !== 'paid' && invoice.dueDate && new Date(invoice.dueDate) < new Date();
  const canVoid = VOID_ROLES.includes(me?.role);
  const canPay = invoice.status !== 'void' && invoice.status !== 'paid';
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const balance = Number(invoice.balance);

  return (
    <div className="wrap-narrow">
      {dialog}
      <InvoiceDoc invoice={invoice} />
      <Crumb from={from} customer={invoice.customer} label={`Invoice #${invoice.id}`} />

      <div className="detail-h">
        <div>
          <div className="eyebrow">Invoice #{invoice.id} · billed to</div>
          <div className="h-1">{invoice.customer?.name}</div>
          <div className="sub">
            <span className="mono">{invoice.customer?.phone}</span>{invoice.customer?.address ? ` · ${invoice.customer.address}` : ''}
          </div>
          <div className="od-tags">
            <span className={`pill ${st.cls}`}><span className="pdot" />{st.label}</span>
            {overdue && <span className="pill pill-rose">Overdue</span>}
            {invoice.order?.reference && <span className="pill pill-ghost" title={invoice.order.reference}>Order {shortRef(invoice.order.reference)}</span>}
            {invoice.tableNumber && <span className="pill pill-ghost">Table {invoice.tableNumber}</span>}
          </div>
        </div>
        <div className="acts">
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" /></svg>Print invoice
          </button>
        </div>
      </div>

      <div className="od-cards reveal" style={{ margin: '0 0 16px' }}>
        <div className="od-card"><div className="l">Total</div><div className="v mono">{money(invoice.total)}</div></div>
        <div className="od-card"><div className="l">Paid</div><div className="v mono" style={{ color: 'var(--pos)' }}>{money(invoice.amountPaid)}</div></div>
        <div className="od-card"><div className="l">Balance due</div><div className="v mono" style={{ color: balance > 0 && invoice.status !== 'void' ? 'var(--rose)' : undefined }}>{money(balance)}</div></div>
        <div className="od-card"><div className="l">Due date</div><div className="v" style={{ color: overdue ? 'var(--rose)' : undefined }}>{invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'On receipt'}</div></div>
      </div>

      <div className="od-items reveal" style={{ marginBottom: 16, animationDelay: '.06s' }}>
        <div className="card-h"><div><div className="ttl">Line items</div><div className="note">{items.length} {items.length === 1 ? 'line' : 'lines'}</div></div></div>
        <div className="table-wrap">
          <table className="table" style={{ marginTop: 12 }}>
            <thead><tr><th>Description</th><th className="num">Qty</th><th className="num">Unit price</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {items.map((l, i) => (
                <tr key={i}>
                  <td className="strong">{l.description || l.name}{l.optionName ? <div className="note">{l.optionName}</div> : null}</td>
                  <td className="num">{l.quantity}</td>
                  <td className="num">{money(l.unitPrice)}</td>
                  <td className="num">{money((l.quantity || 0) * (l.unitPrice || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="od-tot">
          <div className="r"><span>Subtotal</span><span className="mono">{money(invoice.subtotal)}</span></div>
          {Number(invoice.discount) > 0 && <div className="r"><span>Discount</span><span className="mono rose">−{money(invoice.discount)}</span></div>}
          <div className="r t"><span>Total</span><span className="mono">{money(invoice.total)}</span></div>
          <div className="r"><span>Paid to date</span><span className="mono green">{money(invoice.amountPaid)}</span></div>
          <div className="r"><span>Balance due</span><span className={`mono${balance > 0 ? ' rose' : ''}`}>{money(balance)}</span></div>
        </div>
        {invoice.note && <div className="note" style={{ padding: '12px 18px', borderTop: '1px solid var(--line-2)' }}>Note: {invoice.note}</div>}
      </div>

      <div className="grid2 reveal" style={{ animationDelay: '.1s' }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-h"><div><div className="ttl">Payment history</div><div className="note">{invoice.payments.length} recorded</div></div></div>
          <div className="card-pad">
            {invoice.payments.length === 0 ? (
              <p className="sub">No payments recorded yet.</p>
            ) : invoice.payments.map((p) => (
              <div className="mv-item" key={p.id}>
                <span className="mdot" style={{ background: 'var(--primary)' }} />
                <span className="mv-main">
                  <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{METHOD_LABEL[p.method] || p.method}</span>
                  {p.recordedBy ? <span className="note"> · {p.recordedBy}</span> : null}
                  {p.note ? <div className="note">{p.note}</div> : null}
                </span>
                <span className="mv-amt">{money(p.amount)}</span>
                <span className="mv-when">{new Date(p.paidAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card card-pad">
          <div className="pad-h"><div><div className="eyebrow">Collect</div><div className="h-2">Record a payment</div></div></div>
          {canPay ? (
            <form onSubmit={handlePay}>
              <div className="field-l" style={{ marginTop: 0 }}>Amount · balance {money(balance)}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input" type="number" min="0" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="0.00" aria-label="Payment amount" />
                <button type="button" className="btn btn-soft" onClick={() => setPayAmount(balance.toFixed(2))}>Full</button>
              </div>
              <div className="field-l">Method</div>
              <div className="chips">
                {['cash', 'card', 'evc'].map((m) => (
                  <button key={m} type="button" className={`chip2${payMethod === m ? ' on' : ''}`} onClick={() => setPayMethod(m)}>{METHOD_LABEL[m]}</button>
                ))}
              </div>
              <div className="field-l">Note (optional)</div>
              <input className="input" value={payNote} onChange={(e) => setPayNote(e.target.value)} aria-label="Payment note" />
              {payError && <div className="adm-error-banner" style={{ marginTop: 10 }}>{payError}</div>}
              <button className="btn btn-primary btn-block" type="submit" style={{ marginTop: 14 }} disabled={payMutation.isPending}>{payMutation.isPending ? 'Recording…' : 'Record payment'}</button>
            </form>
          ) : (
            <p className="sub">{invoice.status === 'paid' ? 'This invoice is fully paid.' : 'This invoice is void. No more payments can be recorded.'}</p>
          )}

          {canVoid && invoice.status !== 'void' && (
            <button className="btn btn-danger btn-block" style={{ marginTop: 12 }} onClick={handleVoid} disabled={voidMutation.isPending}>
              {voidMutation.isPending ? 'Voiding…' : 'Void invoice'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
