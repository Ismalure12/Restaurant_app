'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import Field from '@/components/admin/Field';
import { useFormValidation } from '@/lib/formValidation';
import { reportSaveError } from '@/lib/saveError';
import { feeSchema } from '@/lib/schemas/settings';
import { SectionHead } from './shared';

/** Settings › General: the standard delivery fee. */
export default function DeliverySection() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => fetchJson('/api/admin/settings') });
  const [fee, setFee] = useState('');
  const feeValue = fee === '' ? (settings?.deliveryFee != null ? String(settings.deliveryFee) : '') : fee;
  const feeForm = useFormValidation(feeSchema, { fee: feeValue });
  const saveFee = useMutation({
    mutationFn: (v) => fetchJson('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deliveryFee: v }) }),
    onSuccess: (d) => { notify.success(`Delivery fee saved · $${Number(d.deliveryFee).toFixed(2)}`, { title: 'Could not save the delivery fee' }); qc.setQueryData(['settings'], d); setFee(''); },
    onError: (e) => reportSaveError(e, { form: feeForm, title: 'Could not save the delivery fee', guess: { fee: /fee/i } }),
  });
  const submitFee = (e) => { e.preventDefault(); feeForm.setServerErrors({}); if (!feeForm.check()) return; saveFee.mutate(Number(feeValue)); };

  return (
      <section className="card set-sec">
        <SectionHead icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H3v12M14 9h4l3 3v6M3 18h11" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></svg>} title="Delivery" sub="The standard delivery fee. It's applied automatically to delivery orders at the Register — cashiers can still edit it per order." />
        <div className="set-body">
          <form onSubmit={submitFee} noValidate className="fee-set g1-fee">
            <Field htmlFor="delivery-fee" {...feeForm.fieldProps('fee')}>
              {(p) => <div className="money-input"><span className="cur">$</span><input {...p} type="number" min="0" step="0.5" aria-label="Delivery fee" value={feeValue} onChange={(e) => setFee(e.target.value)} /></div>}
            </Field>
            <button type="submit" className="btn btn-primary" disabled={saveFee.isPending || !feeForm.valid}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 6 9 17l-5-5" /></svg>{saveFee.isPending ? 'Saving…' : 'Save fee'}</button>
            <span className="fee-note">Currently <b>${Number(settings?.deliveryFee || 0).toFixed(2)}</b> per delivery order.</span>
          </form>
        </div>
      </section>
  );
}
