'use client';

import { useEffect, useId, useState } from 'react';

/**
 * Small inline-SVG charts for the admin (no chart library): theme-aware via the
 * admin colour tokens, responsive (viewBox + width:100%), hover/focus tooltips,
 * and always paired with real numbers nearby for accessibility.
 *
 *   <LineArea rows series xKey xTick fmt />     trend, several series, optional dashed comparison
 *   <Donut segments fmt centre />               share of a whole
 *   <HBars rows fmt onSelect? />                ranked bars (top dishes, accounts…)
 *   <Columns rows fmt compareLabel />           days/hours as columns + dashed comparison line
 *   <Sparkline values />                        tiny trend for a KPI tile
 *   <StackBar segments fmt />                   one 100% bar (channel split)
 *   <Legend items />
 */
export const PALETTE = ['var(--primary)', 'var(--gold)', 'var(--sky)', 'var(--rose)', 'var(--amber)', '#8a6fb5', '#5f9ea0', '#9aa39d'];

const nice = (max) => {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  const n = max / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};
const compact = (n) => (Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : String(Math.round(n)));

export function Legend({ items }) {
  return (
    <div className="chart-legend">
      {items.map((it) => (
        <span key={it.label} className="chart-legend-i">
          <i className={`chart-sw${it.dashed ? ' dashed' : ''}`} style={{ background: it.dashed ? 'transparent' : it.color, borderColor: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/**
 * series: [{ key, label, color?, area?, dashed? }] — values are read as row[key].
 * Hovering (or focusing) a column shows every series' value for that x.
 */
export function LineArea({ rows, series, xKey = 'day', xTick = (r) => String(r[xKey]).slice(5), xName = (r) => r[xKey], fmt = (n) => String(n), height = 200, empty = 'No data in this range.' }) {
  const [hover, setHover] = useState(null);
  const gid = useId().replace(/:/g, '');
  if (!rows?.length) return <div className="sub">{empty}</div>;
  const W = 720;
  const H = height;
  const padL = 40;
  const padB = 22;
  const padT = 8;
  const cols = series.map((s, i) => ({ color: PALETTE[i % PALETTE.length], ...s }));
  const max = nice(Math.max(...rows.flatMap((r) => cols.map((s) => Number(r[s.key]) || 0)), 0));
  const min = Math.min(0, ...rows.flatMap((r) => cols.map((s) => Number(r[s.key]) || 0)));
  const span = (max - min) || 1;
  const x = (i) => padL + (rows.length === 1 ? (W - padL) / 2 : (i * (W - padL - 6)) / (rows.length - 1));
  const y = (v) => padT + (1 - ((Number(v) || 0) - min) / span) * (H - padT - padB);
  const ticks = [0, 0.5, 1].map((t) => min + span * t);
  const every = Math.ceil(rows.length / 8);
  const path = (s) => rows.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(r[s.key]).toFixed(1)}`).join(' ');
  const h = hover != null ? rows[hover] : null;

  return (
    <div className="chart" onMouseLeave={() => setHover(null)}>
      <div className="chart-tip" aria-live="polite">
        {h ? (
          <>
            <b>{xName(h)}</b>
            {cols.map((s) => <span key={s.key} className="chart-tip-i"><i className="chart-sw" style={{ background: s.color }} />{s.label} {fmt(Number(h[s.key]) || 0)}</span>)}
          </>
        ) : <span className="sub">Hover the chart for exact numbers</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={cols.map((s) => s.label).join(', ')} preserveAspectRatio="none" className="chart-svg">
        <defs>
          {cols.filter((s) => s.area).map((s) => (
            <linearGradient key={s.key} id={`${gid}-${s.key}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity=".28" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="chart-lbl">{compact(t)}</text>
          </g>
        ))}
        {cols.filter((s) => s.area).map((s) => (
          <path key={`a-${s.key}`} d={`${path(s)} L${x(rows.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`} fill={`url(#${gid}-${s.key})`} />
        ))}
        {cols.map((s) => (
          <path key={s.key} d={path(s)} fill="none" stroke={s.color} strokeWidth={s.dashed ? 1.6 : 2.2} strokeDasharray={s.dashed ? '4 4' : undefined} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        ))}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} className="chart-cursor" />}
        {hover != null && cols.map((s) => <circle key={s.key} cx={x(hover)} cy={y(rows[hover][s.key])} r="4" fill="var(--surface)" stroke={s.color} strokeWidth="2" />)}
        {rows.map((r, i) => (
          <g key={i} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}>
            <rect x={x(i) - (W - padL) / rows.length / 2} y="0" width={(W - padL) / rows.length} height={H - padB} fill="transparent" />
            {i % every === 0 && <text x={x(i)} y={H - 6} textAnchor="middle" className="chart-lbl">{xTick(r)}</text>}
          </g>
        ))}
      </svg>
      <Legend items={cols} />
    </div>
  );
}

