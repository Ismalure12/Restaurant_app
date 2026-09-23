'use client';

// Shared pieces of the Reports hub (Sales · Inventory · Financial · Employees).
// Every filter lives in the URL (?preset=&from=&to=&waiterId=…), so a report
// view can be bookmarked, shared and survives a reload; the API receives the
// same keys. Export = a same-origin CSV link (the session cookie rides along);
// Print = window.print() with the A4 rules in reports/layout.jsx.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { money } from '@/lib/money';

export { money };
export const num = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shift = (d, days) => { const x = new Date(d); x.setDate(x.getDate() + days); return x; };

export const PRESETS = [
  ['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', '7 days'], ['30d', '30 days'], ['month', 'This month'],
  ['week', 'This week'], ['lastMonth', 'Last month'], ['year', 'This year'], ['custom', 'Custom'],
];
// The segmented control shows the common ones; the rest sit behind "More".
const PRIMARY_PRESETS = ['today', 'yesterday', '7d', '30d', 'month'];
const presetName = (p) => PRESETS.find(([k]) => k === p)?.[1] ?? p;

const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const lastOfMonth = (y, m) => new Date(y, m + 1, 0).getDate();

/**
 * The period a range is compared with — the one a manager means, not just
 * "the N days before":
 *   today → yesterday · yesterday → the day before · this week → the same
 *   weekdays last week · this month → the same dates last month (1st → same
 *   day, clamped to that month's end) · last month → the month before · this
 *   year → the same dates last year · 7/30 days and custom → the previous
 *   equal-length period. Always ends before the range starts.
 */
export function comparisonRange(preset, range) {
  const from = parseDay(range.from);
  const to = parseDay(range.to);
  const days = Math.round((to - from) / 86_400_000) + 1;
  switch (preset) {
    case 'today':
    case 'yesterday':
      return { from: iso(shift(from, -1)), to: iso(shift(to, -1)) };
    case 'week':
      return { from: iso(shift(from, -7)), to: iso(shift(to, -7)) };
    case 'month': {
      const y = from.getFullYear();
      const m = from.getMonth() - 1;
      const py = m < 0 ? y - 1 : y;
      const pm = (m + 12) % 12;
      return { from: iso(new Date(py, pm, 1)), to: iso(new Date(py, pm, Math.min(to.getDate(), lastOfMonth(py, pm)))) };
    }
    case 'lastMonth':
      return { from: iso(new Date(from.getFullYear(), from.getMonth() - 1, 1)), to: iso(new Date(from.getFullYear(), from.getMonth(), 0)) };
    case 'year': {
      const py = from.getFullYear() - 1;
      return { from: iso(new Date(py, 0, 1)), to: iso(new Date(py, to.getMonth(), Math.min(to.getDate(), lastOfMonth(py, to.getMonth())))) };
    }
    default:
      return { from: iso(shift(from, -days)), to: iso(shift(from, -1)) };
  }
}

const COMPARE_LABELS = {
  today: 'vs yesterday', yesterday: 'vs the day before', '7d': 'vs previous 7 days', '30d': 'vs previous 30 days',
  week: 'vs same days last week', month: 'vs same days last month', lastMonth: 'vs the month before', year: 'vs same days last year',
};
export const compareLabel = (preset) => COMPARE_LABELS[preset] || 'vs previous period';

export function presetRange(preset) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case 'today': return { from: iso(now), to: iso(now) };
    case 'yesterday': return { from: iso(shift(now, -1)), to: iso(shift(now, -1)) };
    case 'week': return { from: iso(shift(now, -((now.getDay() + 6) % 7))), to: iso(now) }; // Monday → today
    case '7d': return { from: iso(shift(now, -6)), to: iso(now) };
    case '30d': return { from: iso(shift(now, -29)), to: iso(now) };
    case 'month': return { from: iso(new Date(y, m, 1)), to: iso(now) };
    case 'lastMonth': return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
    case 'year': return { from: iso(new Date(y, 0, 1)), to: iso(now) };
    default: return null;
  }
}

