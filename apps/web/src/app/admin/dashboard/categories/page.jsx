'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import useConfirm from '@/hooks/useConfirm';
import TagsCard from '@/components/admin/TagsCard';
import Field from '@/components/admin/Field';
import ImageUploadField from '@/components/admin/ImageUploadField';
import { useFormValidation } from '@/lib/formValidation';
import { reportSaveError } from '@/lib/saveError';
import { categorySchema } from '@/lib/schemas/menu';
import useAccess from '@/hooks/useAccess';
import {
  Page, Toolbar, Card, CardHeader, Button, Icon, Chip, Toggle, Segmented, Table, Th, Td, EmptyRow,
  Modal, ModalSpacer, Alert, EmptyState, ErrorState, RowSkeletons, inputCls, cx,
} from '@/components/admin/ui';

const EMPTY_FORM = { name: '', isActive: true, kicker: '', headline: '', sub: '', coverUrl: '' };

export default function CategoriesRoute() {
  return <Suspense fallback={null}><CategoriesPage /></Suspense>;
}

function CategoriesPage() {
  const qc = useQueryClient();
  const { canAct, canView } = useAccess();
  const mayEdit = canAct('categories');
  const showTags = canView('tags');
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') === 'tags' ? 'tags' : 'cats');
  const activeTab = tab === 'tags' && showTags ? 'tags' : 'cats';
  const [editing, setEditing] = useState(null); // null · {} new · a category
  const [tagModal, setTagModal] = useState(null); // null · {} new · a tag
  const [rows, setRows] = useState([]);
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const draggingRef = useRef(false);

  const { data: categories, isLoading, error: loadError, refetch } = useQuery({
    queryKey: ['categories'],
    queryFn: () => fetchJson('/api/categories'),
  });

  // Keep a local ordered copy for instant drag feedback; don't clobber mid-drag.
  // Depend on the query data (stable ref) — not a `[]` fallback that changes each render.
  useEffect(() => {
    if (categories && !draggingRef.current) setRows(categories);
  }, [categories]);

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }) => fetchJson(`/api/categories/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
    onError: (err) => notify.error(err, { title: 'Could not change the category' }),
  });

  const persistOrder = async (ordered) => {
    const changed = ordered.filter((c, i) => c.sortOrder !== i);
    if (!changed.length) return;
    try {
      await Promise.all(ordered.map((c, i) => (c.sortOrder === i
        ? null
        : fetchJson(`/api/categories/${c.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sortOrder: i }) })
      )).filter(Boolean));
      notify.success('Order saved');
    } catch (err) {
      notify.error(err, { title: 'Could not save the new order' });
    } finally {
      qc.invalidateQueries({ queryKey: ['categories'] });
    }
  };

  const endDrag = () => { draggingRef.current = false; setDragIndex(null); setOverIndex(null); };
  const onDragStart = (i) => { draggingRef.current = true; setDragIndex(i); };
  const onDragOver = (e, i) => { e.preventDefault(); if (i !== overIndex) setOverIndex(i); };
  const onDrop = () => {
    if (dragIndex == null || overIndex == null || dragIndex === overIndex) { endDrag(); return; }
    const next = [...rows];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(overIndex, 0, moved);
    setRows(next);
    endDrag();
    persistOrder(next);
  };

  const addLabel = activeTab === 'tags' ? 'New tag' : 'New category';
  const mayAdd = activeTab === 'tags' ? canAct('tags') : mayEdit;

  return (
    <Page>
      <Toolbar>
        {showTags && (
          <Segmented
            label="Categories or tags"
            value={activeTab}
            onChange={setTab}
            options={[{ value: 'cats', label: 'Categories' }, { value: 'tags', label: 'Tags' }]}
          />
        )}
        <span className="flex-1" />
        {mayAdd && (
          <Button variant="primary" icon="plus" onClick={() => (activeTab === 'tags' ? setTagModal({}) : setEditing({}))}>{addLabel}</Button>
        )}
      </Toolbar>

      {activeTab === 'tags' ? (
        <TagsCard canEdit={canAct('tags')} modal={tagModal} setModal={setTagModal} />
      ) : (
        <>
          {loadError && <ErrorState error={loadError} onRetry={refetch} title="Couldn’t load the categories" />}
          <Card className="overflow-hidden">
            <CardHeader
              title="Menu sections"
              count={isLoading ? null : rows.length}
              actions={mayEdit && rows.length > 1 ? <span className="text-[12.5px] text-mq-on-tint">Drag to reorder — the customer menu follows this order</span> : null}
            />
            {isLoading ? <RowSkeletons rows={6} /> : rows.length === 0 && !loadError ? (
              <EmptyState
                icon="categories"
                title="No categories yet"
                action={mayEdit ? <Button variant="soft" size="sm" icon="plus" onClick={() => setEditing({})}>New category</Button> : null}
              >
                Create your first category to start organising the menu.
              </EmptyState>
            ) : (
              <Table label="Categories" minW={460}>
                <thead>
                  <tr>
                    {mayEdit && <Th className="w-[34px]"><span className="sr-only">Reorder</span></Th>}
                    <Th>Category</Th>
                    <Th align="right">Items</Th>
                    <Th>Status</Th>
                    <Th><span className="sr-only">Actions</span></Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && <EmptyRow cols={5}>No categories.</EmptyRow>}
                  {rows.map((cat, i) => (
                    <tr
                      key={cat.id}
                      draggable={mayEdit}
                      onDragStart={mayEdit ? () => onDragStart(i) : undefined}
                      onDragOver={mayEdit ? (e) => onDragOver(e, i) : undefined}
                      onDrop={mayEdit ? onDrop : undefined}
                      onDragEnd={mayEdit ? endDrag : undefined}
                      onClick={mayEdit ? () => setEditing(cat) : undefined}
                      className={cx(
                        mayEdit && 'cursor-pointer hover:bg-mq-cream',
                        dragIndex === i && 'opacity-50',
                        overIndex === i && dragIndex !== i && 'shadow-[inset_0_2px_0_#850D33]',
                      )}
                    >
                      {mayEdit && (
                        <Td className="w-[34px] text-mq-faint cursor-grab active:cursor-grabbing">
                          <span aria-label="Drag to reorder" title="Drag to reorder"><Icon name="grip" size={16} stroke={2.4} /></span>
                        </Td>
                      )}
                      <Td>
                        <div className="flex items-center gap-3 min-w-0">
                          {cat.coverUrl && (
                            // eslint-disable-next-line @next/next/no-img-element -- uploaded cover (blob URL)
                            <img src={cat.coverUrl} alt="" className="w-8 h-8 rounded-md object-cover border border-mq-line flex-none" />
                          )}
                          <div className="min-w-0">
                            <div className="font-semibold text-mq-ink truncate">{cat.name}</div>
                            {cat.kicker && <div className="text-xs text-mq-muted truncate">{cat.kicker}</div>}
                          </div>
                        </div>
                      </Td>
                      <Td money className="!font-normal">{cat._count?.items ?? 0}</Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          {mayEdit && (
                            <span className="inline-grid place-items-center w-12 h-11 -my-2.5" onClick={(e) => e.stopPropagation()}>
                              <Toggle
                                checked={cat.isActive}
                                label={`${cat.name}: ${cat.isActive ? 'visible' : 'hidden'} on the menu`}
                                disabled={toggleMutation.isPending && toggleMutation.variables?.id === cat.id}
                                onChange={(on) => toggleMutation.mutate({ id: cat.id, isActive: on })}
                              />
                            </span>
                          )}
                          <Chip small tone={cat.isActive ? 'ok' : 'off'}>{cat.isActive ? 'Visible' : 'Hidden'}</Chip>
                        </div>
                      </Td>
                      <Td align="right">
                        {mayEdit && (
                          <button type="button" className="text-[12.5px] font-semibold text-mq-cta hover:text-mq-primary min-h-9 px-1" onClick={(e) => { e.stopPropagation(); setEditing(cat); }}>
                            Edit
                          </button>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      )}

      {editing && <CategoryModal key={editing.id ?? 'new'} category={editing.id ? editing : null} onClose={() => setEditing(null)} />}
    </Page>
  );
}

function CategoryModal({ category, onClose }) {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const editingId = category?.id ?? null;
  const dishes = category?._count?.items ?? 0;
  const [form, setForm] = useState(() => (category ? {
    name: category.name, isActive: category.isActive,
    kicker: category.kicker || '', headline: category.headline || '', sub: category.sub || '', coverUrl: category.coverUrl || '',
  } : EMPTY_FORM));
  const [uploading, setUploading] = useState(false);
  const [banner, setBanner] = useState('');
  const [blocked, setBlocked] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const v = useFormValidation(categorySchema, { name: form.name, kicker: form.kicker, headline: form.headline, sub: form.sub });

  const saveMutation = useMutation({
    mutationFn: (payload) => fetchJson(editingId ? `/api/categories/${editingId}` : '/api/categories', {
      method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    }),
    onSuccess: () => {
      notify.success(editingId ? 'Category updated' : 'Category added', { title: 'Could not save the category' });
      qc.invalidateQueries({ queryKey: ['categories'] });
      qc.invalidateQueries({ queryKey: ['menu-items'] });
      onClose();
    },
    onError: (err) => reportSaveError(err, { form: v, setBanner, title: 'Could not save the category' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => fetchJson(`/api/categories/${id}`, { method: 'DELETE' }),
    onSuccess: () => { notify.success('Category deleted'); qc.invalidateQueries({ queryKey: ['categories'] }); onClose(); },
    // 409: it still has dishes (someone added one since the list loaded) — say so here.
    onError: (err) => { if (err?.status === 409) setBlocked(err.message); else notify.error(err, { title: 'Could not delete the category' }); qc.invalidateQueries({ queryKey: ['categories'] }); },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setBanner(''); v.setServerErrors({});
    if (!v.check()) return;
    saveMutation.mutate({
      name: form.name.trim(),
      isActive: form.isActive,
      kicker: form.kicker.trim() || null,
      headline: form.headline.trim() || null,
      sub: form.sub.trim() || null,
      coverUrl: form.coverUrl || null,
    });
  };

  const handleDelete = async () => {
    // A category with dishes can't be deleted (the API refuses with 409 too).
    if (dishes > 0) { setBlocked(`Move or delete its ${dishes} ${dishes === 1 ? 'dish' : 'dishes'} first.`); return; }
    const ok = await confirm({ title: `Delete ${category.name}?`, body: 'The category is empty, so nothing else changes.', confirmLabel: 'Delete category' });
    if (ok) deleteMutation.mutate(editingId);
  };

  const busy = saveMutation.isPending || deleteMutation.isPending;
  return (
    <Modal
      eyebrow={editingId ? 'Edit category' : 'New category'}
      title={editingId ? (form.name || 'Category') : 'Add a menu section'}
      onClose={onClose}
      busy={busy}
      width={560}
      footer={(
        <>
          {editingId && <Button variant="danger-soft" size="lg" onClick={handleDelete} disabled={busy}>Delete</Button>}
          <ModalSpacer />
          <Button size="lg" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" size="lg" type="submit" form="category-form" disabled={busy || uploading || !v.valid}>
            {saveMutation.isPending ? 'Saving…' : editingId ? 'Save changes' : 'Add category'}
          </Button>
        </>
      )}
    >
      {dialog}
      <form id="category-form" onSubmit={handleSubmit} noValidate className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
        {blocked && (
          <Alert tone="danger" title="Can’t delete this category" className="sm:col-span-2">
            {blocked} A category with dishes can’t be deleted — reassign them in Menu items.
          </Alert>
        )}
        <Field className="sm:col-span-2" label="Category name" required {...v.fieldProps('name')}>
          <input className={inputCls({ size: 'lg' })} type="text" value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Kicker" {...v.fieldProps('kicker')}>
          <input className={inputCls({ size: 'lg' })} type="text" value={form.kicker} onChange={(e) => set({ kicker: e.target.value })} placeholder="e.g. Until 11 AM" />
        </Field>
        <Field label="Subline" {...v.fieldProps('sub')}>
          <input className={inputCls({ size: 'lg' })} type="text" value={form.sub} onChange={(e) => set({ sub: e.target.value })} placeholder="Eggs, grains & garden fruit" />
        </Field>
        <Field className="sm:col-span-2" label="Headline" hint="Use <em> for italic accents." {...v.fieldProps('headline')}>
          <input className={inputCls({ size: 'lg' })} type="text" value={form.headline} onChange={(e) => set({ headline: e.target.value })} placeholder="Morning, <em>slowly.</em>" />
        </Field>

        <ImageUploadField className="sm:col-span-2" value={form.coverUrl} onChange={(url) => set({ coverUrl: url })} onBusyChange={setUploading}
          title="Upload cover image" changeTitle="Change cover image" hint="Shown at the top of the section on the menu · JPG, PNG or WebP, up to 5 MB" />

        <div className="sm:col-span-2 flex items-center gap-3 rounded-[10px] border border-mq-line bg-mq-cream px-3.5 py-3">
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-semibold text-mq-ink">Visible on the menu</div>
            <div className="text-xs text-mq-muted mt-0.5">Hidden sections keep their dishes, but the menu skips them</div>
          </div>
          <Toggle checked={form.isActive} onChange={(on) => set({ isActive: on })} label="Visible on the menu" />
        </div>

        {banner && <Alert tone="danger" className="sm:col-span-2">{banner}</Alert>}
      </form>
    </Modal>
  );
}
