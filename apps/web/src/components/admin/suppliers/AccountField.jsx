'use client';

import Field from '@/components/admin/Field';
import useMoneyAccounts, { accountName, payableAccounts } from '@/hooks/useMoneyAccounts';

/**
 * "Paid from" as a validated <Field>: the business account money leaves.
 * Value is the account id as a string, '' until chosen. Spread
 * `form.fieldProps('accountId')` on it so the message shows under the select.
 */
export default function AccountField({ label = 'Paid from', value, onChange, disabled, ...fieldProps }) {
  const { accounts } = useMoneyAccounts();
  const options = payableAccounts(accounts);
  return (
    <Field label={label} required {...fieldProps}>
      <select className="input" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>Choose an account…</option>
        {options.map((a) => <option key={a.id} value={a.id}>{accountName(a)}{a.number ? ` · ${a.number}` : ''}</option>)}
      </select>
    </Field>
  );
}