/**
 * The report's query state, read from and written to the URL.
 * `filterKeys` are the extra keys this report understands.
 */
export function useReportParams(defaultPreset, filterKeys = []) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const preset = sp.get('preset') || (sp.get('from') ? 'custom' : defaultPreset);
  const range = preset === 'custom'
    ? { from: sp.get('from') || presetRange(defaultPreset).from, to: sp.get('to') || presetRange(defaultPreset).to }
    : presetRange(preset) || presetRange(defaultPreset);
  const keysSig = filterKeys.join(',');
  const filters = useMemo(() => {
    const out = {};
    for (const k of keysSig.split(',').filter(Boolean)) { const v = sp.get(k); if (v) out[k] = v; }
    return out;
  }, [sp, keysSig]);

  const set = useCallback((patch) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') next.delete(k); else next.set(k, v);
    }
    if (patch.preset && patch.preset !== 'custom') { next.delete('from'); next.delete('to'); }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [sp, router, pathname]);

  // What the API gets: the resolved dates + the active filters.
  const query = useMemo(() => new URLSearchParams({ from: range.from, to: range.to, ...filters }).toString(), [range.from, range.to, filters]);
  return { preset, range, filters, set, query };
}

/** Close a popover on an outside click or Escape (focus goes back to its button). */
function useDismiss(open, setOpen, wrapRef, buttonRef) {
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); buttonRef?.current?.focus(); } };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, setOpen, wrapRef, buttonRef]);
}

const Chevron = <svg className="r6-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>;

/**
 * The period: a segmented control (Today · Yesterday · 7 days · 30 days · This
 * month · More ▾) from 768px up, a single <select> on phones (both rendered,
 * CSS picks one). Custom adds two date inputs.
 */
export function PeriodPicker({ preset, range, set }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const btn = useRef(null);
  const menu = useRef(null);
  useDismiss(open, setOpen, wrap, btn);
  useEffect(() => { if (open) menu.current?.querySelector('button')?.focus(); }, [open]);
  const choose = (p) => {
    setOpen(false);
    set(p === 'custom' ? { preset: 'custom', from: range.from, to: range.to } : { preset: p });
  };
  const inMore = !PRIMARY_PRESETS.includes(preset);
  return (
    <>
      <select className="input rpt-preset r6-period-sel" value={preset} onChange={(e) => choose(e.target.value)} aria-label="Period">
        {PRESETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <div className="r6-period" ref={wrap}>
        <div className="seg" role="group" aria-label="Period">
          {PRIMARY_PRESETS.map((p) => (
            <button key={p} type="button" className={preset === p ? 'active' : ''} aria-pressed={preset === p} onClick={() => choose(p)}>{presetName(p)}</button>
          ))}
          <button ref={btn} type="button" className={inMore ? 'active' : ''} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {inMore ? presetName(preset) : 'More'}{Chevron}
          </button>
        </div>
        {open && (
          <div className="rpt-menu-list r6-period-menu" role="menu" ref={menu}>
            {PRESETS.filter(([p]) => !PRIMARY_PRESETS.includes(p)).map(([p, l]) => (
              <button key={p} type="button" role="menuitemradio" aria-checked={preset === p} className={preset === p ? 'on' : ''} onClick={() => choose(p)}>{l}</button>
            ))}
          </div>
        )}
      </div>
      {preset === 'custom' && (
        <span className="rpt-dates">
          <input className="input" type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && set({ preset: 'custom', from: e.target.value, to: range.to })} aria-label="From date" />
          <span className="sub">to</span>
          <input className="input" type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && set({ preset: 'custom', from: range.from, to: e.target.value })} aria-label="To date" />
        </span>
      )}
    </>
  );
}

