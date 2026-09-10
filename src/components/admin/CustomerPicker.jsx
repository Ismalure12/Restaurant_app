'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchJson, parseApiError } from '@/lib/apiError';

const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const looksLikePhone = (s) => /^[\d\s+()-]+$/.test(s) && /\d/.test(s);

/**
 * Search-and-select-or-create customer picker, shared by the POS "Invoice"
 * payment step and the standalone Invoicing "+ New invoice" modal.
 *
 * Contract: the parent only ever holds a customerId — "+ New customer"
 * persists immediately via POST /api/admin/customers rather than deferring
 * creation into the invoice payload (see plan rationale: matches "customer
 * is being made which later could be edited in the customer table", and
 * avoids ever creating an invoice against a customer that doesn't exist yet).
 *
 * Props: customerId (number|null), customer ({id,name,phone,address,owedBalance?}|null),
 * onChange(({customerId, customer}) => void), disabled (bool), error (string|null).
 */
export default function CustomerPicker({ customerId, customer, onChange, disabled, error }) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', address: '' });
  const boxRef = useRef(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isFetching } = useQuery({
    queryKey: ['customer-search', debounced],
    queryFn: () => fetchJson(`/api/admin/customers?q=${encodeURIComponent(debounced)}&limit=8`),
    enabled: debounced.length >= 2,
  });
  const results = data?.customers || [];

  const createMutation = useMutation({
    mutationFn: (payload) => fetchJson('/api/admin/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      onChange({ customerId: created.id, customer: created });
      setCreating(false);
      setForm({ name: '', phone: '', address: '' });
      setQuery('');
      setOpen(false);
    },
  });

  useEffect(() => {
    function onDocClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function select(row) {
    onChange({ customerId: row.id, customer: row });
    setOpen(false);
    setQuery('');
  }

  function reset() {
    onChange({ customerId: null, customer: null });
    setQuery('');
  }

  function startCreate(prefill) {
    setForm({ name: '', phone: looksLikePhone(prefill || '') ? prefill : '', address: '' });
    setCreating(true);
    setOpen(false);
  }

  function submitCreate() {
    if (!form.name.trim() || !form.phone.trim()) return;
    createMutation.mutate({ name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim() || null });
  }

  if (customerId && customer) {
    return (
      <div className="ff">
        <label>Customer</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{customer.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{customer.phone}</div>
          </div>
          {customer.owedBalance > 0 && (
            <span className="pill pill-rose"><span className="pdot" />owes {money(customer.owedBalance)}</span>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={reset} disabled={disabled}>Change</button>
        </div>
        {error && <div className="empty-sub" style={{ textAlign: 'left', color: 'var(--rose)' }}>{error}</div>}
      </div>
    );
  }

  return (
    <div className="ff" ref={boxRef} style={{ position: 'relative' }}>
      <label>Customer</label>
      {!creating ? (
        <>
          <div className="ff-row" style={{ gap: 8 }}>
            <div className="search" style={{ flex: 1, width: 'auto' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
              <input
                placeholder="Search by name or phone…"
                value={query}
                disabled={disabled}
                onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
              />
            </div>
            <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={() => startCreate(query)}>+ New</button>
          </div>
          {open && debounced.length >= 2 && (
            <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 4, maxHeight: 240, overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
              {isFetching ? (
                <div className="empty-sub" style={{ textAlign: 'left', padding: 12 }}>Searching…</div>
              ) : results.length === 0 ? (
                <div className="empty-sub" style={{ textAlign: 'left', padding: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  No customer matches &ldquo;{debounced}&rdquo;.
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => startCreate(debounced)}>+ New customer</button>
                </div>
              ) : results.map((row) => (
                <div
                  key={row.id}
                  onClick={() => select(row)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer', borderTop: '1px solid var(--line-2)' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{row.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{row.phone}</div>
                  </div>
                  {row.owedBalance > 0 && <span className="pill pill-rose"><span className="pdot" />owes {money(row.owedBalance)}</span>}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="ff-row" style={{ gap: 10 }}>
            <input className="input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            <input className="input" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <input className="input" placeholder="Address (optional)" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          {createMutation.isError && <div className="empty-sub" style={{ textAlign: 'left', color: 'var(--rose)' }}>{parseApiError(createMutation.error)}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCreating(false)}>Cancel</button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={createMutation.isPending || !form.name.trim() || !form.phone.trim()}
              onClick={submitCreate}
            >
              {createMutation.isPending ? 'Creating…' : 'Create customer'}
            </button>
          </div>
        </div>
      )}
      {error && <div className="empty-sub" style={{ textAlign: 'left', color: 'var(--rose)' }}>{error}</div>}
    </div>
  );
}
