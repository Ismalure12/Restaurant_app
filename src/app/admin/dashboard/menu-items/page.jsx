'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchJson, parseApiError } from '@/lib/apiError';
import useConfirm from '@/hooks/useConfirm';

const EMPTY_FORM = {
  name: '', description: '', price: '', categoryId: '',
  imageUrl: '', sortOrder: 0, isActive: true,
  kcal: '', prepTime: '', pairing: '',
  tagIds: [],
};

const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const TAG_PILL = { green: 'pill-green', spicy: 'pill-rose', default: 'pill-gold' };

function MiImg({ src }) {
  const [ok, setOk] = useState(Boolean(src));
  if (ok) return <img src={src} alt="" loading="lazy" onError={() => setOk(false)} />;
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z" /><path d="M6 1v3M10 1v3M14 1v3" />
    </svg>
  );
}

export default function MenuItemsPage() {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [filterCategoryId, setFilterCategoryId] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [groups, setGroups] = useState([]);
  const [extras, setExtras] = useState([]);

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => fetchJson('/api/categories'),
  });
  const { data: tags = [] } = useQuery({
    queryKey: ['tags'],
    queryFn: () => fetchJson('/api/tags'),
  });
  const { data: items = [], isLoading, error: loadError } = useQuery({
    queryKey: ['menu-items', filterCategoryId],
    queryFn: () => {
      const url = filterCategoryId
        ? `/api/menu-items?categoryId=${filterCategoryId}&onlyActive=false`
        : '/api/menu-items?onlyActive=false';
      return fetchJson(url);
    },
  });

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => it.name.toLowerCase().includes(q));
  }, [items, search]);

  const saveItem = useMutation({
    mutationFn: (payload) => fetchJson(
      editingId ? `/api/menu-items/${editingId}` : '/api/menu-items',
      {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    ),
    onMutate: () => toast.loading(editingId ? 'Updating…' : 'Creating…', { id: 'mi-save' }),
    onSuccess: (saved) => {
      toast.success(editingId ? 'Item updated' : 'Item created', { id: 'mi-save' });
      qc.invalidateQueries({ queryKey: ['menu-items'] });
      if (!editingId) {
        setEditingId(saved.id);
        setGroups([]);
        setExtras([]);
      }
    },
    onError: (e) => toast.error(parseApiError(e), { id: 'mi-save' }),
  });

  const deleteItem = useMutation({
    mutationFn: (id) => fetchJson(`/api/menu-items/${id}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success('Item deleted'); qc.invalidateQueries({ queryKey: ['menu-items'] }); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }) => fetchJson(`/api/menu-items/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['menu-items'] }),
    onError: (e) => toast.error(parseApiError(e)),
  });

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
    setImagePreview(null);
    setGroups([]);
    setExtras([]);
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setForm({
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
      tagIds: (item.tags || []).map((t) => t.tag?.id ?? t.id),
    });
    setImagePreview(item.imageUrl ?? null);
    setGroups(
      (item.optionGroups || []).map((g) => ({
        id: g.id, title: g.title,
        options: (g.options || []).map((o) => ({ id: o.id, name: o.name, priceAdd: Number(o.priceAdd) })),
      }))
    );
    setExtras((item.extras || []).map((e) => ({ id: e.id, name: e.name, priceAdd: Number(e.priceAdd) })));
    setShowForm(true);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setImagePreview(URL.createObjectURL(file));
    const fd = new FormData();
    fd.append('file', file);
    try {
      const data = await fetchJson('/api/upload', { method: 'POST', body: fd });
      if (data.url) { setForm((p) => ({ ...p, imageUrl: data.url })); toast.success('Image uploaded'); }
      else throw new Error('No URL returned');
    } catch (err) { toast.error(parseApiError(err)); setImagePreview(null); }
    finally { setUploading(false); }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    saveItem.mutate({
      name: form.name,
      description: form.description || null,
      price: Number(form.price),
      categoryId: Number(form.categoryId),
      imageUrl: form.imageUrl || null,
      sortOrder: Number(form.sortOrder),
      isActive: form.isActive,
      kcal: form.kcal || null,
      prepTime: form.prepTime || null,
      pairing: form.pairing || null,
      tagIds: form.tagIds,
    });
  };

  const handleDelete = async (it) => {
    const ok = await confirm({
      title: `Delete “${it.name}”?`,
      body: 'Removing this item also clears its option groups and extras.',
      confirmLabel: 'Delete item',
    });
    if (ok) { deleteItem.mutate(it.id); resetForm(); }
  };

  // Option groups
  const addGroup = async () => {
    if (!editingId) { toast.error('Save the item first'); return; }
    try {
      const g = await fetchJson('/api/option-groups', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menuItemId: editingId, title: 'New option', sortOrder: groups.length }),
      });
      setGroups((gs) => [...gs, { id: g.id, title: g.title, options: [] }]);
    } catch (err) { toast.error(parseApiError(err)); }
  };
  const renameGroup = async (id, title) => {
    setGroups((gs) => gs.map((g) => g.id === id ? { ...g, title } : g));
    try {
      await fetchJson(`/api/option-groups/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
    } catch (err) { toast.error(parseApiError(err)); }
  };
  const deleteGroup = async (id) => {
    const ok = await confirm({
      title: 'Delete option group?',
      body: 'All options inside this group will be removed.',
      confirmLabel: 'Delete group',
    });
    if (!ok) return;
    try {
      await fetchJson(`/api/option-groups/${id}`, { method: 'DELETE' });
      setGroups((gs) => gs.filter((g) => g.id !== id));
    } catch (err) { toast.error(parseApiError(err)); }
  };
  const addOption = async (groupId) => {
    try {
      const o = await fetchJson('/api/item-options', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionGroupId: groupId, name: 'New', priceAdd: 0 }),
      });
      setGroups((gs) => gs.map((g) => g.id === groupId
        ? { ...g, options: [...g.options, { id: o.id, name: o.name, priceAdd: Number(o.priceAdd) }] }
        : g));
    } catch (err) { toast.error(parseApiError(err)); }
  };
  const updateOption = async (groupId, optId, patch) => {
    setGroups((gs) => gs.map((g) => g.id === groupId
      ? { ...g, options: g.options.map((o) => o.id === optId ? { ...o, ...patch } : o) }
      : g));
    try {
      await fetchJson(`/api/item-options/${optId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
    } catch (err) { toast.error(parseApiError(err)); }
  };
  const deleteOption = async (groupId, optId) => {
    try {
      await fetchJson(`/api/item-options/${optId}`, { method: 'DELETE' });
      setGroups((gs) => gs.map((g) => g.id === groupId
        ? { ...g, options: g.options.filter((o) => o.id !== optId) }
        : g));
    } catch (err) { toast.error(parseApiError(err)); }
  };

  // Extras
  const addExtra = async () => {
    if (!editingId) { toast.error('Save the item first'); return; }
    try {
      const ex = await fetchJson('/api/item-extras', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menuItemId: editingId, name: 'New extra', priceAdd: 0, sortOrder: extras.length }),
      });
      setExtras((xs) => [...xs, { id: ex.id, name: ex.name, priceAdd: Number(ex.priceAdd) }]);
    } catch (err) { toast.error(parseApiError(err)); }
  };
  const updateExtra = async (id, patch) => {
    setExtras((xs) => xs.map((e) => e.id === id ? { ...e, ...patch } : e));
    try {
      await fetchJson(`/api/item-extras/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
    } catch (err) { toast.error(parseApiError(err)); }
  };
  const deleteExtra = async (id) => {
    try {
      await fetchJson(`/api/item-extras/${id}`, { method: 'DELETE' });
      setExtras((xs) => xs.filter((e) => e.id !== id));
    } catch (err) { toast.error(parseApiError(err)); }
  };

  const activeCats = categories.filter((c) => c.isActive !== false);

  return (
    <div>
      {dialog}

      <div className="toolbar">
        <div className="search" style={{ width: 240 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search menu…" />
        </div>
        <div className="seg">
          <button className={filterCategoryId === '' ? 'active' : ''} onClick={() => setFilterCategoryId('')}>All</button>
          {activeCats.map((c) => (
            <button key={c.id} className={String(filterCategoryId) === String(c.id) ? 'active' : ''} onClick={() => setFilterCategoryId(String(c.id))}>{c.name}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 5v14M5 12h14" /></svg>Add item
        </button>
      </div>

      {loadError && <div className="adm-error-banner" style={{ marginBottom: 14 }}>{parseApiError(loadError)}</div>}

      {/* LIST */}
      {isLoading ? (
        <div className="mi-grid">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <div key={n} className="sk" style={{ height: 205, borderRadius: 'var(--r-lg)' }} />)}
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="card card-pad-lg">
          <div className="empty">
            <div className="empty-ring">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z" /><path d="M6 1v3M10 1v3M14 1v3" /></svg>
            </div>
            <p className="empty-title">{search ? 'No matches' : 'No items yet'}</p>
            <p className="empty-sub">{search ? 'Try a different search.' : 'Add your first dish to start building the menu.'}</p>
          </div>
        </div>
      ) : (
        <div className="mi-grid">
          {visibleItems.map((it) => {
            const tag = (it.tags || [])[0];
            const tagObj = tag?.tag ?? tag;
            return (
              <button key={it.id} className={`mi${it.isActive ? '' : ' off'}`} onClick={() => handleEdit(it)}>
                <div className="mi-img">
                  {tagObj && <span className={`pill ${TAG_PILL[tagObj.variant] || 'pill-gold'} tagchip`}>{tagObj.label}</span>}
                  <MiImg src={it.imageUrl} />
                  <span className="mi-edit" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
                  </span>
                </div>
                <div className="mi-b">
                  <div className="mi-nm">{it.name}</div>
                  <div className="mi-cat">{it.category?.name || '—'}</div>
                  <div className="mi-row">
                    <span className="mi-pr">{money(it.price)}</span>
                    <span
                      role="switch"
                      aria-checked={it.isActive}
                      className={`hj-sw${it.isActive ? ' on' : ''}`}
                      onClick={(e) => { e.stopPropagation(); toggleActive.mutate({ id: it.id, isActive: !it.isActive }); }}
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* MODAL */}
      {showForm && (
        <div className="jz-modal-bk open" onClick={(e) => { if (e.target === e.currentTarget) resetForm(); }}>
          <div className="modal" style={{ width: 'min(560px, 100%)' }}>
            <div className="modal-h">
              <div className="mt">
                <div className="eyebrow">{editingId ? (categories.find((c) => String(c.id) === String(form.categoryId))?.name || 'Menu item') : 'New menu item'}</div>
                <div className="h-1" style={{ marginTop: 3 }}>{editingId ? form.name || 'Edit item' : 'Add item'}</div>
              </div>
              <button className="icon-btn" onClick={resetForm} aria-label="Close" disabled={saveItem.isPending}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
              <div className="modal-b">
                <div className="ff"><label>Item name</label><input className="input" type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
                <div className="ff"><label>Description</label><textarea className="input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                <div className="ff-row">
                  <div className="ff" style={{ flex: 1 }}>
                    <label>Category</label>
                    <select className="input" required value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                      <option value="">Select…</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="ff" style={{ flex: 1 }}><label>Price (USD)</label><input className="input" type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required /></div>
                </div>
                <div className="ff-row">
                  <div className="ff" style={{ flex: 1 }}><label>Prep time</label><input className="input" type="text" placeholder="12 min" value={form.prepTime} onChange={(e) => setForm({ ...form, prepTime: e.target.value })} /></div>
                  <div className="ff" style={{ flex: 1 }}><label>Kcal</label><input className="input" type="text" placeholder="520" value={form.kcal} onChange={(e) => setForm({ ...form, kcal: e.target.value })} /></div>
                </div>
                <div className="ff"><label>Pairing</label><input className="input" type="text" placeholder="Champagne" value={form.pairing} onChange={(e) => setForm({ ...form, pairing: e.target.value })} /></div>

                <div className="ff">
                  <label>Image</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {imagePreview && <img src={imagePreview} alt="" style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', border: '1px solid var(--line)', flexShrink: 0 }} />}
                    <label className="btn btn-ghost" style={{ flex: 1, cursor: 'pointer' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
                      {uploading ? 'Uploading…' : imagePreview ? 'Change image' : 'Upload image'}
                      <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handleImageUpload} disabled={uploading} />
                    </label>
                  </div>
                </div>

                <div className="ff">
                  <label>Tags</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                    {tags.length === 0 && <span className="sub" style={{ fontSize: 12 }}>No tags yet. Create some in Settings.</span>}
                    {tags.map((t) => {
                      const on = form.tagIds.includes(t.id);
                      return (
                        <button key={t.id} type="button"
                          onClick={() => setForm((f) => ({ ...f, tagIds: on ? f.tagIds.filter((x) => x !== t.id) : [...f.tagIds, t.id] }))}
                          className={`pill ${on ? (TAG_PILL[t.variant] || 'pill-green') : 'pill-ghost'}`}
                          style={{ cursor: 'pointer' }}>
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="ff-row" style={{ alignItems: 'flex-end' }}>
                  <div className="ff" style={{ flex: 1 }}><label>Sort order</label><input className="input" type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></div>
                  <label className="ff-row" style={{ flex: 1, gap: 10, paddingBottom: 8, cursor: 'pointer' }}>
                    <span style={{ fontSize: 13, color: 'var(--ink-2)', fontWeight: 500 }}>Visible in menu</span>
                    <span role="switch" aria-checked={form.isActive} className={`hj-sw${form.isActive ? ' on' : ''}`} onClick={() => setForm((f) => ({ ...f, isActive: !f.isActive }))} />
                  </label>
                </div>

                {/* Option groups + extras */}
                {editingId && (
                  <>
                    <div style={{ height: 1, background: 'var(--line-2)', margin: '4px 0' }} />
                    <section>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div className="h-2">Option groups</div>
                        <button type="button" onClick={addGroup} className="btn btn-soft btn-sm">+ Group</button>
                      </div>
                      {groups.length === 0 && <p className="sub" style={{ fontSize: 12.5 }}>No options. Add a group for variants like Bread, Milk, Size.</p>}
                      {groups.map((g) => (
                        <div key={g.id} style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: 12, marginBottom: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <input className="input" type="text" value={g.title} onChange={(e) => renameGroup(g.id, e.target.value)} style={{ flex: 1, fontWeight: 600 }} />
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => deleteGroup(g.id)}>Delete</button>
                          </div>
                          {g.options.map((o) => (
                            <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                              <input className="input" type="text" value={o.name} onChange={(e) => updateOption(g.id, o.id, { name: e.target.value })} style={{ flex: 1, height: 34 }} />
                              <span className="sub" style={{ fontSize: 11.5 }}>+ $</span>
                              <input className="input" type="number" step="0.5" min="0" value={o.priceAdd} onChange={(e) => updateOption(g.id, o.id, { priceAdd: Number(e.target.value) })} style={{ width: 80, height: 34 }} />
                              <button type="button" onClick={() => deleteOption(g.id, o.id)} className="icon-btn" style={{ width: 34, height: 34 }} aria-label="Remove">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg>
                              </button>
                            </div>
                          ))}
                          <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 2 }} onClick={() => addOption(g.id)}>+ Add option</button>
                        </div>
                      ))}
                    </section>

                    <section>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div className="h-2">Extras</div>
                        <button type="button" onClick={addExtra} className="btn btn-soft btn-sm">+ Extra</button>
                      </div>
                      {extras.length === 0 && <p className="sub" style={{ fontSize: 12.5 }}>No extras. Add optional add-ons like “Truffle butter”.</p>}
                      {extras.map((x) => (
                        <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: 8 }}>
                          <input className="input" type="text" value={x.name} onChange={(e) => updateExtra(x.id, { name: e.target.value })} style={{ flex: 1, height: 34 }} />
                          <span className="sub" style={{ fontSize: 11.5 }}>+ $</span>
                          <input className="input" type="number" step="0.5" min="0" value={x.priceAdd} onChange={(e) => updateExtra(x.id, { priceAdd: Number(e.target.value) })} style={{ width: 80, height: 34 }} />
                          <button type="button" onClick={() => deleteExtra(x.id)} className="icon-btn" style={{ width: 34, height: 34 }} aria-label="Remove">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg>
                          </button>
                        </div>
                      ))}
                    </section>
                  </>
                )}
              </div>

              <div className="modal-f">
                {editingId && <button type="button" className="btn btn-ghost" style={{ marginRight: 'auto', color: 'var(--rose)' }} onClick={() => handleDelete({ id: editingId, name: form.name })} disabled={deleteItem.isPending}>Delete</button>}
                <button type="button" onClick={resetForm} disabled={saveItem.isPending} className="btn btn-ghost">{editingId ? 'Close' : 'Cancel'}</button>
                <button type="submit" disabled={saveItem.isPending || uploading} className="btn btn-primary">
                  {saveItem.isPending ? (editingId ? 'Updating…' : 'Creating…') : (editingId ? 'Save changes' : 'Create item')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
