'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import Field from '@/components/admin/Field';
import { useFormValidation } from '@/lib/formValidation';
import { reportSaveError } from '@/lib/saveError';
import { MAX_BATCH, oneTableSchema, tableRangeSchema, editTableSchema } from '@/lib/schemas/tables';
import useConfirm from '@/hooks/useConfirm';
import Modal from '@/components/admin/Modal';
import { RowsSkeleton } from '@/components/admin/Skeletons';
import { money } from '@/lib/money';
import IfCan from '@/components/admin/IfCan';


const jsonInit = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const GridIc = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>;

export default function TablesPage() {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);

  // Manager view: every table with its unpaid tab. Shape [{id,name,isActive,sortOrder,tabs,total}].
  const list = useQuery({ queryKey: ['tables-status'], queryFn: () => fetchJson('/api/admin/tables?status=1'), refetchInterval: 30_000 });
  const tables = Array.isArray(list.data) ? list.data : [];
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['tables-status'] });
    qc.invalidateQueries({ queryKey: ['tables'] });
  };

  const toggle = useMutation({
    mutationFn: (t) => fetchJson(`/api/admin/tables/${t.id}`, jsonInit('PUT', { isActive: !t.isActive })),
    onSuccess: (_d, t) => { notify.success(t.isActive ? `${t.name} switched off` : `${t.name} switched on`); refresh(); },
    onError: (e, t) => notify.error(e, { title: `Could not switch ${t.name} ${t.isActive ? 'off' : 'on'}` }),
  });
  const remove = useMutation({
    mutationFn: (t) => fetchJson(`/api/admin/tables/${t.id}`, { method: 'DELETE' }),
    onSuccess: (_d, t) => { notify.success(`${t.name} deleted`); refresh(); },
    onError: (e, t) => notify.error(e, { title: `Could not delete ${t.name}` }),
  });
  const askDelete = async (t) => {
    const ok = await confirm({ title: `Delete table ${t.name}?`, body: 'Only a table that never had an order can be deleted; otherwise switch it off instead.', confirmLabel: 'Delete table' });
    if (ok) remove.mutate(t);
  };

  return (
    <div className="wrap">
      {dialog}
      <div className="toolbar">
        <div className="note">{tables.length ? `${tables.filter((t) => t.isActive).length} of ${tables.length} tables in use` : ''}</div>
        <div style={{ flex: 1 }} />
        <IfCan page="tables"><button className="btn btn-primary" onClick={() => setAdding(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 5v14M5 12h14" /></svg>Add tables
        </button></IfCan>
      </div>

      {list.isLoading ? (
        <div className="card"><RowsSkeleton rows={4} className="card-pad" /></div>
      ) : list.isError ? (
        <div className="adm-error-banner">Couldn&rsquo;t load the tables. Try again.</div>
      ) : tables.length === 0 ? (
        <div className="card card-pad-lg">
          <div className="empty">
            <div className="empty-ring">{GridIc}</div>
            <p className="empty-title">No tables yet</p>
            <p className="empty-sub">No tables yet — the Register accepts any text. Add your tables and the Register will only let staff pick from them (so 5, T5 and Table 5 stop being three tables).</p>
          </div>
        </div>
      ) : (
        <div className="tbl-grid">
          {tables.map((t) => {
            const busy = t.tabs > 0;
            return (
              <div key={t.id} className={`card tbl-card${t.isActive ? '' : ' is-off'}${busy ? ' is-busy' : ''}`}>
                <div className="tbl-top">
                  <span className="tbl-name">{t.name}</span>
                  {!t.isActive ? <span className="pill">Off</span> : busy ? <span className="pill pill-gold">Busy</span> : <span className="pill pill-green">Free</span>}
                </div>
                <div className="tbl-state">
                  {busy
                    ? <Link href="/admin/dashboard/orders" className="tbl-link">Unpaid tab · {money(t.total)}{t.tabs > 1 ? ` (${t.tabs} tabs)` : ''}</Link>
                    : <span className="muted">{t.isActive ? 'No unpaid tab' : 'Hidden from the Register'}</span>}
                </div>
                <div className="tbl-acts">
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing(t)}>Edit</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => toggle.mutate(t)} disabled={toggle.isPending}>{t.isActive ? 'Switch off' : 'Switch on'}</button>
                  <button className="btn btn-danger btn-sm" onClick={() => askDelete(t)} disabled={remove.isPending}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {adding && <AddTablesDialog onClose={() => setAdding(false)} onDone={refresh} />}
      {editing && <EditTableDialog table={editing} onClose={() => setEditing(null)} onDone={refresh} />}
    </div>
  );
}

function AddTablesDialog({ onClose, onDone }) {
  const [several, setSeveral] = useState(false);
  const [name, setName] = useState('');
  const [from, setFrom] = useState('1');
  const [to, setTo] = useState('10');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(null); // { done, total }
  const busy = progress !== null;
  const form = useFormValidation(several ? tableRangeSchema : oneTableSchema, several ? { from, to } : { name });

  const submit = async (e) => {
    e.preventDefault(); setError(''); form.setServerErrors({});
    if (!form.check()) return;
    let names;
    if (several) {
      const a = Number(from); const b = Number(to);
      names = Array.from({ length: b - a + 1 }, (_, i) => String(a + i));
    } else {
      names = [name.trim()];
    }
    let created = 0; let skipped = 0;
    setProgress({ done: 0, total: names.length });
    // One POST per table, in order (the API keeps them in the sequence added). A
    // 409 means it already exists: skip it and carry on. Anything else stops.
    for (const n of names) {
      try {
        await fetchJson('/api/admin/tables', jsonInit('POST', { name: n }));
        created += 1;
      } catch (err) {
        if (err?.status === 409) skipped += 1;
        else {
          const note = `Added ${created} before stopping.`;
          reportSaveError(err, { form: several ? undefined : form, setBanner: (m) => setError(`${m} (${note})`), title: `Could not add the tables. ${note}` });
          break;
        }
      }
      setProgress({ done: created + skipped, total: names.length });
    }
    onDone();
    if (created + skipped === names.length) {
      notify.success(`${created} ${created === 1 ? 'table' : 'tables'} added${skipped ? ` · ${skipped} already existed` : ''}`);
      onClose();
    } else setProgress(null);
  };

  return (
    <Modal title="Add tables" eyebrow="Tables" onClose={onClose} busy={busy}>
      <form onSubmit={submit} noValidate style={{ display: 'contents' }}>
        <div className="modal-b">
          <div className="seg seg-full" style={{ marginBottom: 14 }}>
            <button type="button" className={!several ? 'active' : ''} onClick={() => setSeveral(false)} disabled={busy}>One table</button>
            <button type="button" className={several ? 'active' : ''} onClick={() => setSeveral(true)} disabled={busy}>Several</button>
          </div>
          {several ? (
            <div className="form-grid">
              <Field label="From number" required {...form.fieldProps('from')}><input className="input" type="number" min="0" value={from} onChange={(e) => setFrom(e.target.value)} disabled={busy} /></Field>
              <Field label="To number" required {...form.fieldProps('to')}><input className="input" type="number" min="0" value={to} onChange={(e) => setTo(e.target.value)} disabled={busy} /></Field>
            </div>
          ) : (
            <Field label="Table name" required {...form.fieldProps('name')}><input className="input" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="e.g. 5 or Terrace 2" autoFocus disabled={busy} /></Field>
          )}
          {several && <p className="note" style={{ margin: '4px 0 0' }}>Creates one table per number (up to {MAX_BATCH} at a time). Numbers that already exist are skipped.</p>}
          {progress && <p className="note tbl-progress" role="status">Adding {progress.done} of {progress.total}…</p>}
          {error && <div className="adm-error-banner">{error}</div>}
        </div>
        <div className="modal-f">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !form.valid}>{busy ? 'Adding…' : 'Add'}</button>
        </div>
      </form>
    </Modal>
  );
}

function EditTableDialog({ table, onClose, onDone }) {
  const [name, setName] = useState(table.name);
  const [sortOrder, setSortOrder] = useState(String(table.sortOrder));
  const [error, setError] = useState('');
  const form = useFormValidation(editTableSchema, { name, sortOrder });
  const save = useMutation({
    mutationFn: (payload) => fetchJson(`/api/admin/tables/${table.id}`, jsonInit('PUT', payload)),
    onSuccess: () => { notify.success('Table saved', { title: 'Could not save the table' }); onDone(); onClose(); },
    onError: (e) => reportSaveError(e, { form, setBanner: setError, title: 'Could not save the table' }),
  });
  const submit = (e) => {
    e.preventDefault(); setError(''); form.setServerErrors({});
    if (!form.check()) return;
    save.mutate({ name: name.trim(), sortOrder: Number(sortOrder) });
  };
  return (
    <Modal title={`Edit ${table.name}`} eyebrow="Table" onClose={onClose} busy={save.isPending}>
      <form onSubmit={submit} noValidate style={{ display: 'contents' }}>
        <div className="modal-b">
          <div className="form-grid">
            <Field label="Name" required {...form.fieldProps('name')}><input className="input" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
            <Field label="Position" required {...form.fieldProps('sortOrder')}><input className="input" type="number" min="0" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} /></Field>
          </div>
          <p className="note" style={{ margin: '4px 0 0' }}>Tables are listed by position, lowest first. Renaming doesn&rsquo;t change past orders.</p>
          {error && <div className="adm-error-banner">{error}</div>}
        </div>
        <div className="modal-f">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={save.isPending}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending || !form.valid}>{save.isPending ? 'Saving…' : 'Save changes'}</button>
        </div>
      </form>
    </Modal>
  );
}
