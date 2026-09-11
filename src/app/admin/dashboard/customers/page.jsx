'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchJson, parseApiError } from '@/lib/apiError';
import { KpiRowSkeleton, RowsSkeleton } from '@/components/admin/Skeletons';

const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (n) => Number(n || 0).toLocaleString('en-US');
const emptyForm = { name: '', phone: '', address: '' };

const PersonIc = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M6 16c0-1.66 1.34-3 3-3s3 1.34 3 3M14 9h4M14 13h4" /></svg>;

export default function CustomersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Platform-wide KPIs come from the unfiltered first page, fetched on their
  // own so they stay put while the list below is being searched.
  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['customers', 'summary'],
    queryFn: () => fetchJson('/api/admin/customers?limit=1'),
    retry: false,
  });
  const summary = summaryData?.summary;

  const list = useInfiniteQuery({
    queryKey: ['customers', 'list', q],
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (pageParam) params.set('cursor', pageParam);
      const res = await fetch(`/api/admin/customers?${params}`);
      if (res.status === 403) return { denied: true, customers: [], nextCursor: null };
      if (!res.ok) throw new Error('Failed to load customers');
      return { denied: false, ...(await res.json()) };
    },
    getNextPageParam: (last) => last.nextCursor || undefined,
  });

  const pages = list.data?.pages || [];
  const accessDenied = pages[0]?.denied ?? false;
  const customers = pages.flatMap((p) => p.customers || []);

  const createMutation = useMutation({
    mutationFn: (payload) => fetchJson('/api/admin/customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
    onSuccess: () => { toast.success('Customer created'); qc.invalidateQueries({ queryKey: ['customers'] }); resetForm(); },
    onError: (err) => setFormError(parseApiError(err)),
  });

  function resetForm() { setForm(emptyForm); setShowForm(false); setFormError(''); }

  const handleSubmit = (e) => {
    e.preventDefault(); setFormError('');
    if (!form.name.trim() || !form.phone.trim()) { setFormError('Name and phone are required'); return; }
    createMutation.mutate({ name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim() || null });
  };

  if (!list.isLoading && accessDenied) {
    return (
      <div className="card card-pad-lg" style={{ maxWidth: 560 }}>
        <div className="empty">
          <div className="empty-ring">{PersonIc}</div>
          <p className="empty-title">No access</p>
          <p className="empty-sub">You don&rsquo;t have permission to view customers.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      {summaryLoading ? <KpiRowSkeleton count={3} style={{ marginBottom: 16 }} /> : summary && (
        <div className="kpi-row reveal" style={{ marginBottom: 16 }}>
          <div className="kpi">
            <div className="kpi-top"><div className="kpi-ic ink">{PersonIc}</div><span className="kpi-k">Total customers</span></div>
            <div className="kpi-v">{num(summary.totalCustomers)}</div>
            <div className="kpi-foot"><span>accounts on file</span></div>
          </div>
          <div className="kpi">
            <div className="kpi-top"><div className="kpi-ic amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg></div><span className="kpi-k">Customers owing</span></div>
            <div className="kpi-v">{num(summary.customersWithBalance)}</div>
            <div className="kpi-foot"><span>with an unpaid balance</span></div>
          </div>
          <div className="kpi">
            <div className="kpi-top"><div className="kpi-ic rose"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg></div><span className="kpi-k">Total outstanding</span></div>
            <div className="kpi-v"><small>$</small>{Number(summary.totalOutstanding || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div className="kpi-foot"><span>owed across all customers</span></div>
          </div>
        </div>
      )}

      <div className="toolbar">
        <div className="search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or phone" aria-label="Search customers" />
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 5v14M5 12h14" /></svg>New customer
        </button>
      </div>

      <div className="card reveal" style={{ overflow: 'hidden', animationDelay: '.08s' }}>
        <div className="card-h">
          <div>
            <div className="ttl">{q ? `Results for “${q}”` : 'All customers'}</div>
            <div className="note">{list.isLoading ? 'Loading…' : `${num(customers.length)} shown${list.hasNextPage ? ' · more available' : ''}`}</div>
          </div>
        </div>
        {list.isLoading ? (
          <RowsSkeleton rows={5} className="card-pad" />
        ) : customers.length === 0 ? (
          <div className="empty">
            <div className="empty-ring">{PersonIc}</div>
            <p className="empty-title">{q ? 'No matching customers' : 'No customers yet'}</p>
            <p className="empty-sub">{q ? 'Try a different name or phone number.' : 'Customers appear here once you invoice one, or create one directly.'}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Name</th><th>Phone</th><th className="num">Owed balance</th><th className="num">Invoices</th><th>Since</th><th /></tr></thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td className="strong">{c.name}</td>
                    <td className="muted mono">{c.phone}</td>
                    <td className="num" style={{ color: c.owedBalance > 0 ? 'var(--rose)' : 'var(--muted)' }}>{money(c.owedBalance)}</td>
                    <td className="num">{num(c.invoiceCount)}</td>
                    <td className="muted">{new Date(c.createdAt).toLocaleDateString()}</td>
                    <td className="act"><Link href={`/admin/dashboard/customers/${c.id}`} className="btn btn-ghost btn-sm">Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {list.hasNextPage && (
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <button className="btn btn-ghost" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>{list.isFetchingNextPage ? 'Loading…' : 'Load more'}</button>
        </div>
      )}

      {showForm && (
        <div className="jz-modal-bk open" onClick={(e) => { if (e.target === e.currentTarget) resetForm(); }}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="New customer">
            <div className="modal-h">
              <div className="mt"><div className="eyebrow">New customer</div><div className="h-1" style={{ marginTop: 3 }}>Add an account</div></div>
              <button className="icon-btn" onClick={resetForm} aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
              <div className="modal-b">
                <div className="ff"><label htmlFor="c-name">Name</label><input id="c-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus /></div>
                <div className="ff"><label htmlFor="c-phone">Phone</label><input id="c-phone" className="input" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required /></div>
                <div className="ff"><label htmlFor="c-addr">Address (optional)</label><input id="c-addr" className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
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
