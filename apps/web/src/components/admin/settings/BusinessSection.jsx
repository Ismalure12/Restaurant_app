'use client';

import Field from '@/components/admin/Field';
import { inputCls, textareaCls } from '@/components/admin/ui';
import { SettingsCard } from './shared';

// [field, label, placeholder, input type, layout] — layout: 'full' spans the
// row, 'area' is a full-width textarea.
export const BIZ_FIELDS = [
  ['businessName', 'Business name', 'e.g. Hotel Jazeera Restaurant'],
  ['businessPhone', 'Phone', '+252 61 000 0000', 'tel'],
  ['businessAddress', 'Address', 'Street, district, city', 'text', 'full'],
  ['taxId', 'Tax ID (optional)', 'Shown on invoices'],
  // First part of every order ID: KFG-260919-0101. Letters/digits, max 8.
  ['orderPrefix', 'Order ID prefix', 'KFG'],
  ['receiptFooter', 'Receipt message', 'Thank you!', 'text', 'area'],
  ['invoiceTerms', 'Invoice payment terms', 'Payment is due by the due date shown above.', 'text', 'area'],
];
export const BIZ_KEYS = BIZ_FIELDS.map(([k]) => k);
/** The saved business details as form values ('' for anything unset). */
export const bizFromSettings = (s) => Object.fromEntries(BIZ_KEYS.map((k) => [k, s?.[k] ?? '']));

/**
 * Settings › General: the business identity printed on receipts and invoices.
 * Controlled — the page owns the draft and the one Save bar.
 */
export default function BusinessSection({ values, onChange, form, disabled }) {
  return (
    <SettingsCard title="Receipt & business details" sub="Printed at the top of every receipt and invoice. Keep the phone and address current so customers can reach you.">
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))' }}>
        {BIZ_FIELDS.map(([k, label, ph, type = 'text', layout]) => (
          <Field
            key={k}
            className={layout ? 'col-span-full' : undefined}
            label={label}
            required={k === 'businessName' || k === 'orderPrefix'}
            hint={k === 'orderPrefix' ? `Order IDs read ${(values.orderPrefix || 'KFG').trim().toUpperCase()}-260919-0101` : undefined}
            {...form.fieldProps(k)}
          >
            {layout === 'area' ? (
              <textarea className={textareaCls('min-h-[68px]')} rows={2} value={values[k]} disabled={disabled} onChange={(e) => onChange(k, e.target.value)} placeholder={ph} />
            ) : (
              <input
                className={inputCls({ size: 'lg', mono: k === 'orderPrefix', className: k === 'orderPrefix' ? 'uppercase' : '' })}
                type={type}
                value={values[k]}
                disabled={disabled}
                onChange={(e) => onChange(k, e.target.value)}
                placeholder={ph}
                maxLength={k === 'orderPrefix' ? 8 : undefined}
              />
            )}
          </Field>
        ))}
      </div>
    </SettingsCard>
  );
}
