'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchJson, parseApiError } from '@/lib/apiError';
import { KpiRowSkeleton, RowsSkeleton } from '@/components/admin/Skeletons';

const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STATUS_PILL = {
  unpaid: { cls: 'pill-rose', label: 'Unpaid' },
  partial: { cls: 'pill-amber', label: 'Partial' },
  paid: { cls: 'pill-green', label: 'Paid' },
  void: { cls: 'pill-ghost', label: 'Void' },
};

function Crumb({ name }) {
  return (
    <nav className="adm-crumb">
      <Link href="/admin/dashboard/customers">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
        Customers
      </Link>
      <span className="sep">/</span>
      <span>{name}</span>
    </nav>
  );
}

export default function CustomerDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', address: '' });
  const [formError, setFormError] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => fetchJson(`/api/admin/customers/${id}`),
  });

  const updateMutation = useMutation({
    mutationFn: (payload) => fetchJson(`/api/admin/customers/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
    onSuccess: () => { toast.success('Customer updated'); qc.invalidateQueries({ queryKey: ['customer', id] }); qc.invalidateQueries({ queryKey: ['customers'] }); setEditing(false); },
    onError: (err) => setFormError(parseApiError(err)),
  });

  const startEdit = () => {
    setForm({ name: data.customer.name, phone: data.customer.phone, address: data.customer.address || '' });
    setFormError('');
    setEditing(true);
  };

  const submitEdit = (e) => {
    e.preventDefault(); setFormError('');
    if (!form.name.trim() || !form.phone.trim()) { setFormError('Name and phone are required'); return; }
    updateMutation.mutate({ name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim() || null });
  };

  if (isLoading) {
    return (
      <div className="wrap-narrow">
        <Crumb name="Loading…" />
        <div className="sk" style={{ height: 58, marginBottom: 16 }} />
        <KpiRowSkeleton count={3} style={{ marginBottom: 16 }} />
        <div className="card card-pad"><RowsSkeleton rows={4} /></div>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="wrap-narrow">
        <Crumb name="Not found" />
        <div className="card card-pad-lg">
          <div className="empty">
            <div className="empty-ring"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /></svg></div>
            <p className="empty-title">Customer not found</p>
            <p className="empty-sub">This account may not exist. Go back to the customer list.</p>
          </div>
        </div>
      </div>
    );
  }

  const { customer, owedBalance, invoices } = data;
  // Counts come from the server; the history list is capped at the 50 most recent.
  const invoiceCount = data.invoiceCount ?? invoices.length;
  const openInvoices = data.openCount ?? invoices.filter((i) => i.status === 'unpaid' || i.status === 'partial').length;

  return (
    <div className="wrap-narrow">
      <Crumb name={customer.name} />

      <div className="detail-h">
        <div>
          <div className="eyebrow">Customer account</div>
          <div className="h-1">{customer.name}</div>
          <div className="sub"><span className="mono">{customer.phone}</span>{customer.address ? ` · ${customer.address}` : ''}</div>
        </div>
        <div className="acts">
          <button className="btn btn-ghost" onClick={startEdit}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>Edit details
          </button>
        </div>
      </div>

      <div className="kpi-row reveal" style={{ marginBottom: 16 }}>
        <div className="kpi">
          <div className="kpi-top"><div className={`kpi-ic ${owedBalance > 0 ? 'rose' : 'green'}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg></div><span className="kpi-k">Owed balance</span></div>
          <div className="kpi-v"><small>$</small>{Number(owedBalance).toFixed(2)}</div>
          <div className="kpi-foot"><span>{owedBalance > 0 ? 'currently outstanding' : 'all settled'}</span></div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ic amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg></div><span className="kpi-k">Invoices</span></div>
          <div className="kpi-v">{invoiceCount}</div>
          <div className="kpi-foot"><span>{openInvoices} still open</span></div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ic ink"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg></div><span className="kpi-k">Customer since</span></div>
          <div className="kpi-v is-text">{new Date(customer.createdAt).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}</div>
          <div className="kpi-foot"><span>account created</span></div>
        </div>
      </div>

      <div className="card reveal" style={{ overflow: 'hidden', animationDelay: '.08s' }}>
        <div className="card-h">
          <div><div className="ttl">Invoice history</div><div className="note">Most recent 50 invoices</div></div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Invoice</th><th className="num">Total</th><th className="num">Balance</th><th>Status</th><th>Due</th><th /></tr></thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr><td colSpan={6} className="td-empty">No invoices yet</td></tr>
              ) : invoices.map((inv) => {
                const st = STATUS_PILL[inv.status] || STATUS_PILL.unpaid;
                return (
                  <tr key={inv.id}>
                    <td><span className="mono strong">#{inv.id}</span><div className="note">{new Date(inv.createdAt).toLocaleDateString()}</div></td>
                    <td className="num">{money(inv.total)}</td>
                    <td className="num" style={{ color: Number(inv.balance) > 0 ? 'var(--rose)' : 'var(--muted)' }}>{money(inv.balance)}</td>
                    <td><span className={`pill ${st.cls}`}><span className="pdot" />{st.label}</span></td>
                    <td className="muted">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '—'}</td>
                    <td className="act"><Link href={`/admin/dashboard/customers/${customer.id}/invoices/${inv.id}`} className="btn btn-ghost btn-sm">Open</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <div className="jz-modal-bk open" onClick={(e) => { if (e.target === e.currentTarget) setEditing(false); }}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Edit customer">
            <div className="modal-h">
              <div className="mt"><div className="eyebrow">Edit customer</div><div className="h-1" style={{ marginTop: 3 }}>{customer.name}</div></div>
              <button className="icon-btn" onClick={() => setEditing(false)} aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
            </div>
            <form onSubmit={submitEdit} style={{ display: 'contents' }}>
              <div className="modal-b">
                <div className="ff"><label htmlFor="e-name">Name</label><input id="e-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
                <div className="ff"><label htmlFor="e-phone">Phone</label><input id="e-phone" className="input" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required /></div>
                <div className="ff"><label htmlFor="e-addr">Address (optional)</label><input id="e-addr" className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
                {formError && <div className="adm-error-banner">{formError}</div>}
              </div>
              <div className="modal-f">
                <button type="button" onClick={() => setEditing(false)} disabled={updateMutation.isPending} className="btn btn-ghost">Cancel</button>
                <button type="submit" disabled={updateMutation.isPending} className="btn btn-primary">{updateMutation.isPending ? 'Saving…' : 'Save changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
