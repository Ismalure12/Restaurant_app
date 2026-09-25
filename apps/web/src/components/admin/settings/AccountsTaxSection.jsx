'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import { MONEY_ACCOUNTS_KEY, accountName } from '@/hooks/useMoneyAccounts';
import Field from '@/components/admin/Field';
import { useFormValidation } from '@/lib/formValidation';
import { reportSaveError } from '@/lib/saveError';
import { accountSchema } from '@/lib/schemas/settings';
import {
  Alert, Button, Chip, ChoiceChip, Modal, ModalSpacer, Overline, Table, Th, Td, Tr, EmptyRow, ToggleRow, inputCls,
} from '@/components/admin/ui';
import { ACCOUNTS_KEY, JSON_H, KIND_LABEL, SETTINGS_KEY, SettingsCard } from './shared';

// The design's accounts table writes amounts without the $ ("1,000.00").
const amount = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The accounts query every Money settings card shares (same key + URL as Cash & accounts). */
export function useAccountsData() {
  return useQuery({ queryKey: ACCOUNTS_KEY, queryFn: () => fetchJson('/api/admin/accounts?balances=1') });
}
/** Refetch everything that shows accounts or the calendar after a change. */
export function useRefreshAccounts() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ACCOUNTS_KEY });
    qc.invalidateQueries({ queryKey: MONEY_ACCOUNTS_KEY });
    qc.invalidateQueries({ queryKey: SETTINGS_KEY });
  };
}

/**
 * Settings › Money: the business accounts (Cash, wallets, Mastercard, bank,
 * Sifalo) — every one, active or not. Balances live on Cash & accounts; here
 * each shows its opening balance. A wallet switched to "Show in staff
 * accounts" lets waiters/cashiers add their own number for it (Staff › Team).
 * An account is a record, so it saves from its own dialog.
 */
