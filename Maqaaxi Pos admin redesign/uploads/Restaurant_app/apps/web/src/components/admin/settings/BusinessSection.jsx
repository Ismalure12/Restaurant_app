'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import Field from '@/components/admin/Field';
import { useFormValidation } from '@/lib/formValidation';
import { reportSaveError } from '@/lib/saveError';
import { businessSchema } from '@/lib/schemas/settings';
import { SectionHead } from './shared';

// [field, label, wide (textarea), placeholder, input type]
const BIZ_FIELDS = [
  ['businessName', 'Business name', false, 'e.g. Hotel Jazeera Restaurant'],
  ['businessPhone', 'Phone', false, '+252 61 000 0000', 'tel'],
  ['businessAddress', 'Address', false, 'Street, district, city'],
  ['taxId', 'Tax ID (optional)', false, 'Shown on invoices'],
  // First part of every order ID: KFG-260919-0101. Letters/digits, max 8.
  ['orderPrefix', 'Order ID prefix', false, 'KFG'],
  ['receiptFooter', 'Receipt message', true, 'Thank you!'],
  ['invoiceTerms', 'Invoice payment terms', true, 'Payment is due by the due date shown above.'],
];

/** Settings › General: the business identity printed on receipts and invoices. */
export default function BusinessSection() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => fetchJson('/api/admin/settings') });
  // `biz` is a local draft; null means "show what's saved".
  const [biz, setBiz] = useState(null);
  const bizValues = biz ?? Object.fromEntries(BIZ_FIELDS.map(([k]) => [k, settings?.[k] ?? '']));
  const setBizField = (k, v) => setBiz({ ...bizValues, [k]: v });
  const bizForm = useFormValidation(businessSchema, bizValues);
  const saveBiz = useMutation({
    mutationFn: (payload) => fetchJson('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
    onSuccess: (d) => {
      notify.success('Receipt details saved', { title: 'Could not save the receipt details' }); qc.setQueryData(['settings'], d); setBiz(null);
      // Order IDs are formatted server-side with the prefix — refetch lists.
      qc.invalidateQueries({ queryKey: ['orders-all'] });
    },
    onError: (e) => reportSaveError(e, { form: bizForm, title: 'Could not save the receipt details', guess: { orderPrefix: /prefix/i, businessName: /business name/i } }),
  });
  const submitBiz = (e) => {
    e.preventDefault();
    bizForm.setServerErrors({});
    if (!bizForm.check()) return;
    saveBiz.mutate({ ...bizValues, orderPrefix: String(bizValues.orderPrefix || '').trim().toUpperCase() });
  };

  return (
      <section className="card set-sec">
        <SectionHead gold icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2h16v20l-3-2-3 2-2-2-2 2-3-2-3 2z" /><path d="M8 7h8M8 11h8M8 15h5" /></svg>} title="Receipt & business details" sub="Printed at the top of every receipt and invoice. Keep the phone and address current so customers can reach you." />
        <div className="set-body">
          <form className="set-form" onSubmit={submitBiz} noValidate>
            <div className="form-grid g1-top">
              {BIZ_FIELDS.filter(([, , wide]) => !wide).map(([k, label, , ph, type]) => (
                <Field key={k} label={label} required={k === 'businessName' || k === 'orderPrefix'} {...bizForm.fieldProps(k)}><input className="input" type={type || 'text'} value={bizValues[k]} onChange={(e) => setBizField(k, e.target.value)} placeholder={ph} /></Field>
              ))}
            </div>
            {BIZ_FIELDS.filter(([, , wide]) => wide).map(([k, label, , ph]) => (
              <Field key={k} label={label} {...bizForm.fieldProps(k)}><textarea className="input" rows={2} value={bizValues[k]} onChange={(e) => setBizField(k, e.target.value)} placeholder={ph} /></Field>
            ))}
            <div className="set-actions">
              {biz && <button type="button" className="btn btn-ghost" onClick={() => { setBiz(null); bizForm.reset(); }} disabled={saveBiz.isPending}>Discard changes</button>}
              <button type="submit" className="btn btn-primary" disabled={saveBiz.isPending || !biz || !bizForm.valid}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 6 9 17l-5-5" /></svg>{saveBiz.isPending ? 'Saving…' : 'Save details'}</button>
            </div>
          </form>
        </div>
      </section>
  );
}
