'use client';

import useMoneyAccounts, { accountName, payableAccounts } from '@/hooks/useMoneyAccounts';
import { selectCls } from '@/components/admin/ui/Controls';

/**
 * "Paid from" — which business account money leaves (expenses, salaries,
 * stock purchases). Value is the account id as a string; '' until chosen.
 */
export default function AccountSelect({ id, value, onChange, disabled, label = 'Paid from' }) {
  const { accounts } = useMoneyAccounts();
  const options = payableAccounts(accounts);
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <label htmlFor={id} className="text-[11px] font-semibold uppercase tracking-[.09em] text-mq-muted">{label}</label>
      <select id={id} className={selectCls()} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        <option value="" disabled>Choose an account…</option>
        {options.map((a) => <option key={a.id} value={a.id}>{accountName(a)}{a.number ? ` · ${a.number}` : ''}</option>)}
      </select>
    </div>
  );
}

/** The account a new expense defaults to: the first Cash account. */
export function defaultPaidFrom(accounts) {
  return String(accounts.find((a) => a.kind === 'cash')?.id ?? '');
}