/** Kept for older imports — every report now uses the period control. */
export const RangePicker = PeriodPicker;

/**
 * "Filters (2)" — a disclosure that holds the filter selects, so phones get a
 * one-line toolbar. The panel wraps onto its own row inside the Toolbar.
 */
export function FiltersButton({ active = 0, onClear, children }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <button type="button" className={`btn btn-ghost r6-fbtn${active ? ' on' : ''}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M3 5h18M6 12h12M10 19h4" /></svg>
        Filters
        {active > 0 && <span className="r6-chip"><span className="sr-only">, </span>{active}<span className="sr-only"> active</span></span>}
      </button>
      <div id={id} className="r6-fpanel" role="group" aria-label="Filters" hidden={!open}>
        {children}
        {active > 0 && onClear && <button type="button" className="btn btn-ghost btn-sm r6-fclear" onClick={onClear}>Clear filters</button>}
      </div>
    </>
  );
}

export const CHANNEL_OPTIONS = [{ value: 'dine_in', label: 'Dine-in' }, { value: 'delivery', label: 'Delivery' }, { value: 'online', label: 'Online' }];

/** Dine-in / Delivery (rung up in the restaurant) · Online (placed through the online menu). URL key `channel`. */
export function ChannelSelect({ value, onChange }) {
  return <FilterSelect label="Channel" value={value} options={CHANNEL_OPTIONS} onChange={onChange} />;
}

/** The money accounts a sale can land in (Settings accounts included), plus any the data shows. */
const NONE = [];
export function useAccountOptions(seen) {
  const extra = seen || NONE;
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => fetchJson('/api/admin/settings'), staleTime: 5 * 60 * 1000 });
  return useMemo(() => {
    const list = [
      { value: 'cash', label: 'Cash' }, { value: 'card', label: 'Card' },
      ...(settings?.paymentAccounts || []).map((a) => ({ value: `acct:${a.label}`, label: a.label })),
      { value: 'evc', label: 'EVC (account not recorded)' }, { value: 'invoice', label: 'On account' },
    ];
    for (const a of extra) if (!list.some((x) => x.value === a.key)) list.push({ value: a.key, label: a.label });
    return list;
  }, [settings, extra]);
}

/** The URL params that reproduce this period on another page (preset, or the dates for custom). */
export function periodParams(preset, range) {
  return preset === 'custom' ? { preset, from: range.from, to: range.to } : { preset };
}

/**
 * "▲ 12% vs yesterday · $340" — coloured by whether the change is good (for
 * costs, up is bad). A zero before shows `zero` (e.g. "no sales before").
 */
export function Delta({ now, before, fmt = money, invert = false, vs = 'vs previous period', zero = 'nothing before' }) {
  if (before == null) return null;
  if (!before && !now) return <span className="delta flat">no change {vs}</span>;
  if (!before) return <span className="r6-delta-note">{zero}</span>;
  const diff = now - before;
  if (Math.abs(diff) < 0.005) return <span className="delta flat">no change {vs}</span>;
  const good = invert ? diff < 0 : diff > 0;
  // A % against a loss (or a flip from profit to loss) means nothing — show the amount instead.
  const change = before < 0 || now < 0 ? fmt(Math.abs(diff)) : `${Math.round((Math.abs(diff) / Math.abs(before)) * 100)}%`;
  return (
    <span className="r6-delta">
      <span className={`delta ${good ? 'up' : 'down'}`}><span aria-hidden="true">{diff > 0 ? '▲' : '▼'}</span><span className="sr-only">{diff > 0 ? 'up' : 'down'}</span> {change}</span>
      <span>{vs} ({fmt(before)})</span>
    </span>
  );
}

/** A labelled <select> filter bound to one URL key. */
export function FilterSelect({ label, value, options, onChange }) {
  return (
    <select className="input rpt-filter" value={value || ''} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="">{label}: all</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/** Export ▾ (CSV downloads) + Print / PDF. */
export function ExportBar({ exports = [], print = true }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const btn = useRef(null);
  useDismiss(open, setOpen, wrap, btn);
  if (!exports.length && !print) return null;
  return (
    <div className="rpt-export">
      {exports.length > 0 && (
        <div className="rpt-menu" ref={wrap}>
          <button ref={btn} type="button" className="btn btn-ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>Export CSV
          </button>
          {open && (
            <div className="rpt-menu-list" role="menu" onClick={() => setOpen(false)}>
              {exports.map((x) => <a key={x.href} role="menuitem" href={x.href} download>{x.label}</a>)}
            </div>
          )}
        </div>
      )}
      {print && (
        <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" /></svg>Print / PDF
        </button>
      )}
    </div>
  );
}

export function Toolbar({ children, exports, print = true }) {
  return (
    <div className="toolbar rpt-toolbar rpt-noprint">
      {children}
      <div className="grow" />
      <ExportBar exports={exports} print={print} />
    </div>
  );
}

/** Human labels for the raw filter values the API takes (never print the raw value). */
export const FILTER_LABELS = {
  channel: { dine_in: 'Dine-in', delivery: 'Delivery', online: 'Online' },
  movement: { purchase: 'Purchase', usage: 'Usage', waste: 'Waste', adjustment: 'Adjustment' },
  role: { cashier: 'Cashiers', waiter: 'Waiters', manager: 'Managers', admin: 'Admins' },
  status: { voided: 'Voided', completed: 'Completed' },
};
export const labelOf = (kind, v) => (v ? FILTER_LABELS[kind]?.[v] ?? null : null);

/**
 * Heading printed on paper instead of the (hidden) toolbar: title, the dates
 * (with the preset name when there is one) and ONLY the filters that are
 * applied, as human labels. `filters` is { 'Label': 'Human value' } — empty
 * values are skipped; nothing applied prints "No filters applied".
 */
export function PrintHead({ title, range, preset, filters }) {
  const bits = Object.entries(filters || {}).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}: ${v}`);
  const name = preset && preset !== 'custom' ? PRESETS.find(([k]) => k === preset)?.[1] : null;
  const dates = range.from === range.to ? range.from : `${range.from} → ${range.to}`;
  return (
    <div className="rpt-printhead">
      <div className="h-2">{title}</div>
      <div className="sub">{name ? `${name} · ` : ''}{dates}</div>
      <div className="sub">{bits.length ? `Filters — ${bits.join(' · ')}` : 'No filters applied'}</div>
    </div>
  );
}

