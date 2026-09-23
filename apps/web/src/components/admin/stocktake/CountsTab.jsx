'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import { handleSaveError } from '@/components/admin/suppliers/saveError';
import useConfirm from '@/hooks/useConfirm';
import { money } from '@/lib/money';
import {
  Toolbar, Card, CardHeader, Button, Chip, Table, Th, Td, Tr, Modal, ModalSpacer, Alert, EmptyState, ErrorState,
  RowSkeletons, SearchInput, ProgressBar, Overline, Icon, inputCls, cx,
} from '@/components/admin/ui';

const JSON_H = { 'Content-Type': 'application/json' };

// Quantities are compared to 3 decimals, like the server (lib/stockCount.ts qty3).
const qty3 = (n) => Math.round(n * 1000) / 1000;
const qty = (n) => String(qty3(Number(n)));
const signedQty = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + qty(Math.abs(n));
const dateOf = (d) => new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
const round2 = (n) => Math.round(n * 100) / 100;

// The queries a posted count changes: stock on hand, the movement ledgers, statements.
const AFTER_POST = ['inventory', 'stock-counts', 'stock-count', 'statement', 'statement-months', 'inv-movements'];

/** Inventory > Counts (manager): the stocktake list and the count sheet. */
export default function CountsTab() {
  const qc = useQueryClient();
  const [openId, setOpenId] = useState(null);
  const list = useQuery({ queryKey: ['stock-counts'], queryFn: () => fetchJson('/api/admin/stock-counts') });
  const start = useMutation({
    mutationFn: () => fetchJson('/api/admin/stock-counts', { method: 'POST', headers: JSON_H, body: JSON.stringify({}) }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['stock-counts'] }); if (!r.created) notify.info('A count is already in progress. Opening it.'); setOpenId(r.id); },
    onError: (e) => notify.error(e, { title: 'Could not start the count' }),
  });

  if (openId) return <CountSheet id={openId} onBack={() => setOpenId(null)} />;

  const rows = list.data || [];
  const draft = rows.find((r) => r.status === 'draft');
  return (
    <>
      <Toolbar>
        <p className="m-0 flex-[1_1_320px] text-[12.5px] text-mq-muted leading-normal">A stock count means counting what is really on the shelf. The differences fix the stock figures and give the month its closing stock value.</p>
        <Button variant="primary" icon={draft ? undefined : 'plus'} onClick={() => (draft ? setOpenId(draft.id) : start.mutate())} disabled={start.isPending}>
          {draft ? 'Continue count' : start.isPending ? 'Starting…' : 'Start count'}
        </Button>
      </Toolbar>
      <Card className="overflow-hidden">
        <CardHeader title="Stock counts" count={list.isLoading ? null : rows.length} />
        {list.isLoading ? <RowSkeletons rows={3} /> : list.isError ? (
          <div className="p-4"><ErrorState error={list.error} onRetry={list.refetch} /></div>
        ) : rows.length === 0 ? (
          <EmptyState icon="orders" title="No counts yet">Start a count at the end of the month, after the shelves are counted.</EmptyState>
        ) : (
          <Table label="Stock counts" minW={520}>
            <thead><tr><Th>Count date</Th><Th>Status</Th><Th align="right">Items</Th><Th align="right">Stock value</Th><Th><span className="sr-only">Open</span></Th></tr></thead>
            <tbody>{rows.map((r) => (
              <Tr key={r.id} onClick={() => setOpenId(r.id)} tone={r.status === 'draft' ? 'warn' : undefined}>
                <Td strong className="whitespace-nowrap">{dateOf(r.countedOn)}</Td>
                <Td>{r.status === 'draft' ? <Chip small tone="warn">In progress</Chip> : <Chip small tone="ok">Posted</Chip>}</Td>
                <Td align="right" className="font-mq-mono tabular-nums">{r.items}</Td>
                <Td money>{r.status === 'draft' ? '—' : money(r.totalValue)}</Td>
                <Td align="right"><span className="text-[12.5px] font-semibold text-mq-cta">{r.status === 'draft' ? 'Continue' : 'View'}</span></Td>
              </Tr>
            ))}</tbody>
          </Table>
        )}
      </Card>
    </>
  );
}

