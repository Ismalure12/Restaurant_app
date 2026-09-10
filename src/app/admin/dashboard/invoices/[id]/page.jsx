'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchJson, parseApiError } from '@/lib/apiError';
import useConfirm from '@/hooks/useConfirm';

const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const STATUS_PILL = {
  unpaid: { cls: 'pill-rose', label: 'Unpaid' },
  partial: { cls: 'pill-amber', label: 'Partial' },
  paid: { cls: 'pill-green', label: 'Paid' },
  void: { cls: 'pill-ghost', label: 'Void' },
};
const METHOD_LABEL = { cash: 'Cash', card: 'Card', evc: 'EVC' };

export default function InvoiceDetailPage() {
  const { id } = useParams();
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

  const payMutation = useMutation({
    mutationFn: (payload) => fetchJson(`/api/admin/invoices/${id}/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
    onSuccess: (data) => {
      toast.success('Payment recorded');
      setPayAmount(''); setPayNote('');
      // Merge the mutation response straight into cache instead of only
      // invalidating — a refetch can otherwise be superseded by an
      // in-flight request and leave the balance looking stale on screen.
      qc.setQueryData(['invoice', id], (old) => old && ({
        ...old,
        status: data.invoice.status,
        amountPaid: data.invoice.amountPaid,
        balance: data.invoice.balance,
        payments: [{ ...data.payment, note: payNote.trim() || null, recordedBy: me?.name || me?.email || null }, ...old.payments],
      }));
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: (err) => setPayError(parseApiError(err)),
  });

  const voidMutation = useMutation({
    mutationFn: () => fetchJson(`/api/admin/invoices/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'void' }) }),
    onSuccess: (data) => { toast.success('Invoice voided'); qc.setQueryData(['invoice', id], data); qc.invalidateQueries({ queryKey: ['invoices'] }); },
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

  if (isLoading) {
    return <div className="card" style={{ overflow: 'hidden', maxWidth: 900 }}>{[1, 2, 3].map((n) => <div key={n} className="sk" style={{ height: 60, margin: 14, borderRadius: 'var(--r-sm)' }} />)}</div>;
  }
  if (isError || !invoice) {
    return <div className="adm-error-banner" style={{ maxWidth: 900 }}>Invoice not found.</div>;
  }

  const st = STATUS_PILL[invoice.status] || STATUS_PILL.unpaid;
  const overdue = invoice.status !== 'void' && invoice.status !== 'paid' && invoice.dueDate && new Date(invoice.dueDate) < new Date();
  const isManager = me?.role === 'MANAGER';
  const canPay = invoice.status !== 'void' && invoice.status !== 'paid';

  return (
    <div style={{ maxWidth: 900 }}>
      {dialog}
      <nav className="adm-crumb" style={{ marginBottom: 14 }}>
        <Link href="/admin/dashboard/invoices">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
          All invoices
        </Link>
        <span className="sep">/</span>
        <span>Invoice #{invoice.id}</span>
      </nav>

      <div className="card card-pad-lg" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div className="eyebrow">Billed to</div>
            <div className="h-1" style={{ marginTop: 3 }}>{invoice.customer?.name}</div>
            <div className="sub">{invoice.customer?.phone}{invoice.customer?.address ? ` · ${invoice.customer.address}` : ''}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className={`pill ${st.cls}`} style={{ marginBottom: 6 }}><span className="pdot" />{st.label}</span>
            <div className="h-1" style={{ marginTop: 6 }}>{money(invoice.balance)} <span className="sub" style={{ fontSize: 12 }}>due</span></div>
            {invoice.dueDate && <div className="sub" style={{ color: overdue ? 'var(--rose)' : undefined }}>Due {new Date(invoice.dueDate).toLocaleDateString()}{overdue ? ' · overdue' : ''}</div>}
          </div>
        </div>

        {(invoice.tableNumber || invoice.orderId) && (
          <div className="empty-sub" style={{ textAlign: 'left', marginTop: 10 }}>
            {invoice.orderId && invoice.order ? <>From order <b>{invoice.order.reference}</b>. </> : null}
            {invoice.tableNumber ? <>Table {invoice.tableNumber}.</> : null}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', fontWeight: 620, borderBottom: '1px solid var(--line)' }}>Line items</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th>Description</th><th className="num">Qty</th><th className="num">Unit price</th><th className="num">Total</th></tr></thead>
            <tbody>
              {(Array.isArray(invoice.items) ? invoice.items : []).map((l, i) => (
                <tr key={i}>
                  <td>{l.description || l.name}</td>
                  <td className="num">{l.quantity}</td>
                  <td className="num">{money(l.unitPrice)}</td>
                  <td className="num">{money((l.quantity || 0) * (l.unitPrice || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--line)' }}>
          <div className="tf-row"><span>Subtotal</span><span className="v">{money(invoice.subtotal)}</span></div>
          {Number(invoice.discount) > 0 && <div className="tf-row"><span>Discount</span><span className="v" style={{ color: 'var(--rose)' }}>−{money(invoice.discount)}</span></div>}
          <div className="tf-row total"><span>Total</span><span className="v">{money(invoice.total)}</span></div>
          <div className="tf-row"><span>Paid</span><span className="v" style={{ color: 'var(--primary)' }}>{money(invoice.amountPaid)}</span></div>
        </div>
        {invoice.note && <div className="empty-sub" style={{ textAlign: 'left', padding: '0 18px 14px' }}>Note: {invoice.note}</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card card-pad-lg">
          <div style={{ fontWeight: 620, marginBottom: 12 }}>Payment history</div>
          {invoice.payments.length === 0 ? (
            <p className="empty-sub" style={{ textAlign: 'left' }}>No payments recorded yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {invoice.payments.map((p) => (
                <div className="mv-item" key={p.id}>
                  <span className="mdot" style={{ background: 'var(--primary)' }} />
                  <span style={{ flex: 1 }}>{METHOD_LABEL[p.method] || p.method}{p.recordedBy ? ` · ${p.recordedBy}` : ''}</span>
                  <span className="mono" style={{ fontWeight: 600 }}>{money(p.amount)}</span>
                  <span style={{ color: 'var(--faint)', fontSize: 11 }}>{new Date(p.paidAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card card-pad-lg">
          <div style={{ fontWeight: 620, marginBottom: 12 }}>Record a payment</div>
          {canPay ? (
            <form onSubmit={handlePay}>
              <div className="field-l">Amount (balance {money(invoice.balance)})</div>
              <input className="input" type="number" min="0" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="0.00" />
              <div className="field-l">Method</div>
              <div className="chips">
                {['cash', 'card', 'evc'].map((m) => (
                  <button key={m} type="button" className={`chip2${payMethod === m ? ' on' : ''}`} onClick={() => setPayMethod(m)}>{METHOD_LABEL[m]}</button>
                ))}
              </div>
              <div className="field-l">Note (optional)</div>
              <input className="input" value={payNote} onChange={(e) => setPayNote(e.target.value)} />
              {payError && <div className="adm-error-banner" style={{ marginTop: 10 }}>{payError}</div>}
              <button className="btn btn-primary" type="submit" style={{ width: '100%', height: 42, marginTop: 14 }} disabled={payMutation.isPending}>{payMutation.isPending ? 'Recording…' : 'Record payment'}</button>
            </form>
          ) : (
            <p className="empty-sub" style={{ textAlign: 'left' }}>{invoice.status === 'paid' ? 'This invoice is fully paid.' : 'This invoice is void — no more payments can be recorded.'}</p>
          )}

          {isManager && invoice.status !== 'void' && (
            <button className="btn btn-ghost" style={{ width: '100%', marginTop: 12, color: 'var(--rose)' }} onClick={handleVoid} disabled={voidMutation.isPending}>
              {voidMutation.isPending ? 'Voiding…' : 'Void invoice'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
