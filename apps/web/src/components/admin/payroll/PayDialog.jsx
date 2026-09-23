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
import { Alert, Button, IconButton, Modal, ModalSpacer, inputCls } from '@/components/admin/ui';
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
    <Modal
      eyebrow={`Salary · ${label}`}
      title={lines.length === 1 ? `Pay ${lines[0].name}` : `Pay ${lines.length} people`}
      icon="cash"
      onClose={onClose}
      busy={pay.isPending}
      width={520}
      footer={(
        <>
          <ModalSpacer />
          <Button variant="secondary" size="lg" onClick={onClose} disabled={pay.isPending}>Cancel</Button>
          <Button variant="primary" size="lg" type="submit" form="pay-form" disabled={pay.isPending || !linesOk || !fv.valid}>{pay.isPending ? 'Paying…' : `Pay ${money(total)}`}</Button>
        </>
      )}
    >
      <form id="pay-form" onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <div className="flex flex-col border border-mq-line rounded-[10px] overflow-hidden">
          {lines.map((l) => {
            const bad = touchedLines[l.staffId] && lineErr[l.staffId];
            return (
              <div key={l.staffId} className="flex flex-col gap-1 px-3 py-2.5 border-b border-mq-chip last:border-b-0">
                <div className="flex items-center gap-2.5">
                  <label htmlFor={`pay-${l.staffId}`} className="flex-1 min-w-0 truncate text-[13.5px] font-medium text-mq-ink">{l.name}</label>
                  <div className="relative w-[140px] flex-none">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-mq-muted font-mq-mono pointer-events-none">$</span>
                    <input
                      id={`pay-${l.staffId}`}
                      className={inputCls({ size: 'lg', mono: true, className: 'pl-7 text-right' })}
                      type="number" min="0" step="0.01" inputMode="decimal"
                      aria-invalid={bad ? true : undefined} aria-describedby={lineErr[l.staffId] ? `pay-${l.staffId}-m` : undefined}
                      value={l.amount} onChange={(e) => setAmount(l.staffId, e.target.value)} onBlur={() => setTouchedLines((t) => ({ ...t, [l.staffId]: true }))} autoFocus={lines.length === 1}
                    />
                  </div>
                  {lines.length > 1 && <IconButton icon="x" variant="ghost" size={34} label={`Don’t pay ${l.name} now`} onClick={() => remove(l.staffId)} />}
                </div>
                {lineErr[l.staffId] && (
                  <div id={`pay-${l.staffId}-m`} className={bad ? 'text-xs font-medium text-mq-danger-ink' : 'text-xs text-mq-muted'} role={bad ? 'alert' : undefined}>{lineErr[l.staffId]}</div>
                )}
              </div>
            );
          })}
        </div>
        <AccountField label="Paid from" value={paidFrom} onChange={setAccountId} {...fv.fieldProps('paidFromAccountId')} />
        <Field label="Note (optional)" {...fv.fieldProps('note')}>
          <input className={inputCls({ size: 'lg' })} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. paid by EVC, advance deducted" />
        </Field>
        <p className="m-0 text-xs text-mq-muted">Recorded as <b className="text-mq-body">Salaries</b> expenses for {label}. You can undo a payment afterwards.</p>
        {error && <Alert tone="danger">{error}</Alert>}
      </form>
    </Modal>
  );
}
