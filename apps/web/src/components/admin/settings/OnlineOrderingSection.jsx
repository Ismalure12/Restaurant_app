'use client';

import Field from '@/components/admin/Field';
import { Textarea, ToggleRow } from '@/components/admin/ui';
import { SettingsCard } from './shared';

export const DEFAULT_OFF_MESSAGE = 'Online ordering is coming soon. Please order with a waiter.';

/**
 * Settings › General: the switch for online ordering (QR menu checkout, both
 * dine-in and delivery). Off = customers can still browse the menu, but the
 * basket shows this message instead of checkout, and the API refuses checkout.
 * Controlled — the page owns the draft and the one Save bar.
 */
export default function OnlineOrderingSection({ value, onChange, form, disabled }) {
  const set = (patch) => onChange({ ...value, ...patch });
  return (
    <SettingsCard title="Online ordering" sub="Customers ordering and paying from the QR menu">
      <ToggleRow
        title="Take online orders"
        desc={value.enabled ? 'Customers can check out and pay from the menu.' : 'Customers can browse the menu but cannot check out.'}
        checked={value.enabled}
        onChange={(enabled) => set({ enabled })}
        disabled={disabled}
      />
      <Field label="Message when online ordering is off" hint="Shown in the customer’s basket. Leave empty for the default." {...form.fieldProps('message')}>
        <Textarea
          rows={2}
          maxLength={300}
          placeholder={DEFAULT_OFF_MESSAGE}
          value={value.message}
          disabled={disabled}
          onChange={(e) => set({ message: e.target.value })}
        />
      </Field>
    </SettingsCard>
  );
}