function CountSheet({ id, onBack }) {
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['stock-count', id], queryFn: () => fetchJson(`/api/admin/stock-counts/${id}`) });
  const { confirm, dialog } = useConfirm();
  // Unsaved changes on the sheet: guard the Back button and the tab closing.
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const back = async () => {
    if (dirty && !(await confirm({ title: 'Leave without saving?', body: 'The changes you made on this sheet since the last save will be lost.', confirmLabel: 'Leave', cancelLabel: 'Stay' }))) return;
    onBack();
  };
  return (
    <>
      {dialog}
      <Toolbar><Button variant="ghost" icon="back" onClick={back}>All counts</Button></Toolbar>
      {isLoading ? <Card><RowSkeletons rows={6} /></Card>
        : isError ? <ErrorState error={error} />
          : <Sheet key={data.id} detail={data} dirty={dirty} setDirty={setDirty} onBack={onBack} />}
    </>
  );
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
const byName = (a, b) => collator.compare(a.name, b.name);
const BIG_UNIT = /^(kgs?|kilos?|kilograms?|l|lt|ltr|litres?|liters?)$/i;
const SMALL_UNIT = /^(g|gr|grams?|grammes?|ml|millilitres?|milliliters?)$/i;
// Whole units step by 1, kg/litres by 0.5, grams/ml by 50, anything already fractional by 0.1.
function stepFor(l) {
  const unit = String(l.unit || '').trim();
  if (BIG_UNIT.test(unit)) return 0.5;
  if (SMALL_UNIT.test(unit)) return 50;
  return Number.isInteger(l.systemQty) ? 1 : 0.1;
}
// What a person types or steps to is never below zero (system stock can be).
const clean = (n) => String(Math.max(0, qty3(n)));

/** The edits a saved draft already holds: every line with a counted quantity. */
const savedEdits = (detail) => Object.fromEntries(detail.lines.filter((l) => l.countedQty != null).map((l) => [l.itemId, String(l.countedQty)]));

function diffText(l) {
  if (l.bad) return 'Must be zero or more';
  if (l.blank) return 'Enter a number';
  if (!l.touched) return 'matches (not changed)';
  if (l.diff === 0) return 'matches';
  return l.diff > 0 ? `+${qty(l.diff)} more` : `−${qty(Math.abs(l.diff))} fewer`;
}

