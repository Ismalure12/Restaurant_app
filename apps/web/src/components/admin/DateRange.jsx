'use client';

import { useEffect, useState } from 'react';
import { PeriodPicker, presetRange } from '@/components/admin/reports/ReportKit';

// Older preset names → the shared period picker's names.
const LEGACY = { last7: '7d', last30: '30d', thisMonth: 'month', thisYear: 'year', thisWeek: 'week' };
const norm = (p) => LEGACY[p] || p;

/** { from, to } (local YYYY-MM-DD) for a preset name, old or new; null for unknown/custom. */
export function rangeFor(preset) {
  return presetRange(norm(preset));
}

/**
 * The period picker (Today · This week · This month · More ▾) with its state
 * kept in the component instead of the URL — for tabs that don't own the page
 * URL (Cash book, Transfers). Calls onChange(from, to) on mount and whenever
 * the range changes; keep `onChange` stable (useCallback).
 */
export default function DateRange({ defaultPreset = '30d', onChange }) {
  const [state, setState] = useState(() => {
    const preset = rangeFor(defaultPreset) ? norm(defaultPreset) : '30d';
    return { preset, range: presetRange(preset) };
  });

  const set = (patch) => {
    if (patch.preset === 'custom') {
      setState({ preset: 'custom', range: { from: patch.from, to: patch.to } });
      return;
    }
    const r = presetRange(patch.preset);
    if (r) setState({ preset: patch.preset, range: r });
  };

  const { from, to } = state.range;
  useEffect(() => { onChange?.(from, to); }, [from, to, onChange]);

  return <PeriodPicker preset={state.preset} range={state.range} set={set} />;
}
