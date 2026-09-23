'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { reportSaveError } from '@/lib/saveError';
import { useFormValidation } from '@/lib/formValidation';
import { customerSchema } from '@/lib/schemas/customers';
import Field from '@/components/admin/Field';
import { money } from '@/lib/money';


const looksLikePhone = (s) => /^[\d\s+()-]+$/.test(s) && /\d/.test(s);

/**
 * Search-and-select-or-create customer picker, shared by the POS "Invoice"
 * payment step and the standalone Invoicing "+ New invoice" modal.
 *
 * Contract: the parent only ever holds a customerId — "+ New customer"
 * persists immediately via POST /api/admin/customers, so an invoice can never
 * reference a customer that doesn't exist yet.
 *
 * Results render inline below the search box rather than as a floating
 * dropdown: both hosts are scroll containers (.modal-b, .ticket-foot) that
 * would clip an absolutely-positioned list.
 *
 * Props: customerId (number|null), customer ({id,name,phone,address,owedBalance?}|null),
 * onChange(({customerId, customer}) => void), disabled (bool), error (string|null).
 */
export default function CustomerPicker({ customerId, customer, onChange, disabled, error, id, onBlur, 'aria-describedby': describedBy, 'aria-invalid': ariaInvalid }) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', address: '' });
  const queryClient = useQueryClient();
  const cform = useFormValidation(customerSchema, form);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const searching = debounced.length >= 2;
  const { data, isFetching } = useQuery({
    queryKey: ['customer-search', debounced],
    queryFn: () => fetchJson(`/api/admin/customers?q=${encodeURIComponent(debounced)}&limit=8`),
    enabled: searching,
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
      cform.reset();
    },
    onError: (err) => {
      // A field problem the API found goes under that field; anything else is a status message.
      reportSaveError(err, { form: cform, title: 'Could not save the customer', guess: { phone: /phone/i } });
    },
  });

  function select(row) {
    onChange({ customerId: row.id, customer: row });
    setQuery('');
  }

  function startCreate(prefill) {
    const p = (prefill || '').trim();
    setForm({ name: looksLikePhone(p) ? '' : p, phone: looksLikePhone(p) ? p : '', address: '' });
    createMutation.reset();
    cform.reset();
    setCreating(true);
  }

  function submitCreate() {
    if (!cform.check()) return;
    createMutation.mutate({ name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim() || null });
  }

  // Enter inside the picker must never submit the form it sits in (Take payment).
  const onEnter = (e) => {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
    e.preventDefault();
    if (creating) submitCreate();
  };

  if (customerId && customer) {
    return (
      <div className="cpk" onKeyDown={onEnter}>
        <div className="cpk-sel">
          <div className="cpk-main">
            <div className="cpk-nm">{customer.name}</div>
            <div className="cpk-ph">{customer.phone}</div>
          </div>
          {customer.owedBalance > 0 && <span className="pill pill-rose"><span className="pdot" />owes {money(customer.owedBalance)}</span>}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange({ customerId: null, customer: null })} disabled={disabled}>Change</button>
        </div>
        {error && <div className="field-err">{error}</div>}
      </div>
    );
  }

  if (creating) {
    return (
      <div className="cpk" onKeyDown={onEnter}>
        <div className="cpk-new">
          <div className="eyebrow">New customer</div>
          <div className="row2">
            <Field label="Full name" required {...cform.fieldProps('name')}>
              <input className="input" placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            </Field>
            <Field label="Phone" required {...cform.fieldProps('phone')}>
              <input className="input" type="tel" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
          </div>
          <Field label="Address" {...cform.fieldProps('address')}>
            <input className="input" placeholder="Address (optional)" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
          <div className="acts">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCreating(false)} disabled={createMutation.isPending}>Cancel</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={createMutation.isPending || !cform.valid} onClick={submitCreate}>
              {createMutation.isPending ? 'Saving…' : 'Save customer'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cpk" onKeyDown={onEnter} onBlur={onBlur}>
      <div className="cpk-search">
        <div className="search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          <input id={id} aria-describedby={describedBy} aria-invalid={ariaInvalid} placeholder="Search customer by name or phone" aria-label="Search customers" value={query} disabled={disabled} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={() => startCreate(query)}>+ New</button>
      </div>

      {searching && (
        <div className="cpk-list" role="listbox" aria-label="Matching customers">
          {isFetching && results.length === 0 ? (
            <div className="cpk-msg">Searching…</div>
          ) : results.length === 0 ? (
            <div className="cpk-msg">
              <span>No customer matches &ldquo;{debounced}&rdquo;</span>
              <button type="button" className="btn btn-soft btn-sm" onClick={() => startCreate(debounced)}>Create customer</button>
            </div>
          ) : results.map((row) => (
            <button type="button" role="option" aria-selected="false" key={row.id} className="cpk-row" onClick={() => select(row)}>
              <div className="cpk-main">
                <div className="cpk-nm">{row.name}</div>
                <div className="cpk-ph">{row.phone}</div>
              </div>
              {row.owedBalance > 0 && <span className="pill pill-rose"><span className="pdot" />owes {money(row.owedBalance)}</span>}
            </button>
          ))}
        </div>
      )}
      {error && <div className="field-err">{error}</div>}
    </div>
  );
}
// <Field> may hand it id / aria-* / onBlur (see Field.jsx): they go to the search box.
CustomerPicker.fieldControl = true;
