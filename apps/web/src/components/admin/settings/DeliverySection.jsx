'use client';

import Field from '@/components/admin/Field';
import { MoneyInput, SettingsCard } from './shared';

/**
 * Settings › General: the standard delivery fee. It's applied automatically to
 * delivery orders at the Register — cashiers can still edit it per order.
 * Controlled — the page owns the draft and the one Save bar.
 */
export default function DeliverySection({ value, onChange, form, disabled }) {
  return (
    <SettingsCard title="Delivery" sub="The default fee the Register suggests">
      <div className="flex items-start gap-3 flex-wrap">
        <Field htmlFor="delivery-fee" {...form.fieldProps('fee')}>
          {(p) => <MoneyInput {...p} min="0" step="0.5" aria-label="Delivery fee" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />}
        </Field>
        <span className="min-h-11 flex items-center text-[13.5px] text-mq-on-tint">Staff can change it per order.</span>
      </div>
    </SettingsCard>
  );
}
