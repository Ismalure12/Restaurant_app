'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchJson, parseApiError } from '@/lib/apiError';
import useConfirm from '@/hooks/useConfirm';

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
const placeholderFor = (p) => (p === 'phone' || p === 'whatsapp') ? '+252 70 000 0000' : 'https://kfggalkacyo.com';
const VARIANTS = [{ value: 'default', label: 'Blue', dot: 'var(--primary)' }, { value: 'green', label: 'Green', dot: 'var(--primary-2)' }, { value: 'spicy', label: 'Spicy', dot: 'var(--rose)' }];
const variantDot = (v) => (VARIANTS.find((x) => x.value === v) || VARIANTS[0]).dot;
const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function SectionHead({ icon, gold, title, sub, action }) {
  return (
    <div className="set-head">
      <span className={`si${gold ? ' gold' : ''}`}>{icon}</span>
      <div style={{ flex: 1 }}><h3>{title}</h3><p className="sub">{sub}</p></div>
      {action}
    </div>
  );
}
function Modal({ title, onClose, onSubmit, saving, children }) {
  return (
    <div className="jz-modal-bk open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-h"><div className="mt"><div className="h-1">{title}</div></div><button className="icon-btn" onClick={onClose} aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg></button></div>
        <form onSubmit={onSubmit}>
          <div className="modal-b">{children}</div>
          <div className="modal-f"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></div>
        </form>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => fetchJson('/api/admin/settings') });
  const [fee, setFee] = useState('');
  const feeValue = fee === '' ? (settings?.deliveryFee != null ? String(settings.deliveryFee) : '') : fee;
  const saveFee = useMutation({
    mutationFn: (v) => fetchJson('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deliveryFee: v }) }),
    onSuccess: (d) => { toast.success(`Delivery fee saved · $${Number(d.deliveryFee).toFixed(2)}`); qc.setQueryData(['settings'], d); setFee(''); },
    onError: (e) => toast.error(parseApiError(e)),
  });
  const submitFee = (e) => { e.preventDefault(); const v = parseFloat(feeValue); if (isNaN(v) || v < 0) { toast.error('Enter a valid amount'); return; } saveFee.mutate(v); };

  const { data: links = [] } = useQuery({ queryKey: ['social-links'], queryFn: () => fetchJson('/api/social-links') });
  const [linkModal, setLinkModal] = useState(null);
  const [linkForm, setLinkForm] = useState({ platform: '', value: '' });
  const usedPlatforms = links.map((l) => l.platform);
  const available = PLATFORMS.filter((p) => !usedPlatforms.includes(p.value));
  const saveLink = useMutation({
    mutationFn: (p) => fetchJson(p.id ? `/api/social-links/${p.id}` : '/api/social-links', { method: p.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p.id ? { value: p.value } : { platform: p.platform, value: p.value }) }),
    onSuccess: () => { toast.success(linkModal?.id ? 'Link updated' : 'Link added'); qc.invalidateQueries({ queryKey: ['social-links'] }); setLinkModal(null); },
    onError: (e) => toast.error(parseApiError(e)),
  });
  const delLink = useMutation({ mutationFn: (id) => fetchJson(`/api/social-links/${id}`, { method: 'DELETE' }), onSuccess: () => { toast.success('Link removed'); qc.invalidateQueries({ queryKey: ['social-links'] }); }, onError: (e) => toast.error(parseApiError(e)) });
  const openLink = (l) => { setLinkForm({ platform: l?.platform || available[0]?.value || '', value: l?.value || '' }); setLinkModal(l || {}); };
  const removeLink = async (l) => { if (await confirm({ title: `Remove ${platformInfo(l.platform).label}?`, body: 'It will disappear from the public menu footer.', confirmLabel: 'Remove' })) delLink.mutate(l.id); };

  const { data: tags = [] } = useQuery({ queryKey: ['tags'], queryFn: () => fetchJson('/api/tags') });
  const [tagModal, setTagModal] = useState(null);
  const [tagForm, setTagForm] = useState({ label: '', slug: '', variant: 'default' });
  const saveTag = useMutation({
    mutationFn: (p) => fetchJson(p.id ? `/api/tags/${p.id}` : '/api/tags', { method: p.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: p.slug || slugify(p.label), label: p.label, variant: p.variant }) }),
    onSuccess: () => { toast.success(tagModal?.id ? 'Tag updated' : 'Tag added'); qc.invalidateQueries({ queryKey: ['tags'] }); setTagModal(null); },
    onError: (e) => toast.error(parseApiError(e)),
  });
  const delTag = useMutation({ mutationFn: (id) => fetchJson(`/api/tags/${id}`, { method: 'DELETE' }), onSuccess: () => { toast.success('Tag removed'); qc.invalidateQueries({ queryKey: ['tags'] }); }, onError: (e) => toast.error(parseApiError(e)) });
  const openTag = (t) => { setTagForm({ label: t?.label || '', slug: t?.slug || '', variant: t?.variant || 'default' }); setTagModal(t || {}); };
  const removeTag = async (t) => { if (await confirm({ title: 'Delete tag?', body: 'It will be removed from every item that uses it.', confirmLabel: 'Delete tag' })) delTag.mutate(t.id); };

  const plus = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>;

  return (
    <div className="set-wrap">
      {dialog}
      <section className="card set-sec">
        <SectionHead icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H3v12M14 9h4l3 3v6M3 18h11" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></svg>} title="Delivery" sub="The standard delivery fee. It's applied automatically to delivery orders at the Register — cashiers can still edit it per order." />
        <div className="set-body">
          <form onSubmit={submitFee} className="fee-set">
            <div className="money-input"><span className="cur">$</span><input type="number" min="0" step="0.5" value={feeValue} onChange={(e) => setFee(e.target.value)} /></div>
            <button type="submit" className="btn btn-primary" disabled={saveFee.isPending}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 6 9 17l-5-5" /></svg>{saveFee.isPending ? 'Saving…' : 'Save fee'}</button>
            <span className="fee-note">Currently <b>${Number(settings?.deliveryFee || 0).toFixed(2)}</b> per delivery order.</span>
          </form>
        </div>
      </section>

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

      <section className="card set-sec">
        <SectionHead icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><path d="M7 7h.01" /></svg>} title="Tags" sub="Labels shown on menu items — dietary flags, promos and badges." action={<button className="btn btn-ghost btn-sm" onClick={() => openTag(null)}>{plus}Add tag</button>} />
        <div className="set-body">
          {tags.length === 0 ? <p className="sub">No tags yet — add your first.</p> : (
            <div className="tag-grid">
              {tags.map((t) => (
                <div className="tg" key={t.id}>
                  <span className="dot" style={{ background: variantDot(t.variant) }} />
                  <div style={{ minWidth: 0 }}><div className="nm">{t.label}</div><div className="ct">{t.slug}</div></div>
                  <button className="ed" onClick={() => openTag(t)} aria-label="Edit"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg></button>
                  <button className="ed danger" onClick={() => removeTag(t)} aria-label="Delete" disabled={delTag.isPending}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {linkModal && (
        <Modal title={linkModal.id ? 'Edit link' : 'Add social link'} onClose={() => setLinkModal(null)} saving={saveLink.isPending} onSubmit={(e) => { e.preventDefault(); saveLink.mutate({ id: linkModal.id, platform: linkForm.platform, value: linkForm.value }); }}>
          <div className="ff"><label>Platform</label>{linkModal.id ? <div className="input" style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 16 }}>{platformInfo(linkForm.platform).icon}</span>{platformInfo(linkForm.platform).label}</div> : <select className="input" value={linkForm.platform} onChange={(e) => setLinkForm({ ...linkForm, platform: e.target.value })} required>{available.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select>}</div>
          <div className="ff"><label>Handle / URL</label><input className="input" value={linkForm.value} onChange={(e) => setLinkForm({ ...linkForm, value: e.target.value })} required placeholder={placeholderFor(linkForm.platform)} /></div>
        </Modal>
      )}
      {tagModal && (
        <Modal title={tagModal.id ? 'Edit tag' : 'Add tag'} onClose={() => setTagModal(null)} saving={saveTag.isPending} onSubmit={(e) => { e.preventDefault(); if (!tagForm.label.trim()) return; saveTag.mutate({ id: tagModal.id, ...tagForm }); }}>
          <div className="ff"><label>Label</label><input className="input" value={tagForm.label} onChange={(e) => setTagForm({ ...tagForm, label: e.target.value })} required placeholder="e.g. Bestseller" /></div>
          <div className="ff"><label>Slug</label><input className="input" value={tagForm.slug} onChange={(e) => setTagForm({ ...tagForm, slug: e.target.value })} placeholder={tagForm.label ? slugify(tagForm.label) : 'auto'} /></div>
          <div className="ff"><label>Colour</label><select className="input" value={tagForm.variant} onChange={(e) => setTagForm({ ...tagForm, variant: e.target.value })}>{VARIANTS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}</select></div>
        </Modal>
      )}
    </div>
  );
}
