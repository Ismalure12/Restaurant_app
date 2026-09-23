'use client';

import { useEffect, useId, useState } from 'react';

/**
 * Small inline-SVG charts for the admin (no chart library), styled per
 * docs/admin-design-system.md §8: solid maroon = this period, dashed grey =
 * previous, dark tooltip, maroon ramp for ranked bars. Always paired with real
 * numbers nearby for accessibility.
 *
 *   <LineArea rows series xKey xTick fmt />     trend, several series, optional dashed comparison
 *   <Donut segments fmt centre />               share of a whole
 *   <HBars rows fmt onSelect? />                ranked bars (top dishes, accounts…)
 *   <Columns rows fmt compareLabel />           days/hours as columns + dashed comparison line
 *   <Sparkline values prev? />                  tiny trend for a KPI tile
 *   <StackBar segments fmt />                   one 100% bar (channel split)
 *   <Legend items />
 */
export const PALETTE = ['#850D33', '#1F6FB2', '#0E7C5A', '#B06A00', '#6B5CA5', '#C0576F', '#5f9ea0', '#9A9A93'];
export const RAMP = ['#850D33', '#A31743', '#C0576F', '#D68C9E', '#E5C3CC'];
const PREV = '#B8B8B0';

const nice = (max) => {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  const n = max / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};
const compact = (n) => (Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : String(Math.round(n)));
const EMPTY = 'text-[12.5px] text-mq-muted py-6 text-center';
const LBL = 'fill-mq-muted font-mq-mono text-[10.5px]';

function Swatch({ color, dashed }) {
  return dashed
    ? <i className="inline-block w-3.5 h-0 border-t-2 border-dashed flex-none" style={{ borderColor: color || PREV }} />
    : <i className="inline-block w-2.5 h-2.5 rounded-[3px] flex-none" style={{ background: color }} />;
}

export function Legend({ items }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-mq-muted">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5"><Swatch color={it.color} dashed={it.dashed} />{it.label}</span>
      ))}
    </div>
  );
}

/** Dark tooltip box. */
function Tip({ style, className = '', children }) {
  return (
    <div className={`pointer-events-none absolute z-10 min-w-[150px] rounded-lg bg-mq-ink text-mq-cream px-[11px] py-[9px] shadow-[0_10px_28px_-12px_rgba(26,26,24,.5)] text-xs ${className}`} style={style}>
      {children}
    </div>
  );
}
function TipHead({ children }) {
  return <div className="text-[10.5px] font-semibold uppercase tracking-[.1em] opacity-60 mb-1">{children}</div>;
}
function TipRow({ color, dashed, label, value }) {
  return (
    <div className="flex items-center gap-2 py-px">
      {dashed ? <i className="w-2.5 border-t-2 border-dashed" style={{ borderColor: PREV }} /> : <i className="w-[7px] h-[7px] rounded-full" style={{ background: color }} />}
      <span className="flex-1 opacity-80">{label}</span>
      <b className="font-mq-mono font-medium tabular-nums">{value}</b>
    </div>
  );
}