/** A4 print rules shared by the reports layout and Sales history (which lives outside it). */
export function ReportPrintCss() {
  return (
    <style jsx global>{`
      @media print {
        @page { size: A4; margin: 12mm; }
        .jz .side, .jz .topbar, .jz .scrim, .rpt-noprint, .rpt-toolbar, .rpt-tabs { display: none !important; }
        .jz .app, .jz .main, .jz .page { display: block !important; margin: 0 !important; padding: 0 !important; height: auto !important; overflow: visible !important; }
        .jz .rpt-printhead { display: block !important; margin-bottom: 12px; }
        .jz .table-scroll { max-height: none !important; overflow: visible !important; }
        .jz .card, .jz .kpi { break-inside: avoid; box-shadow: none !important; }
        .jz .reveal { animation: none !important; opacity: 1 !important; transform: none !important; }
      }
    `}</style>
  );
}

export function Kpi({ label, value, foot, tone = 'ink' }) {
  return (
    <div className="kpi">
      <div className="kpi-top"><span className={`kpi-dot ${tone}`} /><span className="kpi-k">{label}</span></div>
      <div className="kpi-v is-text">{value}</div>
      {foot != null && <div className="kpi-foot"><span>{foot}</span></div>}
    </div>
  );
}

export function Card({ eyebrow, title, action, children, flush, id }) {
  return (
    <div id={id} className={`card${flush ? '' : ' card-pad'} rpt-card`}>
      <div className={flush ? 'card-h' : 'pad-h'}>
        <div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<div className={flush ? 'ttl' : 'h-2'}>{title}</div></div>
        {action}
      </div>
      {children}
    </div>
  );
}

