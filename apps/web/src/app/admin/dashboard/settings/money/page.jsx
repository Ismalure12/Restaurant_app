'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import { useFormValidation } from '@/lib/formValidation';
import { reportSaveError } from '@/lib/saveError';
import { calendarSchema, openingSchema, taxSchema } from '@/lib/schemas/settings';
import SettingsForm, { useSettingsReadOnly } from '@/components/admin/settings/SettingsForm';
import AccountsSection, { TaxSection, useAccountsData, useRefreshAccounts } from '@/components/admin/settings/AccountsTaxSection';
import CalendarSection from '@/components/admin/settings/CalendarSection';
import { JSON_H, SETTINGS_KEY, SaveBar } from '@/components/admin/settings/shared';

const taxCalSchema = taxSchema.extend(calendarSchema.shape);
const same = (a, b) => Number(a) === Number(b);

/**
 * Settings › Money: business accounts (saved from their own dialog), then the
 * tax rate, business calendar and opening balances — drafts sent by one Save
 * bar: the settings in one PUT, then the opening balances.
 */
export default function MoneySettingsPage() {
  const qc = useQueryClient();
  const readOnly = useSettingsReadOnly();
  const refreshAccounts = useRefreshAccounts();
  const { data: settings } = useQuery({ queryKey: SETTINGS_KEY, queryFn: () => fetchJson('/api/admin/settings') });
  const { data: acctData } = useAccountsData();
  const accounts = useMemo(() => acctData?.accounts || [], [acctData]);

  // Tax + calendar drafts: undefined = saved value.
  const [draft, setDraft] = useState({});
  const saved = {
    tax: settings?.taxRate != null ? String(settings.taxRate) : '0',
    dayEnd: String(settings?.businessDayEndHour ?? 0),
    fy: String(settings?.fiscalYearStartMonth ?? 1),
  };
  const tc = { tax: draft.tax ?? saved.tax, dayEnd: draft.dayEnd ?? saved.dayEnd, fy: draft.fy ?? saved.fy };
  const tcForm = useFormValidation(taxCalSchema, tc);
  // A cleared field counts as a change (so its message shows and Save stays off).
  const tcChanged = Object.keys(tc).filter((k) => draft[k] !== undefined && (draft[k] === '' || !same(draft[k], saved[k])));

  // Opening balances: null = saved; { date, amounts: {id: string} } = draft.
  const openingSaved = settings?.openingDate || acctData?.openingDate || '';
  const [opening, setOpening] = useState(null);
  const todayKey = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, browser-local (the API re-checks)
  const openDate = opening?.date ?? openingSaved;
  const savedAmount = (a) => (a.openingBalance != null ? String(Number(a.openingBalance)) : '0');
  const openAmount = (a) => opening?.amounts?.[a.id] ?? savedAmount(a);
  const patchOpening = (patch) => setOpening((o) => ({ date: openDate, amounts: {}, ...(o || {}), ...patch }));
  const openSchema = useMemo(() => openingSchema(todayKey), [todayKey]);
  const openForm = useFormValidation(openSchema, { openDate, ...Object.fromEntries(accounts.map((a) => [`bal_${a.id}`, openAmount(a)])) });
  const openChanged = opening
    ? (openDate !== openingSaved ? 1 : 0) + accounts.filter((a) => opening.amounts?.[a.id] !== undefined && (opening.amounts[a.id] === '' || !same(opening.amounts[a.id], savedAmount(a)))).length
    : 0;

  const count = tcChanged.length + openChanged;
  const canSave = !!settings && tcForm.valid && (!openChanged || (!!acctData && openForm.valid));

  const discard = () => { setDraft({}); setOpening(null); tcForm.reset(); openForm.reset(); };

  const save = useMutation({
    mutationFn: async () => {
      const payload = {};
      if (tcChanged.includes('tax')) payload.taxRate = Number(tc.tax);
      if (tcChanged.includes('dayEnd')) payload.businessDayEndHour = Number(tc.dayEnd);
      if (tcChanged.includes('fy')) payload.fiscalYearStartMonth = Number(tc.fy);
      if (Object.keys(payload).length) {
        let d;
        try {
          d = await fetchJson('/api/admin/settings', { method: 'PUT', headers: JSON_H, body: JSON.stringify(payload) });
        } catch (e) { e.stage = 'settings'; throw e; }
        qc.setQueryData(SETTINGS_KEY, d);
        setDraft({});
        refreshAccounts();
      }
      if (openChanged) {
        try {
          await fetchJson('/api/admin/accounts/opening', { method: 'PUT', headers: JSON_H, body: JSON.stringify({ openingDate: openDate, balances: accounts.map((a) => ({ accountId: a.id, amount: Number(openAmount(a)) })) }) });
        } catch (e) { e.stage = 'opening'; throw e; }
        setOpening(null);
        refreshAccounts();
      }
    },
    onSuccess: () => notify.success('Settings saved', { title: 'Could not save the settings' }),
    onError: (e) => {
      if (e.stage === 'opening') { reportSaveError(e, { form: openForm, title: 'Could not save the opening balances', guess: { openDate: /date/i } }); return; }
      reportSaveError(e, { form: tcForm, title: 'Could not save the settings', guess: { tax: /tax/i, dayEnd: /day end|hour/i, fy: /fiscal|financial year|month/i } });
    },
  });
  const submit = () => {
    tcForm.setServerErrors({}); openForm.setServerErrors({});
    const tcOk = tcForm.check();
    const openOk = !openChanged || openForm.check();
    if (tcOk && openOk && canSave) save.mutate();
  };

  const disabled = !settings;
  return (
    <SettingsForm>
      <AccountsSection disabled={readOnly} />
      <TaxSection value={tc.tax} onChange={(v) => setDraft((d) => ({ ...d, tax: v }))} form={tcForm} disabled={disabled} />
      <CalendarSection
        cal={{ dayEnd: tc.dayEnd, fy: tc.fy, set: (p) => setDraft((d) => ({ ...d, ...p })), form: tcForm }}
        opening={{
          date: openDate,
          amountOf: openAmount,
          setDate: (date) => patchOpening({ date }),
          setAmount: (id, v) => patchOpening({ amounts: { ...(opening?.amounts || {}), [id]: v } }),
          form: openForm,
          saved: openingSaved,
          todayKey,
        }}
        accounts={accounts}
        loaded={!!settings && !!acctData}
        disabled={disabled}
      />
      <SaveBar
        count={count}
        saving={save.isPending}
        canSave={canSave}
        onDiscard={discard}
        onSave={submit}
        saveLabel={openChanged && !openingSaved ? 'Save & set opening balances' : 'Save changes'}
      />
    </SettingsForm>
  );
}
