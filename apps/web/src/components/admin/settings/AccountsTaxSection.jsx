'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import { MONEY_ACCOUNTS_KEY, accountName } from '@/hooks/useMoneyAccounts';
import Field from '@/components/admin/Field';
import { useFormValidation } from '@/lib/formValidation';
import { reportSaveError } from '@/lib/saveError';
import { accountSchema, taxSchema } from '@/lib/schemas/settings';
import { money } from '@/lib/money';
import { ACCOUNTS_KEY, JSON_H, KIND_LABEL, Modal, SectionHead, plus } from './shared';

/** Settings › Money: the business accounts (with balances) and the tax rate. */
export default function AccountsTaxSection() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => fetchJson('/api/admin/settings') });
  // Tax already included in menu prices. `pay` is a local draft; null = saved.
  const [pay, setPay] = useState(null);
  const taxValue = pay ?? (settings?.taxRate != null ? String(settings.taxRate) : '0');
  const taxForm = useFormValidation(taxSchema, { tax: taxValue });
  const savePay = useMutation({
    mutationFn: (payload) => fetchJson('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
    onSuccess: (d) => { notify.success('Tax saved', { title: 'Could not save the tax rate' }); qc.setQueryData(['settings'], d); setPay(null); },
    onError: (e) => reportSaveError(e, { form: taxForm, title: 'Could not save the tax rate', guess: { tax: /tax/i } }),
  });
  const submitPay = (e) => {
    e.preventDefault();
    taxForm.setServerErrors({});
    if (!taxForm.check()) return;
    savePay.mutate({ taxRate: Number(taxValue) });
  };

  // Business accounts (Cash, wallets, Mastercard, bank, Sifalo) — every one,
  // active or not, with balances. Staff wallet numbers live in Staff › Team.
  const { data: acctData } = useQuery({ queryKey: ACCOUNTS_KEY, queryFn: () => fetchJson('/api/admin/accounts?balances=1') });
  const accounts = acctData?.accounts || [];
  const refreshAccounts = () => {
    qc.invalidateQueries({ queryKey: ACCOUNTS_KEY });
    qc.invalidateQueries({ queryKey: MONEY_ACCOUNTS_KEY });
    qc.invalidateQueries({ queryKey: ['settings'] });
  };
  const [acctModal, setAcctModal] = useState(null); // {} = new, {id,...} = edit
  const [acctForm, setAcctForm] = useState({ kind: 'wallet', label: '', number: '', isActive: true });
  const openAcct = (a) => { acctV.reset(); setAcctBanner(''); setAcctForm({ kind: a?.kind || 'wallet', label: a?.label || '', number: a?.number || '', isActive: a ? a.isActive : true }); setAcctModal(a || {}); };
  const [acctBanner, setAcctBanner] = useState('');
  const acctV = useFormValidation(accountSchema, { label: acctForm.label, number: acctForm.number });
  const saveAcct = useMutation({
    mutationFn: ({ id, ...f }) => id
      ? fetchJson(`/api/admin/accounts/${id}`, { method: 'PUT', headers: JSON_H, body: JSON.stringify({ label: f.label, number: f.number || null, isActive: f.isActive }) })
      : fetchJson('/api/admin/accounts', { method: 'POST', headers: JSON_H, body: JSON.stringify({ kind: f.kind, label: f.label, number: f.number || null }) }),
    onSuccess: () => { notify.success(acctModal?.id ? 'Account updated' : 'Account added', { title: 'Could not save the account' }); refreshAccounts(); setAcctModal(null); },
    onError: (e) => reportSaveError(e, { form: acctV, setBanner: setAcctBanner, title: 'Could not save the account', guess: { label: /name|already/i } }),
  });
  const submitAcct = (e) => {
    e.preventDefault();
    setAcctBanner(''); acctV.setServerErrors({});
    if (!acctV.check()) return;
    saveAcct.mutate({ id: acctModal.id, kind: acctForm.kind, label: acctForm.label.trim(), number: acctForm.number.trim(), isActive: acctForm.isActive });
  };

  return (
    <>
      <section className="card set-sec">
        <SectionHead gold icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></svg>} title="Business accounts & tax" sub="Where the business's money sits: cash, mobile wallets, the Mastercard, the bank and Sifalo. Each waiter and cashier's own wallet numbers are set in Staff › Team." action={<button type="button" className="btn btn-ghost btn-sm" onClick={() => openAcct(null)} disabled={!acctData}>{plus}Add account</button>} />
        <div className="set-body">
          {!acctData && <p className="sub">Loading…</p>}
          {accounts.map((a) => (
            <div className={`bacc-row${a.isActive ? '' : ' off'}`} key={a.id}>
              <div className="bacc-main">
                <div className="bacc-name">{accountName(a)}{!a.isActive && <span className="pill pill-ghost">Inactive</span>}</div>
                <div className="bacc-meta">{KIND_LABEL[a.kind] || a.kind}{a.number ? ` · ${a.number}` : ''}</div>
              </div>
              <div className="bacc-bal">{money(a.balance)}</div>
              {a.kind === 'gateway' ? <span className="bacc-ro">Automatic</span> : <button type="button" className="btn btn-ghost btn-sm" onClick={() => openAcct(a)}>Edit</button>}
            </div>
          ))}
          <form className="set-form" onSubmit={submitPay} noValidate style={{ marginTop: 16 }}>
            <Field className="g1-narrow" label="Tax included in prices (%)" required {...taxForm.fieldProps('tax')}>
              <input className="input" type="number" min="0" max="50" step="0.5" value={taxValue} disabled={!settings} onChange={(e) => setPay(e.target.value)} />
            </Field>
            <div className="set-actions">
              {pay != null && <button type="button" className="btn btn-ghost" onClick={() => { setPay(null); taxForm.reset(); }} disabled={savePay.isPending}>Discard changes</button>}
              <button type="submit" className="btn btn-primary" disabled={savePay.isPending || pay == null || !settings || !taxForm.valid}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 6 9 17l-5-5" /></svg>{savePay.isPending ? 'Saving…' : 'Save tax'}</button>
            </div>
          </form>
        </div>
      </section>

      {acctModal && (
        <Modal title={acctModal.id ? 'Edit account' : 'Add account'} onClose={() => setAcctModal(null)} saving={saveAcct.isPending} canSave={acctV.valid} banner={acctBanner} onSubmit={submitAcct}>
          <div className="ff"><label htmlFor="acct-kind">Type</label>
            {acctModal.id ? <div className="input" id="acct-kind" style={{ display: 'flex', alignItems: 'center' }}>{KIND_LABEL[acctForm.kind]}</div> : (
              <select id="acct-kind" className="input" value={acctForm.kind} onChange={(e) => setAcctForm({ ...acctForm, kind: e.target.value })}>
                {['wallet', 'cash', 'card', 'bank'].map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
            )}
          </div>
          <Field label="Name" required {...acctV.fieldProps('label')}><input className="input" value={acctForm.label} maxLength={30} onChange={(e) => setAcctForm({ ...acctForm, label: e.target.value })} placeholder="e.g. EVC Plus" /></Field>
          <Field label="Number (optional)" {...acctV.fieldProps('number')}><input className="input" type="tel" value={acctForm.number} maxLength={40} onChange={(e) => setAcctForm({ ...acctForm, number: e.target.value })} placeholder="Business wallet or account number" /></Field>
          {acctModal.id && <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}><input type="checkbox" checked={acctForm.isActive} onChange={(e) => setAcctForm({ ...acctForm, isActive: e.target.checked })} /> Active (shown when taking payment)</label>}
        </Modal>
      )}
    </>
  );
}
