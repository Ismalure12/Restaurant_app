'use client';

import { useId, useMemo, useState } from 'react';
import { paymentOptions, findOption } from './paymentOptions';
import { inputCls, selectCls, cx } from '@/components/admin/ui';
import { money } from '@/lib/money';


const LABEL = 'text-[11px] font-semibold uppercase tracking-[.1em] text-mq-muted';

/**
 * How a bill is paid, shared by the Register, Orders › Take payment and (without
 * On account) invoice payments. One method per sale — no split tender (owner
 * decision: nobody pays part cash, part wallet). Holds the choice;
 * <PaymentFields> draws it; paymentBody() turns it into the API fields the
 * server re-checks: { paymentMethod, accountId?, amountReceived?, collectedById? }
 */
export function usePayment(accounts, { invoice = true } = {}) {
  const options = useMemo(() => paymentOptions(accounts || [], { invoice }), [accounts, invoice]);
  const [key, setKey] = useState('cash');
  const [received, setReceived] = useState('');
  const [collectedBy, setCollectedBy] = useState('');
  const opt = findOption(options, key);
  const reset = () => { setKey('cash'); setReceived(''); setCollectedBy(''); };

  return { options, key, setKey, opt, received, setReceived, collectedBy, setCollectedBy, reset };
}

/** Why this payment can't be sent yet (null = fine). */
export function paymentProblem(pay, total) {
  if (pay.opt.method === 'cash' && pay.received !== '' && Number(pay.received) < total) return 'Cash received is less than the total';
  return null;
}

/** The API fields for this payment (the server re-validates every one). */
export function paymentBody(pay) {
  const m = pay.opt.method;
  return {
    paymentMethod: m,
    accountId: m === 'evc' ? pay.opt.accountId : null,
    amountReceived: m === 'cash' && pay.received !== '' ? Number(pay.received) : null,
    // Card and On account are never tagged to a person.
    collectedById: m !== 'card' && m !== 'invoice' && pay.collectedBy ? Number(pay.collectedBy) : null,
  };
}

/**
 * The "Collected by" choices. The blank option always means "whoever the server
 * picks": the table's waiter when there is one, else the signed-in person — so
 * "Me (Name)" is listed separately ONLY as an override when a table waiter exists,
 * and the table waiter is never listed again (they are the default already).
 * `waiters` = the ACTIVE waiters list; a tab waiter who isn't in it (left, or
 * deactivated) counts as "no table waiter" — the server falls back to the caller.
 * Returns { collectors, defaultCollector } for <PaymentFields>; collectors is
 * null (no selector) for a waiter, who always collects themselves, and when
 * there is nobody else to choose.
 */
export function collectorChoices(me, waiters, tableWaiter = null) {
  if (!me || me.role === 'waiter') return { collectors: null, defaultCollector: 'Me' };
  const list = Array.isArray(waiters) ? waiters : [];
  const tw = tableWaiter ? list.find((w) => String(w.id) === String(tableWaiter.id)) || null : null;
  const meLabel = `Me${me.name ? ` (${me.name})` : ''}`;
  const others = list
    .filter((w) => w.id !== me.userId && (!tw || w.id !== tw.id))
    .map((w) => ({ id: w.id, name: w.label || w.name || `Waiter #${w.id}` }));
  const collectors = tw && tw.id !== me.userId ? [{ id: me.userId, name: meLabel }, ...others] : others;
  const defaultCollector = tw ? `Table waiter · ${tw.label || tw.name || `#${tw.id}`}` : meLabel;
  return { collectors: collectors.length > 0 ? collectors : null, defaultCollector };
}

/** A 48px payment-method tile (maroon-soft when chosen). */
function MethodButton({ on, compact, children, ...rest }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={cx(
        compact ? 'min-h-9 px-2 rounded-lg text-[13px]' : 'min-h-12 px-2.5 rounded-[9px] text-[13.5px]',
        'border font-semibold leading-tight transition-colors',
        'focus-visible:outline-none focus-visible:shadow-mq-focus disabled:opacity-60 disabled:cursor-not-allowed',
        on ? 'bg-mq-soft border-mq-primary text-mq-primary' : 'bg-white border-mq-line text-mq-body hover:bg-mq-canvas hover:border-mq-line-2',
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * The method tiles + cash received + "Collected by".
 * `collectors` = [{ id, name }] people who can take money (hidden for a waiter,
 * who always collects themselves); `defaultCollector` = label of whoever the
 * server picks when none is chosen (the table's waiter, else "Me").
 * `compact` = the Register ticket: smaller tiles and inputs, "Collected by"
 * on one row, so the whole payment fits a laptop screen.
 */
export default function PaymentFields({ pay, total, collectors = null, defaultCollector = 'Me', disabled = false, label = 'Payment method', compact = false }) {
  const uidBase = useId();
  const m = pay.opt.method;
  const short = m === 'cash' && pay.received !== '' && Number(pay.received) < total;
  const collectorId = `${uidBase}-collector`;

  return (
    <div className={cx('flex flex-col', compact ? 'gap-2' : 'gap-2.5')}>
      <div className={cx('flex flex-col', compact ? 'gap-1.5' : 'gap-[7px]')}>
        <span className={LABEL} id={`${uidBase}-label`}>{label}</span>
        <div className={cx('grid', compact ? 'gap-1.5 grid-cols-[repeat(auto-fit,minmax(76px,1fr))]' : 'gap-2 grid-cols-[repeat(auto-fit,minmax(86px,1fr))]')} role="group" aria-labelledby={`${uidBase}-label`}>
          {pay.options.map((o) => (
            <MethodButton key={o.key} compact={compact} on={pay.key === o.key} disabled={disabled} onClick={() => pay.setKey(o.key)} title={o.hint || undefined}>{o.label}</MethodButton>
          ))}
        </div>
      </div>

      {m === 'cash' && (
        <div className="flex flex-col gap-1.5">
          <input
            className={inputCls({ size: compact ? 'sm' : 'xl', mono: pay.received !== '' })}
            type="number" min="0" step="0.01" inputMode="decimal"
            value={pay.received} onChange={(e) => pay.setReceived(e.target.value)}
            placeholder="Cash received (optional)" aria-label="Cash received"
            aria-invalid={short ? true : undefined} disabled={disabled}
          />
          {Number(pay.received) > total && (
            <div className={cx('flex items-center justify-between gap-2.5 px-3 rounded-lg bg-mq-soft text-mq-primary font-semibold', compact ? 'py-1.5 text-[13px]' : 'py-[9px] text-[13.5px]')} role="status">
              Change due<span className="font-mq-mono tabular-nums">{money(Number(pay.received) - total)}</span>
            </div>
          )}
          {short && <div className="text-xs font-medium text-mq-danger-ink" role="alert">Cash received is less than the total ({money(total)}). Enter the full amount, or leave it blank.</div>}
        </div>
      )}

      {collectors && m !== 'card' && m !== 'invoice' && (
        <div className={compact ? 'flex items-center gap-2' : 'flex flex-col gap-[5px]'}>
          <label className={cx(LABEL, compact && 'flex-none')} htmlFor={collectorId}>Collected by</label>
          <select id={collectorId} className={selectCls({ size: compact ? 'sm' : 'xl', className: compact ? 'flex-1 min-w-0' : '' })} value={pay.collectedBy} onChange={(e) => pay.setCollectedBy(e.target.value)} disabled={disabled}>
            <option value="">{defaultCollector}</option>
            {collectors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
