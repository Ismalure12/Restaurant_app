'use client';

import { Segmented, inputCls, cx } from '@/components/admin/ui';
import { money } from '@/lib/money';

// Shared by the Register ticket and Orders › Take payment.

// An amount first (the usual case), percent second.
const DISCOUNT_TYPES = [{ value: 'fixed', label: '$' }, { value: 'percent', label: '%' }];

/**
 * Discount typed as a percent or a fixed amount. Render inside
 * <Field {...form.fieldProps('discountValue')}>{(a) => <DiscountRow a11y={a} … />}</Field>
 * so the message lands under it. `compact` = the Register ticket's small row.
 */
export function DiscountRow({ a11y = {}, discount, setDiscount, disabled, compact = false }) {
  return (
    <div className={cx('flex items-center', compact ? 'gap-1.5' : 'gap-2')}>
      <label htmlFor={a11y.id} className="flex-1 min-w-0 text-[11px] font-semibold uppercase tracking-[.09em] text-mq-muted">Discount</label>
      <input
        {...a11y}
        className={inputCls({ size: compact ? 'sm' : 'xl', mono: true, className: cx(compact ? 'w-[84px]' : 'w-[110px]', 'text-right') })}
        type="number" min="0" step="0.01" inputMode="decimal"
        value={discount.value}
        onChange={(e) => setDiscount((d) => ({ ...d, value: e.target.value }))}
        placeholder="0"
        disabled={disabled}
      />
      <Segmented
        size={compact ? 'md' : 'lg'}
        label="Discount type"
        className="flex-none flex-nowrap"
        options={DISCOUNT_TYPES}
        value={discount.type}
        onChange={(type) => setDiscount((d) => ({ ...d, type }))}
      />
    </div>
  );
}

/** Label/amount rows then the Total (19px, 17px compact). rows: [[label, formatted value], …] */
export function TotalsBlock({ rows = [], total, compact = false }) {
  return (
    <div className="flex flex-col gap-[3px]">
      {rows.map(([k, v]) => (
        <div key={k} className={cx('flex justify-between gap-3 text-mq-on-tint', compact ? 'text-[13px]' : 'text-[13.5px]')}>
          {k}<span className="font-mq-mono tabular-nums text-mq-ink">{v}</span>
        </div>
      ))}
      <div className={cx('flex justify-between gap-3 font-bold text-mq-ink', compact ? 'text-[17px]' : 'text-[19px]', rows.length > 0 && (compact ? 'border-t border-mq-line mt-1 pt-1.5' : 'border-t border-mq-line mt-2 pt-2.5'))}>
        Total<span className="font-mq-mono tabular-nums">{money(total)}</span>
      </div>
    </div>
  );
}
