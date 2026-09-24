'use client';

import { useState, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import useConfirm from '@/hooks/useConfirm';
import useAccess from '@/hooks/useAccess';
import Field from '@/components/admin/Field';
import ImageUploadField from '@/components/admin/ImageUploadField';
import { useFormValidation, zodFieldErrors } from '@/lib/formValidation';
import { reportSaveError } from '@/lib/saveError';
import { groupTitleSchema, menuItemSchema, optionSchema } from '@/lib/schemas/menu';
import { money } from '@/lib/money';
import { ActiveFilters, FilterSelect, FiltersButton } from '@/components/admin/reports/ReportKit';
import {
  Page, Toolbar, Card, Kpi, KpiGrid, KpiSkeletons, Button, IconButton, Icon, Toggle, ChoiceChip,
  SearchInput, Modal, ModalSpacer, Alert, EmptyState, ErrorState, Skeleton,
  inputCls, selectCls, textareaCls, cx,
} from '@/components/admin/ui';

const NEVER_SOLD_DAYS = 30;
const EMPTY_FORM = {
  name: '', description: '', price: '', categoryId: '',
  imageUrl: '', sortOrder: 0, isActive: true,
  kcal: '', prepTime: '', pairing: '',
  tagIds: [],
};

// An option / extra row: what is in the boxes (`priceAdd` stays text while typing) and what the server last saved.
const optionRow = (o) => ({ id: o.id, name: o.name, priceAdd: String(Number(o.priceAdd)), saved: { name: o.name, priceAdd: String(Number(o.priceAdd)) } });
const rowErrors = (r) => zodFieldErrors(optionSchema.safeParse({ name: r.name, priceAdd: r.priceAdd }));

// Tag colours follow the public menu's three tag styles (Tag.variant).
export const TAG_FILL = { default: 'bg-mq-primary', green: 'bg-mq-ok', spicy: 'bg-mq-danger' };
const tagOf = (t) => t?.tag ?? t;
const optionCount = (it) => (it.optionGroups || []).reduce((n, g) => n + (g.options?.length || 0), 0);

/** The dish photo, or the striped placeholder (also when the image fails to load). */
function DishImage({ src, label }) {
  const [ok, setOk] = useState(Boolean(src));
  // eslint-disable-next-line @next/next/no-img-element -- uploaded blob URLs of any size; the menu uses a plain <img> with a fallback too
  if (ok) return <img src={src} alt="" loading="lazy" onError={() => setOk(false)} className="block w-full h-full object-cover" />;
  return (
    <span className="grid place-items-center w-full h-full bg-mq-chip bg-[repeating-linear-gradient(135deg,transparent_0_11px,rgba(26,26,24,.045)_11px_12px)] font-mq-mono text-[10.5px] tracking-[.04em] uppercase text-mq-on-tint px-3 text-center">
      {label}
    </span>
  );
}

// The topbar search links here with ?q= — the page opens already filtered.
// Keyed on q so a second search while on this page starts fresh.
export default function MenuItemsRoute() {
  return <Suspense fallback={null}><MenuItemsPageFromUrl /></Suspense>;
}
function MenuItemsPageFromUrl() {
  const q = useSearchParams().get('q') || '';
  return <MenuItemsPage key={q} initialSearch={q} />;
}

function MenuItemsPage({ initialSearch = '' }) {
  const qc = useQueryClient();
  const { canAct, canView } = useAccess();
  const mayEdit = canAct('menu');
  const [filterCategoryId, setFilterCategoryId] = useState('');
  const [search, setSearch] = useState(initialSearch);
  const [editing, setEditing] = useState(null); // null · {} (new) · a menu item

  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: () => fetchJson('/api/categories') });
  const { data: tags = [] } = useQuery({ queryKey: ['tags'], queryFn: () => fetchJson('/api/tags') });
  // Every dish (hidden ones too) — the KPIs count the whole menu; the category filter is applied here.
  const { data: items = [], isLoading, error: loadError, refetch } = useQuery({
    queryKey: ['menu-items', ''],
    queryFn: () => fetchJson('/api/menu-items?onlyActive=false'),
  });
  const neverSold = useQuery({
    queryKey: ['menu-never-sold', NEVER_SOLD_DAYS],
    queryFn: () => fetchJson(`/api/admin/menu-items/never-sold?days=${NEVER_SOLD_DAYS}`),
    staleTime: 5 * 60 * 1000,
  });

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => (!filterCategoryId || String(it.categoryId) === filterCategoryId) && (!q || it.name.toLowerCase().includes(q)));
  }, [items, search, filterCategoryId]);

  const kpis = useMemo(() => {
    const unavailable = items.filter((it) => !it.isActive).length;
    const avg = items.length ? items.reduce((s, it) => s + Number(it.price || 0), 0) / items.length : 0;
    return { unavailable, avg };
  }, [items]);

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }) => fetchJson(`/api/menu-items/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['menu-items'] }); qc.invalidateQueries({ queryKey: ['menu-never-sold'] }); },
    onError: (e) => notify.error(e, { title: 'Could not change the item' }),
  });

  const nCats = categories.length;
  const categoryOptions = categories.map((c) => ({ value: String(c.id), label: c.name }));
  return (
    <Page>
      {isLoading ? <KpiSkeletons count={4} min={210} /> : (
        <KpiGrid min={210}>
          <Kpi label="Dishes" value={items.length} foot={`${nCats} ${nCats === 1 ? 'category' : 'categories'}`} />
          <Kpi label="Unavailable" value={kpis.unavailable} foot="hidden from the menu" />
          <Kpi label="Average price" value={money(kpis.avg)} foot="across all dishes" />
          <Kpi
            label={`Never sold · ${NEVER_SOLD_DAYS} days`}
            value={neverSold.data ? neverSold.data.count : neverSold.isError ? '—' : '…'}
            foot={neverSold.isError ? 'Couldn’t load' : `no sale in the last ${NEVER_SOLD_DAYS} days`}
            href={canView('reports') ? '/admin/dashboard/reports/sales#dishes' : undefined}
          />
        </KpiGrid>
      )}

      <Toolbar>
        {/* Category lives in the one Filters control, never as its own select. */}
        <FiltersButton active={filterCategoryId ? 1 : 0} onClear={() => setFilterCategoryId('')}>
          <FilterSelect label="Category" value={filterCategoryId} options={categoryOptions} onChange={setFilterCategoryId} all="All categories" />
        </FiltersButton>
        <SearchInput value={search} onChange={setSearch} placeholder="Search dishes" className="flex-[1_1_220px] h-[38px]" aria-label="Search dishes" />
        {mayEdit && <Button variant="primary" icon="plus" onClick={() => setEditing({})}>New dish</Button>}
      </Toolbar>
      <ActiveFilters
        items={filterCategoryId ? [{ key: 'category', label: `Category: ${categoryOptions.find((c) => c.value === filterCategoryId)?.label || '…'}`, onRemove: () => setFilterCategoryId('') }] : []}
      />

      {loadError && <ErrorState error={loadError} onRetry={refetch} title="Couldn’t load the menu" />}

      {isLoading ? (
        <DishGrid>
          {Array.from({ length: 8 }, (_, n) => (
            <Card key={n} className="overflow-hidden">
              <Skeleton className="h-28 !rounded-none" />
              <div className="flex flex-col gap-2 p-3.5"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /><Skeleton className="h-5 w-1/3 mt-3" /></div>
            </Card>
          ))}
        </DishGrid>
      ) : visibleItems.length === 0 && !loadError ? (
        <Card>
          <EmptyState
            icon="menu"
            title={search || filterCategoryId ? 'No dishes match' : 'No dishes yet'}
            action={!search && !filterCategoryId && mayEdit ? <Button variant="soft" size="sm" icon="plus" onClick={() => setEditing({})}>New dish</Button> : null}
          >
            {search || filterCategoryId ? 'Try a different search or category.' : 'Add your first dish to start building the menu.'}
          </EmptyState>
        </Card>
      ) : (
        <DishGrid>
          {visibleItems.map((it) => {
            const tag = tagOf((it.tags || [])[0]);
            const n = optionCount(it);
            const cat = it.category?.name || '—';
            return (
              <Card as="article" key={it.id} className={cx('overflow-hidden flex flex-col', !it.isActive && 'opacity-60')}>
                <div className="relative h-28 flex-none">
                  <DishImage key={it.imageUrl || 'none'} src={it.imageUrl} label={cat} />
                  {!it.isActive ? (
                    <span className="absolute top-2 left-2 rounded-md px-[7px] py-[3px] text-[10px] font-bold uppercase tracking-[.06em] text-white bg-mq-muted">Off menu</span>
                  ) : tag ? (
                    <span className={cx('absolute top-2 left-2 rounded-md px-[7px] py-[3px] text-[10px] font-bold uppercase tracking-[.06em] text-white', TAG_FILL[tag.variant] || TAG_FILL.default)}>{tag.label}</span>
                  ) : null}
                </div>
                <div className="flex flex-col gap-[3px] flex-1 px-3.5 py-3">
                  <h3 className="m-0 text-sm font-semibold leading-snug text-mq-ink break-words">{it.name}</h3>
                  <span className="text-[11.5px] text-mq-muted">{cat}{n ? ` · ${n} ${n === 1 ? 'option' : 'options'}` : ''}</span>
                  <div className="flex items-center gap-1 mt-auto pt-2.5">
                    <span className="flex-1 font-mq-mono text-base font-semibold tabular-nums text-mq-ink">{money(it.price)}</span>
                    {mayEdit && (
                      <span className="inline-grid place-items-center w-12 h-11">
                        <Toggle
                          checked={it.isActive}
                          label={`${it.name}: ${it.isActive ? 'on the menu' : 'off the menu'}`}
                          disabled={toggleActive.isPending && toggleActive.variables?.id === it.id}
                          onChange={(on) => toggleActive.mutate({ id: it.id, isActive: on })}
                        />
                      </span>
                    )}
                    {mayEdit && <Button size="xs" onClick={() => setEditing(it)} aria-label={`Edit ${it.name}`}>Edit</Button>}
                  </div>
                </div>
              </Card>
            );
          })}
        </DishGrid>
      )}

      {editing && (
        <DishModal
          key={editing.id ?? 'new'}
          item={editing.id ? editing : null}
          categories={categories}
          tags={tags}
          defaultCategoryId={filterCategoryId}
          onClose={() => setEditing(null)}
        />
      )}
    </Page>
  );
}

function DishGrid({ children }) {
  return <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(224px, 100%), 1fr))' }}>{children}</div>;
}

/** Bordered row with a title, a hint and a switch (the design's toggle field). */
function ToggleField({ title, hint, checked, onChange }) {
  return (
    <div className="flex items-center gap-3 rounded-[10px] border border-mq-line bg-mq-cream px-3.5 py-3">
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-semibold text-mq-ink">{title}</div>
        {hint && <div className="text-xs text-mq-muted mt-0.5">{hint}</div>}
      </div>
      <Toggle checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

const itemForm = (item, defaultCategoryId) => (item ? {
  name: item.name,
  description: item.description ?? '',
  price: item.price.toString(),
  categoryId: item.categoryId.toString(),
  imageUrl: item.imageUrl ?? '',
  sortOrder: item.sortOrder ?? 0,
  isActive: item.isActive,
  kcal: item.kcal ?? '',
  prepTime: item.prepTime ?? '',
  pairing: item.pairing ?? '',
  tagIds: (item.tags || []).map((t) => tagOf(t).id),
} : { ...EMPTY_FORM, categoryId: defaultCategoryId || '' });
const itemGroups = (item) => (item?.optionGroups || []).map((g) => ({
  id: g.id, title: g.title, savedTitle: g.title, options: (g.options || []).map((o) => optionRow(o)),
}));

function DishModal({ item, categories, tags, defaultCategoryId, onClose }) {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const editingId = item?.id ?? null;
  const [form, setForm] = useState(() => itemForm(item, defaultCategoryId));
  const [uploading, setUploading] = useState(false);
  const [groups, setGroups] = useState(() => itemGroups(item));
  const [extras, setExtras] = useState(() => (item?.extras || []).map((e) => optionRow(e)));
  const [banner, setBanner] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const v = useFormValidation(menuItemSchema, {
    name: form.name, description: form.description, categoryId: String(form.categoryId ?? ''), price: String(form.price ?? ''),
    prepTime: String(form.prepTime ?? ''), kcal: String(form.kcal ?? ''), pairing: String(form.pairing ?? ''), sortOrder: String(form.sortOrder ?? ''),
  });

  const refresh = () => { qc.invalidateQueries({ queryKey: ['menu-items'] }); qc.invalidateQueries({ queryKey: ['menu-never-sold'] }); qc.invalidateQueries({ queryKey: ['categories'] }); qc.invalidateQueries({ queryKey: ['tags'] }); };

  const saveItem = useMutation({
    mutationFn: (payload) => fetchJson(editingId ? `/api/menu-items/${editingId}` : '/api/menu-items', {
      method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    }),
    // Saving closes the form. Option groups and extras need the dish to exist,
    // so a new dish gets them by opening it again from the list.
    onSuccess: () => {
      notify.success(editingId ? 'Dish updated' : 'Dish added — open it to add options and extras');
      refresh();
      onClose();
    },
    onError: (e) => reportSaveError(e, { form: v, setBanner, title: 'Could not save the dish' }),
  });

  const deleteItem = useMutation({
    mutationFn: (id) => fetchJson(`/api/menu-items/${id}`, { method: 'DELETE' }),
    onSuccess: () => { notify.success('Dish deleted'); refresh(); onClose(); },
    onError: (e) => notify.error(e, { title: 'Could not delete the dish' }),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setBanner(''); v.setServerErrors({});
    if (!v.check()) return;
    saveItem.mutate({
      name: form.name.trim(),
      description: String(form.description).trim() || null,
      price: Number(form.price),
      categoryId: Number(form.categoryId),
      imageUrl: form.imageUrl || null,
      sortOrder: Number(form.sortOrder) || 0,
      isActive: form.isActive,
      kcal: String(form.kcal).trim() || null,
      prepTime: String(form.prepTime).trim() || null,
      pairing: String(form.pairing).trim() || null,
      tagIds: form.tagIds,
    });
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: `Delete ${form.name || 'this dish'}?`,
      body: 'It disappears from the Register and the public menu, with its option groups and extras. Past sales keep the dish name.',
      confirmLabel: 'Delete dish',
    });
    if (ok) deleteItem.mutate(editingId);
  };

  // Option groups, options and extras save when you leave a box (blur), and only
  // when the row is valid — a half-typed row is never sent. Typing only edits the
  // on-screen copy; the message under a box says what is missing.
  const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const addGroup = async () => {
    try {
      const g = await fetchJson('/api/option-groups', json('POST', { menuItemId: editingId, title: 'New option', sortOrder: groups.length }));
      setGroups((gs) => [...gs, { id: g.id, title: g.title, savedTitle: g.title, options: [] }]);
      qc.invalidateQueries({ queryKey: ['menu-items'] });
    } catch (err) { notify.error(err, { title: 'Could not add the option group' }); }
  };
  const editGroupTitle = (id, title) => setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, title } : g)));
  const commitGroupTitle = async (g) => {
    if (g.title.trim() === g.savedTitle || !groupTitleSchema.safeParse({ title: g.title }).success) return;
    const title = g.title.trim();
    try {
      await fetchJson(`/api/option-groups/${g.id}`, json('PUT', { title }));
      setGroups((gs) => gs.map((x) => (x.id === g.id ? { ...x, savedTitle: title } : x)));
      qc.invalidateQueries({ queryKey: ['menu-items'] });
    } catch (err) { notify.error(err, { title: 'Could not rename the option group' }); }
  };
  const deleteGroup = async (id) => {
    const ok = await confirm({ title: 'Delete option group?', body: 'All options inside this group will be removed.', confirmLabel: 'Delete group' });
    if (!ok) return;
    try {
      await fetchJson(`/api/option-groups/${id}`, { method: 'DELETE' });
      setGroups((gs) => gs.filter((g) => g.id !== id));
      qc.invalidateQueries({ queryKey: ['menu-items'] });
    } catch (err) { notify.error(err, { title: 'Could not delete the option group' }); }
  };
  const addOption = async (groupId) => {
    try {
      const o = await fetchJson('/api/item-options', json('POST', { optionGroupId: groupId, name: 'New', priceAdd: 0 }));
      setGroups((gs) => gs.map((g) => (g.id === groupId ? { ...g, options: [...g.options, optionRow(o)] } : g)));
      qc.invalidateQueries({ queryKey: ['menu-items'] });
    } catch (err) { notify.error(err, { title: 'Could not add the option' }); }
  };
  const editOption = (groupId, optId, patch) => setGroups((gs) => gs.map((g) => (g.id === groupId
    ? { ...g, options: g.options.map((o) => (o.id === optId ? { ...o, ...patch } : o)) }
    : g)));
  const commitOption = async (groupId, o) => {
    if (Object.keys(rowErrors(o)).length || (o.name.trim() === o.saved.name && Number(o.priceAdd) === Number(o.saved.priceAdd))) return;
    const patch = { name: o.name.trim(), priceAdd: Number(o.priceAdd) };
    try {
      await fetchJson(`/api/item-options/${o.id}`, json('PUT', patch));
      editOption(groupId, o.id, { saved: { name: patch.name, priceAdd: String(patch.priceAdd) } });
      qc.invalidateQueries({ queryKey: ['menu-items'] });
    } catch (err) { notify.error(err, { title: 'Could not save the option' }); }
  };
  const deleteOption = async (groupId, optId) => {
    try {
      await fetchJson(`/api/item-options/${optId}`, { method: 'DELETE' });
      setGroups((gs) => gs.map((g) => (g.id === groupId ? { ...g, options: g.options.filter((o) => o.id !== optId) } : g)));
      qc.invalidateQueries({ queryKey: ['menu-items'] });
    } catch (err) { notify.error(err, { title: 'Could not remove the option' }); }
  };
  const addExtra = async () => {
    try {
      const ex = await fetchJson('/api/item-extras', json('POST', { menuItemId: editingId, name: 'New extra', priceAdd: 0, sortOrder: extras.length }));
      setExtras((xs) => [...xs, optionRow(ex)]);
      qc.invalidateQueries({ queryKey: ['menu-items'] });
    } catch (err) { notify.error(err, { title: 'Could not add the extra' }); }
  };
  const editExtra = (id, patch) => setExtras((xs) => xs.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const commitExtra = async (x) => {
    if (Object.keys(rowErrors(x)).length || (x.name.trim() === x.saved.name && Number(x.priceAdd) === Number(x.saved.priceAdd))) return;
    const patch = { name: x.name.trim(), priceAdd: Number(x.priceAdd) };
    try {
      await fetchJson(`/api/item-extras/${x.id}`, json('PUT', patch));
      editExtra(x.id, { saved: { name: patch.name, priceAdd: String(patch.priceAdd) } });
      qc.invalidateQueries({ queryKey: ['menu-items'] });
    } catch (err) { notify.error(err, { title: 'Could not save the extra' }); }
  };
  const deleteExtra = async (id) => {
    try {
      await fetchJson(`/api/item-extras/${id}`, { method: 'DELETE' });
      setExtras((xs) => xs.filter((e) => e.id !== id));
      qc.invalidateQueries({ queryKey: ['menu-items'] });
    } catch (err) { notify.error(err, { title: 'Could not remove the extra' }); }
  };

  const busy = saveItem.isPending || deleteItem.isPending;
  const catName = categories.find((c) => String(c.id) === String(form.categoryId))?.name;

  return (
    <Modal
      eyebrow={editingId ? 'Edit dish' : 'New dish'}
      title={editingId ? (form.name || 'Dish') : 'Add to the menu'}
      sub={editingId && catName ? catName : undefined}
      onClose={onClose}
      busy={busy}
      width={560}
      footer={(
        <>
          {editingId && <Button variant="danger-soft" size="lg" onClick={handleDelete} disabled={busy}>Delete</Button>}
          <ModalSpacer />
          <Button size="lg" onClick={onClose} disabled={busy}>{editingId ? 'Close' : 'Cancel'}</Button>
          <Button variant="primary" size="lg" type="submit" form="dish-form" disabled={busy || uploading || !v.valid}>
            {saveItem.isPending ? 'Saving…' : editingId ? 'Save changes' : 'Add dish'}
          </Button>
        </>
      )}
    >
      {dialog}
      <form id="dish-form" onSubmit={handleSubmit} noValidate className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
        <Field className="sm:col-span-2" label="Item name" required {...v.fieldProps('name')}>
          <input className={inputCls({ size: 'lg' })} type="text" value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field className="sm:col-span-2" label="Description" {...v.fieldProps('description')}>
          <textarea className={textareaCls()} rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <Field label="Category" required {...v.fieldProps('categoryId')}>
          <select className={selectCls({ size: 'lg' })} value={form.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
            <option value="">Select…</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Price (USD)" required {...v.fieldProps('price')}>
          <input className={inputCls({ size: 'lg', mono: true })} type="number" step="0.01" min="0" inputMode="decimal" placeholder="0.00" value={form.price} onChange={(e) => set({ price: e.target.value })} />
        </Field>
        <Field label="Prep time" {...v.fieldProps('prepTime')}>
          <input className={inputCls({ size: 'lg' })} type="text" placeholder="12 min" value={form.prepTime} onChange={(e) => set({ prepTime: e.target.value })} />
        </Field>
        <Field label="Kcal" {...v.fieldProps('kcal')}>
          <input className={inputCls({ size: 'lg' })} type="text" placeholder="520" value={form.kcal} onChange={(e) => set({ kcal: e.target.value })} />
        </Field>
        <Field className="sm:col-span-2" label="Pairing" {...v.fieldProps('pairing')}>
          <input className={inputCls({ size: 'lg' })} type="text" placeholder="Champagne" value={form.pairing} onChange={(e) => set({ pairing: e.target.value })} />
        </Field>

        <ImageUploadField className="sm:col-span-2" value={form.imageUrl} onChange={(url) => set({ imageUrl: url })} onBusyChange={setUploading} />

        <div className="sm:col-span-2 flex flex-col gap-[7px]">
          <span className="text-[11px] font-semibold uppercase tracking-[.09em] text-mq-muted">Tags</span>
          {tags.length === 0
            ? <span className="text-xs text-mq-muted">No tags yet. Create some in Categories › Tags.</span>
            : (
              <div className="flex flex-wrap gap-2">
                {tags.map((t) => {
                  const on = form.tagIds.includes(t.id);
                  return (
                    <ChoiceChip key={t.id} size="sm" active={on} onClick={() => set({ tagIds: on ? form.tagIds.filter((x) => x !== t.id) : [...form.tagIds, t.id] })}>
                      <span className={cx('w-2 h-2 rounded-full', on ? 'bg-white' : (TAG_FILL[t.variant] || TAG_FILL.default))} aria-hidden="true" />
                      {t.label}
                    </ChoiceChip>
                  );
                })}
              </div>
            )}
        </div>

        <Field label="Sort order" hint="Lower numbers show first in the category" {...v.fieldProps('sortOrder')}>
          <input className={inputCls({ size: 'lg', mono: true })} type="number" min="0" inputMode="numeric" value={form.sortOrder} onChange={(e) => set({ sortOrder: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <ToggleField title="Available" hint="Off hides it from the public menu and the Register" checked={form.isActive} onChange={(on) => set({ isActive: on })} />
        </div>

        {banner && <Alert tone="danger" className="sm:col-span-2">{banner}</Alert>}
      </form>

      {!editingId ? (
        <p className="m-0 mt-4 text-xs text-mq-muted">Option groups (Size, Bread…) and extras: add the dish, then open it from the list.</p>
      ) : (
        <div className="flex flex-col gap-5 mt-5 pt-4 border-t border-mq-chip">
          <section className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="m-0 text-sm font-semibold text-mq-ink">Option groups</h3>
                <p className="m-0 text-xs text-mq-muted">The customer picks one per group; its price adds to the dish.</p>
              </div>
              <Button variant="soft" size="xs" icon="plus" onClick={addGroup}>Group</Button>
            </div>
            {groups.length === 0 && <p className="m-0 text-[12.5px] text-mq-muted">No options. Add a group for variants like Bread, Milk, Size.</p>}
            {groups.map((g) => (
              <div key={g.id} className="flex flex-col gap-2 rounded-[10px] border border-mq-line bg-mq-cream p-3">
                <div className="flex items-start gap-2">
                  <Field className="flex-1" error={zodFieldErrors(groupTitleSchema.safeParse({ title: g.title })).title}>
                    <input className={inputCls({ className: 'font-semibold' })} type="text" aria-label="Group name" value={g.title} onChange={(e) => editGroupTitle(g.id, e.target.value)} onBlur={() => commitGroupTitle(g)} />
                  </Field>
                  <IconButton icon="trash" label={`Delete group ${g.title}`} variant="danger" size={40} onClick={() => deleteGroup(g.id)} />
                </div>
                {g.options.map((o) => (
                  <PriceRow
                    key={o.id} row={o} nameLabel="Option name"
                    onEdit={(patch) => editOption(g.id, o.id, patch)}
                    onCommit={() => commitOption(g.id, o)}
                    onRemove={() => deleteOption(g.id, o.id)}
                  />
                ))}
                <div><Button variant="ghost" size="xs" icon="plus" onClick={() => addOption(g.id)}>Add option</Button></div>
              </div>
            ))}
          </section>

          <section className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="m-0 text-sm font-semibold text-mq-ink">Extras</h3>
                <p className="m-0 text-xs text-mq-muted">Optional add-ons; each one ticked adds its price.</p>
              </div>
              <Button variant="soft" size="xs" icon="plus" onClick={addExtra}>Extra</Button>
            </div>
            {extras.length === 0 && <p className="m-0 text-[12.5px] text-mq-muted">No extras. Add optional add-ons like “Truffle butter”.</p>}
            {extras.map((x) => (
              <div key={x.id} className="rounded-[10px] border border-mq-line bg-mq-cream p-2">
                <PriceRow row={x} nameLabel="Extra name" onEdit={(patch) => editExtra(x.id, patch)} onCommit={() => commitExtra(x)} onRemove={() => deleteExtra(x.id)} />
              </div>
            ))}
          </section>
        </div>
      )}
    </Modal>
  );
}

/** Name + "+ $ price" + remove, saved on blur (options and extras). */
function PriceRow({ row, nameLabel, onEdit, onCommit, onRemove }) {
  const err = rowErrors(row);
  return (
    <div className="flex items-start gap-1.5">
      <Field className="flex-1" error={err.name}>
        <input className={inputCls()} type="text" aria-label={nameLabel} value={row.name} onChange={(e) => onEdit({ name: e.target.value })} onBlur={onCommit} />
      </Field>
      <span className="h-10 grid place-items-center text-[12.5px] text-mq-muted font-mq-mono flex-none">+ $</span>
      <Field className="w-[92px] flex-none" error={err.priceAdd}>
        <input className={inputCls({ mono: true })} type="number" step="0.5" min="0" inputMode="decimal" aria-label="Extra price" value={row.priceAdd} onChange={(e) => onEdit({ priceAdd: e.target.value })} onBlur={onCommit} />
      </Field>
      <IconButton icon="x" label={`Remove ${row.name || 'row'}`} variant="danger" size={40} onClick={onRemove} />
    </div>
  );
}
