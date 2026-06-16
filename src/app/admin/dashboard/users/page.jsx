'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchJson, parseApiError } from '@/lib/apiError';
import useConfirm from '@/hooks/useConfirm';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin — full access' },
  { value: 'manager', label: 'Manager — full access' },
  { value: 'cashier', label: 'Cashier — POS, orders, inventory' },
  { value: 'waiter', label: 'Waiter — Register + performance' },
  { value: 'user', label: 'User — menu content only' },
];
const ROLE_LABEL = { admin: 'Admin', manager: 'Manager', cashier: 'Cashier', waiter: 'Waiter', user: 'User' };
const GRAD = { admin: ['#1f6b4f', '#154b38'], manager: ['#1f6b4f', '#154b38'], cashier: ['#2f6db0', '#1f4f80'], waiter: ['#b5862c', '#8a6a1f'], user: ['#69756e', '#4a544e'] };
const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const initials = (s) => (s || '').trim().split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || 'HJ';
const emptyForm = { role: 'cashier', name: '', phone: '', email: '', password: '', isActive: true };

export default function StaffPage() {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [currentUserId, setCurrentUserId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  useEffect(() => { fetch('/api/auth/me').then((r) => r.json()).then((d) => { if (d.userId) setCurrentUserId(d.userId); }).catch(() => {}); }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => { const res = await fetch('/api/users'); if (res.status === 403) return { denied: true, users: [] }; if (!res.ok) throw new Error('Failed'); return { denied: false, users: await res.json() }; },
  });
  const accessDenied = data?.denied ?? false;
  const logins = useMemo(() => (Array.isArray(data?.users) ? data.users : []), [data]);

  const { data: salesByStaff = [] } = useQuery({ queryKey: ['staff-sales'], queryFn: async () => { const r = await fetch('/api/admin/finance/summary'); return r.ok ? (await r.json()).salesByStaff || [] : []; }, enabled: !accessDenied });
  const { data: waiterPerf = [] } = useQuery({ queryKey: ['waiter-perf'], queryFn: async () => { const r = await fetch('/api/admin/reports/summary'); return r.ok ? (await r.json()).waiterPerformance || [] : []; }, enabled: !accessDenied });
  const { data: myShifts = [] } = useQuery({ queryKey: ['my-shifts'], queryFn: () => fetchJson('/api/admin/shifts?mine=1'), enabled: !accessDenied });
  const openShift = myShifts.find((s) => s.open);
  const loginSales = Object.fromEntries(salesByStaff.filter((s) => s.staffId != null).map((s) => [s.staffId, s.total]));
  const waiterSales = Object.fromEntries(waiterPerf.filter((w) => w.waiterId != null).map((w) => [w.waiterId, w.total]));

  const shiftMutation = useMutation({ mutationFn: (a) => fetchJson(`/api/admin/shifts/${a}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }), onSuccess: () => { toast.success('Shift updated'); qc.invalidateQueries({ queryKey: ['my-shifts'] }); }, onError: (e) => toast.error(parseApiError(e)) });

  const allRows = useMemo(() => logins.map((u) => ({ id: u.id, name: u.name || u.email, email: u.email, phone: u.phone, role: u.role, isActive: u.isActive, sales: u.role === 'waiter' ? waiterSales[u.id] : loginSales[u.id] })), [logins, loginSales, waiterSales]);
  const rows = roleFilter === 'all' ? allRows : allRows.filter((r) => r.role === roleFilter);
  const activeCount = allRows.filter((r) => r.isActive).length;

  const save = useMutation({
    mutationFn: ({ id, payload }) => fetchJson(id ? `/api/users/${id}` : '/api/users', { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
    onSuccess: () => { toast.success(editing ? 'Saved' : 'Created'); qc.invalidateQueries({ queryKey: ['users'] }); reset(); },
    onError: (e) => setFormError(parseApiError(e)),
  });
  const del = useMutation({ mutationFn: (id) => fetchJson(`/api/users/${id}`, { method: 'DELETE' }), onSuccess: () => { toast.success('Removed'); qc.invalidateQueries({ queryKey: ['users'] }); }, onError: (e) => toast.error(parseApiError(e)) });

  const reset = () => { setForm(emptyForm); setEditing(null); setShowForm(false); setFormError(''); };
  const submit = (e) => {
    e.preventDefault(); setFormError('');
    if (!form.email.trim()) { setFormError('Email is required'); return; }
    const base = { email: form.email.trim(), role: form.role, name: form.name.trim() || null, phone: form.phone.trim() || null, isActive: form.isActive };
    if (editing) { save.mutate({ id: editing.id, payload: base }); return; }
    if (!form.password || form.password.length < 6) { setFormError('Password must be at least 6 characters'); return; }
    save.mutate({ id: null, payload: { ...base, password: form.password } });
  };
  const startEdit = (row) => { setForm({ role: row.role, name: logins.find((u) => u.id === row.id)?.name ?? '', phone: row.phone ?? '', email: row.email ?? '', password: '', isActive: row.isActive }); setEditing({ id: row.id }); setShowForm(true); setFormError(''); };
  const remove = async (row) => { if (await confirm({ title: `Remove ${row.name}?`, body: 'This account will no longer be able to sign in.', confirmLabel: 'Remove' })) del.mutate(row.id); };

  if (!isLoading && accessDenied) {
    return <div className="card card-pad-lg" style={{ maxWidth: 720 }}><div className="empty"><div className="empty-ring"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg></div><p className="empty-title">Managers only</p><p className="empty-sub">You don’t have permission to manage staff.</p></div></div>;
  }

  return (
    <div style={{ maxWidth: 1100 }}>
      {dialog}
      <div className="kpi-row reveal" style={{ marginBottom: 16 }}>
        <div className="kpi"><div className="kpi-top"><div className="kpi-ic ink"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /></svg></div><span className="kpi-k">Total staff</span></div><div className="kpi-v">{allRows.length}</div></div>
        <div className="kpi"><div className="kpi-top"><div className="kpi-ic green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg></div><span className="kpi-k">Active</span></div><div className="kpi-v">{activeCount}</div></div>
        <div className="kpi"><div className="kpi-top"><div className="kpi-ic gold"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg></div><span className="kpi-k">My shift</span></div><div className="kpi-v" style={{ fontSize: 18 }}>{openShift ? 'On shift' : 'Off'}</div><div className="kpi-foot"><button className="btn btn-ghost btn-sm" disabled={shiftMutation.isPending} onClick={() => shiftMutation.mutate(openShift ? 'clock-out' : 'clock-in')}>{openShift ? 'Clock out' : 'Clock in'}</button></div></div>
      </div>

      <div className="toolbar">
        <div className="seg">{['all', 'manager', 'cashier', 'waiter'].map((r) => <button key={r} className={roleFilter === r ? 'active' : ''} onClick={() => setRoleFilter(r)} style={{ textTransform: 'capitalize' }}>{r === 'all' ? 'All roles' : r + 's'}</button>)}</div>
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={() => { reset(); setShowForm(true); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></svg>Add staff</button>
      </div>

      {isLoading ? (
        <div className="staff-grid">{[1, 2, 3].map((n) => <div key={n} className="sc"><div className="sk" style={{ height: 48, width: 48, borderRadius: 14 }} /><div className="sk" style={{ height: 14, marginTop: 12 }} /></div>)}</div>
      ) : rows.length === 0 ? (
        <div className="card card-pad-lg"><div className="empty"><div className="empty-ring"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg></div><p className="empty-title">No staff here</p><p className="empty-sub">Add a staff account to get started.</p></div></div>
      ) : (
        <div className="staff-grid">
          {rows.map((row) => {
            const isSelf = row.id === currentUserId;
            const g = GRAD[row.role] || GRAD.user;
            return (
              <div className="sc" key={row.id}>
                <div className="sc-top">
                  <div className="sc-av" style={{ background: `linear-gradient(135deg,${g[0]},${g[1]})` }}>{initials(row.name)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}><div className="sc-name">{row.name}{isSelf && <span className="pill pill-ghost" style={{ marginLeft: 6, fontSize: 9.5 }}>You</span>}</div><div className="sc-meta">{row.email}{row.phone ? ` · ${row.phone}` : ''}</div></div>
                  <span className={`pill role-${row.role}`}>{ROLE_LABEL[row.role] || row.role}</span>
                </div>
                <div className="sc-stats">
                  <div className="sc-stat"><div className="v">{money(row.sales)}</div><div className="k">Sales · 30d</div></div>
                  <div className="sc-stat"><div className="v" style={{ fontSize: 13 }}>{row.isActive ? 'Active' : 'Inactive'}</div><div className="k">Status</div></div>
                </div>
                <div className="sc-foot">
                  <button className="btn btn-ghost btn-sm" onClick={() => startEdit(row)}>Edit</button>
                  {!isSelf && <button className="btn btn-danger btn-sm" onClick={() => remove(row)} disabled={del.isPending}>Remove</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="jz-modal-bk open" onClick={(e) => { if (e.target === e.currentTarget) reset(); }}>
          <div className="modal">
            <div className="modal-h"><div className="mt"><div className="h-1">{editing ? 'Edit staff' : 'New staff'}</div></div><button className="icon-btn" onClick={reset} aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg></button></div>
            <form onSubmit={submit}>
              <div className="modal-b">
                <div className="ff-row" style={{ gap: 12 }}><div className="ff" style={{ flex: 1 }}><label>Name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Amina M." /></div><div className="ff" style={{ flex: 1 }}><label>Phone</label><input className="input" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div></div>
                <div className="ff"><label>Email</label><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
                {!editing && <div className="ff"><label>Password</label><input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} placeholder="At least 6 characters" /></div>}
                <div className="ff"><label>Role</label><select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active</label>
                {formError && <div className="pill pill-rose" style={{ padding: '8px 12px' }}>{formError}</div>}
              </div>
              <div className="modal-f"><button type="button" className="btn btn-ghost" onClick={reset}>Cancel</button><button type="submit" className="btn btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : (editing ? 'Save changes' : 'Create staff')}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
