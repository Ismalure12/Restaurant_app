'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson, parseApiError, isConnectionError } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import { useFormValidation } from '@/lib/formValidation';
import { salaryFormSchema } from '@/lib/schemas/payroll';
import Field from '@/components/admin/Field';
import { reportSaveError } from '@/lib/saveError';
import { money, monthLabel } from './payrollUi';

const MODES = [
  { key: 'set', label: 'Set to', hint: 'New monthly amount' },
  { key: 'add', label: 'Raise by $', hint: 'Added to each salary (negative lowers it)' },
  { key: 'percent', label: 'Raise by %', hint: 'Percent of each salary' },
];

const post = (body) => fetchJson('/api/admin/payroll/rates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/**
 * Set or raise salaries from a month onward — one person, the selected
 * people, or everyone (the manager included). Earlier months keep their
 * amount. The old → new list is the server's own dry run, so what you see is
 * exactly what gets saved.
 *   people: [{ staffId, name }] | null (null = everyone on the team)
 */
export default function SalaryDialog({ people, thisMonth, onClose }) {
  const qc = useQueryClient();
  const single = people?.length === 1 ? people[0] : null;
  const [mode, setMode] = useState(single ? 'set' : 'percent');
  const [value, setValue] = useState('');
  const [fromMonth, setFromMonth] = useState(thisMonth);
  const [error, setError] = useState('');

  const target = people ? { staffIds: people.map((p) => p.staffId) } : { all: true };
  const n = Number(value);
  const schema = useMemo(() => salaryFormSchema(mode, thisMonth), [mode, thisMonth]);
  const values = useMemo(() => ({ value, fromMonth }), [value, fromMonth]);
  const fv = useFormValidation(schema, values);
  const valid = fv.valid;

  // Debounce typing so the preview isn't requested on every keystroke.
  const [debounced, setDebounced] = useState(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(valid ? { mode, value: n, fromMonth } : null), 250);
    return () => clearTimeout(t);
  }, [mode, n, fromMonth, valid]);
  const targetKey = JSON.stringify(target);
  const preview = useQuery({
    queryKey: ['salary-preview', targetKey, debounced],
    queryFn: () => post({ ...target, ...debounced, dryRun: true }),
    enabled: !!debounced,
    retry: false,
  });

  const save = useMutation({
    mutationFn: () => post({ ...target, mode, value: n, fromMonth }),
    onSuccess: (r) => {
      const changed = r.changes.filter((c) => c.from !== c.to).length;
      notify.success(`${changed || r.changes.length} ${(changed || r.changes.length) === 1 ? 'salary' : 'salaries'} updated from ${r.label}`, { title: 'Could not save the salary change' });
      qc.invalidateQueries({ queryKey: ['payroll'] });
      qc.invalidateQueries({ queryKey: ['payroll-staff'] });
      qc.invalidateQueries({ queryKey: ['staff-list'] });
      onClose();
    },
    onError: (e) => reportSaveError(e, { title: 'Could not save the salary change', form: fv, setBanner: setError }),
  });

  const submit = (e) => {
    e.preventDefault(); setError('');
    if (!fv.check()) return;
    fv.setServerErrors({});
    save.mutate();
  };

  const changes = preview.data?.changes || [];
  const who = single ? single.name : people ? `${people.length} people` : 'Everyone on the team';
  const modeInfo = MODES.find((m) => m.key === mode);

  return (
    <div className="jz-modal-bk open" onClick={(e) => { if (e.target === e.currentTarget && !save.isPending) onClose(); }}>
      <div className="modal pr-modal" role="dialog" aria-modal="true" aria-labelledby="sal-title">
        <div className="modal-h">
          <div className="mt"><div className="eyebrow">Change salary</div><div className="h-1" id="sal-title" style={{ marginTop: 3 }}>{who}</div></div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close" disabled={save.isPending}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
        </div>
        <form onSubmit={submit} noValidate style={{ display: 'contents' }}>
          <div className="modal-b">
            <div className="ff">
              <label id="sal-mode">How</label>
              <div className="seg seg-full" role="group" aria-labelledby="sal-mode">
                {MODES.map((m) => <button key={m.key} type="button" className={mode === m.key ? 'active' : ''} onClick={() => setMode(m.key)}>{m.label}</button>)}
              </div>
            </div>
            <div className="g2-cols">
              <Field label={modeInfo.hint} required {...fv.fieldProps('value')}>
                {(a11y) => (
                  <div className="pr-affix">
                    {mode !== 'percent' && <span>$</span>}
                    <input {...a11y} className={`input${a11y['aria-invalid'] ? ' input-err' : ''}`} type="number" step="0.01" inputMode="decimal" value={value}
                      onChange={(e) => setValue(e.target.value)} autoFocus placeholder={mode === 'percent' ? '10' : '0.00'} />
                    {mode === 'percent' && <span>%</span>}
                  </div>
                )}
              </Field>
              <Field label="Starts from" required {...fv.fieldProps('fromMonth')}>
                <input className="input" type="month" value={fromMonth} min={thisMonth} onChange={(e) => setFromMonth(e.target.value)} />
              </Field>
            </div>
            <div className="note">Months before {monthLabel(fromMonth)} keep their salary. Payments already made don’t change.</div>

            <div className="pr-preview" aria-live="polite">
              {!debounced ? <div className="sub">Enter an amount to see the new salaries.</div>
                : preview.isLoading ? <div className="sub">Working it out…</div>
                  : preview.isError ? (isConnectionError(preview.error) ? <div className="sub">Can’t work out the new salaries right now.</div> : <div className="adm-error-banner">{parseApiError(preview.error)}</div>)
                    : changes.map((c) => (
                      <div className="pr-prev-row" key={c.staffId}>
                        <span className="pr-prev-nm">{c.name}</span>
                        <span className="mono sub">{money(c.from)}</span>
                        <span aria-hidden="true">→</span>
                        <span className={`mono strong${c.to > c.from ? ' pr-up' : c.to < c.from ? ' pr-down' : ''}`}>{money(c.to)}</span>
                      </div>
                    ))}
            </div>
            {error && <div className="adm-error-banner">{error}</div>}
          </div>
          <div className="modal-f">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={save.isPending}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={save.isPending || !valid}>
              {save.isPending ? 'Saving…' : `Save from ${monthLabel(fromMonth)}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
