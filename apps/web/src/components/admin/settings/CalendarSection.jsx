'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import { MONEY_ACCOUNTS_KEY, accountName } from '@/hooks/useMoneyAccounts';
import Field from '@/components/admin/Field';
import { useFormValidation } from '@/lib/formValidation';
import { reportSaveError } from '@/lib/saveError';
import { calendarSchema, openingSchema } from '@/lib/schemas/settings';
import { ACCOUNTS_KEY, JSON_H, KIND_LABEL, SectionHead } from './shared';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Settings › Money: how days and years are cut, and the cash book's opening balances. */
export default function CalendarSection() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => fetchJson('/api/admin/settings') });
  // Same key and shape as the accounts card above it (one request for both).
  const { data: acctData } = useQuery({ queryKey: ACCOUNTS_KEY, queryFn: () => fetchJson('/api/admin/accounts?balances=1') });
  const accounts = acctData?.accounts || [];
  const refreshAccounts = () => {
    qc.invalidateQueries({ queryKey: ACCOUNTS_KEY });
    qc.invalidateQueries({ queryKey: MONEY_ACCOUNTS_KEY });
    qc.invalidateQueries({ queryKey: ['settings'] });
  };

  // Business calendar: day end, financial year start, opening balances.
  const [cal, setCal] = useState({});
  const dayEnd = cal.dayEnd ?? String(settings?.businessDayEndHour ?? 0);
  const fyMonth = cal.fy ?? String(settings?.fiscalYearStartMonth ?? 1);
  const calForm = useFormValidation(calendarSchema, { dayEnd, fy: fyMonth });
  const saveCal = useMutation({
    mutationFn: (payload) => fetchJson('/api/admin/settings', { method: 'PUT', headers: JSON_H, body: JSON.stringify(payload) }),
    onSuccess: (d) => { notify.success('Business calendar saved', { title: 'Could not save the business calendar' }); qc.setQueryData(['settings'], d); setCal({}); refreshAccounts(); },
    onError: (e) => reportSaveError(e, { form: calForm, title: 'Could not save the business calendar', guess: { dayEnd: /day end|hour/i, fy: /fiscal|financial year|month/i } }),
  });
  const calDirty = cal.dayEnd !== undefined || cal.fy !== undefined;
  const submitCal = (e) => {
    e.preventDefault();
    calForm.setServerErrors({});
    if (!calForm.check()) return;
    const payload = {};
    if (cal.dayEnd !== undefined) payload.businessDayEndHour = Number(cal.dayEnd);
    if (cal.fy !== undefined) payload.fiscalYearStartMonth = Number(cal.fy);
    saveCal.mutate(payload);
  };

  const openingSaved = settings?.openingDate || acctData?.openingDate || '';
  const [opening, setOpening] = useState(null); // { date, amounts: {id: string} }
  const todayKey = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, browser-local (the API re-checks)
  const openDate = opening?.date ?? openingSaved;
  const openAmount = (a) => opening?.amounts?.[a.id] ?? (a.openingBalance != null ? String(Number(a.openingBalance)) : '0');
  const setOpen = (patch) => setOpening({ date: openDate, amounts: {}, ...(opening || {}), ...patch });
  const openSchema = useMemo(() => openingSchema(todayKey), [todayKey]);
  const openValues = { openDate, ...Object.fromEntries(accounts.map((a) => [`bal_${a.id}`, openAmount(a)])) };
  const openForm = useFormValidation(openSchema, openValues);
  const saveOpening = useMutation({
    mutationFn: (payload) => fetchJson('/api/admin/accounts/opening', { method: 'PUT', headers: JSON_H, body: JSON.stringify(payload) }),
    onSuccess: () => { notify.success('Opening balances saved', { title: 'Could not save the opening balances' }); setOpening(null); refreshAccounts(); },
    onError: (e) => reportSaveError(e, { form: openForm, title: 'Could not save the opening balances', guess: { openDate: /date/i } }),
  });
  const submitOpening = (e) => {
    e.preventDefault();
    openForm.setServerErrors({});
    if (!openForm.check()) return;
    saveOpening.mutate({ openingDate: openDate, balances: accounts.map((a) => ({ accountId: a.id, amount: Number(openAmount(a)) })) });
  };

  return (
      <section className="card set-sec">
        <SectionHead icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>} title="Business calendar" sub="How your days and years are cut. The cash book, day closes and statements are built on these." />
        <div className="set-body">
          {settings && !openingSaved && (
            <div className="cal-prompt"><b>Set opening balances</b> below to start the cash book. Until then, balances are not tracked from a known starting point.</div>
          )}
          <form className="set-form" onSubmit={submitCal} noValidate>
            <div className="form-grid g1-top">
              <Field label="Business day ends at" required hint="Sales and expenses before this hour count towards the previous day, and receipt numbers restart after it. A change applies to how days are cut from now on; days already closed are not re-sorted." {...calForm.fieldProps('dayEnd')}>
                <select className="input" value={dayEnd} disabled={!settings} onChange={(e) => setCal({ ...cal, dayEnd: e.target.value })}>
                  {[0, 1, 2, 3, 4, 5, 6].map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
                </select>
              </Field>
              <Field label="Financial year starts in" required hint="Which 12 months a year close covers, and what “This year” means in reports. It cannot be changed once a year has been closed." {...calForm.fieldProps('fy')}>
                <select className="input" value={fyMonth} disabled={!settings} onChange={(e) => setCal({ ...cal, fy: e.target.value })}>
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </Field>
            </div>
            <div className="set-actions">
              {calDirty && <button type="button" className="btn btn-ghost" onClick={() => { setCal({}); calForm.reset(); }} disabled={saveCal.isPending}>Discard changes</button>}
              <button type="submit" className="btn btn-primary" disabled={saveCal.isPending || !calDirty || !calForm.valid}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 6 9 17l-5-5" /></svg>{saveCal.isPending ? 'Saving…' : 'Save calendar'}</button>
            </div>
          </form>

          <form className="set-form cal-open" onSubmit={submitOpening} noValidate>
            <h4 className="cal-h">Opening balances</h4>
            <p className="sub">The opening date is where your cash book starts: enter what each account held that day, counted cash and the balance shown in each app or on the bank statement. Money before this date is not in the cash book (older sales stay in reports). It cannot be in the future.</p>
            <Field className="g1-narrow" label="Opening date" required {...openForm.fieldProps('openDate')}>
              <input className="input" type="date" max={todayKey} value={openDate} disabled={!acctData} onChange={(e) => setOpen({ date: e.target.value })} />
            </Field>
            {accounts.map((a) => (
              <div className="cal-acc g1-acc" key={a.id}>
                <label htmlFor={`open-${a.id}`}>{accountName(a)}<span className="cal-k">{KIND_LABEL[a.kind]}</span></label>
                <Field htmlFor={`open-${a.id}`} {...openForm.fieldProps(`bal_${a.id}`)}>
                  {(p) => <div className="money-input"><span className="cur">$</span><input {...p} type="number" min="0" step="0.01" inputMode="decimal" value={openAmount(a)} onChange={(e) => setOpen({ amounts: { ...(opening?.amounts || {}), [a.id]: e.target.value } })} /></div>}
                </Field>
              </div>
            ))}
            <div className="set-actions">
              {opening && <button type="button" className="btn btn-ghost" onClick={() => { setOpening(null); openForm.reset(); }} disabled={saveOpening.isPending}>Discard changes</button>}
              <button type="submit" className="btn btn-primary" disabled={saveOpening.isPending || !acctData || !opening || !openForm.valid}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 6 9 17l-5-5" /></svg>{saveOpening.isPending ? 'Saving…' : openingSaved ? 'Save opening balances' : 'Set opening balances'}</button>
            </div>
          </form>
        </div>
      </section>
  );
}
