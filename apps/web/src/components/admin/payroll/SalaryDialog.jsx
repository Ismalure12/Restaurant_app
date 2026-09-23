'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson, parseApiError, isConnectionError } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import { useFormValidation } from '@/lib/formValidation';
import { salaryFormSchema } from '@/lib/schemas/payroll';
import Field from '@/components/admin/Field';
import { reportSaveError } from '@/lib/saveError';
import { Alert, Button, Modal, ModalSpacer, Segmented, inputCls, cx } from '@/components/admin/ui';
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
    <Modal
      eyebrow="Change salary"
      title={who}
      icon="arrowUp"
      onClose={onClose}
      busy={save.isPending}
      width={520}
      footer={(
        <>
          <ModalSpacer />
          <Button variant="secondary" size="lg" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button variant="primary" size="lg" type="submit" form="salary-form" disabled={save.isPending || !valid}>
            {save.isPending ? 'Saving…' : `Save from ${monthLabel(fromMonth)}`}
          </Button>
        </>
      )}
    >
      <form id="salary-form" onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-1.5">
          <span aria-hidden="true" className="text-[11px] font-semibold uppercase tracking-[.09em] text-mq-muted">How</span>
          <Segmented label="How" size="lg" className="w-full [&>button]:flex-1" options={MODES.map((m) => ({ value: m.key, label: m.label }))} value={mode} onChange={setMode} />
        </div>
        <div className="grid grid-cols-1 tab:grid-cols-2 gap-3.5">
          <Field label={modeInfo.hint} required {...fv.fieldProps('value')}>
            {(a11y) => (
              <div className="relative">
                {mode !== 'percent' && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-mq-muted font-mq-mono pointer-events-none">$</span>}
                <input
                  {...a11y}
                  className={inputCls({ size: 'lg', mono: true, className: mode === 'percent' ? 'pr-8' : 'pl-7' })}
                  type="number" step="0.01" inputMode="decimal" value={value}
                  onChange={(e) => setValue(e.target.value)} autoFocus placeholder={mode === 'percent' ? '10' : '0.00'}
                />
                {mode === 'percent' && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-mq-muted font-mq-mono pointer-events-none">%</span>}
              </div>
            )}
          </Field>
          <Field label="Starts from" required {...fv.fieldProps('fromMonth')}>
            <input className={inputCls({ size: 'lg' })} type="month" value={fromMonth} min={thisMonth} onChange={(e) => setFromMonth(e.target.value)} />
          </Field>
        </div>
        <p className="m-0 text-xs text-mq-muted">Months before {monthLabel(fromMonth)} keep their salary. Payments already made don’t change.</p>

        <div className="flex flex-col bg-mq-cream border border-mq-line rounded-[10px] px-3.5 py-2.5 max-h-[240px] overflow-y-auto" aria-live="polite">
          {!debounced ? <span className="text-[12.5px] text-mq-muted py-1">Enter an amount to see the new salaries.</span>
            : preview.isLoading ? <span className="text-[12.5px] text-mq-muted py-1">Working it out…</span>
              : preview.isError ? (isConnectionError(preview.error)
                ? <span className="text-[12.5px] text-mq-muted py-1">Can’t work out the new salaries right now.</span>
                : <Alert tone="danger">{parseApiError(preview.error)}</Alert>)
                : changes.map((c) => (
                  <div key={c.staffId} className="flex items-center gap-2.5 py-1.5 border-b border-mq-chip last:border-b-0 text-[13px]">
                    <span className="flex-1 min-w-0 truncate text-mq-ink">{c.name}</span>
                    <span className="font-mq-mono tabular-nums text-mq-muted">{money(c.from)}</span>
                    <span aria-hidden="true" className="text-mq-faint">→</span>
                    <span className={cx('font-mq-mono tabular-nums font-semibold', c.to > c.from ? 'text-mq-ok-ink' : c.to < c.from ? 'text-mq-danger-ink' : 'text-mq-ink')}>{money(c.to)}</span>
                  </div>
                ))}
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
      </form>
    </Modal>
  );
}
