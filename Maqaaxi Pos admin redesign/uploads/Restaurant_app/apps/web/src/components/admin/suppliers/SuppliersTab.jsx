'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchJson, parseApiError } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import { useFormValidation } from '@/lib/formValidation';
import { supplierFormSchema, supplierPaymentSchema } from '@/lib/schemas/inventory';
import Field from '@/components/admin/Field';
import AccountField from './AccountField';
import { reportSaveError } from '@/lib/saveError';
import { KpiRowSkeleton, RowsSkeleton } from '@/components/admin/Skeletons';
import { defaultPaidFrom } from '@/components/admin/AccountSelect';
import useMoneyAccounts from '@/hooks/useMoneyAccounts';
import useSuppliers from '@/hooks/useSuppliers';
import Modal from '@/components/admin/Modal';
import { money } from '@/lib/money';


const day = (d) => new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
const JSON_H = { 'Content-Type': 'application/json' };
const TruckIc = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M1 3h15v13H1zM16 8h4l3 3v5h-7z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>;

/** Expenses > Suppliers: who we owe, credit purchases, supplier payments. */
export default function SuppliersTab() {
  const { suppliers, totalOwed, isLoading, isError, error } = useSuppliers();
  const [editing, setEditing] = useState(null); // null | 'new' | supplier
  const [openId, setOpenId] = useState(null);
  const owing = suppliers.filter((s) => s.owed > 0).length;

  return (
    <>
      {isLoading ? <KpiRowSkeleton count={2} style={{ marginBottom: 16 }} /> : (
        <div className="kpi-row reveal" style={{ marginBottom: 16 }}>
          <div className="kpi">
            <div className="kpi-top"><div className={`kpi-ic ${totalOwed > 0 ? 'amber' : 'green'}`}>{TruckIc}</div><span className="kpi-k">We owe suppliers</span></div>
            <div className="kpi-v"><small>$</small>{totalOwed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div className="kpi-foot"><span>{owing ? `across ${owing} ${owing === 1 ? 'supplier' : 'suppliers'}` : 'nothing owed'}</span></div>
          </div>
          <div className="kpi">
            <div className="kpi-top"><div className="kpi-ic ink">{TruckIc}</div><span className="kpi-k">Suppliers</span></div>
            <div className="kpi-v">{suppliers.filter((s) => s.isActive).length}</div>
            <div className="kpi-foot"><span>active</span></div>
          </div>
        </div>
      )}

      <div className="toolbar">
        <div className="note stm-note">Stock bought on credit is owed to the supplier until you pay them here. Paying comes out of a business account.</div>
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 5v14M5 12h14" /></svg>Add supplier
        </button>
      </div>

      <div className="card reveal" style={{ overflow: 'hidden' }}>
        <div className="card-h"><div><div className="ttl">Suppliers</div><div className="note">{suppliers.length} on record</div></div></div>
        {isLoading ? <RowsSkeleton rows={4} className="card-pad" /> : isError ? (
          <div className="card-pad"><div className="adm-error-banner">{parseApiError(error)}</div></div>
        ) : suppliers.length === 0 ? (
          <div className="empty">
            <div className="empty-ring">{TruckIc}</div>
            <p className="empty-title">No suppliers yet</p>
            <p className="empty-sub">Add the people you buy stock from, so purchases on credit can be tracked and paid.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table" style={{ marginTop: 12 }}>
              <thead><tr><th>Supplier</th><th>Phone</th><th className="num">Owed</th><th /></tr></thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.id} className={s.isActive ? '' : 'stm-off'}>
                    <td className="strong">{s.name}{!s.isActive && <span className="pill pill-ghost" style={{ marginLeft: 8 }}>Inactive</span>}</td>
                    <td className="muted">{s.phone || '—'}</td>
                    <td className="num strong" style={s.owed > 0 ? { color: 'var(--amber)' } : undefined}>{money(s.owed)}</td>
                    <td className="act"><span style={{ display: 'inline-flex', gap: 6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setOpenId(s.id)}>Open</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditing(s)}>Edit</button>
                    </span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && <SupplierForm supplier={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {openId && <SupplierDetail id={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

/** Add / edit dialog. Also used from the Inventory purchase form (onSaved gets the API response). */
export function SupplierForm({ supplier, onClose, onSaved }) {
  const qc = useQueryClient();
  const [name, setName] = useState(supplier?.name || '');
  const [phone, setPhone] = useState(supplier?.phone || '');
  const [isActive, setIsActive] = useState(supplier?.isActive ?? true);
  const [error, setError] = useState('');
  const values = useMemo(() => ({ name, phone }), [name, phone]);
  const fv = useFormValidation(supplierFormSchema, values);

  const save = useMutation({
    mutationFn: () => fetchJson(supplier ? `/api/admin/suppliers/${supplier.id}` : '/api/admin/suppliers', {
      method: supplier ? 'PUT' : 'POST', headers: JSON_H,
      body: JSON.stringify(supplier ? { name: name.trim(), phone: phone.trim() || null, isActive } : { name: name.trim(), phone: phone.trim() || undefined }),
    }),
    onSuccess: (d) => {
      notify.success(supplier ? 'Supplier updated' : 'Supplier added', { title: supplier ? 'Could not save the supplier' : 'Could not add the supplier' });
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      if (supplier) qc.invalidateQueries({ queryKey: ['supplier', supplier.id] });
      onSaved?.(d);
      onClose();
    },
    onError: (e) => reportSaveError(e, { title: supplier ? 'Could not save the supplier' : 'Could not add the supplier', form: fv, setBanner: setError }),
  });

  const submit = (e) => {
    e.preventDefault(); setError('');
    if (!fv.check()) return;
    fv.setServerErrors({});
    save.mutate();
  };

  return (
    <Modal eyebrow={supplier ? 'Edit supplier' : 'New supplier'} title={supplier ? supplier.name : 'Add supplier'} onClose={onClose} busy={save.isPending}>
      <form onSubmit={submit} noValidate style={{ display: 'contents' }}>
        <div className="modal-b">
          <Field label="Name" required {...fv.fieldProps('name')}>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field label="Phone (optional)" {...fv.fieldProps('phone')}>
            <input className="input" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          {supplier && (
            <label className="ff-row" style={{ cursor: 'pointer' }}>
              <span style={{ fontSize: 13, color: 'var(--ink-2)', fontWeight: 500 }}>Active (offered when buying stock)</span>
              <span role="switch" aria-checked={isActive} className={`hj-sw${isActive ? ' on' : ''}`} onClick={() => setIsActive((v) => !v)} />
            </label>
          )}
          {error && <div className="adm-error-banner">{error}</div>}
        </div>
        <div className="modal-f">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={save.isPending}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending || !fv.valid}>{save.isPending ? 'Saving…' : supplier ? 'Save changes' : 'Add supplier'}</button>
        </div>
      </form>
    </Modal>
  );
}

function SupplierDetail({ id, onClose }) {
  const { data: s, isLoading, isError, error } = useQuery({ queryKey: ['supplier', id], queryFn: () => fetchJson(`/api/admin/suppliers/${id}`) });
  const [paying, setPaying] = useState(false);

  return (
    <>
      <div className="sheet-bk open" onClick={onClose} />
      <aside className="sheet open stm-sheet" role="dialog" aria-label="Supplier">
        <div className="sheet-h">
          <div style={{ flex: 1, minWidth: 0 }}><div className="eyebrow" style={{ color: 'var(--primary)' }}>Supplier</div><div className="h-2" style={{ marginTop: 2 }}>{s?.name || '…'}</div></div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
        </div>
        <div className="sheet-b">
          {isLoading ? <RowsSkeleton rows={4} /> : isError ? <div className="adm-error-banner">{parseApiError(error)}</div> : (
            <>
              <div className="stm-owed">
                <div><div className="stm-k">We owe {s.name}</div><div className="stm-big">{money(s.owed)}</div>{s.phone && <div className="note">{s.phone}</div>}</div>
                <button className="btn btn-primary" onClick={() => setPaying(true)} disabled={!(s.owed > 0)}>Pay supplier</button>
              </div>

              <div className="stm-h">Bought on credit</div>
              {s.purchases.length === 0 ? <p className="note">No purchases on credit yet.</p> : (
                <div className="table-wrap"><table className="table">
                  <thead><tr><th>Date</th><th>Item</th><th className="num">Cost</th></tr></thead>
                  <tbody>{s.purchases.map((p) => (
                    <tr key={p.id}>
                      <td className="muted" style={{ whiteSpace: 'nowrap' }}>{day(p.at)}</td>
                      <td>{p.item} <span className="muted">· {p.quantity} {p.unit}</span>{p.note && <div className="note">{p.note}</div>}</td>
                      <td className="num">{money(p.cost)}</td>
                    </tr>
                  ))}</tbody>
                </table></div>
              )}

              <div className="stm-h">Payments made</div>
              {s.payments.length === 0 ? <p className="note">Nothing paid yet.</p> : (
                <div className="table-wrap"><table className="table">
                  <thead><tr><th>Date</th><th>Paid from</th><th className="num">Amount</th></tr></thead>
                  <tbody>{s.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="muted" style={{ whiteSpace: 'nowrap' }}>{day(p.at)}</td>
                      <td>{p.account}{p.by && <span className="muted"> · {p.by}</span>}{p.note && <div className="note">{p.note}</div>}</td>
                      <td className="num">{money(p.amount)}</td>
                    </tr>
                  ))}</tbody>
                </table></div>
              )}
            </>
          )}
        </div>
      </aside>
      {paying && s && <PayDialog supplier={s} onClose={() => setPaying(false)} />}
    </>
  );
}

function PayDialog({ supplier, onClose }) {
  const qc = useQueryClient();
  const { accounts } = useMoneyAccounts();
  const [amount, setAmount] = useState(String(supplier.owed));
  const [accountId, setAccountId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const paidFrom = accountId || defaultPaidFrom(accounts);
  const schema = useMemo(() => supplierPaymentSchema(supplier.owed), [supplier.owed]);
  const values = useMemo(() => ({ amount, accountId: paidFrom, note }), [amount, paidFrom, note]);
  const fv = useFormValidation(schema, values);

  const pay = useMutation({
    mutationFn: (body) => fetchJson(`/api/admin/suppliers/${supplier.id}/payments`, { method: 'POST', headers: JSON_H, body: JSON.stringify(body) }),
    onSuccess: () => {
      notify.success('Payment recorded', { title: 'Could not record the payment' });
      ['suppliers', 'supplier', 'account-balances', 'account-entries'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      onClose();
    },
    // 409 = more than is owed: the API message says how much is left.
    onError: (e) => reportSaveError(e, { title: 'Could not record the payment', form: fv, setBanner: setError }),
  });

  const submit = (e) => {
    e.preventDefault(); setError('');
    if (!fv.check()) return;
    fv.setServerErrors({});
    pay.mutate({ amount: Number(amount), accountId: Number(paidFrom), note: note.trim() || undefined });
  };

  return (
    <Modal eyebrow="Pay supplier" title={supplier.name} onClose={onClose} busy={pay.isPending}>
      <form onSubmit={submit} noValidate style={{ display: 'contents' }}>
        <div className="modal-b">
          <div className="stm-callout">Owed to {supplier.name}: <b>{money(supplier.owed)}</b>. You cannot pay more than this.</div>
          <Field label="Amount ($)" required {...fv.fieldProps('amount')}>
            <input className="input" type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </Field>
          <AccountField value={paidFrom} onChange={setAccountId} {...fv.fieldProps('accountId')} />
          <Field label="Note (optional)" {...fv.fieldProps('note')}>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Receipt number, part payment..." />
          </Field>
          {error && <div className="adm-error-banner">{error}</div>}
        </div>
        <div className="modal-f">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pay.isPending}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={pay.isPending || !fv.valid}>{pay.isPending ? 'Paying…' : 'Record payment'}</button>
        </div>
      </form>
    </Modal>
  );
}