/** One item to count: name + current stock on top, − / number / + below (stacks on a phone). */
function CountRow({ l, onChange, onReset }) {
  const step = stepFor(l);
  const n = Number(l.shown);
  const cur = l.shown.trim() !== '' && Number.isFinite(n) ? n : null;
  const bump = (dir) => onChange(clean((cur ?? l.systemQty) + dir * step));
  const tone = l.bad || l.blank ? 'bad' : !l.touched ? 'same' : l.diff > 0 ? 'up' : l.diff < 0 ? 'down' : 'same';
  // Only what the person types is clamped; a negative system figure shows as it is.
  const type = (v) => onChange(v.trim() !== '' && Number(v) < 0 ? '0' : v);
  const stepBtn = 'grid place-items-center w-11 h-11 flex-none rounded-lg border border-mq-line bg-white text-mq-body text-lg font-semibold hover:bg-mq-canvas disabled:opacity-40 disabled:cursor-not-allowed';
  return (
    <div className={cx(
      'flex flex-col tab:flex-row tab:items-center gap-2.5 tab:gap-4 px-4 py-3 border-b border-mq-chip last:border-b-0',
      tone === 'bad' && 'bg-mq-danger-bg', tone === 'up' && 'shadow-[inset_3px_0_0_#0E7C5A]', tone === 'down' && 'shadow-[inset_3px_0_0_#B06A00]',
    )}>
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <span className="text-sm font-semibold text-mq-ink break-words">{l.name}</span>
        <span className="text-xs text-mq-muted">Current stock: <span className="font-mq-mono tabular-nums">{qty(l.systemQty)}</span> {l.unit}</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" className={stepBtn} onClick={() => bump(-1)} disabled={cur != null && cur <= 0} aria-label={`One less ${l.name}`}>−</button>
        <input
          className={inputCls({ mono: true, className: cx('!w-[104px] !h-11 text-center', (l.bad || l.blank) && '!border-mq-danger') })}
          type="number" inputMode="decimal" min="0" step={step} aria-label={`Counted ${l.name}`} aria-invalid={l.bad || l.blank || undefined}
          value={l.shown} onChange={(e) => type(e.target.value)} onFocus={(e) => e.target.select()}
        />
        <button type="button" className={stepBtn} onClick={() => bump(1)} aria-label={`One more ${l.name}`}>+</button>
        <span
          className={cx('text-[12.5px] min-w-[120px] flex items-center gap-2',
            tone === 'bad' ? 'text-mq-danger-ink font-semibold' : tone === 'up' ? 'text-mq-ok-ink font-semibold' : tone === 'down' ? 'text-mq-warn-ink font-semibold' : 'text-mq-muted')}
          aria-live="polite"
        >
          {diffText(l)}
          {l.touched && <button type="button" className="text-[12.5px] font-semibold text-mq-cta hover:text-mq-primary min-h-9 px-1" onClick={onReset} aria-label={`Undo the change to ${l.name}`}>Undo</button>}
        </span>
      </div>
    </div>
  );
}

