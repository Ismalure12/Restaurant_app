'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import { Button, Chip, ErrorState, Icon, RowSkeletons, Table, Th, Td, cx } from '@/components/admin/ui';
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
// Narrower cells on a phone so all four columns fit without sideways scrolling.
const TIGHT = 'max-tab:!px-2';

/**
 * One cell: the design's level pill. When this editor may change it, a native
 * <select> sits invisibly on top of the pill (16px — iOS zoom rule), so a tap
 * opens the system picker; levels above the editor's own are disabled in it.
 */
function LevelCell({ label, value, options, allowed, disabled, changed, onPick, locked }) {
  const info = levelInfo(value);
  const pill = (
    <Chip small tone={info.tone} dot={false} className={cx(value === 'none' && '!border-mq-line', !locked && 'pr-[7px]')}>
      <span className="inline-flex items-center gap-1">
        {info.label}
        {!locked && <Icon name="chevDown" size={11} stroke={2.4} className="opacity-70" />}
      </span>
    </Chip>
  );
  if (locked) return <span title="Only the admin can change this">{pill}</span>;
  return (
    <span className={cx('relative inline-flex rounded-full transition-shadow focus-within:shadow-mq-focus', changed && 'shadow-mq-focus')}>
      {pill}
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onPick(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-base disabled:cursor-not-allowed"
      >
        {options.map((l) => (
          <option key={l.key} value={l.key} disabled={!allowed(l.key) && l.key !== value}>
            {l.label} — {allowed(l.key) ? l.hint : 'more than you have'}
          </option>
        ))}
      </select>
    </span>
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
  const pages = data?.pages || [];
  const canEdit = editable.size > 0;

  return (
    <>
      <SettingsCard
        flush
        title="Which pages each role can open"
        sub={`None · View · Act. Admin always has everything; the API enforces it too.${isAdmin ? '' : ' Only the admin changes what managers can do, and you can’t give more than you have.'}`}
        actions={data && canEdit && <Button size="xs" onClick={resetDefaults} disabled={save.isPending}>Reset to defaults</Button>}
      >
        {isLoading ? <RowSkeletons rows={8} /> : (
          <Table maxH={420} label="Page access by role">
            <thead>
              <tr>
                <Th className={TIGHT}>Page</Th>
                {ROLES.map((r) => <Th key={r.key} className={TIGHT}>{r.label}</Th>)}
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => (
                <tr key={p.key} className="hover:bg-mq-cream">
                  <Td className={cx(TIGHT, 'font-medium text-mq-ink')}>{p.label}</Td>
                  {ROLES.map((r) => <Td key={r.key} className={TIGHT}>{cell(r, p)}</Td>)}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <p className="m-0 px-4 py-3 text-xs text-mq-muted leading-normal border-t border-mq-chip">
          Always fixed: voiding or editing a closed sale is manager-only · Staff access and the Audit log are for the admin and managers · only the admin makes admins · nobody manages an account above their own role.
        </p>
      </SettingsCard>

      <SaveBar count={changes.length} saving={save.isPending} onDiscard={() => setDraft({})} onSave={() => save.mutate()} saveLabel="Save access" hidden={!canEdit} />
    </>
  );
}
