'use client';

import { useState, useEffect } from 'react';

const PRESETS = [
  ['today', 'Today'],
  ['yesterday', 'Yesterday'],
  ['last7', 'Last 7 days'],
  ['last30', 'Last 30 days'],
  ['thisMonth', 'This month'],
  ['lastMonth', 'Last month'],
  ['thisYear', 'This year'],
  ['lastYear', 'Last year'],
  ['custom', 'Custom range'],
];

const pad = (n) => String(n).padStart(2, '0');
// Local YYYY-MM-DD (avoids the UTC off-by-one that toISOString causes).
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function rangeFor(preset) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case 'today': return { from: iso(now), to: iso(now) };
    case 'yesterday': { const d = new Date(now); d.setDate(now.getDate() - 1); return { from: iso(d), to: iso(d) }; }
    case 'last7': { const s = new Date(now); s.setDate(now.getDate() - 6); return { from: iso(s), to: iso(now) }; }
    case 'last30': { const s = new Date(now); s.setDate(now.getDate() - 29); return { from: iso(s), to: iso(now) }; }
    case 'thisMonth': return { from: iso(new Date(y, m, 1)), to: iso(now) };
    case 'lastMonth': return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
    case 'thisYear': return { from: iso(new Date(y, 0, 1)), to: iso(now) };
    case 'lastYear': return { from: iso(new Date(y - 1, 0, 1)), to: iso(new Date(y - 1, 11, 31)) };
    default: return null;
  }
}

/**
 * Date-range picker with quick presets + a custom range fallback.
 * Calls onChange(fromYYYYMMDD, toYYYYMMDD) on mount and whenever the range changes.
 */
export default function DateRange({ defaultPreset = 'last30', onChange }) {
  const [preset, setPreset] = useState(defaultPreset);
  const initial = rangeFor(defaultPreset) || rangeFor('last30');
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);

  // Emit the initial range once on mount; later changes emit from the handlers below.
  useEffect(() => { onChange?.(initial.from, initial.to); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choosePreset = (p) => {
    setPreset(p);
    if (p !== 'custom') { const r = rangeFor(p); setFrom(r.from); setTo(r.to); onChange?.(r.from, r.to); }
  };
  const changeFrom = (v) => { setFrom(v); onChange?.(v, to); };
  const changeTo = (v) => { setTo(v); onChange?.(from, v); };

  return (
    <div className="adm-daterange">
      <div className="adm-daterange-select">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
        <select className="adm-select" value={preset} onChange={(e) => choosePreset(e.target.value)} aria-label="Date range">
          {PRESETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      {preset === 'custom' && (
        <div className="adm-daterange-custom">
          <input className="adm-input" type="date" value={from} max={to} onChange={(e) => changeFrom(e.target.value)} aria-label="From" />
          <span className="adm-daterange-dash">–</span>
          <input className="adm-input" type="date" value={to} min={from} onChange={(e) => changeTo(e.target.value)} aria-label="To" />
        </div>
      )}

      <style jsx>{`
        .adm-daterange { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .adm-daterange-select { position: relative; display: inline-flex; align-items: center; }
        .adm-daterange-select svg { position: absolute; left: 12px; width: 15px; height: 15px; color: var(--muted); pointer-events: none; }
        .adm-daterange-select :global(.adm-select) { padding-left: 36px; min-width: 160px; cursor: pointer; }
        .adm-daterange-custom { display: inline-flex; align-items: center; gap: 8px; }
        .adm-daterange-custom :global(.adm-input) { width: 150px; }
        .adm-daterange-dash { color: var(--muted); }
      `}</style>
    </div>
  );
}
