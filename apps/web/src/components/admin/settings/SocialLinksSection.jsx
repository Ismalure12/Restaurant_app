'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import useConfirm from '@/hooks/useConfirm';
import Field from '@/components/admin/Field';
import { useFormValidation } from '@/lib/formValidation';
import { reportSaveError } from '@/lib/saveError';
import { socialLinkSchema } from '@/lib/schemas/settings';
import { Modal, SectionHead, plus } from './shared';

const PLATFORMS = [
  { value: 'phone', label: 'Phone', icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>) },
  { value: 'whatsapp', label: 'WhatsApp', icon: (<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" /></svg>) },
  { value: 'instagram', label: 'Instagram', icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="2" y="2" width="20" height="20" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></svg>) },
  { value: 'facebook', label: 'Facebook', icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" /></svg>) },
  { value: 'twitter', label: 'X / Twitter', icon: (<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>) },
  { value: 'tiktok', label: 'TikTok', icon: (<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.88a8.28 8.28 0 0 0 4.76 1.5V6.93a4.84 4.84 0 0 1-1-.24z" /></svg>) },
  { value: 'website', label: 'Website', icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>) },
];
const platformInfo = (p) => PLATFORMS.find((x) => x.value === p) || { value: p, label: p, icon: null };
const placeholderFor = (p) => (p === 'phone' || p === 'whatsapp') ? '+252 70 000 0000' : 'https://example.com';
/** Settings › General: links shown in the public menu footer. */
export default function SocialLinksSection() {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const { data: links = [] } = useQuery({ queryKey: ['social-links'], queryFn: () => fetchJson('/api/social-links') });
  const [linkModal, setLinkModal] = useState(null);
  const [linkForm, setLinkForm] = useState({ platform: '', value: '' });
  const usedPlatforms = links.map((l) => l.platform);
  const available = PLATFORMS.filter((p) => !usedPlatforms.includes(p.value));
  const [linkBanner, setLinkBanner] = useState('');
  const linkV = useFormValidation(socialLinkSchema, linkForm);
  const saveLink = useMutation({
    mutationFn: (p) => fetchJson(p.id ? `/api/social-links/${p.id}` : '/api/social-links', { method: p.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p.id ? { value: p.value } : { platform: p.platform, value: p.value }) }),
    onSuccess: () => { notify.success(linkModal?.id ? 'Link updated' : 'Link added', { title: 'Could not save the link' }); qc.invalidateQueries({ queryKey: ['social-links'] }); setLinkModal(null); },
    onError: (e) => reportSaveError(e, { form: linkV, setBanner: setLinkBanner, title: 'Could not save the link' }),
  });
  const delLink = useMutation({ mutationFn: (id) => fetchJson(`/api/social-links/${id}`, { method: 'DELETE' }), onSuccess: () => { notify.success('Link removed'); qc.invalidateQueries({ queryKey: ['social-links'] }); }, onError: (e) => notify.error(e, { title: 'Could not remove the link' }) });
  const openLink = (l) => { linkV.reset(); setLinkBanner(''); setLinkForm({ platform: l?.platform || available[0]?.value || '', value: l?.value || '' }); setLinkModal(l || {}); };
  const removeLink = async (l) => { if (await confirm({ title: `Remove ${platformInfo(l.platform).label}?`, body: 'It will disappear from the public menu footer.', confirmLabel: 'Remove' })) delLink.mutate(l.id); };

  return (
    <>
      {dialog}
      <section className="card set-sec">
        <SectionHead gold icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>} title="Social links" sub="Shown in the customer menu footer and contact screen." action={available.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => openLink(null)}>{plus}Add link</button>} />
        <div className="set-body">
          {links.length === 0 ? <p className="sub">No links yet — add your first.</p> : links.map((l) => {
            const info = platformInfo(l.platform);
            return (
              <div className="sl" key={l.id}>
                <span className="sl-ic">{info.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}><div className="sl-nm">{info.label}</div><div className="sl-url">{l.value}</div></div>
                <button className="btn btn-ghost btn-sm" onClick={() => openLink(l)}>Edit</button>
                <button className="btn btn-danger btn-sm" onClick={() => removeLink(l)} disabled={delLink.isPending}>Remove</button>
              </div>
            );
          })}
        </div>
      </section>

      {linkModal && (
        <Modal title={linkModal.id ? 'Edit link' : 'Add social link'} onClose={() => setLinkModal(null)} saving={saveLink.isPending} canSave={linkV.valid} banner={linkBanner} onSubmit={(e) => { e.preventDefault(); setLinkBanner(''); linkV.setServerErrors({}); if (!linkV.check()) return; saveLink.mutate({ id: linkModal.id, platform: linkForm.platform, value: linkForm.value.trim() }); }}>
          {linkModal.id
            ? <div className="ff"><label>Platform</label><div className="input" style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 16 }}>{platformInfo(linkForm.platform).icon}</span>{platformInfo(linkForm.platform).label}</div></div>
            : <Field label="Platform" required {...linkV.fieldProps('platform')}><select className="input" value={linkForm.platform} onChange={(e) => setLinkForm({ ...linkForm, platform: e.target.value })}>{available.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></Field>}
          <Field label="Handle / URL" required {...linkV.fieldProps('value')}><input className="input" value={linkForm.value} onChange={(e) => setLinkForm({ ...linkForm, value: e.target.value })} placeholder={placeholderFor(linkForm.platform)} /></Field>
        </Modal>
      )}
    </>
  );
}
