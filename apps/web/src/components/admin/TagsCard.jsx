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
import {
  Card, CardHeader, Button, Icon, ChoiceChip, Modal, ModalSpacer, Alert, EmptyState, ErrorState, RowSkeletons, inputCls, cx,
} from '@/components/admin/ui';

// Tag.variant → the public menu's three tag styles. (The design's Grey has no
// public-menu style, so it is not offered.)
const COLOURS = [
  { value: 'default', label: 'Maroon', dot: 'bg-mq-primary' },
  { value: 'green', label: 'Green', dot: 'bg-mq-ok' },
  { value: 'spicy', label: 'Red', dot: 'bg-mq-danger' },
];
const dotOf = (v) => (COLOURS.find((c) => c.value === v) || COLOURS[0]).dot;

/**
 * Categories › Tags: labels shown on dishes (dietary flags, badges). Everyone
 * who may view tags sees them; only `tags: act` adds, edits or deletes (the API
 * enforces the same rule). The page's "New tag" button opens the modal through
 * `setModal({})`.
 */
export default function TagsCard({ canEdit, modal, setModal }) {
  const { data: tags = [], isLoading, error, refetch } = useQuery({ queryKey: ['tags'], queryFn: () => fetchJson('/api/tags') });

  return (
    <Card className="overflow-hidden">
      <CardHeader title="Tags on dishes" count={isLoading ? null : tags.length} sub="Pick them on each dish in Menu items" />
      {error && <div className="p-4"><ErrorState error={error} onRetry={refetch} title="Couldn’t load the tags" /></div>}
      {isLoading ? <RowSkeletons rows={3} /> : tags.length === 0 && !error ? (
        <EmptyState
          icon="menu"
          title="No tags yet"
          action={canEdit ? <Button variant="soft" size="sm" icon="plus" onClick={() => setModal({})}>New tag</Button> : null}
        >
          Tags like Vegetarian or Spicy show on the dish in the customer menu.
        </EmptyState>
      ) : (
        <div className="p-4 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(210px, 100%), 1fr))' }}>
          {tags.map((t) => {
            const n = t.itemCount ?? t._count?.items;
            const body = (
              <>
                <span className={cx('w-2.5 h-2.5 rounded-full flex-none', dotOf(t.variant))} aria-hidden="true" />
                <span className="flex flex-col gap-px min-w-0 flex-1">
                  <span className="text-sm font-semibold text-mq-ink truncate">{t.label}</span>
                  <span className="font-mq-mono text-[11.5px] text-mq-muted tabular-nums">{n == null ? t.slug : `${n} ${n === 1 ? 'dish' : 'dishes'}`}</span>
                </span>
                {canEdit && <span className="text-mq-muted"><Icon name="pen" size={15} stroke={1.9} /></span>}
              </>
            );
            const cls = 'flex items-center gap-3 w-full min-h-[56px] text-left bg-mq-cream border border-mq-line rounded-[10px] px-[15px] py-[13px]';
            return canEdit
              ? <button key={t.id} type="button" onClick={() => setModal(t)} aria-label={`Edit ${t.label}`} className={cx(cls, 'transition-colors hover:border-mq-line-2 hover:bg-white focus-visible:outline-none focus-visible:shadow-mq-focus')}>{body}</button>
              : <div key={t.id} className={cls}>{body}</div>;
          })}
        </div>
      )}
      {modal && canEdit && <TagModal key={modal.id ?? 'new'} tag={modal.id ? modal : null} onClose={() => setModal(null)} />}
    </Card>
  );
}

function TagModal({ tag, onClose }) {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [form, setForm] = useState({ label: tag?.label || '', slug: tag?.slug || '', variant: tag?.variant || 'default' });
  const [banner, setBanner] = useState('');
  const v = useFormValidation(tagSchema, { label: form.label, slug: form.slug });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['tags'] }); qc.invalidateQueries({ queryKey: ['menu-items'] }); };

  const save = useMutation({
    mutationFn: (p) => fetchJson(tag ? `/api/tags/${tag.id}` : '/api/tags', {
      method: tag ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: p.slug || slugify(p.label), label: p.label, variant: p.variant }),
    }),
    onSuccess: () => { notify.success(tag ? 'Tag updated' : 'Tag added', { title: 'Could not save the tag' }); refresh(); onClose(); },
    onError: (e) => reportSaveError(e, { form: v, setBanner, title: 'Could not save the tag', guess: { slug: /slug|already/i } }),
  });
  const del = useMutation({
    mutationFn: (id) => fetchJson(`/api/tags/${id}`, { method: 'DELETE' }),
    onSuccess: () => { notify.success('Tag deleted'); refresh(); onClose(); },
    onError: (e) => notify.error(e, { title: 'Could not delete the tag' }),
  });

  const remove = async () => {
    const n = tag.itemCount ?? 0;
    const ok = await confirm({
      title: `Delete the ${tag.label} tag?`,
      body: n ? `It comes off ${n} ${n === 1 ? 'dish' : 'dishes'}. The dishes stay on the menu.` : 'No dish uses it.',
      confirmLabel: 'Delete tag',
    });
    if (ok) del.mutate(tag.id);
  };
  const submit = (e) => {
    e.preventDefault();
    setBanner(''); v.setServerErrors({});
    if (!v.check()) return;
    save.mutate({ ...form, label: form.label.trim(), slug: form.slug.trim() });
  };
  const busy = save.isPending || del.isPending;

  return (
    <Modal
      eyebrow={tag ? 'Edit tag' : 'New tag'}
      title={tag ? tag.label : 'Add a dish tag'}
      onClose={onClose}
      busy={busy}
      footer={(
        <>
          {tag && <Button variant="danger-soft" size="lg" onClick={remove} disabled={busy}>Delete</Button>}
          <ModalSpacer />
          <Button size="lg" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" size="lg" type="submit" form="tag-form" disabled={busy || !v.valid}>{save.isPending ? 'Saving…' : tag ? 'Save changes' : 'Add tag'}</Button>
        </>
      )}
    >
      {dialog}
      <form id="tag-form" noValidate onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
        <Field label="Label" required {...v.fieldProps('label')}>
          <input className={inputCls({ size: 'lg' })} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Bestseller" />
        </Field>
        <Field label="Slug" hint="Optional. Made from the label when blank." {...v.fieldProps('slug')}>
          <input className={inputCls({ size: 'lg', mono: true })} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder={form.label ? slugify(form.label) : 'auto'} />
        </Field>
        <div className="sm:col-span-2 flex flex-col gap-[7px]" role="group" aria-label="Colour">
          <span className="text-[11px] font-semibold uppercase tracking-[.09em] text-mq-muted">Colour</span>
          <div className="flex flex-wrap gap-2">
            {COLOURS.map((c) => (
              <ChoiceChip key={c.value} active={form.variant === c.value} onClick={() => setForm({ ...form, variant: c.value })}>
                <span className={cx('w-2.5 h-2.5 rounded-full', form.variant === c.value ? 'bg-white' : c.dot)} aria-hidden="true" />
                {c.label}
              </ChoiceChip>
            ))}
          </div>
        </div>
        {banner && <Alert tone="danger" className="sm:col-span-2">{banner}</Alert>}
      </form>
    </Modal>
  );
}
