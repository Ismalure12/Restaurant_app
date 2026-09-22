'use client';

import { useMemo, useState } from 'react';
import { paymentOptions, tillAccounts, findOption } from './paymentOptions';
import { money } from '@/lib/money';


const cents = (n) => Math.round(Number(n || 0) * 100);

/**
 * How a bill is paid, shared by the Register, Orders › Take payment and (without
 * On account / split) invoice payments. Holds the choice; <PaymentFields> draws
 * it; paymentBody() turns it into the API fields the server re-checks:
 *   { paymentMethod, accountId?, payments?, amountReceived?, collectedById? }
 */
export function usePayment(accounts, { invoice = true, split = true } = {}) {
  const options = useMemo(() => paymentOptions(accounts || [], { invoice }), [accounts, invoice]);
  const [key, setKey] = useState('cash');
  const [received, setReceived] = useState('');
  const [parts, setParts] = useState([]);
  const [collectedBy, setCollectedBy] = useState('');
  const isSplit = split && key === 'split';
  const opt = isSplit ? { key: 'split', method: 'split' } : findOption(options, key);

  const startSplit = () => {
    const till = tillAccounts(accounts || []);
    setParts([{ accountId: till[0]?.id ?? '', amount: '' }, { accountId: till[1]?.id ?? '', amount: '' }]);
    setKey('split');
  };
  const reset = () => { setKey('cash'); setReceived(''); setParts([]); setCollectedBy(''); };

  return { options, key, setKey, opt, isSplit, split, received, setReceived, parts, setParts, startSplit, collectedBy, setCollectedBy, reset };
}

/** Why this payment can't be sent yet (null = fine). */
export function paymentProblem(pay, total) {
  if (pay.opt.method === 'cash' && pay.received !== '' && Number(pay.received) < total) return 'Cash received is less than the total';
  if (pay.isSplit) {
    if (pay.parts.some((p) => !p.accountId || !(Number(p.amount) > 0))) return 'Give every part an account and an amount';
    if (new Set(pay.parts.map((p) => String(p.accountId))).size !== pay.parts.length) return 'Each part must use a different account';
    const sum = pay.parts.reduce((s, p) => s + cents(p.amount), 0);
    if (sum !== cents(total)) return `The parts add up to ${money(sum / 100)} — the total is ${money(total)}`;
  }
  return null;
}

/** The API fields for this payment (the server re-validates every one). */
export function paymentBody(pay) {
  const m = pay.opt.method;
  return {
    paymentMethod: m,
    accountId: m === 'evc' ? pay.opt.accountId : null,
    payments: pay.isSplit ? pay.parts.map((p) => ({ accountId: Number(p.accountId), amount: Number(p.amount) })) : null,
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

/**
 * The chips + cash received + split parts + "Collected by".
 * `collectors` = [{ id, name }] people who can take money (hidden for a waiter,
 * who always collects themselves); `defaultCollector` = label of whoever the
 * server picks when none is chosen (the table's waiter, else "Me").
 */
export default function PaymentFields({ pay, total, accounts, collectors = null, defaultCollector = 'Me', disabled = false, label = 'Payment method' }) {
  const till = tillAccounts(accounts || []);
  const m = pay.opt.method;
  const sum = pay.parts.reduce((s, p) => s + cents(p.amount), 0) / 100;
  // Split rules shown right under the parts: quiet until an amount is typed.
  const splitProblem = pay.isSplit ? paymentProblem(pay, total) : null;
  const splitTouched = pay.parts.some((p) => p.amount !== '');
  const setPart = (i, patch) => pay.setParts((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  // The last part fills whatever is left, so a two-way split is one number.
  const fillRest = (i) => {
    const others = pay.parts.reduce((s, p, j) => (j === i ? s : s + cents(p.amount)), 0);
    const rest = (cents(total) - others) / 100;
    if (rest > 0) setPart(i, { amount: rest.toFixed(2) });
  };

  return (
    <>
      <div className="field-l">{label}</div>
      <div className="chips">
        {pay.options.map((o) => (
          <button key={o.key} type="button" disabled={disabled} className={`chip2${pay.key === o.key ? ' on' : ''}`} onClick={() => pay.setKey(o.key)} title={o.hint || undefined}>{o.label}</button>
        ))}
        {pay.split && till.length > 1 && (
          <button type="button" disabled={disabled} className={`chip2${pay.isSplit ? ' on' : ''}`} onClick={pay.startSplit}>Split</button>
        )}
      </div>

      {m === 'cash' && (
        <>
          <div className="disc-row" style={{ marginTop: 8, marginBottom: 0 }}>
            <input className={`input${pay.received !== '' && Number(pay.received) < total ? ' input-err' : ''}`} type="number" min="0" step="0.01" inputMode="decimal" value={pay.received} onChange={(e) => pay.setReceived(e.target.value)} placeholder="Cash received (optional)" aria-label="Cash received" aria-invalid={pay.received !== '' && Number(pay.received) < total ? true : undefined} disabled={disabled} />
          </div>
          {Number(pay.received) > total && <div className="tf-change"><span>Change due</span><span className="v">{money(Number(pay.received) - total)}</span></div>}
          {pay.received !== '' && Number(pay.received) < total && <div className="field-err" role="alert" style={{ marginTop: 6 }}>Cash received is less than the total ({money(total)}). Enter the full amount, or leave it blank.</div>}
        </>
      )}

      {pay.isSplit && (
        <div className="pay-split">
          {pay.parts.map((p, i) => (
            <div className="pay-part" key={i}>
              <select className="input" value={p.accountId} onChange={(e) => setPart(i, { accountId: e.target.value })} aria-label={`Part ${i + 1} account`} disabled={disabled}>
                {till.map((a) => <option key={a.id} value={a.id}>{a.kind === 'cash' ? 'Cash' : a.label}</option>)}
              </select>
              <input className="input" type="number" min="0" step="0.01" value={p.amount} onChange={(e) => setPart(i, { amount: e.target.value })} onFocus={() => { if (p.amount === '' && i === pay.parts.length - 1) fillRest(i); }} placeholder="Amount" aria-label={`Part ${i + 1} amount`} disabled={disabled} />
              {pay.parts.length > 2 && <button type="button" className="icon-btn" onClick={() => pay.setParts((ps) => ps.filter((_, j) => j !== i))} aria-label={`Remove part ${i + 1}`} disabled={disabled}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg></button>}
            </div>
          ))}
          <div className="pay-split-foot">
            {pay.parts.length < Math.min(4, till.length) && <button type="button" className="btn btn-ghost btn-sm" onClick={() => pay.setParts((ps) => [...ps, { accountId: till.find((a) => !ps.some((p) => String(p.accountId) === String(a.id)))?.id ?? '', amount: '' }])} disabled={disabled}>+ Add part</button>}
            <span className={`sub${cents(sum) === cents(total) ? '' : ' pay-off'}`}>{money(sum)} of {money(total)}</span>
          </div>
          {splitProblem && <div className={splitTouched ? 'field-err' : 'fld-note'} role={splitTouched ? 'alert' : undefined}>{splitProblem}</div>}
        </div>
      )}

      {collectors && m !== 'card' && m !== 'invoice' && (
        <div className="pay-collector">
          <label className="field-l" htmlFor="pay-collector">Collected by</label>
          <select id="pay-collector" className="input" value={pay.collectedBy} onChange={(e) => pay.setCollectedBy(e.target.value)} disabled={disabled}>
            <option value="">{defaultCollector}</option>
            {collectors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
    </>
  );
}
