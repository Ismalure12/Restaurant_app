'use client';

import Field from '@/components/admin/Field';
import { accountName } from '@/hooks/useMoneyAccounts';
import { Alert, Overline, inputCls, selectCls } from '@/components/admin/ui';
import { KIND_LABEL, SettingsCard } from './shared';

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Settings › Money: how days and years are cut, and the cash book's opening
 * balances. Controlled — the page owns the drafts and the one Save bar.
 *   cal:     { dayEnd, fy, set(patch), form }
 *   opening: { date, amountOf(account), setDate, setAmount(id, v), form, saved (date string), todayKey }
 */
export default function CalendarSection({ cal, opening, accounts, loaded, disabled }) {
  return (
    <SettingsCard title="Business calendar" sub="How days and years are cut. The cash book, day closes and statements are built on these.">
      <div className="flex flex-col gap-4">
        {loaded && !opening.saved && (
          <Alert tone="warn" title="Set opening balances">Enter them below to start the cash book. Until then, balances are not tracked from a known starting point.</Alert>
        )}

        <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))' }}>
          <Field label="Business day ends at" required hint="Sales before this hour count towards the previous day; receipt numbers restart after it. Days already closed are not re-sorted." {...cal.form.fieldProps('dayEnd')}>
            <select className={selectCls({ size: 'lg' })} value={cal.dayEnd} disabled={disabled} onChange={(e) => cal.set({ dayEnd: e.target.value })}>
              {[0, 1, 2, 3, 4, 5, 6].map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
            </select>
          </Field>
          <Field label="Financial year starts in" required hint="Locked once a year has been closed." {...cal.form.fieldProps('fy')}>
            <select className={selectCls({ size: 'lg' })} value={cal.fy} disabled={disabled} onChange={(e) => cal.set({ fy: e.target.value })}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </Field>
        </div>

        <div className="flex flex-col gap-2.5">
          <Overline as="h4" className="m-0">Opening balances</Overline>
          <div className="flex flex-col gap-[5px] max-w-[220px]">
            <label htmlFor="opening-date" className="text-[12.5px] text-mq-on-tint">Opening date<span className="text-mq-danger" aria-hidden="true"> *</span></label>
            <Field htmlFor="opening-date" hint="Where the cash book starts. It can’t be in the future." {...opening.form.fieldProps('openDate')}>
              <input id="opening-date" className={inputCls({ size: 'lg' })} type="date" max={opening.todayKey} value={opening.date} disabled={disabled || !loaded} onChange={(e) => opening.setDate(e.target.value)} aria-required="true" />
            </Field>
          </div>
          <div className="flex flex-col">
            {accounts.map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-2.5 py-2 border-b border-mq-chip">
                <label htmlFor={`open-${a.id}`} className="flex flex-col gap-px min-h-[42px] justify-center min-w-0">
                  <span className="text-[13.5px] font-semibold text-mq-ink truncate">{accountName(a)}</span>
                  <span className="text-[11.5px] text-mq-muted">{KIND_LABEL[a.kind] || a.kind}</span>
                </label>
                <Field htmlFor={`open-${a.id}`} className="w-[130px] flex-none" {...opening.form.fieldProps(`bal_${a.id}`)}>
                  <input id={`open-${a.id}`} className={inputCls({ size: 'lg', mono: true, className: 'text-right' })} type="number" min="0" step="0.01" inputMode="decimal" aria-label={`${accountName(a)} opening balance`} value={opening.amountOf(a)} disabled={disabled || !loaded} onChange={(e) => opening.setAmount(a.id, e.target.value)} />
                </Field>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SettingsCard>
  );
}