export default function AccountsSection({ disabled }) {
  const { data: acctData, isError, error, refetch } = useAccountsData();
  const refreshAccounts = useRefreshAccounts();
  const accounts = acctData?.accounts || [];

  const [acctModal, setAcctModal] = useState(null); // {} = new, {id,...} = edit
  const [acctForm, setAcctForm] = useState({ kind: 'wallet', label: '', number: '', isActive: true, staffNumbers: false });
  const [acctBanner, setAcctBanner] = useState('');
  const acctV = useFormValidation(accountSchema, { label: acctForm.label, number: acctForm.number });
  const openAcct = (a) => { acctV.reset(); setAcctBanner(''); setAcctForm({ kind: a?.kind || 'wallet', label: a?.label || '', number: a?.number || '', isActive: a ? a.isActive : true, staffNumbers: Boolean(a?.staffNumbers) }); setAcctModal(a || {}); };
  const saveAcct = useMutation({
    mutationFn: ({ id, ...f }) => id
      ? fetchJson(`/api/admin/accounts/${id}`, { method: 'PUT', headers: JSON_H, body: JSON.stringify({ label: f.label, number: f.number || null, isActive: f.isActive, ...(f.kind === 'wallet' ? { staffNumbers: f.staffNumbers } : {}) }) })
      : fetchJson('/api/admin/accounts', { method: 'POST', headers: JSON_H, body: JSON.stringify({ kind: f.kind, label: f.label, number: f.number || null, staffNumbers: f.kind === 'wallet' && f.staffNumbers }) }),
    onSuccess: () => { notify.success(acctModal?.id ? 'Account updated' : 'Account added', { title: 'Could not save the account' }); refreshAccounts(); setAcctModal(null); },
    onError: (e) => reportSaveError(e, { form: acctV, setBanner: setAcctBanner, title: 'Could not save the account', guess: { label: /name|already/i } }),
  });
  const submitAcct = (e) => {
    e?.preventDefault();
    setAcctBanner(''); acctV.setServerErrors({});
    if (!acctV.check()) return;
    saveAcct.mutate({ id: acctModal.id, kind: acctForm.kind, label: acctForm.label.trim(), number: acctForm.number.trim(), isActive: acctForm.isActive, staffNumbers: acctForm.staffNumbers });
  };

  return (
    <>
      <SettingsCard
        flush
        title="Business accounts"
        sub="Where money lands · these are the till’s payment chips"
        actions={<Button size="xs" onClick={() => openAcct(null)} disabled={disabled || !acctData}>Add account</Button>}
      >
        {isError ? <div className="p-4"><Alert tone="danger" title="Couldn’t load the accounts" action={<Button size="xs" icon="refresh" onClick={() => refetch()}>Retry</Button>}>{error?.message}</Alert></div> : (
          <Table minW={440} label="Business accounts" className="max-desk:[&_td]:!px-3 max-desk:[&_th]:!px-3">
            <thead><tr><Th>Account</Th><Th>Kind</Th><Th>Number</Th><Th align="right">Opening balance</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
            <tbody>
              {!acctData ? <EmptyRow cols={5}>Loading…</EmptyRow> : accounts.length === 0 ? <EmptyRow cols={5}>No accounts yet — add Cash and your wallets.</EmptyRow> : accounts.map((a) => (
                <Tr key={a.id} dim={!a.isActive} className="hover:bg-mq-cream">
                  <Td className="font-medium text-mq-ink">
                    <span className="inline-flex items-center gap-2 flex-wrap">{accountName(a)}{a.kind === 'wallet' && a.staffNumbers && <Chip small tone="info" dot={false} title="Shown in staff accounts">Staff</Chip>}{!a.isActive && <Chip small tone="off" dot={false}>Inactive</Chip>}</span>
                  </Td>
                  <Td className="text-mq-on-tint">{KIND_LABEL[a.kind] || a.kind}</Td>
                  <Td className="text-mq-on-tint">{a.number || '—'}</Td>
                  <Td align="right" className="font-mq-mono tabular-nums whitespace-nowrap text-mq-ink">{a.openingBalance != null ? amount(a.openingBalance) : '—'}</Td>
                  <Td align="right">
                    {a.kind === 'gateway'
                      ? <span className="text-xs text-mq-muted">Automatic</span>
                      : <Button size="xs" className="!text-mq-cta hover:!bg-mq-soft" onClick={() => openAcct(a)} disabled={disabled}>Edit</Button>}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </SettingsCard>

      {acctModal && (
        <Modal
          eyebrow={acctModal.id ? 'Edit account' : 'New account'}
          title={acctModal.id ? accountName(acctModal) : 'Add a business account'}
          icon="cash"
          width={460}
          onClose={() => setAcctModal(null)}
          busy={saveAcct.isPending}
          footer={<><ModalSpacer /><Button onClick={() => setAcctModal(null)} disabled={saveAcct.isPending}>Cancel</Button><Button variant="primary" onClick={submitAcct} disabled={saveAcct.isPending || !acctV.valid}>{saveAcct.isPending ? 'Saving…' : acctModal.id ? 'Save changes' : 'Add account'}</Button></>}
        >
          <form className="flex flex-col gap-3.5" onSubmit={submitAcct} noValidate>
            <Field label="Name" required {...acctV.fieldProps('label')}><input className={inputCls({ size: 'lg' })} value={acctForm.label} maxLength={30} onChange={(e) => setAcctForm({ ...acctForm, label: e.target.value })} placeholder="e.g. EVC Plus" /></Field>
            <Field label="Number (optional)" {...acctV.fieldProps('number')}><input className={inputCls({ size: 'lg', mono: true })} type="tel" value={acctForm.number} maxLength={40} onChange={(e) => setAcctForm({ ...acctForm, number: e.target.value })} placeholder="Wallet or account number" /></Field>
            <div className="flex flex-col gap-1.5">
              <Overline id="acct-kind-label">Kind</Overline>
              <div role="group" aria-labelledby="acct-kind-label" className="flex flex-wrap gap-2">
                {(acctModal.id ? [acctForm.kind] : ['cash', 'wallet', 'card', 'bank']).map((k) => (
                  <ChoiceChip key={k} size="sm" active={acctForm.kind === k} disabled={!!acctModal.id} onClick={() => setAcctForm({ ...acctForm, kind: k })}>{KIND_LABEL[k] || k}</ChoiceChip>
                ))}
              </div>
              {acctModal.id && <span className="text-xs text-mq-muted">The kind is fixed once an account exists.</span>}
            </div>
            {acctForm.kind === 'wallet' && <ToggleRow title="Show in staff accounts" desc="Waiters and cashiers can add their own number for it — it prints on their bills" checked={acctForm.staffNumbers} onChange={(v) => setAcctForm({ ...acctForm, staffNumbers: v })} />}
            {acctModal.id && <ToggleRow title="Active" desc="Shown when taking payment" checked={acctForm.isActive} onChange={(v) => setAcctForm({ ...acctForm, isActive: v })} />}
            {acctBanner && <Alert tone="danger">{acctBanner}</Alert>}
            <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
          </form>
        </Modal>
      )}
    </>
  );
}

/** Settings › Money: tax already included in menu prices. Controlled. */
export function TaxSection({ value, onChange, form, disabled }) {
  return (
    <SettingsCard title="Tax" sub="Included in menu prices, shown on receipts — never added on top of a total">
      <Field label="Tax included in prices (%)" required {...form.fieldProps('tax')}>
        <input className={inputCls({ size: 'lg', mono: true })} type="number" min="0" max="50" step="0.5" inputMode="decimal" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      </Field>
    </SettingsCard>
  );
}
