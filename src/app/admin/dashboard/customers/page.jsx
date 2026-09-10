'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchJson, parseApiError } from '@/lib/apiError';

const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const emptyForm = { name: '', phone: '', address: '' };

export default function CustomersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search, cursor],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (cursor) params.set('cursor', cursor);
      const res = await fetch(`/api/admin/customers?${params}`);
      if (res.status === 403) return { denied: true, customers: [] };
      if (!res.ok) throw new Error('Failed to load customers');
      return { denied: false, ...(await res.json()) };
    },
  });

  const accessDenied = data?.denied ?? false;
  const customers = data?.customers ?? [];
  const summary = data?.summary;

  const createMutation = useMutation({
    mutationFn: (payload) => fetchJson('/api/admin/customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
    onSuccess: () => { toast.success('Customer created'); qc.invalidateQueries({ queryKey: ['customers'] }); resetForm(); },
    onError: (err) => setFormError(parseApiError(err)),
  });

  const resetForm = () => { setForm(emptyForm); setShowForm(false); setFormError(''); };

  const handleSubmit = (e) => {
    e.preventDefault(); setFormError('');
    if (!form.name.trim() || !form.phone.trim()) { setFormError('Name and phone are required'); return; }
    createMutation.mutate({ name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim() || null });
  };

  if (!isLoading && accessDenied) {
    return (
      <div className="card card-pad-lg" style={{ maxWidth: 560 }}>
        <div className="empty">
          <div className="empty-ring"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /></svg></div>
          <p className="empty-title">No access</p>
          <p className="empty-sub">You don&rsquo;t have permission to view customers.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200 }}>
      {summary && (
        <div className="kpi-row reveal" style={{ marginBottom: 18 }}>
          <div className="kpi">
            <div className="kpi-top"><div className="kpi-ic ink"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /></svg></div><span className="kpi-k">Total customers</span></div>
            <div className="kpi-v">{summary.totalCustomers}</div>
          </div>
          <div className="kpi">
            <div className="kpi-top"><div className="kpi-ic amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg></div><span className="kpi-k">Customers owing</span></div>
            <div className="kpi-v">{summary.customersWithBalance}</div>
          </div>
          <div className="kpi">
            <div className="kpi-top"><div className="kpi-ic rose"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg></div><span className="kpi-k">Total outstanding</span></div>
            <div className="kpi-v"><small>$</small>{Math.round(summary.totalOutstanding)}</div>
            <div className="kpi-foot"><span>owed across all customers</span></div>
          </div>
        </div>
      )}

      <div className="toolbar">
        <div className="search" style={{ width: 260 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          <input value={search} onChange={(e) => { setSearch(e.target.value); setCursor(null); }} placeholder="Search by name or phone…" />
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 5v14M5 12h14" /></svg>New customer
        </button>
      </div>

      {isLoading && !cursor ? (
        <div className="card" style={{ overflow: 'hidden' }}>{[1, 2, 3, 4].map((n) => <div key={n} className="sk" style={{ height: 52, margin: 12, borderRadius: 'var(--r-sm)' }} />)}</div>
      ) : customers.length === 0 ? (
        <div className="card card-pad-lg">
          <div className="empty">
            <div className="empty-ring"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /></svg></div>
            <p className="empty-title">No customers yet</p>
            <p className="empty-sub">Customers appear here once you invoice one, or you can create one directly.</p>
          </div>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>Name</th><th>Phone</th><th className="num">Owed balance</th><th className="num">Invoices</th><th>Since</th><th /></tr></thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 560, color: 'var(--ink)' }}>{c.name}</td>
                    <td style={{ color: 'var(--muted)' }}>{c.phone}</td>
                    <td className="num" style={{ color: c.owedBalance > 0 ? 'var(--rose)' : 'var(--muted)' }}>{money(c.owedBalance)}</td>
                    <td className="num">{c.invoiceCount}</td>
                    <td style={{ color: 'var(--muted)' }}>{new Date(c.createdAt).toLocaleDateString()}</td>
                    <td style={{ textAlign: 'right' }}><Link href={`/admin/dashboard/customers/${c.id}`} className="btn btn-ghost btn-sm">Open →</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data?.nextCursor && (
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <button className="btn btn-ghost" onClick={() => setCursor(data.nextCursor)}>Load more</button>
        </div>
      )}

      {showForm && (
        <div className="jz-modal-bk open" onClick={(e) => { if (e.target === e.currentTarget) resetForm(); }}>
          <div className="modal" style={{ maxWidth: 460 }}>
            <div className="modal-h">
              <div className="mt"><div className="eyebrow">New customer</div><div className="h-1" style={{ marginTop: 3 }}>Add an account</div></div>
              <button className="icon-btn" onClick={resetForm} aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
              <div className="modal-b">
                <div className="ff"><label>Name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
                <div className="ff"><label>Phone</label><input className="input" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required /></div>
                <div className="ff"><label>Address (optional)</label><input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
                {formError && <div className="adm-error-banner">{formError}</div>}
              </div>
              <div className="modal-f">
                <button type="button" onClick={resetForm} disabled={createMutation.isPending} className="btn btn-ghost">Cancel</button>
                <button type="submit" disabled={createMutation.isPending} className="btn btn-primary">{createMutation.isPending ? 'Creating…' : 'Create customer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
