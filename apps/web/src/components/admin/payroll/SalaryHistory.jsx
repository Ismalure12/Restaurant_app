'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import useConfirm from '@/hooks/useConfirm';
import { Button, Drawer, ErrorState, RowSkeletons, SectionLabel, cx } from '@/components/admin/ui';
import { ROLE_LABEL, day, money } from './payrollUi';

/**
 * Side sheet: one person's salary over time and the months they were paid.
 * A paid month prints its payslip (onPayslip); `canChange` = payroll act.
 */
export default function SalaryHistory({ staffId, onClose, onChangeSalary, onPayslip, canChange = true }) {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['payroll-staff', staffId],
    queryFn: () => fetchJson(`/api/admin/payroll/staff/${staffId}`),
  });
  const cancel = useMutation({
    mutationFn: (id) => fetchJson(`/api/admin/payroll/rates/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      notify.success('Upcoming salary change cancelled');
      qc.invalidateQueries({ queryKey: ['payroll-staff'] });
      qc.invalidateQueries({ queryKey: ['payroll'] });
      qc.invalidateQueries({ queryKey: ['staff-list'] });
    },
    onError: (e) => notify.error(e, { title: 'Could not cancel the change' }),
  });
  const askCancel = async (r) => {
    if (await confirm({ title: `Cancel the change from ${r.label}?`, body: `${data.person.name} stays on ${money(data.salary)} a month.`, confirmLabel: 'Cancel change' })) cancel.mutate(r.id);
  };

  return (
    <>
      {dialog}
      <Drawer
        open
        name="salary-history"
        onClose={onClose}
        eyebrow={data ? `${ROLE_LABEL[data.person.role] || data.person.role} · now ${data.salary > 0 ? `${money(data.salary)} / month` : 'no salary'}` : 'Salary history'}
        title={data?.person.name || 'Salary history'}
        footer={data && canChange && <Button variant="primary" block onClick={() => onChangeSalary(data.person)}>Change salary</Button>}
      >
        <div className="flex flex-col gap-3 p-4">
          {isLoading ? <RowSkeletons rows={4} className="!p-0" /> : isError ? <ErrorState error={error} onRetry={refetch} /> : (
            <>
              <SectionLabel className="!mt-0">Salary</SectionLabel>
              {data.rates.length === 0 ? <p className="m-0 text-[12.5px] text-mq-muted">No salary set yet.</p> : (
                <ol className="m-0 p-0 list-none flex flex-col">
                  {data.rates.map((r, i) => {
                    const prev = data.rates[i + 1];
                    const up = prev && r.amount > prev.amount;
                    return (
                      <li key={r.id} className="relative flex items-start gap-3 pl-5 pb-3 last:pb-0 before:absolute before:left-[5px] before:top-3 before:bottom-0 before:w-px before:bg-mq-line last:before:hidden">
                        <span className={cx('absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full border-2 bg-white', r.upcoming ? 'border-mq-warn' : i === data.rates.findIndex((x) => !x.upcoming) ? 'border-mq-primary' : 'border-mq-line-2')} aria-hidden="true" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap text-[13.5px] text-mq-ink">
                            <span><b className="font-mq-mono font-semibold">{money(r.amount)}</b> / month</span>
                            {prev && r.amount !== prev.amount && (
                              <span className={cx('text-[11.5px] font-semibold rounded-full px-[7px] py-px', up ? 'bg-mq-ok-bg text-mq-ok-ink' : 'bg-mq-danger-bg text-mq-danger-ink')}>
                                {up ? '↑' : '↓'} <span className="font-mq-mono">{money(Math.abs(r.amount - prev.amount))}</span>
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-mq-muted">{r.label === 'From the start' ? 'From the start' : `${r.upcoming ? 'Starts' : 'From'} ${r.label}`}{r.setBy ? ` · set by ${r.setBy}` : ''}</div>
                        </div>
                        {r.upcoming && canChange && <Button variant="ghost" size="xs" onClick={() => askCancel(r)} disabled={cancel.isPending}>Cancel</Button>}
                      </li>
                    );
                  })}
                </ol>
              )}

              <SectionLabel>Paid</SectionLabel>
              {data.payments.length === 0 ? <p className="m-0 text-[12.5px] text-mq-muted">No salary paid yet.</p> : (
                <div className="flex flex-col border border-mq-line rounded-[10px] overflow-hidden">
                  {data.payments.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 border-b border-mq-chip last:border-b-0">
                      <div className="flex-1 min-w-0">
                        <div className="text-[13.5px] font-semibold text-mq-ink">{p.label}</div>
                        <div className="text-xs text-mq-muted truncate">{day(p.paidAt)}{p.paidBy ? ` · by ${p.paidBy}` : ''}{p.note ? ` · ${p.note}` : ''}</div>
                      </div>
                      <span className="font-mq-mono tabular-nums text-[13.5px] font-medium text-mq-ink">{money(p.amount)}</span>
                      {onPayslip && (
                        <Button
                          variant="ghost" size="xs" icon="print" aria-label={`Print the ${p.label} payslip`}
                          onClick={() => onPayslip({ name: data.person.name, role: data.person.role, monthLabel: p.label, payment: p })}
                        >
                          Payslip
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </Drawer>
    </>
  );
}
