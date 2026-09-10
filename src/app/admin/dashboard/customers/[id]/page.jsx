'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchJson, parseApiError } from '@/lib/apiError';

const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const STATUS_PILL = {
  unpaid: { cls: 'pill-rose', label: 'Unpaid' },
  partial: { cls: 'pill-amber', label: 'Partial' },
  paid: { cls: 'pill-green', label: 'Paid' },
  void: { cls: 'pill-ghost', label: 'Void' },
};

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

  if (isLoading) return <div className="card" style={{ overflow: 'hidden', maxWidth: 900 }}>{[1, 2, 3].map((n) => <div key={n} className="sk" style={{ height: 60, margin: 14, borderRadius: 'var(--r-sm)' }} />)}</div>;
  if (isError || !data) return <div className="adm-error-banner" style={{ maxWidth: 900 }}>Customer not found.</div>;

  const { customer, owedBalance, invoices } = data;

  return (
    <div style={{ maxWidth: 900 }}>
      <nav className="adm-crumb" style={{ marginBottom: 14 }}>
        <Link href="/admin/dashboard/customers">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
          Customers
        </Link>
        <span className="sep">/</span>
        <span>{customer.name}</span>
      </nav>

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div>
          <div className="h-1">{customer.name}</div>
          <div className="empty-sub" style={{ textAlign: 'left', marginTop: 2 }}>{customer.phone}{customer.address ? ` · ${customer.address}` : ''}</div>
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" onClick={startEdit}>Edit</button>
      </div>

      <div className="kpi-row reveal" style={{ marginBottom: 16 }}>
        <div className="kpi">
          <div className="kpi-top"><div className={`kpi-ic ${owedBalance > 0 ? 'rose' : 'green'}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg></div><span className="kpi-k">Owed balance</span></div>
          <div className="kpi-v"><small>$</small>{owedBalance.toFixed(2)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ic amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg></div><span className="kpi-k">Invoices</span></div>
          <div className="kpi-v">{invoices.length}</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ic ink"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg></div><span className="kpi-k">Customer since</span></div>
          <div className="kpi-v" style={{ fontSize: 19 }}>{new Date(customer.createdAt).toLocaleDateString()}</div>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', fontWeight: 620, borderBottom: '1px solid var(--line)' }}>Invoice history</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th className="num">Total</th><th className="num">Balance</th><th>Status</th><th>Due</th><th>Created</th><th /></tr></thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>No invoices yet</td></tr>
              ) : invoices.map((inv) => {
                const st = STATUS_PILL[inv.status] || STATUS_PILL.unpaid;
                return (
                  <tr key={inv.id}>
                    <td className="num">{money(inv.total)}</td>
                    <td className="num" style={{ color: Number(inv.balance) > 0 ? 'var(--rose)' : 'var(--muted)' }}>{money(inv.balance)}</td>
                    <td><span className={`pill ${st.cls}`}><span className="pdot" />{st.label}</span></td>
                    <td style={{ color: 'var(--muted)' }}>{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '—'}</td>
                    <td style={{ color: 'var(--muted)' }}>{new Date(inv.createdAt).toLocaleDateString()}</td>
                    <td style={{ textAlign: 'right' }}><Link href={`/admin/dashboard/invoices/${inv.id}`} className="btn btn-ghost btn-sm">Open</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <div className="jz-modal-bk open" onClick={(e) => { if (e.target === e.currentTarget) setEditing(false); }}>
          <div className="modal" style={{ maxWidth: 460 }}>
            <div className="modal-h">
              <div className="mt"><div className="eyebrow">Edit customer</div><div className="h-1" style={{ marginTop: 3 }}>{customer.name}</div></div>
              <button className="icon-btn" onClick={() => setEditing(false)} aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
            </div>
            <form onSubmit={submitEdit} style={{ display: 'contents' }}>
              <div className="modal-b">
                <div className="ff"><label>Name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
                <div className="ff"><label>Phone</label><input className="input" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required /></div>
                <div className="ff"><label>Address (optional)</label><input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
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
