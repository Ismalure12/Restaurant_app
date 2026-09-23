'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchJson, parseApiError } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import { handleSaveError } from '@/components/admin/suppliers/saveError';
import { RowsSkeleton } from '@/components/admin/Skeletons';
import Modal from '@/components/admin/Modal';
import useConfirm from '@/hooks/useConfirm';
import { money } from '@/lib/money';

const JSON_H = { 'Content-Type': 'application/json' };

// Quantities are compared to 3 decimals, like the server (lib/stockCount.ts qty3).
const qty3 = (n) => Math.round(n * 1000) / 1000;
const qty = (n) => String(qty3(Number(n)));
const signedQty = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + qty(Math.abs(n));
const dateOf = (d) => new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
const round2 = (n) => Math.round(n * 100) / 100;
const CheckIc = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="2" /><path d="m9 14 2 2 4-4" /></svg>;

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
      <div className="toolbar">
        <div className="note stm-note">A stock count means counting what is really on the shelf. The differences fix the stock figures and give the month its closing stock value.</div>
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={() => (draft ? setOpenId(draft.id) : start.mutate())} disabled={start.isPending}>
          {draft ? 'Continue count' : start.isPending ? 'Starting…' : 'Start count'}
        </button>
      </div>
      <div className="card reveal" style={{ overflow: 'hidden' }}>
        <div className="card-h"><div><div className="ttl">Stock counts</div><div className="note">{rows.length} on record</div></div></div>
        {list.isLoading ? <RowsSkeleton rows={3} className="card-pad" /> : list.isError ? (
          <div className="card-pad"><div className="adm-error-banner">{parseApiError(list.error)}</div></div>
        ) : rows.length === 0 ? (
          <div className="empty"><div className="empty-ring">{CheckIc}</div><p className="empty-title">No counts yet</p><p className="empty-sub">Start a count at the end of the month, after the shelves are counted.</p></div>
        ) : (
          <div className="table-wrap"><table className="table" style={{ marginTop: 12 }}>
            <thead><tr><th>Count date</th><th>Status</th><th className="num">Items</th><th className="num">Stock value</th><th /></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td className="strong">{dateOf(r.countedOn)}</td>
                <td>{r.status === 'draft' ? <span className="pill pill-amber"><span className="pdot" />In progress</span> : <span className="pill pill-green"><span className="pdot" />Posted</span>}</td>
                <td className="num">{r.items}</td>
                <td className="num">{r.status === 'draft' ? '—' : money(r.totalValue)}</td>
                <td className="act"><button className="btn btn-ghost btn-sm" onClick={() => setOpenId(r.id)}>{r.status === 'draft' ? 'Continue' : 'View'}</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
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
      <div className="toolbar"><button className="btn btn-ghost" onClick={back}>← All counts</button></div>
      {isLoading ? <div className="card card-pad"><RowsSkeleton rows={6} /></div>
        : isError ? <div className="adm-error-banner">{parseApiError(error)}</div>
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
  return (
    <div className={`g2-cnt-row tone-${tone}${l.touched ? ' r6f-touched' : ''}`}>
      <div className="g2-cnt-name">
        <span className="g2-cnt-n">{l.name}</span>
        <span className="g2-cnt-sys">Current stock: {qty(l.systemQty)} {l.unit}</span>
      </div>
      <div className="g2-cnt-ctl">
        <button type="button" className="g2-step" onClick={() => bump(-1)} disabled={cur != null && cur <= 0} aria-label={`One less ${l.name}`}>−</button>
        <input className={`input g2-cnt-in${l.bad || l.blank ? ' bad' : ''}`} type="number" inputMode="decimal" min="0" step={step} aria-label={`Counted ${l.name}`}
          value={l.shown} onChange={(e) => type(e.target.value)} onFocus={(e) => e.target.select()} />
        <button type="button" className="g2-step" onClick={() => bump(1)} aria-label={`One more ${l.name}`}>+</button>
        <span className="g2-cnt-diff" aria-live="polite">
          {diffText(l)}
          {l.touched && <button type="button" className="r6f-undo" onClick={onReset} aria-label={`Undo the change to ${l.name}`}>Undo</button>}
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
      <div className="card card-pad-lg stm-head reveal">
        <div>
          <div className="eyebrow">{draft ? 'Count in progress' : 'Posted count'}</div>
          <div className="h-2">{dateOf(detail.countedOn)}</div>
          {draft && <div className="note">{checked} checked · {changed} changed{badCount ? ` · ${badCount} need a number` : ''} <span className="muted">of {total} items</span></div>}
          {!draft && <div className="note">Read only. The differences were posted as stock adjustments.</div>}
          {draft && <div className="stm-bar" aria-hidden="true"><i style={{ width: `${total ? (checked / total) * 100 : 0}%` }} /></div>}
        </div>
        <div className="stm-tot"><div className="stm-k">{draft ? 'Stock value so far' : 'Closing stock value'}</div><div className="stm-big">{money(draft ? runningValue : detail.totalValue)}</div></div>
      </div>

      <div className="toolbar">
        <div className="search g2-cnt-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items…" aria-label="Search items" />
        </div>
      </div>

      {draft ? (
        <>
          <div className="note g2-cnt-help">Each item shows the current stock. Change (− / + or type) only where the shelf is different; untouched items keep the current stock when you post.</div>
          <div className="card reveal g2-cnt-card">
            {stocked.length === 0 && zeros.length === 0 && <div className="empty"><p className="empty-title">No items match</p></div>}
            {stocked.map(row)}
          </div>
          {zeroTotal > 0 && (!needle || zeros.length > 0) && (
            <div className="card reveal g2-cnt-card g2-cnt-zero">
              <button type="button" className="g2-cnt-zero-h" aria-expanded={zeroOpen} disabled={zeroForced} onClick={() => setShowZero((v) => !v)}>
                <span>Zero-stock items ({needle ? `${zeros.length} of ${zeroTotal}` : zeroTotal})</span>
                <span className="muted">{zeroChanged ? `${zeroChanged} changed` : 'untouched = 0'} {zeroForced ? '' : zeroOpen ? '▴' : '▾'}</span>
              </button>
              {zeroOpen && zeros.map(row)}
            </div>
          )}
        </>
      ) : (
        <div className="card reveal" style={{ overflow: 'hidden' }}>
          <div className="table-wrap"><table className="table stm-count">
            <thead><tr><th>Item</th><th className="num">System</th><th className="num">Counted</th><th className="num">Difference</th><th className="num">Unit cost</th><th className="num">Value</th></tr></thead>
            <tbody>{parsed.filter(matches).sort(byName).map((l) => (
              <tr key={l.itemId}>
                <td className="strong">{l.name} <span className="muted">· {l.unit}</span></td>
                <td className="num">{qty(l.systemQty)}</td>
                <td className="num">{l.countedQty == null ? '—' : qty(l.countedQty)}</td>
                <td className="num" style={l.diff ? { color: l.diff < 0 ? 'var(--rose)' : 'var(--primary-ink)', fontWeight: 600 } : undefined}>{l.diff == null ? '—' : l.diff === 0 ? '0' : signedQty(l.diff)}</td>
                <td className="num muted">{l.unitCost != null ? money(l.unitCost) : '—'}</td>
                <td className="num">{l.val != null ? money(l.val) : '—'}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      )}

      {error && !confirming && <div className="adm-error-banner" style={{ marginTop: 14 }}>{error}</div>}

      {draft && (
        <div className="stm-foot r6f-cnt-foot">
          <button className="btn btn-danger" onClick={askDiscard} disabled={busy}>Discard draft</button>
          <div className="r6f-grow" />
          <span className="note">{dirty ? 'Unsaved changes' : 'Saved'}</span>
          <button className="btn btn-ghost" onClick={() => { setError(''); save.mutate(); }} disabled={busy || !!badCount || !dirty}>{save.isPending ? 'Saving…' : 'Save draft'}</button>
          <button className="btn btn-primary" onClick={askPost} disabled={busy || !!badCount}>Post count</button>
        </div>
      )}

      {confirming && (
        <Modal eyebrow="Post count" title="Post this stock count?" onClose={() => setConfirming(false)} busy={post.isPending}>
          <div className="modal-b">
            <p className="stm-p">Posting will:</p>
            <ul className="stm-list">
              <li>{changed} line{changed === 1 ? '' : 's'} you changed become{changed === 1 ? 's a' : ''} stock adjustment{changed === 1 ? '' : 's'}; untouched lines keep the current stock.</li>
              <li>Fix the closing stock value at about <b>{money(runningValue)}</b> for the month statements (worked out again from the stock at the moment of posting).</li>
              <li>This cannot be edited afterwards.</li>
            </ul>
            {error && <div className="adm-error-banner">{error}</div>}
          </div>
          <div className="modal-f">
            <button className="btn btn-ghost" onClick={() => setConfirming(false)} disabled={post.isPending}>Cancel</button>
            <button className="btn btn-primary" onClick={() => { setError(''); post.mutate(); }} disabled={post.isPending}>{post.isPending ? 'Posting…' : 'Post count'}</button>
          </div>
        </Modal>
      )}

      {result && (
        <Modal eyebrow="Count posted" title="Stock count posted" onClose={onBack}>
          <div className="modal-b">
            <p className="stm-p">{postedAdj} adjustment{postedAdj === 1 ? '' : 's'} recorded across {postedItems} items. Closing stock value: <b>{money(result.totalValue ?? runningValue)}</b>.</p>
            <p className="stm-p">The month statements now use this value. <Link className="cash-link" href="/admin/dashboard/reports/statements">Open Statements →</Link></p>
          </div>
          <div className="modal-f"><button className="btn btn-primary" onClick={onBack}>Done</button></div>
        </Modal>
      )}
    </>
  );
}
