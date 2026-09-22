'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import { useFormValidation } from '@/lib/formValidation';
import { payAmountSchema, payFormSchema } from '@/lib/schemas/payroll';
import Field from '@/components/admin/Field';
import AccountField from '@/components/admin/suppliers/AccountField';
import { reportSaveError } from '@/lib/saveError';
import useMoneyAccounts from '@/hooks/useMoneyAccounts';
import { defaultPaidFrom } from '@/components/admin/AccountSelect';
import { money } from './payrollUi';

/**
 * Pay one or several people for a month. Each amount starts at that person's
 * salary for the month and can be changed (advance taken, bonus…). Everything
 * is recorded in one go as "Salaries" expenses — all or nothing.
 *   people: [{ staffId, name, salary }]
 */
export default function PayDialog({ people, month, label, onClose }) {
  const qc = useQueryClient();
  const [lines, setLines] = useState(() => people.map((p) => ({ staffId: p.staffId, name: p.name, amount: p.salary > 0 ? String(p.salary) : '' })));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const { accounts } = useMoneyAccounts();
  const [accountId, setAccountId] = useState('');
  const paidFrom = accountId || defaultPaidFrom(accounts);
  const values = useMemo(() => ({ paidFromAccountId: paidFrom, note }), [paidFrom, note]);
  const fv = useFormValidation(payFormSchema, values);
  const [touchedLines, setTouchedLines] = useState({});

  const total = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const lineErr = Object.fromEntries(lines.map((l) => { const r = payAmountSchema.safeParse(l.amount); return [l.staffId, r.success ? '' : r.error.issues[0].message]; }));
  const linesOk = lines.length > 0 && lines.every((l) => !lineErr[l.staffId]);

  const pay = useMutation({
    mutationFn: () => fetchJson('/api/admin/payroll', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, paidFromAccountId: Number(paidFrom), payments: lines.map((l) => ({ staffId: l.staffId, amount: Number(l.amount), note: note.trim() || null })) }),
    }),
    onSuccess: (r) => {
      notify.success(`${r.paid.length === 1 ? `${lines[0].name} paid` : `${r.paid.length} people paid`} · ${money(total)} recorded under Expenses`, { title: 'Could not record the salaries' });
      qc.invalidateQueries({ queryKey: ['payroll'] });
      qc.invalidateQueries({ queryKey: ['payroll-staff'] });
      qc.invalidateQueries({ queryKey: ['expenses'] });
      onClose();
    },
    onError: (e) => reportSaveError(e, { title: 'Could not record the salaries', form: fv, setBanner: setError }),
  });

  const submit = (e) => {
    e.preventDefault(); setError('');
    if (!lines.length) { setError('Nobody left to pay'); return; }
    setTouchedLines(Object.fromEntries(lines.map((l) => [l.staffId, true])));
    if (!linesOk || !fv.check()) return;
    fv.setServerErrors({});
    pay.mutate();
  };
  const setAmount = (id, amount) => setLines((ls) => ls.map((l) => (l.staffId === id ? { ...l, amount } : l)));
  const remove = (id) => setLines((ls) => ls.filter((l) => l.staffId !== id));

  return (
    <div className="jz-modal-bk open" onClick={(e) => { if (e.target === e.currentTarget && !pay.isPending) onClose(); }}>
      <div className="modal pr-modal" role="dialog" aria-modal="true" aria-labelledby="pay-title">
        <div className="modal-h">
          <div className="mt"><div className="eyebrow">Salary · {label}</div><div className="h-1" id="pay-title" style={{ marginTop: 3 }}>{lines.length === 1 ? `Pay ${lines[0].name}` : `Pay ${lines.length} people`}</div></div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close" disabled={pay.isPending}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
        </div>
        <form onSubmit={submit} noValidate style={{ display: 'contents' }}>
          <div className="modal-b">
            <div className="pr-paylist">
              {lines.map((l) => (
                <div className="pr-payline-w" key={l.staffId}>
                  <div className="pr-payline">
                    <label htmlFor={`pay-${l.staffId}`} className="pr-prev-nm">{l.name}</label>
                    <div className="pr-affix">
                      <span>$</span>
                      <input id={`pay-${l.staffId}`} className={`input${touchedLines[l.staffId] && lineErr[l.staffId] ? ' input-err' : ''}`} type="number" min="0" step="0.01" inputMode="decimal"
                        aria-invalid={touchedLines[l.staffId] && lineErr[l.staffId] ? true : undefined} aria-describedby={lineErr[l.staffId] ? `pay-${l.staffId}-m` : undefined}
                        value={l.amount} onChange={(e) => setAmount(l.staffId, e.target.value)} onBlur={() => setTouchedLines((t) => ({ ...t, [l.staffId]: true }))} autoFocus={lines.length === 1} />
                    </div>
                    {lines.length > 1 && (
                      <button type="button" className="icon-btn pr-x" onClick={() => remove(l.staffId)} aria-label={`Don’t pay ${l.name} now`}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>
                  {lineErr[l.staffId] && <div id={`pay-${l.staffId}-m`} className={touchedLines[l.staffId] ? 'field-err' : 'fld-note'} role={touchedLines[l.staffId] ? 'alert' : undefined}>{lineErr[l.staffId]}</div>}
                </div>
              ))}
            </div>
            <AccountField label="Paid from" value={paidFrom} onChange={setAccountId} {...fv.fieldProps('paidFromAccountId')} />
            <Field label="Note (optional)" {...fv.fieldProps('note')}>
              <input className="input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. paid by EVC, advance deducted" />
            </Field>
            <div className="note">Recorded as <b>Salaries</b> expenses for {label}. You can undo a payment afterwards.</div>
            {error && <div className="adm-error-banner">{error}</div>}
          </div>
          <div className="modal-f">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pay.isPending}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={pay.isPending || !linesOk || !fv.valid}>{pay.isPending ? 'Paying…' : `Pay ${money(total)}`}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
