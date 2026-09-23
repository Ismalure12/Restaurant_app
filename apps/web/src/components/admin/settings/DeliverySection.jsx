'use client';

import Field from '@/components/admin/Field';
import { money } from '@/lib/money';
import { MoneyInput, SettingsCard } from './shared';

/**
 * Settings › General: the standard delivery fee. It's applied automatically to
 * delivery orders at the Register — cashiers can still edit it per order.
 * Controlled — the page owns the draft and the one Save bar.
 */
export default function DeliverySection({ value, onChange, form, saved, disabled }) {
  return (
    <SettingsCard title="Delivery" sub="The fee the Register adds to every delivery order.">
      <div className="flex items-start gap-3 flex-wrap">
        <Field htmlFor="delivery-fee" className="w-[150px]" {...form.fieldProps('fee')}>
          {(p) => <MoneyInput {...p} min="0" step="0.5" aria-label="Delivery fee" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />}
        </Field>
        <span className="text-[13.5px] text-mq-on-tint min-h-[42px] flex-[1_1_220px] flex items-center">
          <span>Currently <b className="font-mq-mono font-semibold text-mq-ink">{money(saved || 0)}</b> per delivery order · staff can change it per order.</span>
        </span>
      </div>
    </SettingsCard>
  );
}
