'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import { useFormValidation } from '@/lib/formValidation';
import { reportSaveError } from '@/lib/saveError';
import { businessSchema, feeSchema } from '@/lib/schemas/settings';
import SettingsForm, { useSettingsReadOnly } from '@/components/admin/settings/SettingsForm';
import BusinessSection, { BIZ_KEYS, bizFromSettings } from '@/components/admin/settings/BusinessSection';
import DeliverySection from '@/components/admin/settings/DeliverySection';
import SocialLinksSection, { blankRows, linkOps, rowsFromLinks } from '@/components/admin/settings/SocialLinksSection';
import { JSON_H, SETTINGS_KEY, SaveBar } from '@/components/admin/settings/shared';

/**
 * Settings › General: what customers see — receipt details, delivery fee,
 * social links. Every edit is a draft; one Save bar sends them all: the
 * settings in one PUT, then each social-link change (POST / PUT / DELETE).
 */
export default function GeneralSettingsPage() {
  const qc = useQueryClient();
  const readOnly = useSettingsReadOnly();
  const { data: settings } = useQuery({ queryKey: SETTINGS_KEY, queryFn: () => fetchJson('/api/admin/settings') });
  const linksQ = useQuery({ queryKey: ['social-links'], queryFn: () => fetchJson('/api/social-links') });
  const links = linksQ.data || [];

  // Drafts; null = show what's saved.
  const [biz, setBiz] = useState(null);
  const [fee, setFee] = useState(null);
  const [rows, setRows] = useState(null);

  const savedBiz = bizFromSettings(settings);
  const bizValues = biz ?? savedBiz;
  const bizForm = useFormValidation(businessSchema, bizValues);
  const bizChanged = biz ? BIZ_KEYS.filter((k) => biz[k] !== savedBiz[k]) : [];

  const savedFee = settings?.deliveryFee != null ? String(settings.deliveryFee) : '';
  const feeValue = fee ?? savedFee;
  const feeForm = useFormValidation(feeSchema, { fee: feeValue });
  const feeChanged = fee != null && Number(fee) !== Number(savedFee);

  const linkRows = rows ?? rowsFromLinks(links);
  const ops = linkOps(links, linkRows);
  // A row with nothing typed can't be saved (saved links are never blank).
  const blanks = blankRows(linkRows);

  const count = bizChanged.length + (feeChanged ? 1 : 0) + ops.length + blanks.length;
  const canSave = !!settings && bizForm.valid && feeForm.valid && blanks.length === 0;

  const discard = () => { setBiz(null); setFee(null); setRows(null); bizForm.reset(); feeForm.reset(); };

  const save = useMutation({
    mutationFn: async () => {
      const payload = {};
      for (const k of bizChanged) payload[k] = k === 'orderPrefix' ? String(bizValues[k] || '').trim().toUpperCase() : bizValues[k];
      if (feeChanged) payload.deliveryFee = Number(feeValue);
      if (Object.keys(payload).length) {
        let d;
        try {
          d = await fetchJson('/api/admin/settings', { method: 'PUT', headers: JSON_H, body: JSON.stringify(payload) });
        } catch (e) { e.stage = 'settings'; throw e; }
        qc.setQueryData(SETTINGS_KEY, d);
        setBiz(null); setFee(null);
        // Order IDs are formatted server-side with the prefix — refetch lists.
        if (payload.orderPrefix) qc.invalidateQueries({ queryKey: ['orders-all'] });
      }
      // One link per request; stop at the first failure. The draft stays, and
      // after the refetch the diff holds only what is still left to send.
      try {
        for (const op of ops) await fetchJson(op.url, { method: op.method, headers: op.body ? JSON_H : undefined, body: op.body ? JSON.stringify(op.body) : undefined });
      } catch (e) { e.stage = 'links'; throw e; } finally {
        if (ops.length) await qc.invalidateQueries({ queryKey: ['social-links'] });
      }
      setRows(null);
    },
    onSuccess: () => notify.success('Settings saved', { title: 'Could not save the settings' }),
    onError: (e) => {
      if (e.stage === 'links') { notify.error(e, { title: 'Could not save the social links' }); return; }
      reportSaveError(e, { form: bizForm, title: 'Could not save the settings', guess: { orderPrefix: /prefix/i, businessName: /business name/i } });
    },
  });
  const submit = () => {
    bizForm.setServerErrors({});
    const bizOk = bizForm.check();
    const feeOk = feeForm.check();
    if (bizOk && feeOk && canSave) save.mutate();
  };

  return (
    <SettingsForm>
      <BusinessSection values={bizValues} onChange={(k, v) => setBiz({ ...bizValues, [k]: v })} form={bizForm} disabled={!settings} />
      <DeliverySection value={feeValue} onChange={setFee} form={feeForm} saved={settings?.deliveryFee} disabled={!settings} />
      <SocialLinksSection rows={linkRows} onChange={setRows} loaded={linksQ.isSuccess} disabled={readOnly} />
      <SaveBar
        count={count}
        note="new receipts use the changes"
        saving={save.isPending}
        canSave={canSave}
        onDiscard={discard}
        onSave={submit}
      />
    </SettingsForm>
  );
}
