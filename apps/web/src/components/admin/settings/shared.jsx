'use client';

import { Button, Card } from '@/components/admin/ui';

// Pieces every Settings section shares: the constants, the section card and
// the one sticky Discard / Save bar (docs/admin-design-system.md).
export const JSON_H = { 'Content-Type': 'application/json' };
export const KIND_LABEL = { cash: 'Cash', wallet: 'Mobile wallet', card: 'Card (Mastercard)', bank: 'Bank', gateway: 'Online (Sifalo)' };
export const ACCOUNTS_KEY = ['account-balances'];
export const SETTINGS_KEY = ['settings'];

/** A settings card: cream header strip (title + sub + actions), padded body. */
export function SettingsCard({ title, sub, actions, flush = false, children }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2.5 flex-wrap px-4 py-[13px] bg-mq-cream border-b border-mq-line">
        <div className="flex-1 min-w-[200px]">
          <h3 className="m-0 text-sm font-semibold tracking-[-.01em] text-mq-ink">{title}</h3>
          {sub && <p className="m-0 mt-px text-xs text-mq-on-tint leading-snug">{sub}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </div>
      {flush ? children : <div className="p-4">{children}</div>}
    </Card>
  );
}

/**
 * The section's one save bar: sticky to the bottom of the viewport, shown only
 * while something is unsaved. `count` = number of changed things.
 */
export function SaveBar({ count, note, saving, canSave = true, onDiscard, onSave, saveLabel = 'Save changes' }) {
  if (!count) return null;
  return (
    <div
      role="region"
      aria-label="Unsaved changes"
      className="sticky bottom-3 z-10 flex items-center gap-2.5 flex-wrap bg-white border border-mq-line rounded-xl shadow-mq-lg px-4 py-3 animate-mq-in motion-reduce:animate-none"
    >
      <span className="text-[13px] text-mq-body mr-auto">
        <b className="font-mq-mono font-semibold text-mq-ink tabular-nums">{count}</b> unsaved {count === 1 ? 'change' : 'changes'}
        {note && <span className="text-mq-muted"> · {note}</span>}
      </span>
      <Button onClick={onDiscard} disabled={saving}>Discard</Button>
      <Button variant="primary" icon="check" onClick={onSave} disabled={saving || !canSave}>{saving ? 'Saving…' : saveLabel}</Button>
    </div>
  );
}

/** Money input with a mono "$" prefix (16px text — iOS zoom rule). */
export function MoneyInput({ className = '', ...props }) {
  return (
    <span className={`flex items-center h-[42px] bg-white border border-mq-line rounded-lg focus-within:border-mq-focus focus-within:shadow-mq-focus has-[:disabled]:bg-mq-canvas has-[[aria-invalid=true]]:border-mq-danger ${className}`}>
      <span className="pl-3 pr-1 font-mq-mono font-semibold text-mq-on-tint" aria-hidden="true">$</span>
      <input
        type="number"
        inputMode="decimal"
        {...props}
        className="flex-1 min-w-0 h-full bg-transparent border-0 outline-none pr-3 font-mq-mono tabular-nums text-base text-mq-ink disabled:text-mq-disabled"
      />
    </span>
  );
}