/**
 * One series as thin columns (4px rounded tops on a shared baseline, 2px
 * gaps), recessive axis, hover/focus tooltip per column. The same numbers are
 * always available as a table next to it (the "table view"). By day unless
 * `keyOf`/`tick`/`name` say otherwise (e.g. HourBars).
 */
export function DayBars({
  rows, value = (r) => r.total, fmt = money, label = 'Sales',
  keyOf = (r) => r.day, tick = (r) => r.day.slice(5), name = (r) => r.day, unit = 'day',
}) {
  const [hover, setHover] = useState(null);
  if (!rows?.length) return <div className="sub">No data in range.</div>;
  const W = 720;
  const H = 180;
  const max = Math.max(...rows.map(value), 0) || 1;
  const step = W / rows.length;
  const bw = Math.max(2, Math.min(28, step - 2));
  const every = Math.ceil(rows.length / 8);
  const h = hover != null ? rows[hover] : null;
  return (
    <div className="daybars">
      <div className="daybars-tip" aria-live="polite">
        {h ? <><b>{fmt(value(h))}</b> {label.toLowerCase()} · {name(h)}{h.orders != null ? ` · ${h.orders} orders` : ''}</> : <span className="sub">Hover {/^[aeiou]|^hour/.test(unit) ? 'an' : 'a'} {unit} for its total</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H + 22}`} role="img" aria-label={`${label} by ${unit}`} preserveAspectRatio="none">
        <line x1="0" x2={W} y1={H} y2={H} className="daybars-axis" />
        {rows.map((r, i) => {
          const v = value(r);
          const bh = v > 0 ? Math.max(2, (v / max) * (H - 8)) : 0;
          const x = i * step + (step - bw) / 2;
          return (
            <g key={keyOf(r)} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}>
              <rect x={i * step} y="0" width={step} height={H} fill="transparent" />
              {bh > 0 && (bw >= 8 && bh > 4
                ? <path className={`daybars-bar${hover === i ? ' on' : ''}`} d={`M${x},${H} v${-(bh - 4)} q0,-4 4,-4 h${bw - 8} q4,0 4,4 v${bh - 4} z`} />
                : <rect className={`daybars-bar${hover === i ? ' on' : ''}`} x={x} y={H - bh} width={bw} height={bh} />)}
              {i % every === 0 && <text x={i * step + step / 2} y={H + 16} textAnchor="middle" className="daybars-lbl">{tick(r)}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const hh = (h) => `${String(h).padStart(2, '0')}:00`;

/** Sales by hour of day: every hour from the first to the last busy one (no gaps). */
export function HourBars({ rows }) {
  if (!rows?.length) return <div className="sub">No sales in this range.</div>;
  const byHour = new Map(rows.map((r) => [r.hour, r]));
  const first = Math.min(...rows.map((r) => r.hour));
  const last = Math.max(...rows.map((r) => r.hour));
  const filled = [];
  for (let h = first; h <= last; h++) filled.push(byHour.get(h) || { hour: h, orders: 0, total: 0 });
  return <DayBars rows={filled} keyOf={(r) => r.hour} tick={(r) => hh(r.hour)} name={(r) => `${hh(r.hour)}–${hh(r.hour + 1)}`} unit="hour" />;
}

export function Empty({ children = 'Nothing in this range.' }) {
  return <div className="td-empty" style={{ padding: 18 }}>{children}</div>;
}

export function ErrorNote({ error }) {
  return <div className="adm-error-banner" style={{ marginBottom: 16 }}>{error?.message || 'Couldn’t load this report.'}</div>;
}
