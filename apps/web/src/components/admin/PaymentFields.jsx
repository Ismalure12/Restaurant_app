'use client';

import { useId, useMemo, useState } from 'react';
import { paymentOptions, findOption } from './paymentOptions';
import { inputCls, selectCls, cx } from '@/components/admin/ui';
import { money } from '@/lib/money';


const LABEL = 'text-[11px] font-semibold uppercase tracking-[.1em] text-mq-muted';

/**
 * How a bill is paid, shared by the Register, Orders › Take payment and (without
 * On account) invoice payments. One method per sale — no split tender (owner
 * decision: nobody pays part cash, part wallet). Who collected is never picked
 * here: the server credits the table's waiter, else the signed-in person (the
 * cashier on a delivery). Holds the choice; <PaymentFields> draws it;
 * paymentBody() turns it into the API fields the server re-checks:
 *   { paymentMethod, accountId?, amountReceived? }
 */
export function usePayment(accounts, { invoice = true } = {}) {
  const options = useMemo(() => paymentOptions(accounts || [], { invoice }), [accounts, invoice]);
  const [key, setKey] = useState('cash');
  const [received, setReceived] = useState('');
  const opt = findOption(options, key);
  const reset = () => { setKey('cash'); setReceived(''); };

  return { options, key, setKey, opt, received, setReceived, reset };
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
  };
}

/** A 48px payment-method tile (maroon-soft when chosen). */
function MethodButton({ on, children, ...rest }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={cx(
        'min-h-12 px-2.5 rounded-[9px] text-[13.5px] border font-semibold leading-tight transition-colors',
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
 * Payment method + cash received (+ change due).
 * `compact` = the Register ticket: the method is a dropdown with cash received
 * beside it on one row, so the whole ticket fits a laptop screen. Otherwise
 * (Orders › Take payment) the methods are tiles.
 */
export default function PaymentFields({ pay, total, disabled = false, label = 'Payment method', compact = false }) {
  const uidBase = useId();
  const m = pay.opt.method;
  const short = m === 'cash' && pay.received !== '' && Number(pay.received) < total;
  const methodId = `${uidBase}-method`;

  const received = (
    <input
      className={inputCls({ size: compact ? 'sm' : 'xl', mono: pay.received !== '', className: compact ? 'w-[118px] flex-none !px-2.5' : '' })}
      type="number" min="0" step="0.01" inputMode="decimal"
      value={pay.received} onChange={(e) => pay.setReceived(e.target.value)}
      placeholder={compact ? 'Received' : 'Cash received (optional)'} aria-label="Cash received"
      aria-invalid={short ? true : undefined} disabled={disabled}
    />
  );
  const change = Number(pay.received) > total && (
    <div className={cx('flex items-center justify-between gap-2.5 px-3 rounded-lg bg-mq-soft text-mq-primary font-semibold', compact ? 'py-1 text-[12.5px]' : 'py-[9px] text-[13.5px]')} role="status">
      Change due<span className="font-mq-mono tabular-nums">{money(Number(pay.received) - total)}</span>
    </div>
  );
  const shortMsg = short && <div className="text-xs font-medium text-mq-danger-ink" role="alert">Cash received is less than the total ({money(total)}). Enter the full amount, or leave it blank.</div>;

  if (compact) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <label className={cx(LABEL, 'flex-none')} htmlFor={methodId}>{label === 'Payment method' ? 'Paid with' : label}</label>
          <select
            id={methodId}
            className={selectCls({ size: 'sm', className: 'flex-1 min-w-0 w-auto !text-base' })}
            value={pay.key} onChange={(e) => pay.setKey(e.target.value)} disabled={disabled}
          >
            {pay.options.map((o) => <option key={o.key} value={o.key}>{o.label}{o.hint ? ` · ${o.hint}` : ''}</option>)}
          </select>
          {m === 'cash' && received}
        </div>
        {change}
        {shortMsg}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-[7px]">
        <span className={LABEL} id={`${uidBase}-label`}>{label}</span>
        <div className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(86px,1fr))]" role="group" aria-labelledby={`${uidBase}-label`}>
          {pay.options.map((o) => (
            <MethodButton key={o.key} on={pay.key === o.key} disabled={disabled} onClick={() => pay.setKey(o.key)} title={o.hint || undefined}>{o.label}</MethodButton>
          ))}
        </div>
      </div>

      {m === 'cash' && (
        <div className="flex flex-col gap-1.5">
          {received}
          {change}
          {shortMsg}
        </div>
      )}
    </div>
  );
}