/** The element's rendered width in px (so SVG text is never stretched and labels can be spaced). */
function useWidth(initial = 640) {
  const [el, setEl] = useState(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => {
      const cw = Math.round(e.contentRect.width);
      if (cw > 0) setW(cw);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, w];
}

/**
 * series: [{ key, label, color?, area?, dashed? }] — values are read as row[key].
 * Hovering (or focusing) a column shows every series' value for that x.
 */
export function LineArea({ rows, series, xKey = 'day', xTick = (r) => String(r[xKey]).slice(5), xName = (r) => r[xKey], fmt = (n) => String(n), height = 200, empty = 'No data in this range.' }) {
  const [ref, W] = useWidth();
  const [hover, setHover] = useState(null);
  const gid = useId().replace(/:/g, '');
  if (!rows?.length) return <div className={EMPTY}>{empty}</div>;
  const H = height;
  const padL = 40;
  const padB = 22;
  const padT = 8;
  const cols = series.map((s, i) => ({ color: s.dashed ? PREV : PALETTE[i % PALETTE.length], ...s }));
  const max = nice(Math.max(...rows.flatMap((r) => cols.map((s) => Number(r[s.key]) || 0)), 0));
  const min = Math.min(0, ...rows.flatMap((r) => cols.map((s) => Number(r[s.key]) || 0)));
  const span = (max - min) || 1;
  const x = (i) => padL + (rows.length === 1 ? (W - padL) / 2 : (i * (W - padL - 6)) / (rows.length - 1));
  const y = (v) => padT + (1 - ((Number(v) || 0) - min) / span) * (H - padT - padB);
  const ticks = [0, 0.5, 1].map((t) => min + span * t);
  const every = Math.max(1, Math.ceil(rows.length / Math.max(2, Math.floor((W - padL) / 56))));
  const path = (s) => rows.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(r[s.key]).toFixed(1)}`).join(' ');
  const h = hover != null ? rows[hover] : null;

  return (
    <div className="flex flex-col gap-2.5">
      <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={cols.map((s) => s.label).join(', ')} className="block overflow-visible">
          <defs>
            {cols.filter((s) => s.area).map((s) => (
              <linearGradient key={s.key} id={`${gid}-${s.key}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity=".18" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          {ticks.map((t, i) => (
            <g key={t}>
              <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke={i === 0 ? '#D5D5CE' : '#EFEFEA'} />
              <text x={padL - 6} y={y(t) + 4} textAnchor="end" className={LBL}>{compact(t)}</text>
            </g>
          ))}
          {cols.filter((s) => s.area).map((s) => (
            <path key={`a-${s.key}`} d={`${path(s)} L${x(rows.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`} fill={`url(#${gid}-${s.key})`} />
          ))}
          {cols.map((s) => (
            <path key={s.key} d={path(s)} fill="none" stroke={s.color} strokeWidth={s.dashed ? 1.8 : 2.2} strokeDasharray={s.dashed ? '4 4' : undefined} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {hover != null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke="#850D33" strokeOpacity=".4" strokeDasharray="3 3" />}
          {hover != null && cols.map((s) => <circle key={s.key} cx={x(hover)} cy={y(rows[hover][s.key])} r="4" fill="#fff" stroke={s.color} strokeWidth="2.4" />)}
          {rows.map((r, i) => (
            <g key={i} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} className="outline-none">
              <rect x={x(i) - (W - padL) / rows.length / 2} y="0" width={(W - padL) / rows.length} height={H - padB} fill="transparent" />
              {i % every === 0 && <text x={x(i)} y={H - 6} textAnchor="middle" className={LBL}>{xTick(r)}</text>}
            </g>
          ))}
        </svg>
        {h && (
          <Tip style={{ left: Math.min(Math.max(x(hover) - 80, 0), W - 170), top: 0 }}>
            <TipHead>{xName(h)}</TipHead>
            {cols.map((s) => <TipRow key={s.key} color={s.color} dashed={s.dashed} label={s.label} value={fmt(Number(h[s.key]) || 0)} />)}
          </Tip>
        )}
      </div>
      <Legend items={cols} />
    </div>
  );
}

/** segments: [{ label, value, color? }]. Shows each share; centre text is a headline number. */
export function Donut({ segments, fmt = (n) => String(n), centre, centreLabel, size = 150 }) {
  const [hover, setHover] = useState(null);
  const data = (segments || []).filter((s) => s.value > 0);
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <div className={EMPTY}>Nothing to show in this range.</div>;
  const R = 46;
  const C = 2 * Math.PI * R;
  const lens = data.map((d) => (d.value / total) * C);
  const rings = data.map((d, i) => ({
    ...d,
    color: d.color || PALETTE[i % PALETTE.length],
    dash: `${Math.max(lens[i] - 1.2, 0.5)} ${C}`,
    offset: -lens.slice(0, i).reduce((a, b) => a + b, 0),
  }));
  const h = hover != null ? rings[hover] : null;
  return (
    <div className="flex items-center gap-5 flex-wrap">
      <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label="Share breakdown" className="flex-none">
        <circle cx="60" cy="60" r={R} fill="none" stroke="#EFEFEA" strokeWidth="18" />
        {rings.map((r, i) => (
          <circle key={r.label} cx="60" cy="60" r={R} fill="none" stroke={r.color} strokeWidth={hover === i ? 21 : 18} strokeDasharray={r.dash} strokeDashoffset={r.offset} transform="rotate(-90 60 60)" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ transition: 'stroke-width .15s' }} />
        ))}
        <text x="60" y={centreLabel || h ? 60 : 65} textAnchor="middle" className="fill-mq-ink font-mq-mono text-[15px] font-medium">{h ? fmt(h.value) : centre ?? fmt(total)}</text>
        {(centreLabel || h) && <text x="60" y="74" textAnchor="middle" className="fill-mq-muted text-[8px] font-semibold uppercase tracking-[.1em]">{h ? h.label : centreLabel}</text>}
      </svg>
      <ul className="m-0 p-0 list-none flex-1 min-w-[180px] flex flex-col gap-1">
        {rings.map((r, i) => (
          <li key={r.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className={`flex items-center gap-2 px-1.5 py-1 rounded-md text-[13px] ${hover === i ? 'bg-mq-canvas' : ''}`}>
            <Swatch color={r.color} />
            <span className="flex-1 min-w-0 truncate text-mq-ink">{r.label}</span>
            <span className="font-mq-mono tabular-nums text-mq-ink">{fmt(r.value)}</span>
            <span className="font-mq-mono tabular-nums text-mq-muted w-10 text-right">{Math.round((r.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * rows: [{ label, value, sub?, color? }] ranked bars with the value at the end.
 * With `onSelect` every row is a button (e.g. click a category to filter by it);
 * `active` marks the selected row's label. Colours step down the maroon ramp.
 */
export function HBars({ rows, fmt = (n) => String(n), max, color, empty = 'Nothing to show in this range.', onSelect, active }) {
  if (!rows?.length) return <div className={EMPTY}>{empty}</div>;
  const top = (max ?? Math.max(...rows.map((r) => r.value), 0)) || 1;
  return (
    <ul className="m-0 p-0 list-none flex flex-col gap-2.5">
      {rows.map((r, i) => {
        const fill = r.color || color || RAMP[Math.min(i, RAMP.length - 1)];
        const on = active === r.label;
        const body = (
          <>
            <div className="flex items-baseline gap-2 text-[13px]">
              <span className={`flex-1 min-w-0 truncate ${on ? 'text-mq-primary font-semibold' : 'text-mq-ink'}`} title={r.label}>{r.label}</span>
              <span className="font-mq-mono tabular-nums text-mq-ink">{fmt(r.value)}</span>
            </div>
            <div className="h-2 rounded bg-mq-chip overflow-hidden mt-1" aria-hidden="true">
              <span className="block h-full rounded" style={{ width: `${Math.max(2, (r.value / top) * 100)}%`, background: fill }} />
            </div>
            {r.sub && <div className="text-[11.5px] text-mq-muted mt-0.5">{r.sub}</div>}
          </>
        );
        return (
          <li key={`${r.label}-${i}`}>
            {onSelect
              ? <button type="button" className={`w-full text-left rounded-lg px-1.5 py-1 -mx-1.5 transition-colors ${on ? 'bg-mq-soft' : 'hover:bg-mq-canvas'}`} onClick={() => onSelect(r)} aria-pressed={on}>{body}</button>
              : body}
          </li>
        );
      })}
    </ul>
  );
}

const pctChange = (now, before) => (before ? Math.round(((now - before) / Math.abs(before)) * 100) : null);

/**
 * Columns for one period (days or hours) with an optional dashed line for the
 * comparison period, aligned by position.
 *   rows: [{ key, tick, name, value, sub?, prev?, prevName? }]
 * Hover, tap or focus + ←/→ shows a tooltip with both values and the change.
 * Tick labels are thinned from the real width, so they never collide.
 */
export function Columns({ rows, fmt = (n) => String(n), label = 'Sales', compareLabel, height = 220, unit = 'day', empty = 'No sales in this range.', onSelect }) {
  const [ref, W] = useWidth();
  const [active, setActive] = useState(null);
  const hasPrev = !!compareLabel && (rows || []).some((r) => r.prev != null);
  if (!rows?.length || rows.every((r) => !r.value && !r.prev)) return <div className={EMPTY}>{empty}</div>;

  const H = height;
  const padL = 46;
  const padR = 6;
  const padT = 10;
  const padB = 24;
  const plotW = Math.max(W - padL - padR, 40);
  const plotH = H - padT - padB;
  const max = nice(Math.max(...rows.map((r) => Math.max(Number(r.value) || 0, hasPrev ? Number(r.prev) || 0 : 0)), 0));
  const step = plotW / rows.length;
  const bw = Math.max(2, Math.min(40, step * 0.62));
  const cx = (i) => padL + i * step + step / 2;
  const y = (v) => padT + (1 - (Number(v) || 0) / max) * plotH;
  const labelW = Math.max(...rows.map((r) => String(r.tick).length)) * 7 + 14;
  const every = Math.max(1, Math.ceil(rows.length / Math.max(1, Math.floor(plotW / labelW))));
  const ticks = [0, max / 2, max];
  const line = hasPrev ? rows.map((r, i) => `${i ? 'L' : 'M'}${cx(i).toFixed(1)},${y(r.prev).toFixed(1)}`).join(' ') : '';
  const a = active != null ? rows[active] : null;

  const pick = (clientX, rect) => {
    const i = Math.floor((clientX - rect.left - padL) / step);
    setActive(Math.min(rows.length - 1, Math.max(0, i)));
  };
  const onKey = (e) => {
    const last = rows.length - 1;
    const cur = active ?? last;
    if (e.key === 'Enter' && onSelect && a) { onSelect(a); return; }
    const next = { ArrowLeft: cur - 1, ArrowRight: cur + 1, Home: 0, End: last }[e.key];
    if (next == null) return;
    e.preventDefault();
    setActive(Math.min(last, Math.max(0, next)));
  };
  const tipLeft = a ? Math.min(Math.max(cx(active) - 85, 0), W - 175) : 0;
  const tipText = a
    ? `${a.name}: ${fmt(a.value)}${a.sub ? `, ${a.sub}` : ''}${hasPrev && a.prev != null ? `. ${compareLabel}${a.prevName ? ` (${a.prevName})` : ''}: ${fmt(a.prev)}` : ''}`
    : '';
  const ch = a && hasPrev ? pctChange(a.value, a.prev) : null;

  return (
    <div className="flex flex-col gap-2.5">
      <div
        ref={ref}
        className={`relative outline-none rounded-md focus-visible:shadow-mq-focus ${onSelect ? 'cursor-pointer' : ''}`}
        tabIndex={0}
        role="group"
        aria-roledescription="chart"
        aria-label={`${label} by ${unit}${hasPrev ? `, with a dashed line for ${compareLabel}` : ''}. Use the left and right arrow keys to read each ${unit}.`}
        onKeyDown={onKey}
        onFocus={() => setActive((v) => v ?? rows.length - 1)}
        onBlur={() => setActive(null)}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') setActive(null); }}
        onClick={() => { if (onSelect && a) onSelect(a); }}
      >
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" className="block">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#D5D5CE' : '#EFEFEA'} />
              <text x={padL - 8} y={y(t) + 4} textAnchor="end" className={LBL}>{compact(t)}</text>
            </g>
          ))}
          {active != null && <rect x={padL + active * step} y={padT} width={step} height={plotH} fill="#F6E8EC" opacity=".6" />}
          {rows.map((r, i) => {
            const v = Number(r.value) || 0;
            const bh = v > 0 ? Math.max(2, (v / max) * plotH) : 0;
            const x = cx(i) - bw / 2;
            const rad = Math.min(3, bw / 2, bh);
            return bh > 0 && (
              <path key={r.key} fill={active === i || active == null ? '#850D33' : '#C0576F'}
                d={`M${x},${H - padB} v${-(bh - rad)} q0,${-rad} ${rad},${-rad} h${bw - 2 * rad} q${rad},0 ${rad},${rad} v${bh - rad} z`} />
            );
          })}
          {hasPrev && <path d={line} fill="none" stroke={PREV} strokeWidth="1.8" strokeDasharray="4 4" strokeLinejoin="round" />}
          {hasPrev && active != null && a.prev != null && <circle cx={cx(active)} cy={y(a.prev)} r="3.5" fill="#fff" stroke={PREV} strokeWidth="2" />}
          {rows.map((r, i) => (i % every === 0 ? <text key={r.key} x={cx(i)} y={H - 6} textAnchor="middle" className={LBL}>{r.tick}</text> : null))}
        </svg>
        {a && (
          <Tip style={{ left: tipLeft, top: 0 }}>
            <TipHead>{a.name}</TipHead>
            <TipRow color="#E9A3B6" label={label} value={fmt(a.value)} />
            {hasPrev && a.prev != null && <TipRow dashed label={a.prevName || compareLabel} value={fmt(a.prev)} />}
            {(ch != null || a.sub) && (
              <div className="mt-1 text-[11.5px]">
                {ch != null && <span className="text-[#8FD3B6] font-semibold">{ch > 0 ? '+' : ''}{ch}%</span>}
                {ch != null && a.sub && <span className="opacity-60"> · </span>}
                {a.sub && <span className="opacity-70">{a.sub}</span>}
              </div>
            )}
          </Tip>
        )}
        <div className="sr-only" aria-live="polite">{tipText}</div>
      </div>
      {hasPrev && (
        <Legend items={[{ label, color: '#850D33' }, { label: compareLabel.replace(/^vs /, ''), dashed: true }]} />
      )}
    </div>
  );
}

/** A tiny trend line for a KPI tile (decorative — the number sits beside it). `prev` draws a dashed comparison. */
export function Sparkline({ values, prev, height = 34, color = '#850D33' }) {
  const gid = useId().replace(/:/g, '');
  const v = (values || []).map((n) => Number(n) || 0);
  const p = (prev || []).map((n) => Number(n) || 0);
  if (v.length < 2 || v.every((n) => n === 0)) return null;
  const W = 100;
  const max = Math.max(...v, ...p) || 1;
  const x = (i, len) => (i / (len - 1)) * W;
  const y = (n) => 2 + (1 - n / max) * (height - 4);
  const d = v.map((n, i) => `${i ? 'L' : 'M'}${x(i, v.length).toFixed(2)},${y(n).toFixed(2)}`).join(' ');
  const dp = p.length > 1 ? p.map((n, i) => `${i ? 'L' : 'M'}${x(i, p.length).toFixed(2)},${y(n).toFixed(2)}`).join(' ') : null;
  return (
    <svg className="block w-full" viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" height={height} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".16" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {dp && <path d={dp} fill="none" stroke="#D5D5CE" strokeWidth="1.5" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
      <path d={`${d} L${W},${height} L0,${height} Z`} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/**
 * One 100% bar split into segments, with label · share · amount below.
 *   segments: [{ label, value, sub?, color? }]
 */
export function StackBar({ segments, fmt = (n) => String(n), empty = 'No sales in this range.' }) {
  const data = (segments || []).filter((s) => s.value > 0).map((s, i) => ({ ...s, color: s.color || PALETTE[i % PALETTE.length] }));
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <div className={EMPTY}>{empty}</div>;
  const pct = (v) => Math.round((v / total) * 100);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-3 rounded-full overflow-hidden gap-px bg-mq-chip" role="img" aria-label={data.map((d) => `${d.label} ${pct(d.value)}%, ${fmt(d.value)}`).join('; ')}>
        {data.map((d) => <span key={d.label} style={{ width: `${(d.value / total) * 100}%`, background: d.color }} title={`${d.label} · ${pct(d.value)}%`} />)}
      </div>
      <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-2 text-[13px] flex-wrap">
            <span className="flex items-center gap-2 flex-1 min-w-0 text-mq-ink"><Swatch color={d.color} />{d.label}</span>
            {d.sub && <span className="text-xs text-mq-muted">{d.sub}</span>}
            <span className="font-mq-mono tabular-nums text-mq-muted w-10 text-right">{pct(d.value)}%</span>
            <span className="font-mq-mono tabular-nums text-mq-ink min-w-[76px] text-right">{fmt(d.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
