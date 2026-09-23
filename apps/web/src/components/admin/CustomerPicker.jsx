'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { reportSaveError } from '@/lib/saveError';
import { useFormValidation } from '@/lib/formValidation';
import { customerSchema } from '@/lib/schemas/customers';
import Field from '@/components/admin/Field';
import { Button, Chip, SearchInput, inputCls } from '@/components/admin/ui';
import { money } from '@/lib/money';


const looksLikePhone = (s) => /^[\d\s+()-]+$/.test(s) && /\d/.test(s);

function Person({ c }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="text-sm font-semibold text-mq-ink truncate">{c.name}</div>
      <div className="font-mq-mono tabular-nums text-xs text-mq-muted truncate">{c.phone}</div>
    </div>
  );
}
const Owes = ({ c }) => (Number(c.owedBalance) > 0 ? <Chip tone="danger" small>owes {money(c.owedBalance)}</Chip> : null);

/**
 * Search-and-select-or-create customer picker, shared by the POS "Invoice"
 * payment step and the standalone Invoicing "+ New invoice" modal.
 *
 * Contract: the parent only ever holds a customerId — "+ New customer"
 * persists immediately via POST /api/admin/customers, so an invoice can never
 * reference a customer that doesn't exist yet.
 *
 * Results render inline below the search box rather than as a floating
 * dropdown: both hosts are scroll containers (a dialog body, the ticket
 * footer) that would clip an absolutely-positioned list.
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

  const errNote = error ? <div className="text-xs font-medium text-mq-danger-ink" role="alert">{error}</div> : null;

  if (customerId && customer) {
    return (
      <div className="flex flex-col gap-1.5" onKeyDown={onEnter}>
        <div className="flex items-center gap-2.5 min-h-12 pl-3.5 pr-1.5 py-1.5 bg-white border border-mq-primary rounded-lg">
          <Person c={customer} />
          <Owes c={customer} />
          <Button variant="ghost" size="sm" onClick={() => onChange({ customerId: null, customer: null })} disabled={disabled}>Change</Button>
        </div>
        {errNote}
      </div>
    );
  }

  if (creating) {
    return (
      <div className="flex flex-col gap-3 p-3.5 bg-white border border-mq-line rounded-xl" onKeyDown={onEnter}>
        <div className="text-[10.5px] font-semibold uppercase tracking-[.12em] text-mq-muted">New customer</div>
        <Field label="Full name" required {...cform.fieldProps('name')}>
          <input className={inputCls({ size: 'xl' })} placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
        </Field>
        <Field label="Phone" required {...cform.fieldProps('phone')}>
          <input className={inputCls({ size: 'xl', mono: true })} type="tel" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="Address" {...cform.fieldProps('address')}>
          <input className={inputCls({ size: 'xl' })} placeholder="Address (optional)" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button size="sm" onClick={() => setCreating(false)} disabled={createMutation.isPending}>Cancel</Button>
          <Button size="sm" variant="primary" disabled={createMutation.isPending || !cform.valid} onClick={submitCreate}>
            {createMutation.isPending ? 'Saving…' : 'Save customer'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2" onKeyDown={onEnter} onBlur={onBlur}>
      <div className="flex items-center gap-2">
        <SearchInput
          className="flex-1 !h-[46px]"
          id={id}
          aria-describedby={describedBy}
          aria-invalid={ariaInvalid}
          placeholder="Search customer by name or phone"
          aria-label="Search customers"
          value={query}
          disabled={disabled}
          onChange={setQuery}
        />
        <Button variant="soft" icon="plus" className="!h-[46px]" disabled={disabled} onClick={() => startCreate(query)}>New</Button>
      </div>

      {searching && (
        <div className="flex flex-col bg-white border border-mq-line rounded-lg overflow-hidden" role="listbox" aria-label="Matching customers">
          {isFetching && results.length === 0 ? (
            <div className="px-3.5 py-3 text-[13px] text-mq-muted">Searching…</div>
          ) : results.length === 0 ? (
            <div className="flex items-center gap-2.5 flex-wrap px-3.5 py-3 text-[13px] text-mq-muted">
              <span className="flex-1 min-w-0">No customer matches &ldquo;{debounced}&rdquo;</span>
              <Button variant="soft" size="xs" onClick={() => startCreate(debounced)}>Create customer</Button>
            </div>
          ) : results.map((row) => (
            <button
              type="button" role="option" aria-selected="false" key={row.id}
              className="flex items-center gap-2.5 min-h-12 px-3.5 py-2 text-left border-b border-mq-chip last:border-b-0 hover:bg-mq-cream focus-visible:outline-none focus-visible:bg-mq-soft"
              onClick={() => select(row)}
            >
              <Person c={row} />
              <Owes c={row} />
            </button>
          ))}
        </div>
      )}
      {errNote}
    </div>
  );
}
// <Field> may hand it id / aria-* / onBlur (see Field.jsx): they go to the search box.
CustomerPicker.fieldControl = true;
