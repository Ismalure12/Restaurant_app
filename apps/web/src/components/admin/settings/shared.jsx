'use client';

import { Button, Card, cx } from '@/components/admin/ui';

// Pieces every Settings section shares: the constants, the section card and
// the one Discard / Save row (docs/design/Maqaaxi Admin Redesign.dc.html › Settings).
export const JSON_H = { 'Content-Type': 'application/json' };
// Account kinds as the design writes them in the accounts table (short, lower case).
export const KIND_LABEL = { cash: 'cash', wallet: 'wallet', card: 'card', bank: 'bank', gateway: 'online' };
export const ACCOUNTS_KEY = ['account-balances'];
export const SETTINGS_KEY = ['settings'];

/**
 * A settings card: cream header strip (14/600 title over a 12px sub, actions
 * on the right; `actionsClassName` sizes that group), then a 16px body — or
 * the bare children with `flush` (tables).
 */
export function SettingsCard({ title, sub, actions, actionsClassName, flush = false, className, children }) {
  return (
    <Card className={cx('overflow-hidden', className)}>
      <div className="flex items-center gap-2.5 flex-wrap px-4 py-[13px] bg-mq-cream border-b border-mq-line">
        <div className="flex flex-col gap-px flex-[1_1_180px] min-w-0">
          <h3 className="m-0 text-sm font-semibold tracking-[-.01em] text-mq-ink">{title}</h3>
          {sub && <p className="m-0 text-xs text-mq-on-tint leading-snug">{sub}</p>}
        </div>
        {actions && <div className={cx('flex items-center gap-2 flex-wrap', actionsClassName)}>{actions}</div>}
      </div>
      {flush ? children : <div className="p-4">{children}</div>}
    </Card>
  );
}

/**
 * The section's one Discard / Save row, under the last card. With unsaved
 * changes it sticks to the bottom of the screen (on a canvas band) so Save is
 * always in reach; with none, both buttons are off. `count` = changed things.
 */
export function SaveBar({ count, note, saving, canSave = true, onDiscard, onSave, saveLabel = 'Save changes', hidden = false }) {
  if (hidden) return null;
  const dirty = count > 0;
  return (
    <div
      role="region"
      aria-label={dirty ? 'Unsaved changes' : 'Save'}
      className={cx(
        'flex items-center justify-end gap-3 flex-wrap',
        dirty && 'sticky bottom-0 z-10 -mx-1 px-1 py-3 bg-mq-canvas/90 backdrop-blur-[10px] border-t border-mq-line',
      )}
    >
      <span className="w-full tab:w-auto tab:mr-auto empty:hidden text-[12.5px] text-mq-on-tint" aria-live="polite">
        {dirty && <><b className="font-mq-mono font-semibold text-mq-ink tabular-nums">{count}</b> unsaved {count === 1 ? 'change' : 'changes'}{note ? ' · ' : ''}</>}
        {note}
      </span>
      <Button onClick={onDiscard} disabled={saving || !dirty}>Discard</Button>
      <Button variant="primary" onClick={onSave} disabled={saving || !dirty || !canSave}>{saving ? 'Saving…' : saveLabel}</Button>
    </div>
  );
}

/**
 * The design's money field: a 44px box with a mono "$" and a wide mono amount
 * (18px — above the 16px iOS zoom floor). Used for the delivery fee.
 */
export function MoneyInput({ className = '', ...props }) {
  return (
    <span className={cx('inline-flex items-center h-11 bg-white border border-mq-line rounded-[9px] overflow-hidden focus-within:border-mq-focus focus-within:shadow-mq-focus has-[:disabled]:bg-mq-canvas has-[[aria-invalid=true]]:border-mq-danger', className)}>
      <span className="pl-3.5 pr-1 font-mq-mono font-semibold text-mq-on-tint" aria-hidden="true">$</span>
      <input
        type="number"
        inputMode="decimal"
        {...props}
        className="w-24 h-full bg-transparent border-0 outline-none pl-0.5 pr-3.5 font-mq-mono font-semibold tabular-nums text-lg text-mq-ink disabled:text-mq-disabled"
      />
    </span>
  );
}
