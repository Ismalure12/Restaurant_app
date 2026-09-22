'use client';

import { Fragment, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import { RowsSkeleton } from '@/components/admin/Skeletons';

const KEY = ['permissions'];
const ROLES = [
  { key: 'manager', label: 'Manager' },
  { key: 'cashier', label: 'Cashier' },
  { key: 'waiter', label: 'Waiter' },
];
const LEVELS = [
  { key: 'none', label: 'None', hint: 'Hidden' },
  { key: 'view', label: 'View', hint: 'Can look, not change' },
  { key: 'act', label: 'Act', hint: 'Can look and change' },
];
const RANK = { none: 0, view: 1, act: 2 };

/**
 * Settings › Staff access: which pages each role can open (View) or change
 * (Act). The admin always has everything; the manager sets cashiers and
 * waiters (never above their own level), only the admin sets the manager.
 * GET/PUT /api/admin/permissions — the API enforces every rule here again.
 */
export default function StaffAccessPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({ queryKey: KEY, queryFn: () => fetchJson('/api/admin/permissions') });
  // Local edits over the saved matrix: { role: { page: level } }.
  const [draft, setDraft] = useState({});

  const saved = data?.matrix;
  const editable = useMemo(() => new Set(data?.editable || []), [data]);
  const own = data?.own || {};
  const isAdmin = editable.has('manager');
  const valueOf = (role, page) => draft[role]?.[page] ?? saved?.[role]?.[page] ?? 'none';
  const changes = useMemo(() => {
    const list = [];
    for (const [role, row] of Object.entries(draft)) {
      for (const [page, level] of Object.entries(row)) if (saved?.[role]?.[page] !== level) list.push({ role, page, level });
    }
    return list;
  }, [draft, saved]);

  const groups = useMemo(() => {
    const out = [];
    for (const p of data?.pages || []) {
      const g = out.find((x) => x.group === p.group) || out[out.push({ group: p.group, pages: [] }) - 1];
      g.pages.push(p);
    }
    return out;
  }, [data]);

  const set = (role, page, level) => setDraft((d) => ({ ...d, [role]: { ...(d[role] || {}), [page]: level } }));
  // What this editor may pick in a cell: never 'act' on a read-only page, and a
  // manager never above their own level.
  const allowed = (page, level) => (!page.readOnly || level !== 'act') && (isAdmin || RANK[level] <= RANK[own[page.key] || 'none']);

  const resetDefaults = () => {
    const next = {};
    for (const role of editable) {
      for (const p of data.pages) {
        const def = data.defaults[role][p.key];
        if (allowed(p, def) || def === 'none') (next[role] ??= {})[p.key] = def;
      }
    }
    setDraft(next);
  };

  const save = useMutation({
    mutationFn: () => {
      const matrix = {};
      for (const c of changes) (matrix[c.role] ??= {})[c.page] = c.level;
      return fetchJson('/api/admin/permissions', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matrix }) });
    },
    onSuccess: () => {
      notify.success(`Staff access saved · ${changes.length} ${changes.length === 1 ? 'change' : 'changes'}`, { title: 'Could not save staff access' });
      setDraft({});
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['audit-log'] });
    },
    onError: (e) => notify.error(e, { title: 'Could not save staff access' }),
  });

  if (isError) return <div className="adm-error-banner">{error?.message || 'Could not load staff access'}</div>;

  return (
    <div className="pa-wrap">
      <section className="card set-sec">
        <div className="set-head">
          <span className="si"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></svg></span>
          <div style={{ flex: 1 }}>
            <h3>Who can open what</h3>
            <p className="sub">
              Pick, for each role, whether a page is hidden (<b>None</b>), read-only (<b>View</b>) or fully usable (<b>Act</b>). Changes apply straight away — nobody has to sign in again.
              {isAdmin ? ' The admin always has every page.' : ' Only the admin can change what managers can do, and you can’t give more than you have.'}
            </p>
          </div>
          {data && editable.size > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={resetDefaults} disabled={save.isPending}>Reset to defaults</button>
          )}
        </div>

        <ul className="pa-legend" aria-label="What the levels mean">
          {LEVELS.map((l) => <li key={l.key}><span className={`pa-chip lv-${l.key}`}>{l.label}</span>{l.hint}</li>)}
        </ul>

        {isLoading ? <div className="card-pad"><RowsSkeleton rows={8} height={44} /></div> : (
          <div className="pa-grid" role="table" aria-label="Page access by role">
            <div className="pa-row pa-headrow" role="row">
              <div className="pa-page" role="columnheader">Page</div>
              {ROLES.map((r) => (
                <div className="pa-cell" role="columnheader" key={r.key}>
                  {r.label}{!editable.has(r.key) && <span className="pa-lock" title="Only the admin can change this">Admin only</span>}
                </div>
              ))}
            </div>
            {groups.map((g) => (
              <Fragment key={g.group}>
                <div className="pa-group" role="row"><span role="rowheader">{g.group}</span></div>
                {g.pages.map((p) => (
                  <div className="pa-row" role="row" key={p.key}>
                    <div className="pa-page" role="rowheader">{p.label}{p.readOnly && <span className="pa-ro">read-only page</span>}</div>
                    {ROLES.map((r) => {
                      const v = valueOf(r.key, p.key);
                      const changed = draft[r.key]?.[p.key] !== undefined && saved?.[r.key]?.[p.key] !== v;
                      const canEdit = editable.has(r.key);
                      return (
                        <div className={`pa-cell${changed ? ' changed' : ''}`} role="cell" key={r.key} data-role={r.label}>
                          {canEdit ? (
                            <div className="seg pa-seg" role="radiogroup" aria-label={`${r.label} · ${p.label}`}>
                              {LEVELS.filter((l) => !p.readOnly || l.key !== 'act').map((l) => {
                                const ok = allowed(p, l.key);
                                return (
                                  <button key={l.key} type="button" role="radio" aria-checked={v === l.key}
                                    className={`lv-${l.key}${v === l.key ? ' active' : ''}`}
                                    disabled={!ok || save.isPending} title={ok ? l.hint : 'More than you have'}
                                    onClick={() => set(r.key, p.key, l.key)}>{l.label}</button>
                                );
                              })}
                            </div>
                          ) : <span className={`pa-chip lv-${v}`}>{LEVELS.find((l) => l.key === v)?.label}</span>}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
        )}

        <p className="note pa-fixed">
          Always fixed, whatever is set here: voiding or editing a closed sale is manager-only · Staff access and the Audit log are for the admin and managers · only the admin can make someone an admin · nobody can create or change an account above their own role · My Performance is for cashiers and waiters.
        </p>
      </section>

      {changes.length > 0 && (
        <div className="pa-savebar" role="region" aria-label="Unsaved changes">
          <span><b>{changes.length}</b> unsaved {changes.length === 1 ? 'change' : 'changes'}</span>
          <button type="button" className="btn btn-ghost" onClick={() => setDraft({})} disabled={save.isPending}>Discard</button>
          <button type="button" className="btn btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 6 9 17l-5-5" /></svg>{save.isPending ? 'Saving…' : 'Save access'}
          </button>
        </div>
      )}
    </div>
  );
}
