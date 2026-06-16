'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchJson, parseApiError } from '@/lib/apiError';
import useConfirm from '@/hooks/useConfirm';

const EMPTY_FORM = {
  name: '', isActive: true,
  kicker: '', headline: '', sub: '', coverUrl: '', period: 'any',
};

const TONES = ['green', 'gold', 'sky', 'rose'];
const CAT_ICON = (
  <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>
);

export default function CategoriesPage() {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [rows, setRows] = useState([]);
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const draggingRef = useRef(false);

  const { data: categories, isLoading, error: loadError } = useQuery({
    queryKey: ['categories'],
    queryFn: () => fetchJson('/api/categories'),
  });

  // Keep a local ordered copy for instant drag feedback; don't clobber mid-drag.
  // Depend on the query data (stable ref) — not a `[]` fallback that changes each render.
  useEffect(() => {
    if (categories && !draggingRef.current) setRows(categories);
  }, [categories]);

  const saveMutation = useMutation({
    mutationFn: (payload) => fetchJson(
      editingId ? `/api/categories/${editingId}` : '/api/categories',
      { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    ),
    onMutate: () => { toast.loading(editingId ? 'Updating category…' : 'Creating category…', { id: 'cat-save' }); },
    onSuccess: () => {
      toast.success(editingId ? 'Category updated' : 'Category created', { id: 'cat-save' });
      qc.invalidateQueries({ queryKey: ['categories'] });
      resetForm();
    },
    onError: (err) => toast.error(parseApiError(err), { id: 'cat-save' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => fetchJson(`/api/categories/${id}`, { method: 'DELETE' }),
    onMutate: () => { toast.loading('Deleting…', { id: 'cat-del' }); },
    onSuccess: () => { toast.success('Category deleted', { id: 'cat-del' }); qc.invalidateQueries({ queryKey: ['categories'] }); },
    onError: (err) => toast.error(parseApiError(err), { id: 'cat-del' }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }) => fetchJson(`/api/categories/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
    onError: (err) => toast.error(parseApiError(err)),
  });

  const persistOrder = async (ordered) => {
    const changed = ordered.filter((c, i) => c.sortOrder !== i);
    if (!changed.length) return;
    try {
      await Promise.all(ordered.map((c, i) => c.sortOrder === i
        ? null
        : fetchJson(`/api/categories/${c.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sortOrder: i }) })
      ).filter(Boolean));
      toast.success('Order saved');
      qc.invalidateQueries({ queryKey: ['categories'] });
    } catch (err) {
      toast.error(parseApiError(err));
      qc.invalidateQueries({ queryKey: ['categories'] });
    }
  };

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
  const endDrag = () => { draggingRef.current = false; setDragIndex(null); setOverIndex(null); };

  const resetForm = () => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(false); setImagePreview(null); };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setImagePreview(URL.createObjectURL(file));
    const formData = new FormData();
    formData.append('file', file);
    try {
      const data = await fetchJson('/api/upload', { method: 'POST', body: formData });
      if (data.url) { setForm((prev) => ({ ...prev, coverUrl: data.url })); toast.success('Image uploaded'); }
      else throw new Error('No URL returned');
    } catch (err) { toast.error(parseApiError(err) || 'Image upload failed'); setImagePreview(null); }
    finally { setUploading(false); }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMutation.mutate({
      name: form.name,
      isActive: form.isActive,
      kicker: form.kicker || null,
      headline: form.headline || null,
      sub: form.sub || null,
      coverUrl: form.coverUrl || null,
      period: form.period || 'any',
    });
  };

  const handleEdit = (cat) => {
    setForm({
      name: cat.name, isActive: cat.isActive,
      kicker: cat.kicker || '', headline: cat.headline || '', sub: cat.sub || '',
      coverUrl: cat.coverUrl || '', period: cat.period || 'any',
    });
    setImagePreview(cat.coverUrl || null);
    setEditingId(cat.id);
    setShowForm(true);
  };

  const handleDelete = async (cat) => {
    const ok = await confirm({
      title: `Delete “${cat.name}”?`,
      body: 'All menu items inside this category will also be removed. This cannot be undone.',
      confirmLabel: 'Delete category',
    });
    if (ok) deleteMutation.mutate(cat.id);
  };

  const isSaving = saveMutation.isPending;

  return (
    <div>
      {dialog}

      <div className="toolbar">
        <p className="sub" style={{ margin: 0 }}>Drag to reorder how categories appear on the public menu.</p>
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 5v14M5 12h14" /></svg>Add category
        </button>
      </div>

      {loadError && <div className="adm-error-banner" style={{ marginBottom: 14 }}>{parseApiError(loadError)}</div>}

      {isLoading ? (
        <div className="card" style={{ overflow: 'hidden' }}>
          {[1, 2, 3, 4].map((n) => <div key={n} className="sk" style={{ height: 56, margin: 12, borderRadius: 'var(--r-sm)' }} />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="card card-pad-lg">
          <div className="empty">
            <div className="empty-ring"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg></div>
            <p className="empty-title">No categories yet</p>
            <p className="empty-sub">Create your first category to start organizing the menu.</p>
          </div>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 30 }} />
                  <th>Category</th>
                  <th className="num">Items</th>
                  <th>Period</th>
                  <th>Status</th>
                  <th style={{ width: 60 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((cat, i) => (
                  <tr
                    key={cat.id}
                    draggable
                    onDragStart={() => onDragStart(i)}
                    onDragOver={(e) => onDragOver(e, i)}
                    onDrop={onDrop}
                    onDragEnd={endDrag}
                    className={`${dragIndex === i ? 'dragging' : ''} ${overIndex === i && dragIndex !== i ? 'drag-over' : ''}`}
                  >
                    <td>
                      <span className="grip" aria-label="Drag to reorder">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" /></svg>
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {cat.coverUrl
                          ? <img className="cat-thumb" src={cat.coverUrl} alt="" />
                          : <span className={`cat-ic kpi-ic ${TONES[i % TONES.length]}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">{CAT_ICON}</svg></span>}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 560, color: 'var(--ink)' }}>{cat.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--faint)' }}>{cat.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td className="num">{cat._count?.items ?? 0}</td>
                    <td style={{ textTransform: 'capitalize', color: 'var(--muted)' }}>{cat.period}</td>
                    <td>
                      <span role="switch" aria-checked={cat.isActive} className={`hj-sw${cat.isActive ? ' on' : ''}`} onClick={() => toggleMutation.mutate({ id: cat.id, isActive: !cat.isActive })} />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleEdit(cat)}>Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="jz-modal-bk open" onClick={(e) => { if (e.target === e.currentTarget) resetForm(); }}>
          <div className="modal">
            <div className="modal-h">
              <div className="mt">
                <div className="eyebrow">{editingId ? 'Edit category' : 'New category'}</div>
                <div className="h-1" style={{ marginTop: 3 }}>{editingId ? form.name || 'Category' : 'Add category'}</div>
              </div>
              <button className="icon-btn" onClick={resetForm} aria-label="Close" disabled={isSaving}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
              <div className="modal-b">
                <div className="ff"><label>Category name</label><input className="input" type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
                <div className="ff-row">
                  <div className="ff" style={{ flex: 1 }}><label>Kicker</label><input className="input" type="text" value={form.kicker} onChange={(e) => setForm({ ...form, kicker: e.target.value })} placeholder="e.g. Until 11 AM" /></div>
                  <div className="ff" style={{ flex: 1 }}>
                    <label>Period</label>
                    <select className="input" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })}>
                      <option value="any">Any time</option>
                      <option value="morning">Morning (5–11)</option>
                      <option value="midday">Midday (11–16)</option>
                      <option value="evening">Evening (16+)</option>
                    </select>
                  </div>
                </div>
                <div className="ff">
                  <label>Headline</label>
                  <input className="input" type="text" value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} placeholder="Morning, <em>slowly.</em>" />
                  <span className="sub" style={{ fontSize: 11.5 }}>Use &lt;em&gt; for italic accents.</span>
                </div>
                <div className="ff"><label>Subline</label><input className="input" type="text" value={form.sub} onChange={(e) => setForm({ ...form, sub: e.target.value })} placeholder="Eggs, grains & garden fruit" /></div>
                <div className="ff">
                  <label>Cover image</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {imagePreview && <img src={imagePreview} alt="" style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', border: '1px solid var(--line)', flexShrink: 0 }} />}
                    <label className="btn btn-ghost" style={{ flex: 1, cursor: 'pointer' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
                      {uploading ? 'Uploading…' : imagePreview ? 'Change cover' : 'Upload cover'}
                      <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handleImageUpload} disabled={uploading} />
                    </label>
                  </div>
                </div>
                <label className="ff-row" style={{ cursor: 'pointer' }}>
                  <span style={{ fontSize: 13, color: 'var(--ink-2)', fontWeight: 500 }}>Visible on menu</span>
                  <span role="switch" aria-checked={form.isActive} className={`hj-sw${form.isActive ? ' on' : ''}`} onClick={() => setForm((f) => ({ ...f, isActive: !f.isActive }))} />
                </label>
              </div>
              <div className="modal-f">
                {editingId && <button type="button" className="btn btn-ghost" style={{ marginRight: 'auto', color: 'var(--rose)' }} onClick={() => { handleDelete({ id: editingId, name: form.name }); resetForm(); }} disabled={deleteMutation.isPending}>Delete</button>}
                <button type="button" onClick={resetForm} disabled={isSaving} className="btn btn-ghost">Cancel</button>
                <button type="submit" disabled={isSaving || uploading} className="btn btn-primary">{isSaving ? (editingId ? 'Updating…' : 'Creating…') : (editingId ? 'Save changes' : 'Create category')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
