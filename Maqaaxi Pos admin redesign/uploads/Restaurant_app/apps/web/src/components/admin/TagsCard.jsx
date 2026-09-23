'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import useConfirm from '@/hooks/useConfirm';
import Field from '@/components/admin/Field';
import { useFormValidation } from '@/lib/formValidation';
import { reportSaveError } from '@/lib/saveError';
import { slugify, tagSchema } from '@/lib/schemas/menu';

const VARIANTS = [{ value: 'default', label: 'Blue', dot: 'var(--primary)' }, { value: 'green', label: 'Green', dot: 'var(--primary-2)' }, { value: 'spicy', label: 'Spicy', dot: 'var(--rose)' }];
const variantDot = (v) => (VARIANTS.find((x) => x.value === v) || VARIANTS[0]).dot;
const plus = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>;

/**
 * Menu tags (dietary flags, badges) shown on dishes — part of the menu, so it
 * lives beside Categories. Everyone who opens the page sees them; only a
 * manager can add, edit or delete (the API enforces the same rule).
 */
export default function TagsCard({ canEdit }) {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const { data: tags = [] } = useQuery({ queryKey: ['tags'], queryFn: () => fetchJson('/api/tags') });
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ label: '', slug: '', variant: 'default' });

  const [banner, setBanner] = useState('');
  const v = useFormValidation(tagSchema, { label: form.label, slug: form.slug });

  const save = useMutation({
    mutationFn: (p) => fetchJson(p.id ? `/api/tags/${p.id}` : '/api/tags', { method: p.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: p.slug || slugify(p.label), label: p.label, variant: p.variant }) }),
    onSuccess: () => { notify.success(modal?.id ? 'Tag updated' : 'Tag added', { title: 'Could not save the tag' }); qc.invalidateQueries({ queryKey: ['tags'] }); setModal(null); },
    onError: (e) => reportSaveError(e, { form: v, setBanner, title: 'Could not save the tag', guess: { slug: /slug|already/i } }),
  });
  const del = useMutation({ mutationFn: (id) => fetchJson(`/api/tags/${id}`, { method: 'DELETE' }), onSuccess: () => { notify.success('Tag removed'); qc.invalidateQueries({ queryKey: ['tags'] }); }, onError: (e) => notify.error(e, { title: 'Could not delete the tag' }) });
  const open = (t) => { v.reset(); setBanner(''); setForm({ label: t?.label || '', slug: t?.slug || '', variant: t?.variant || 'default' }); setModal(t || {}); };
  const remove = async (t) => { if (await confirm({ title: 'Delete tag?', body: 'It will be removed from every item that uses it.', confirmLabel: 'Delete tag' })) del.mutate(t.id); };

  return (
    <section className="card set-sec" style={{ marginTop: 16 }}>
      {dialog}
      <div className="set-head">
        <span className="si"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><path d="M7 7h.01" /></svg></span>
        <div style={{ flex: 1 }}><h3>Tags</h3><p className="sub">Labels shown on menu items — dietary flags and badges. Pick them on each item.</p></div>
        {canEdit && <button className="btn btn-ghost btn-sm" onClick={() => open(null)}>{plus}Add tag</button>}
      </div>
      <div className="set-body">
        {tags.length === 0 ? <p className="sub">No tags yet{canEdit ? ' — add your first.' : '.'}</p> : (
          <div className="tag-grid">
            {tags.map((t) => (
              <div className="tg" key={t.id}>
                <span className="dot" style={{ background: variantDot(t.variant) }} />
                <div style={{ minWidth: 0 }}><div className="nm">{t.label}</div><div className="ct">{t.slug}</div></div>
                {canEdit && (
                  <>
                    <button className="ed" onClick={() => open(t)} aria-label={`Edit ${t.label}`}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg></button>
                    <button className="ed danger" onClick={() => remove(t)} aria-label={`Delete ${t.label}`} disabled={del.isPending}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg></button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <div className="jz-modal-bk open" onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="modal">
            <div className="modal-h"><div className="mt"><div className="h-1">{modal.id ? 'Edit tag' : 'Add tag'}</div></div><button className="icon-btn" onClick={() => setModal(null)} aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg></button></div>
            <form noValidate onSubmit={(e) => { e.preventDefault(); setBanner(''); v.setServerErrors({}); if (!v.check()) return; save.mutate({ id: modal.id, ...form, label: form.label.trim(), slug: form.slug.trim() }); }}>
              <div className="modal-b">
                <Field label="Label" required {...v.fieldProps('label')}><input className="input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Bestseller" /></Field>
                <Field label="Slug" hint="Optional. Lowercase letters, numbers and hyphens; made from the label when left blank." {...v.fieldProps('slug')}><input className="input" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder={form.label ? slugify(form.label) : 'auto'} /></Field>
                <div className="ff"><label htmlFor="tag-variant">Colour</label><select id="tag-variant" className="input" value={form.variant} onChange={(e) => setForm({ ...form, variant: e.target.value })}>{VARIANTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                {banner && <div className="adm-error-banner">{banner}</div>}
              </div>
              <div className="modal-f"><button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={save.isPending || !v.valid}>{save.isPending ? 'Saving…' : 'Save'}</button></div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