// Every line shows the current stock; only the lines the person changes are
// sent. An untouched line stays null and the server posts it as "matches the
// stock at the moment of posting".
function Sheet({ detail, dirty, setDirty, onBack }) {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const draft = detail.status === 'draft';
  // itemId → typed text, only for lines the person changed (or saved earlier).
  const [edits, setEdits] = useState(() => savedEdits(detail));
  // Re-seed from fresh server data (after a save, or a background refetch) — but
  // never over unsaved typing.
  const [seed, setSeed] = useState(detail);
  if (seed !== detail && !dirty) {
    setSeed(detail);
    setEdits(savedEdits(detail));
  }
  const [search, setSearch] = useState('');
  const [showZero, setShowZero] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const parsed = useMemo(() => detail.lines.map((l) => {
    if (!draft) {
      return { ...l, touched: l.countedQty != null, blank: false, bad: false, cq: l.countedQty, diff: l.difference ?? null, val: l.value, shown: '' };
    }
    const touched = Object.hasOwn(edits, l.itemId);
    const raw = touched ? edits[l.itemId] : '';
    const blank = touched && raw.trim() === '';
    const n = touched && !blank ? Number(raw) : null;
    const bad = touched && !blank && !(Number.isFinite(n) && n >= 0);
    const cq = touched ? (blank || bad ? null : n) : null;
    const eff = touched ? cq : l.systemQty;
    const cost = l.unitCost;
    return {
      ...l, touched, blank, bad, cq,
      shown: touched ? raw : qty(l.systemQty),
      diff: touched ? (cq == null ? null : qty3(cq - l.systemQty)) : 0,
      val: eff == null ? null : cost != null ? round2(eff * cost) : l.value,
    };
  }), [detail.lines, edits, draft]);

  const total = parsed.length;
  const checked = parsed.filter((l) => l.touched).length;
  const changed = parsed.filter((l) => l.touched && l.diff != null && l.diff !== 0).length;
  const badCount = parsed.filter((l) => l.blank || l.bad).length;
  const runningValue = round2(parsed.reduce((s, l) => s + (l.val || 0), 0));

  const needle = search.trim().toLowerCase();
  const matches = (l) => !needle || l.name.toLowerCase().includes(needle);
  const stocked = parsed.filter((l) => l.systemQty !== 0 && matches(l)).sort(byName);
  const zeros = parsed.filter((l) => l.systemQty === 0 && matches(l)).sort(byName);
  const zeroTotal = parsed.filter((l) => l.systemQty === 0).length;
  // A search that finds zero-stock items shows them even when the group is collapsed.
  const zeroForced = Boolean(needle) && zeros.length > 0;
  const zeroOpen = showZero || zeroForced;
  const zeroChanged = parsed.filter((l) => l.systemQty === 0 && l.touched && l.diff).length;

  const setVal = (id, v) => { setEdits((cur) => ({ ...cur, [id]: v })); setDirty(true); };
  const resetVal = (id) => { setEdits((cur) => { const next = { ...cur }; delete next[id]; return next; }); setDirty(true); };

  // Only lines the person changed, plus lines saved earlier that were undone (back to null).
  const linesBody = () => {
    const lines = parsed.filter((l) => l.touched).map((l) => ({ itemId: l.itemId, countedQty: l.cq }));
    for (const l of detail.lines) if (l.countedQty != null && !Object.hasOwn(edits, l.itemId)) lines.push({ itemId: l.itemId, countedQty: null });
    return lines;
  };
  // Returns the saved sheet (or null when there was nothing to send).
  const saveReq = async () => {
    const lines = linesBody();
    if (lines.length === 0) return null;
    return fetchJson(`/api/admin/stock-counts/${detail.id}`, { method: 'PUT', headers: JSON_H, body: JSON.stringify({ lines }) });
  };

  const fail = (title) => (e) => handleSaveError(e, { title, setBanner: setError });
  const save = useMutation({
    mutationFn: saveReq,
    onSuccess: (saved) => {
      setDirty(false);
      notify.success(saved ? 'Draft saved' : 'Nothing to save — no line was changed');
      // Reopening the sheet must show what was saved: put the saved sheet in its own cache.
      if (saved) qc.setQueryData(['stock-count', detail.id], saved);
      qc.invalidateQueries({ queryKey: ['stock-counts'] });
    },
    onError: fail('Could not save the draft'),
  });
  // Post saves what is on screen first, so the sheet and the posted count can't differ.
  // Once the post has gone through it is a success, whatever the refresh afterwards does.
  const post = useMutation({
    mutationFn: async () => { await saveReq(); return fetchJson(`/api/admin/stock-counts/${detail.id}/post`, { method: 'POST' }); },
    onSuccess: (r) => {
      setResult(r || {}); setDirty(false); setConfirming(false);
      AFTER_POST.forEach((k) => { qc.invalidateQueries({ queryKey: [k] }); });
    },
    onError: fail('Could not post the count'),
  });
  const discard = useMutation({
    mutationFn: () => fetchJson(`/api/admin/stock-counts/${detail.id}`, { method: 'DELETE' }),
    onSuccess: () => { setDirty(false); notify.success('Draft discarded'); qc.invalidateQueries({ queryKey: ['stock-counts'] }); qc.removeQueries({ queryKey: ['stock-count', detail.id] }); onBack(); },
    onError: (e) => notify.error(e, { title: 'Could not discard the draft' }),
  });

  const askPost = () => {
    setError('');
    if (badCount) { setError(`${badCount} item${badCount === 1 ? ' needs' : 's need'} a number (zero or more), or Undo. They are marked in red.`); setShowZero(true); return; }
    setConfirming(true);
  };
  const askDiscard = async () => {
    if (await confirm({ title: 'Discard this count?', body: 'Everything typed on this sheet is thrown away. Stock levels are not changed.', confirmLabel: 'Discard draft' })) discard.mutate();
  };

  const busy = save.isPending || post.isPending || discard.isPending;
  // `items` is the number of lines posted; `count` is the full detail, never rendered.
  const postedItems = Number.isFinite(Number(result?.items)) ? Number(result.items) : total;
  const postedAdj = Number.isFinite(Number(result?.adjustments)) ? Number(result.adjustments) : changed;
  const row = (l) => <CountRow key={l.itemId} l={l} onChange={(v) => setVal(l.itemId, v)} onReset={() => resetVal(l.itemId)} />;

  return (
    <>
      {dialog}
      <Card pad className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1 flex-[1_1_260px] min-w-0">
          <Overline>{draft ? 'Count in progress' : 'Posted count'}</Overline>
          <div className="text-xl font-semibold tracking-[-.02em] text-mq-ink">{dateOf(detail.countedOn)}</div>
          {draft && (
            <div className="text-[12.5px] text-mq-muted">
              <span className="font-mq-mono tabular-nums text-mq-ink">{checked}</span> checked · <span className="font-mq-mono tabular-nums text-mq-ink">{changed}</span> changed
              {badCount ? <span className="text-mq-danger-ink"> · {badCount} need a number</span> : null} · of <span className="font-mq-mono tabular-nums">{total}</span> items
            </div>
          )}
          {!draft && <div className="text-[12.5px] text-mq-muted">Read only. The differences were posted as stock adjustments.</div>}
          {draft && <ProgressBar pct={total ? (checked / total) * 100 : 0} className="mt-1.5 max-w-[360px]" />}
        </div>
        <div className="flex flex-col gap-1 text-right">
          <span className="text-[12.5px] text-mq-muted">{draft ? 'Stock value so far' : 'Closing stock value'}</span>
          <span className="font-mq-mono font-medium tracking-[-.03em] tabular-nums text-mq-ink" style={{ fontSize: 'clamp(20px,2vw,25px)' }}>{money(draft ? runningValue : detail.totalValue)}</span>
        </div>
      </Card>

      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search items…" aria-label="Search items" className="flex-[1_1_240px] max-w-[420px]" />
      </Toolbar>

      {draft ? (
        <>
          <p className="m-0 text-[12.5px] text-mq-muted">Each item shows the current stock. Change (− / + or type) only where the shelf is different; untouched items keep the current stock when you post.</p>
          <Card className="overflow-hidden">
            {stocked.length === 0 && zeros.length === 0 && <EmptyState icon="search" title="No items match" />}
            {stocked.map(row)}
          </Card>
          {zeroTotal > 0 && (!needle || zeros.length > 0) && (
            <Card className="overflow-hidden">
              <button
                type="button"
                className="w-full flex items-center justify-between gap-3 min-h-12 px-4 py-3 bg-mq-cream text-left text-sm font-semibold text-mq-ink disabled:cursor-default"
                aria-expanded={zeroOpen} disabled={zeroForced} onClick={() => setShowZero((v) => !v)}
              >
                <span>Zero-stock items ({needle ? `${zeros.length} of ${zeroTotal}` : zeroTotal})</span>
                <span className="flex items-center gap-2 text-[12.5px] font-medium text-mq-muted">
                  {zeroChanged ? `${zeroChanged} changed` : 'untouched = 0'}
                  {!zeroForced && <span className={cx('transition-transform', zeroOpen && 'rotate-180')}><Icon name="chevDown" size={15} /></span>}
                </span>
              </button>
              {zeroOpen && <div className="border-t border-mq-line">{zeros.map(row)}</div>}
            </Card>
          )}
        </>
      ) : (
        <Card className="overflow-hidden">
          <Table label="Counted items" minW={640}>
            <thead><tr><Th>Item</Th><Th align="right">System</Th><Th align="right">Counted</Th><Th align="right">Difference</Th><Th align="right">Unit cost</Th><Th align="right">Value</Th></tr></thead>
            <tbody>{parsed.filter(matches).sort(byName).map((l) => (
              <Tr key={l.itemId}>
                <Td strong>{l.name} <span className="font-normal text-mq-muted">· {l.unit}</span></Td>
                <Td align="right" className="font-mq-mono tabular-nums">{qty(l.systemQty)}</Td>
                <Td align="right" className="font-mq-mono tabular-nums">{l.countedQty == null ? '—' : qty(l.countedQty)}</Td>
                <Td align="right" className={cx('font-mq-mono tabular-nums', l.diff ? (l.diff < 0 ? 'text-mq-danger-ink font-semibold' : 'text-mq-ok-ink font-semibold') : '')}>{l.diff == null ? '—' : l.diff === 0 ? '0' : signedQty(l.diff)}</Td>
                <Td align="right" className="font-mq-mono tabular-nums text-mq-muted">{l.unitCost != null ? money(l.unitCost) : '—'}</Td>
                <Td money>{l.val != null ? money(l.val) : '—'}</Td>
              </Tr>
            ))}</tbody>
          </Table>
        </Card>
      )}

      {error && !confirming && <Alert tone="danger">{error}</Alert>}

      {draft && (
        <div className="sticky bottom-0 z-[2] flex items-center gap-2.5 flex-wrap bg-white border border-mq-line rounded-xl shadow-mq-md px-4 py-3">
          <Button variant="danger-soft" size="lg" onClick={askDiscard} disabled={busy}>Discard draft</Button>
          <span className="flex-1" />
          <span className={cx('text-[12.5px]', dirty ? 'text-mq-warn-ink font-semibold' : 'text-mq-muted')}>{dirty ? 'Unsaved changes' : 'Saved'}</span>
          <Button size="lg" onClick={() => { setError(''); save.mutate(); }} disabled={busy || !!badCount || !dirty}>{save.isPending ? 'Saving…' : 'Save draft'}</Button>
          <Button variant="primary" size="lg" onClick={askPost} disabled={busy || !!badCount}>Post count</Button>
        </div>
      )}

      {confirming && (
        <Modal
          eyebrow="Post count" title="Post this stock count?" icon="alert" tone="warn"
          onClose={() => setConfirming(false)} busy={post.isPending} width={500}
          footer={(
            <>
              <ModalSpacer />
              <Button size="lg" onClick={() => setConfirming(false)} disabled={post.isPending}>Cancel</Button>
              <Button variant="primary" size="lg" onClick={() => { setError(''); post.mutate(); }} disabled={post.isPending}>{post.isPending ? 'Posting…' : 'Post count'}</Button>
            </>
          )}
        >
          <p className="m-0 text-sm text-mq-body">Posting will:</p>
          <ul className="m-0 mt-2 pl-5 list-disc flex flex-col gap-1.5 text-sm text-mq-body leading-normal">
            <li>{changed} line{changed === 1 ? '' : 's'} you changed become{changed === 1 ? 's a' : ''} stock adjustment{changed === 1 ? '' : 's'}; untouched lines keep the current stock.</li>
            <li>Fix the closing stock value at about <b className="font-mq-mono">{money(runningValue)}</b> for the month statements (worked out again from the stock at the moment of posting).</li>
            <li>This cannot be edited afterwards.</li>
          </ul>
          {error && <Alert tone="danger" className="mt-3">{error}</Alert>}
        </Modal>
      )}

      {result && (
        <Modal
          eyebrow="Count posted" title="Stock count posted" icon="check" tone="ok" onClose={onBack} width={480}
          footer={<><ModalSpacer /><Button variant="primary" size="lg" onClick={onBack}>Done</Button></>}
        >
          <p className="m-0 text-sm text-mq-body leading-normal">
            <span className="font-mq-mono">{postedAdj}</span> adjustment{postedAdj === 1 ? '' : 's'} recorded across <span className="font-mq-mono">{postedItems}</span> items. Closing stock value: <b className="font-mq-mono">{money(result.totalValue ?? runningValue)}</b>.
          </p>
          <p className="m-0 mt-2 text-sm text-mq-body">
            The month statements now use this value. <Link className="font-semibold text-mq-cta hover:text-mq-primary" href="/admin/dashboard/reports/statements">Open Statements →</Link>
          </p>
        </Modal>
      )}
    </>
  );
}