/** segments: [{ label, value, color? }]. Shows each share; centre text is a headline number. */
export function Donut({ segments, fmt = (n) => String(n), centre, centreLabel, size = 168 }) {
  const [hover, setHover] = useState(null);
  const data = (segments || []).filter((s) => s.value > 0);
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <div className="sub">Nothing to show in this range.</div>;
  const R = 62;
  const C = 2 * Math.PI * R;
  // Each ring starts where the previous one ended (running total of the lengths before it).
  const lens = data.map((d) => (d.value / total) * C);
  const rings = data.map((d, i) => ({
    ...d,
    color: d.color || PALETTE[i % PALETTE.length],
    dash: `${Math.max(lens[i] - 1.5, 0.5)} ${C}`,
    offset: -lens.slice(0, i).reduce((a, b) => a + b, 0),
  }));
  const h = hover != null ? rings[hover] : null;
  return (
    <div className="donut">
      <svg viewBox="0 0 160 160" width={size} height={size} role="img" aria-label="Share breakdown" className="donut-svg">
        <circle cx="80" cy="80" r={R} fill="none" stroke="var(--line)" strokeWidth="18" />
        {rings.map((r, i) => (
          <circle key={r.label} cx="80" cy="80" r={R} fill="none" stroke={r.color} strokeWidth={hover === i ? 22 : 18} strokeDasharray={r.dash} strokeDashoffset={r.offset} transform="rotate(-90 80 80)" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ transition: 'stroke-width .15s' }} />
        ))}
        <text x="80" y={centreLabel || h ? 78 : 86} textAnchor="middle" className="donut-c">{h ? fmt(h.value) : centre ?? fmt(total)}</text>
        {(centreLabel || h) && <text x="80" y="96" textAnchor="middle" className="donut-cl">{h ? h.label : centreLabel}</text>}
      </svg>
      <ul className="donut-list">
        {rings.map((r, i) => (
          <li key={r.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className={hover === i ? 'on' : ''}>
            <i className="chart-sw" style={{ background: r.color }} />
            <span className="donut-n">{r.label}</span>
            <span className="donut-v mono">{fmt(r.value)}</span>
            <span className="donut-p mono">{Math.round((r.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * rows: [{ label, value, sub?, color? }] ranked bars with the value at the end.
 * With `onSelect` every row is a button (e.g. click a category to filter by it);
 * `active` marks the selected row's label.
 */
export function HBars({ rows, fmt = (n) => String(n), max, color = 'var(--primary)', empty = 'Nothing to show in this range.', onSelect, active }) {
  if (!rows?.length) return <div className="sub">{empty}</div>;
  const top = (max ?? Math.max(...rows.map((r) => r.value), 0)) || 1;
  return (
    <ul className={`hbars${onSelect ? ' r6-hbars-pick' : ''}`}>
      {rows.map((r, i) => {
        const body = (
          <>
            <div className="hbars-top">
              <span className="hbars-n" title={r.label}>{r.label}</span>
              <span className="hbars-v mono">{fmt(r.value)}</span>
            </div>
            <div className="hbars-track" aria-hidden="true"><span className="hbars-fill" style={{ width: `${Math.max(2, (r.value / top) * 100)}%`, background: r.color || color }} /></div>
            {r.sub && <div className="hbars-sub">{r.sub}</div>}
          </>
        );
        return (
          <li key={`${r.label}-${i}`} className={`hbars-row${active === r.label ? ' on' : ''}`}>
            {onSelect
              ? <button type="button" className="r6-hbars-btn" onClick={() => onSelect(r)} aria-pressed={active === r.label}>{body}</button>
              : body}
          </li>
        );
      })}
    </ul>
  );
}

// ── Round 6 chart kit: Columns · Sparkline · StackBar ─────────────

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

const pctChange = (now, before) => (before ? Math.round(((now - before) / Math.abs(before)) * 100) : null);

/** "▲ 12%" / "▼ 5%" / "no change" for a tooltip. */
function ChangeText({ now, before }) {
  const p = pctChange(now, before);
  if (p == null) return null;
  if (p === 0) return <span className="delta flat">no change</span>;
  return <span className={`delta ${p > 0 ? 'up' : 'down'}`}>{p > 0 ? '▲' : '▼'} {Math.abs(p)}%</span>;
}

/**
 * Columns for one period (days or hours) with an optional dashed line for the
 * comparison period, aligned by position.
 *   rows: [{ key, tick, name, value, sub?, prev?, prevName? }]
 * Hover, tap or focus + ←/→ shows a tooltip with both values and the change.
 * Tick labels are thinned from the real width, so they never collide.
 */
export function Columns({ rows, fmt = (n) => String(n), label = 'Sales', compareLabel, height = 220, unit = 'day', empty = 'No sales in this range.' }) {
  const [ref, W] = useWidth();
  const [active, setActive] = useState(null);
  const hasPrev = !!compareLabel && (rows || []).some((r) => r.prev != null);
  if (!rows?.length || rows.every((r) => !r.value && !r.prev)) return <div className="sub r6-empty">{empty}</div>;

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
    const next = { ArrowLeft: cur - 1, ArrowRight: cur + 1, Home: 0, End: last }[e.key];
    if (next == null) return;
    e.preventDefault();
    setActive(Math.min(last, Math.max(0, next)));
  };
  const tipLeft = a ? Math.min(Math.max(cx(active), 90), W - 90) : 0;
  const tipText = a
    ? `${a.name}: ${fmt(a.value)}${a.sub ? `, ${a.sub}` : ''}${hasPrev && a.prev != null ? `. ${compareLabel}${a.prevName ? ` (${a.prevName})` : ''}: ${fmt(a.prev)}` : ''}`
    : '';

  return (
    <div className="r6-cols">
      <div
        ref={ref}
        className="r6-plot"
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
      >
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" className="r6-svg">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className={t === 0 ? 'r6-axis' : 'chart-grid'} />
              <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="chart-lbl">{compact(t)}</text>
            </g>
          ))}
          {active != null && <rect x={padL + active * step} y={padT} width={step} height={plotH} className="r6-hl" />}
          {rows.map((r, i) => {
            const v = Number(r.value) || 0;
            const bh = v > 0 ? Math.max(2, (v / max) * plotH) : 0;
            const x = cx(i) - bw / 2;
            const rad = Math.min(4, bw / 2, bh);
            return bh > 0 && (
              <path key={r.key} className={`r6-col${active === i ? ' on' : ''}`}
                d={`M${x},${H - padB} v${-(bh - rad)} q0,${-rad} ${rad},${-rad} h${bw - 2 * rad} q${rad},0 ${rad},${rad} v${bh - rad} z`} />
            );
          })}
          {hasPrev && <path d={line} className="r6-prev" />}
          {hasPrev && active != null && a.prev != null && <circle cx={cx(active)} cy={y(a.prev)} r="3.5" className="r6-prev-dot" />}
          {rows.map((r, i) => (i % every === 0 ? <text key={r.key} x={cx(i)} y={H - 6} textAnchor="middle" className="chart-lbl">{r.tick}</text> : null))}
        </svg>
        {a && (
          <div className="r6-tip" style={{ left: tipLeft }} aria-hidden="true">
            <div className="r6-tip-h">{a.name}</div>
            <div className="r6-tip-r"><i className="r6-sw" /><span>{label}</span><b className="mono">{fmt(a.value)}</b></div>
            {a.sub && <div className="r6-tip-s">{a.sub}</div>}
            {hasPrev && a.prev != null && (
              <>
                <div className="r6-tip-r"><i className="r6-sw dashed" /><span>{a.prevName || compareLabel}</span><b className="mono">{fmt(a.prev)}</b></div>
                <div className="r6-tip-s"><ChangeText now={a.value} before={a.prev} /> {pctChange(a.value, a.prev) != null ? compareLabel : ''}</div>
              </>
            )}
          </div>
        )}
        <div className="sr-only" aria-live="polite">{tipText}</div>
      </div>
      {hasPrev && (
        <div className="chart-legend">
          <span className="chart-legend-i"><i className="chart-sw" style={{ background: 'var(--primary)' }} />{label}</span>
          <span className="chart-legend-i"><i className="chart-sw dashed" style={{ borderColor: 'var(--muted)' }} />{compareLabel.replace(/^vs /, '')}</span>
        </div>
      )}
    </div>
  );
}

/** A tiny trend line for a KPI tile (decorative — the number sits beside it). */
export function Sparkline({ values, height = 30, color = 'var(--primary)' }) {
  const gid = useId().replace(/:/g, '');
  const v = (values || []).map((n) => Number(n) || 0);
  if (v.length < 2 || v.every((n) => n === 0)) return null;
  const W = 100;
  const max = Math.max(...v) || 1;
  const x = (i) => (i / (v.length - 1)) * W;
  const y = (n) => 2 + (1 - n / max) * (height - 4);
  const d = v.map((n, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(n).toFixed(2)}`).join(' ');
  return (
    <svg className="r6-spark" viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" height={height} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${W},${height} L0,${height} Z`} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
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
  if (!total) return <div className="sub r6-empty">{empty}</div>;
  const pct = (v) => Math.round((v / total) * 100);
  return (
    <div className="r6-stack-wrap">
      <div className="r6-stack" role="img" aria-label={data.map((d) => `${d.label} ${pct(d.value)}%, ${fmt(d.value)}`).join('; ')}>
        {data.map((d) => <span key={d.label} style={{ width: `${(d.value / total) * 100}%`, background: d.color }} title={`${d.label} · ${pct(d.value)}%`} />)}
      </div>
      <ul className="r6-stack-list">
        {data.map((d) => (
          <li key={d.label}>
            <span className="r6-stack-n"><i className="chart-sw" style={{ background: d.color }} />{d.label}</span>
            <span className="r6-stack-p mono">{pct(d.value)}%</span>
            <span className="r6-stack-v mono">{fmt(d.value)}</span>
            {d.sub && <span className="r6-stack-s">{d.sub}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
