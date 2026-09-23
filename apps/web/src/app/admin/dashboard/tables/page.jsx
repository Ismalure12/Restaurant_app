'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import Field from '@/components/admin/Field';
import { useFormValidation } from '@/lib/formValidation';
import { reportSaveError } from '@/lib/saveError';
import { MAX_BATCH, oneTableSchema, tableRangeSchema, editTableSchema } from '@/lib/schemas/tables';
import useConfirm from '@/hooks/useConfirm';
import IfCan from '@/components/admin/IfCan';
import useAccess from '@/hooks/useAccess';
import useNavCounts from '@/hooks/useNavCounts';
import { money } from '@/lib/money';
import { age } from '@/components/admin/orders/orderUi';
import {
  Page, Toolbar, Button, Chip, Modal, ModalSpacer, Alert, EmptyState, ErrorState, Skeleton, Segmented, ToggleRow, inputCls, cx,
} from '@/components/admin/ui';

const jsonInit = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
/** "5" → "Table 5"; any other name as stored. */
const nameOf = (n) => (/^\d+$/.test(String(n).trim()) ? `Table ${String(n).trim()}` : n);
const D = '/admin/dashboard';

export default function TablesPage() {
  const qc = useQueryClient();
  const { canAct } = useAccess();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);

  // Every table with its unpaid tab. Shape [{id,name,isActive,sortOrder,tabs,total,orderId,oldestAt}].
  const list = useQuery({ queryKey: ['tables-status'], queryFn: () => fetchJson('/api/admin/tables?status=1'), refetchInterval: 30_000 });
  const tables = Array.isArray(list.data) ? list.data : [];
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['tables-status'] });
    qc.invalidateQueries({ queryKey: ['tables'] });
  };

  const switchOn = useMutation({
    mutationFn: (t) => fetchJson(`/api/admin/tables/${t.id}`, jsonInit('PUT', { isActive: true })),
    onSuccess: (_d, t) => { notify.success(`${nameOf(t.name)} switched on`); refresh(); },
    onError: (e, t) => notify.error(e, { title: `Could not switch ${nameOf(t.name)} on` }),
  });

  const inUse = tables.filter((t) => t.isActive).length;
  const busy = tables.filter((t) => t.tabs > 0).length;
  // Unpaid dine-in tabs whose table isn't in this list (typed before tables
  // existed, or a name that matches none): the sidebar badge counts them, so say where they are.
  const { openTabs } = useNavCounts();
  const unlisted = list.isSuccess ? openTabs - tables.reduce((n, t) => n + (t.tabs || 0), 0) : 0;

  return (
    <Page>
      <Toolbar>
        {tables.length > 0 && (
          <span className="text-[12.5px] text-mq-on-tint">
            <b className="font-mq-mono font-semibold text-mq-ink">{inUse}</b> of <b className="font-mq-mono font-semibold text-mq-ink">{tables.length}</b> tables in use
            {' · '}<b className="font-mq-mono font-semibold text-mq-ink">{busy}</b> with an unpaid tab
          </span>
        )}
        <span className="flex-1" />
        <IfCan page="tables"><Button variant="primary" icon="plus" className="max-nar:h-12" onClick={() => setAdding(true)}>Add tables</Button></IfCan>
      </Toolbar>

      {unlisted > 0 && (
        <Alert
          tone="info"
          title={`${unlisted} unpaid ${unlisted === 1 ? 'tab is' : 'tabs are'} on a table that isn’t listed here`}
          action={<Button href={`${D}/orders`} size="xs" iconRight="arrowRight">Orders</Button>}
        >
          They were rung up with a table name that matches none of these tables. Take payment in Orders.
        </Alert>
      )}

      {list.isLoading ? (
        <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(min(210px,100%),1fr))]" aria-busy="true" aria-label="Loading">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-[140px] rounded-xl" />)}
        </div>
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} title="Couldn’t load the tables" />
      ) : tables.length === 0 ? (
        <div className="bg-white border border-mq-line rounded-xl">
          <EmptyState
            icon="tables"
            title="No tables yet"
            action={<IfCan page="tables"><Button variant="soft" size="sm" icon="plus" onClick={() => setAdding(true)}>Add tables</Button></IfCan>}
          >
            Until you add tables the Register accepts any text. Add them and staff pick from the list, so 5, T5 and Table 5 stop being three tables.
          </EmptyState>
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(min(210px,100%),1fr))]">
          {tables.map((t) => {
            const hasTab = t.tabs > 0;
            const hidden = !t.isActive;
            const line = hidden
              ? 'Hidden from the Register'
              : hasTab
                ? <>Unpaid tab · <span className="font-mq-mono tabular-nums text-mq-ink">{money(t.total)}</span>{t.tabs > 1 ? ` (${t.tabs} tabs)` : ''}{t.oldestAt ? ` · ${age(t.oldestAt)}` : ''}</>
                : 'No unpaid tab';
            return (
              <div
                key={t.id}
                className={cx(
                  'flex flex-col gap-2.5 min-h-[140px] bg-white border rounded-xl shadow-mq-card p-3.5',
                  hasTab ? 'border-mq-warn-line' : 'border-mq-line',
                  hidden && 'opacity-70',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-lg font-semibold text-mq-ink truncate">{nameOf(t.name)}</span>
                  {hidden ? <Chip tone="off" small>Hidden</Chip> : hasTab ? <Chip tone="warn" small>Unpaid tab</Chip> : <Chip tone="ok" small>Free</Chip>}
                </div>
                <div className="text-[13px] text-mq-on-tint min-h-5">{line}</div>
                <div className="flex gap-1.5 flex-wrap mt-auto">
                  {hasTab && t.orderId ? (
                    <Button size="lg" className="text-[12.5px] max-nar:h-12" href={`${D}/orders?id=${t.orderId}`}>Take payment</Button>
                  ) : hidden ? (
                    canAct('tables') && (
                      <Button size="lg" className="text-[12.5px] max-nar:h-12" onClick={() => switchOn.mutate(t)} disabled={switchOn.isPending}>Switch on</Button>
                    )
                  ) : (
                    <Button size="lg" className="text-[12.5px] max-nar:h-12" href={`${D}/pos?table=${encodeURIComponent(t.name)}`}>Open in Register</Button>
                  )}
                  <IfCan page="tables"><Button size="lg" className="text-[12.5px] max-nar:h-12" onClick={() => setEditing(t)}>Edit</Button></IfCan>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {adding && <AddTablesDialog onClose={() => setAdding(false)} onDone={refresh} />}
      {editing && <EditTableDialog table={editing} onClose={() => setEditing(null)} onDone={refresh} />}
    </Page>
  );
}

function AddTablesDialog({ onClose, onDone }) {
  const [mode, setMode] = useState('one');
  const several = mode === 'range';
  const [name, setName] = useState('');
  const [from, setFrom] = useState('1');
  const [to, setTo] = useState('10');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(null); // { done, total }
  const busy = progress !== null;
  const form = useFormValidation(several ? tableRangeSchema : oneTableSchema, several ? { from, to } : { name });

  const submit = async (e) => {
    e?.preventDefault(); setError(''); form.setServerErrors({});
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
    <Modal
      title="Add tables"
      eyebrow="Tables"
      icon="tables"
      onClose={onClose}
      busy={busy}
      width={480}
      footer={(
        <>
          <ModalSpacer />
          <Button size="lg" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" size="lg" type="submit" form="add-tables-form" disabled={busy || !form.valid}>{busy ? 'Adding…' : 'Add'}</Button>
        </>
      )}
    >
      <form id="add-tables-form" onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <Segmented
          label="Add"
          size="lg"
          className="self-start"
          value={mode}
          onChange={(v) => { if (!busy) setMode(v); }}
          options={[{ value: 'one', label: 'One table' }, { value: 'range', label: 'A range' }]}
        />
        {several ? (
          <div className="grid gap-3 grid-cols-2">
            <Field label="From number" required {...form.fieldProps('from')}><input className={inputCls({ size: 'lg', mono: true })} type="number" inputMode="numeric" min="0" value={from} onChange={(e) => setFrom(e.target.value)} disabled={busy} /></Field>
            <Field label="To number" required {...form.fieldProps('to')}><input className={inputCls({ size: 'lg', mono: true })} type="number" inputMode="numeric" min="0" value={to} onChange={(e) => setTo(e.target.value)} disabled={busy} /></Field>
          </div>
        ) : (
          <Field label="Table name" required {...form.fieldProps('name')}><input className={inputCls({ size: 'lg' })} value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="e.g. 5 or Terrace 2" disabled={busy} /></Field>
        )}
        {several && <p className="m-0 text-xs text-mq-muted">Creates one table per number (up to {MAX_BATCH} at a time). Numbers that already exist are skipped.</p>}
        {progress && <p className="m-0 text-[13px] text-mq-on-tint" role="status">Adding <span className="font-mq-mono tabular-nums">{progress.done}</span> of <span className="font-mq-mono tabular-nums">{progress.total}</span>…</p>}
        {error && <Alert tone="danger">{error}</Alert>}
      </form>
    </Modal>
  );
}

function EditTableDialog({ table, onClose, onDone }) {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [name, setName] = useState(table.name);
  const [sortOrder, setSortOrder] = useState(String(table.sortOrder));
  const [hidden, setHidden] = useState(!table.isActive);
  const [error, setError] = useState('');
  const form = useFormValidation(editTableSchema, { name, sortOrder });
  const save = useMutation({
    mutationFn: (payload) => fetchJson(`/api/admin/tables/${table.id}`, jsonInit('PUT', payload)),
    onSuccess: () => { notify.success('Table saved'); onDone(); onClose(); },
    onError: (e) => reportSaveError(e, { form, setBanner: setError, title: 'Could not save the table' }),
  });
  const remove = useMutation({
    mutationFn: () => fetchJson(`/api/admin/tables/${table.id}`, { method: 'DELETE' }),
    onSuccess: () => { notify.success(`${nameOf(table.name)} deleted`); qc.invalidateQueries({ queryKey: ['tables'] }); onDone(); onClose(); },
    onError: (e) => notify.error(e, { title: `Could not delete ${nameOf(table.name)}` }),
  });
  const askDelete = async () => {
    const ok = await confirm({ title: `Delete ${nameOf(table.name)}?`, body: 'Only a table that never had an order can be deleted; otherwise hide it.', confirmLabel: 'Delete table' });
    if (ok) remove.mutate();
  };
  const submit = (e) => {
    e?.preventDefault(); setError(''); form.setServerErrors({});
    if (!form.check()) return;
    save.mutate({ name: name.trim(), sortOrder: Number(sortOrder), isActive: !hidden });
  };
  const busy = save.isPending || remove.isPending;

  return (
    <Modal
      title={nameOf(table.name)}
      eyebrow="Edit table"
      icon="pen"
      onClose={onClose}
      busy={busy}
      width={480}
      footer={(
        <>
          <IfCan page="tables"><Button variant="danger-soft" size="lg" icon="trash" onClick={askDelete} disabled={busy}>Delete</Button></IfCan>
          <ModalSpacer />
          <Button size="lg" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" size="lg" type="submit" form="edit-table-form" disabled={busy || !form.valid}>{save.isPending ? 'Saving…' : 'Save changes'}</Button>
        </>
      )}
    >
      <form id="edit-table-form" onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <div className="grid gap-3 grid-cols-[minmax(0,1fr)_120px]">
          <Field label="Name" required {...form.fieldProps('name')}><input className={inputCls({ size: 'lg' })} value={name} maxLength={20} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Position" required {...form.fieldProps('sortOrder')}><input className={inputCls({ size: 'lg', mono: true })} type="number" inputMode="numeric" min="0" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} /></Field>
        </div>
        <div className="border-y border-mq-chip">
          <ToggleRow title="Hidden from the Register" desc="Hidden tables keep their history." checked={hidden} onChange={setHidden} />
        </div>
        <p className={cx('m-0 text-xs text-mq-muted')}>Tables are listed by position, lowest first. Renaming doesn’t change past orders.</p>
        {error && <Alert tone="danger">{error}</Alert>}
      </form>
      {dialog}
    </Modal>
  );
}
