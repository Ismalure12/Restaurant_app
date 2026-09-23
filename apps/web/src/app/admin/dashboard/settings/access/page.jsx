'use client';

import { Fragment, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import { Button, Chip, ErrorState, RowSkeletons, Table, Th, Td, cx, useBreakpoint } from '@/components/admin/ui';
import { SaveBar, SettingsCard } from '@/components/admin/settings/shared';

const KEY = ['permissions'];
const ROLES = [
  { key: 'manager', label: 'Manager' },
  { key: 'cashier', label: 'Cashier' },
  { key: 'waiter', label: 'Waiter' },
];
const LEVELS = [
  { key: 'none', label: 'None', hint: 'Hidden', tone: 'off' },
  { key: 'view', label: 'View', hint: 'Can look, not change', tone: 'info' },
  { key: 'act', label: 'Act', hint: 'Can look and change', tone: 'ok' },
];
const levelInfo = (k) => LEVELS.find((l) => l.key === k) || LEVELS[0];
const RANK = { none: 0, view: 1, act: 2 };

/** One cell: a None / View / Act segmented radio group (or a chip when locked). */
function LevelCell({ label, value, options, allowed, disabled, changed, onPick, locked }) {
  if (locked) return <Chip small tone={levelInfo(value).tone} dot={false}>{levelInfo(value).label}</Chip>;
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx('inline-flex bg-mq-chip border rounded-lg p-[3px] gap-0.5', changed ? 'border-mq-focus shadow-mq-focus' : 'border-mq-line')}
    >
      {options.map((l) => {
        const on = value === l.key;
        const ok = allowed(l.key);
        return (
          <button
            key={l.key}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={!ok || disabled}
            title={ok ? l.hint : 'More than you have'}
            onClick={() => onPick(l.key)}
            className={cx(
              'min-h-[30px] min-w-[46px] px-2.5 rounded-md text-[12.5px] whitespace-nowrap transition-colors disabled:cursor-not-allowed',
              on ? 'bg-white font-semibold shadow-mq-seg' : 'font-medium text-mq-on-tint hover:text-mq-ink disabled:hover:text-mq-on-tint disabled:opacity-45',
              on && (l.key === 'act' ? 'text-mq-ok-ink' : l.key === 'view' ? 'text-mq-info-ink' : 'text-mq-ink'),
            )}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Settings › Staff access: which pages each role can open (View) or change
 * (Act). The admin always has everything; the manager sets cashiers and
 * waiters (never above their own level), only the admin sets the manager.
 * GET/PUT /api/admin/permissions — the API enforces every rule here again.
 */
export default function StaffAccessPage() {
  const qc = useQueryClient();
  const bp = useBreakpoint();
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: KEY, queryFn: () => fetchJson('/api/admin/permissions') });
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

  if (isError) return <ErrorState error={error} onRetry={() => refetch()} title="Couldn’t load staff access" />;

  const cell = (r, p) => {
    const v = valueOf(r.key, p.key);
    return (
      <LevelCell
        label={`${r.label} · ${p.label}`}
        value={v}
        options={LEVELS.filter((l) => !p.readOnly || l.key !== 'act')}
        allowed={(lv) => allowed(p, lv)}
        disabled={save.isPending}
        changed={draft[r.key]?.[p.key] !== undefined && saved?.[r.key]?.[p.key] !== v}
        locked={!editable.has(r.key)}
        onPick={(lv) => set(r.key, p.key, lv)}
      />
    );
  };
  const pageName = (p) => (
    <span className="inline-flex items-center gap-2 flex-wrap">
      <span className="font-medium text-mq-ink">{p.label}</span>
      {p.readOnly && <span className="text-[11px] text-mq-muted">read-only page</span>}
    </span>
  );
  const phone = bp === 'phone';

  return (
    <>
      <SettingsCard
        flush
        title="Which pages each role can open"
        sub={`None hides a page, View shows it read-only, Act lets them change things. Changes apply straight away — nobody has to sign in again.${isAdmin ? ' The admin always has every page.' : ' Only the admin can change what managers can do, and you can’t give more than you have.'}`}
        actions={data && editable.size > 0 && <Button size="xs" icon="refresh" onClick={resetDefaults} disabled={save.isPending}>Reset to defaults</Button>}
      >
        <ul className="m-0 list-none flex flex-wrap gap-x-4 gap-y-1.5 px-4 py-2.5 border-b border-mq-chip" aria-label="What the levels mean">
          {LEVELS.map((l) => (
            <li key={l.key} className="inline-flex items-center gap-2 text-xs text-mq-on-tint"><Chip small tone={l.tone} dot={false}>{l.label}</Chip>{l.hint}</li>
          ))}
        </ul>

        {isLoading ? <RowSkeletons rows={8} /> : phone ? (
          // Phone: one block per page, a row per role.
          <div className="flex flex-col">
            {groups.map((g) => (
              <Fragment key={g.group}>
                <div className="px-4 pt-3 pb-1.5 bg-mq-cream border-b border-mq-chip text-[10.5px] font-semibold uppercase tracking-[.12em] text-mq-muted">{g.group}</div>
                {g.pages.map((p) => (
                  <div key={p.key} className="px-4 py-3 border-b border-mq-chip flex flex-col gap-2">
                    {pageName(p)}
                    {ROLES.map((r) => (
                      <div key={r.key} className="flex items-center justify-between gap-3">
                        <span className="text-[12.5px] text-mq-on-tint">{r.label}</span>
                        {cell(r, p)}
                      </div>
                    ))}
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
        ) : (
          <Table maxH={560} minW={660} label="Page access by role">
            <thead>
              <tr>
                <Th>Page</Th>
                {ROLES.map((r) => (
                  <Th key={r.key}>
                    <span className="inline-flex items-center gap-2">{r.label}{!editable.has(r.key) && <span className="normal-case tracking-normal font-medium text-[11px] text-mq-muted" title="Only the admin can change this">· admin only</span>}</span>
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g.group}>
                  <tr><td colSpan={ROLES.length + 1} className="px-3.5 pt-3 pb-1.5 bg-mq-cream border-b border-mq-chip text-[10.5px] font-semibold uppercase tracking-[.12em] text-mq-muted">{g.group}</td></tr>
                  {g.pages.map((p) => (
                    <tr key={p.key} className="hover:bg-mq-cream">
                      <Td>{pageName(p)}</Td>
                      {ROLES.map((r) => <Td key={r.key} className="!py-2">{cell(r, p)}</Td>)}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </Table>
        )}

        <p className="m-0 px-4 py-3 text-xs text-mq-muted leading-normal border-t border-mq-chip">
          Always fixed, whatever is set here: voiding or editing a closed sale is manager-only · Staff access and the Audit log are for the admin and managers · only the admin can make someone an admin · nobody can create or change an account above their own role · My Performance is for cashiers and waiters.
        </p>
      </SettingsCard>

      <SaveBar count={changes.length} saving={save.isPending} onDiscard={() => setDraft({})} onSave={() => save.mutate()} saveLabel="Save access" />
    </>
  );
}
