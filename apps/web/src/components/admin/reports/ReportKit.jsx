'use client';

// Shared pieces of the Reports hub, Overview and Sales history. Every filter
// lives in the URL (?preset=&from=&to=&waiterId=…), so a view can be
// bookmarked, shared and survives a reload; the API receives the same keys.
// Export = a same-origin CSV link (the session cookie rides along);
// Print = window.print() with the A4 rules in ReportPrintCss.
// Styled per docs/admin-design-system.md.

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { money } from '@/lib/money';
import Button from '@/components/admin/ui/Button';
import UiCard, { CardHeader, CardTitle } from '@/components/admin/ui/Card';
import UiKpi from '@/components/admin/ui/Kpi';
import Icon from '@/components/admin/ui/icons';
import Popover, { MenuItem, MenuDivider } from '@/components/admin/ui/Popover';
import { FilterChip } from '@/components/admin/ui/Chip';
import { Alert, EmptyState } from '@/components/admin/ui/Feedback';
import { selectCls, inputCls } from '@/components/admin/ui/Controls';
import cx from '@/components/admin/ui/cx';
import { Columns } from './Charts';

export { money };
export const num = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shift = (d, days) => { const x = new Date(d); x.setDate(x.getDate() + days); return x; };

export const PRESETS = [
  ['today', 'Today'], ['week', 'This week'], ['month', 'This month'],
  ['yesterday', 'Yesterday'], ['7d', '7 days'], ['30d', '30 days'], ['lastMonth', 'Last month'], ['year', 'This year'], ['custom', 'Custom range'],
];
// The segmented control shows the common ones; the rest sit behind "More".
const PRIMARY_PRESETS = ['today', 'week', 'month'];
const presetName = (p) => PRESETS.find(([k]) => k === p)?.[1] ?? p;

const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const lastOfMonth = (y, m) => new Date(y, m + 1, 0).getDate();
const shortDay = (s) => parseDay(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const dayMonth = (s) => parseDay(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** "Mon 22 Sep" / "16–22 Sep" / "24 Aug – 22 Sep" for a range. */
export function rangeLabel(range) {
  if (!range) return '';
  if (range.from === range.to) return shortDay(range.from);
  const a = parseDay(range.from);
  const b = parseDay(range.to);
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) return `${a.getDate()}–${dayMonth(range.to)}`;
  return `${dayMonth(range.from)} – ${dayMonth(range.to)}`;
}

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

const segBtn = (on) => cx(
  'inline-flex items-center justify-center gap-1 min-h-[30px] px-[13px] rounded-md text-[13px] whitespace-nowrap transition-colors',
  on ? 'bg-white text-mq-ink font-semibold shadow-mq-seg' : 'text-mq-on-tint font-medium hover:text-mq-ink',
);

/**
 * The period: Today · This week · This month · More ▾ (Yesterday, 7 days,
 * 30 days, Last month, This year, Custom range). Custom adds two date inputs.
 */
export function PeriodPicker({ preset, range, set }) {
  const choose = (p, close) => {
    close?.();
    set(p === 'custom' ? { preset: 'custom', from: range.from, to: range.to } : { preset: p });
  };
  const inMore = !PRIMARY_PRESETS.includes(preset);
  return (
    <div className="inline-flex items-center gap-2 flex-wrap">
      <div role="group" aria-label="Period" className="inline-flex flex-wrap bg-mq-chip border border-mq-line rounded-lg p-[3px] gap-0.5">
        {PRIMARY_PRESETS.map((p) => (
          <button key={p} type="button" className={segBtn(preset === p)} aria-pressed={preset === p} onClick={() => choose(p)}>{presetName(p)}</button>
        ))}
        <Popover
          width={230}
          trigger={({ open, toggle }) => (
            <button type="button" className={segBtn(inMore)} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
              {inMore ? presetName(preset) : 'More'}<Icon name="chevDown" size={12} stroke={2.4} />
            </button>
          )}
        >
          {({ close }) => (
            <div role="menu">
              {PRESETS.filter(([p]) => !PRIMARY_PRESETS.includes(p) && p !== 'custom').map(([p, l]) => (
                <MenuItem key={p} active={preset === p} onClick={() => choose(p, close)} hint={rangeLabel(presetRange(p))}>{l}</MenuItem>
              ))}
              <MenuDivider />
              <MenuItem active={preset === 'custom'} onClick={() => choose('custom', close)}>Custom range…</MenuItem>
            </div>
          )}
        </Popover>
      </div>
      {preset === 'custom' && (
        <span className="inline-flex items-center gap-1.5">
          <input className={inputCls({ size: 'sm', className: 'w-auto' })} type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && set({ preset: 'custom', from: e.target.value, to: range.to })} aria-label="From date" />
          <span className="text-[12.5px] text-mq-on-tint">to</span>
          <input className={inputCls({ size: 'sm', className: 'w-auto' })} type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && set({ preset: 'custom', from: range.from, to: e.target.value })} aria-label="To date" />
        </span>
      )}
    </div>
  );
}

/** Kept for older imports — every report now uses the period control. */
export const RangePicker = PeriodPicker;

/** "16–22 Sep · vs previous 7 days" — the right-hand toolbar note (design wording). */
export function RangeNote({ preset, range, compare = true }) {
  return (
    <span className="text-[12.5px] text-mq-on-tint whitespace-nowrap">
      {rangeLabel(range)}{compare && <> · {compareLabel(preset)}</>}
    </span>
  );
}

/**
 * "Filters (2)" — the one filter control of a page. It sits beside the period
 * control and holds every extra filter (category, people, account, channel,
 * item, movement, role…) as labelled selects, with Clear all / Done. Pages
 * never lay filters out as their own rows; the active ones show as chips
 * (ActiveFilters) under the toolbar.
 */
export function FiltersButton({ active = 0, onClear, children, align = 'left' }) {
  return (
    <Popover
      width={320}
      align={align}
      panelClassName="!p-0"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={toggle}
          className={cx(
            'inline-flex items-center gap-[7px] min-h-[38px] px-[13px] rounded-lg border text-[13.5px] font-semibold whitespace-nowrap transition-colors max-nar:min-h-12',
            active || open ? 'bg-mq-soft border-mq-primary text-mq-primary' : 'bg-white border-mq-line text-mq-body hover:bg-mq-canvas hover:border-mq-line-2',
          )}
        >
          <Icon name="filter" size={15} stroke={2} />
          Filters
          {active > 0 && (
            <span className="grid place-items-center min-w-5 h-5 px-[5px] rounded-full bg-mq-primary text-mq-cream text-[11.5px] font-bold tabular-nums">
              <span className="sr-only">, </span>{active}<span className="sr-only"> active</span>
            </span>
          )}
        </button>
      )}
    >
      {({ close }) => (
        <div role="group" aria-label="Filters">
          <div className="flex flex-col gap-3 p-3.5">{children}</div>
          <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-t border-mq-chip">
            {onClear ? <Button variant="ghost" size="md" className="!px-3 text-mq-on-tint" onClick={onClear}>Clear all</Button> : <span />}
            <Button variant="primary" size="md" onClick={close}>Done</Button>
          </div>
        </div>
      )}
    </Popover>
  );
}

/** "Showing only [Cashier: Ali ✕] … Clear all" under the toolbar. items: [{key, label, onRemove}] */
export function ActiveFilters({ items, onClear }) {
  if (!items?.length) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap rpt-noprint">
      <span className="text-[12.5px] text-mq-muted">Showing only</span>
      {items.map((it) => <FilterChip key={it.key} onRemove={it.onRemove} label={`Remove ${it.label}`}>{it.label}</FilterChip>)}
      {onClear && <button type="button" onClick={onClear} className="text-[12.5px] font-semibold text-mq-cta hover:text-mq-primary">Clear all</button>}
    </div>
  );
}

export const CHANNEL_OPTIONS = [{ value: 'dine_in', label: 'Dine-in' }, { value: 'delivery', label: 'Delivery' }, { value: 'online', label: 'Online' }];

/** Dine-in / Delivery (rung up in the restaurant) · Online (placed through the online menu). URL key `channel`. */
export function ChannelSelect({ value, onChange }) {
  return <FilterSelect label="Channel" value={value} options={CHANNEL_OPTIONS} onChange={onChange} all="All channels" />;
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
 * "▲ 12% vs yesterday ($340)" — coloured by whether the change is good (for
 * costs, up is bad). A zero before shows `zero` (e.g. "no sales before").
 */
export function Delta({ now, before, fmt = money, invert = false, vs = 'vs previous period', zero = 'nothing before' }) {
  if (before == null) return null;
  const flat = <span className="inline-flex items-center rounded-full px-[7px] py-0.5 text-xs font-semibold bg-mq-chip text-mq-on-tint">no change</span>;
  if (!before && !now) return <span className="inline-flex items-center gap-1.5 flex-wrap">{flat}<span>{vs}</span></span>;
  if (!before) return <span className="text-mq-muted">{zero}</span>;
  const diff = now - before;
  if (Math.abs(diff) < 0.005) return <span className="inline-flex items-center gap-1.5 flex-wrap">{flat}<span>{vs}</span></span>;
  const good = invert ? diff < 0 : diff > 0;
  // A % against a loss (or a flip from profit to loss) means nothing — show the amount instead.
  const change = before < 0 || now < 0 ? fmt(Math.abs(diff)) : `${Math.round((Math.abs(diff) / Math.abs(before)) * 100)}%`;
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <span className={cx('inline-flex items-center gap-0.5 rounded-full px-[7px] py-0.5 text-xs font-semibold tabular-nums', good ? 'bg-mq-ok-bg text-mq-ok-ink' : 'bg-mq-danger-bg text-mq-danger-ink')}>
        <span aria-hidden="true">{diff > 0 ? '▲' : '▼'}</span><span className="sr-only">{diff > 0 ? 'up' : 'down'}</span> {change}
      </span>
      <span>{vs} ({fmt(before)})</span>
    </span>
  );
}

/** A labelled <select> filter bound to one URL key (inside FiltersButton). `all` names the empty choice. */
export function FilterSelect({ label, value, options, onChange, all = 'All' }) {
  return (
    <label className="flex flex-col gap-[5px] min-w-0">
      <span className="text-[11px] font-semibold uppercase tracking-[.09em] text-mq-muted">{label}</span>
      <select className={selectCls()} value={value || ''} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        <option value="">{all}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

/** Export CSV ▾ (downloads) + Print. */
export function ExportBar({ exports = [], print = true }) {
  if (!exports.length && !print) return null;
  return (
    <div className="inline-flex items-center gap-2 rpt-noprint">
      {exports.length === 1 && (
        <Button href={exports[0].href} variant="secondary" size="sm" icon="download" download>Export CSV</Button>
      )}
      {exports.length > 1 && (
        <Popover
          align="right"
          width={240}
          trigger={({ open, toggle }) => (
            <Button variant="secondary" size="sm" icon="download" iconRight="chevDown" onClick={toggle} aria-expanded={open} aria-haspopup="menu">Export CSV</Button>
          )}
        >
          {({ close }) => (
            <div role="menu">
              {exports.map((x) => (
                <a key={x.href} role="menuitem" href={x.href} download onClick={close} className="flex items-center min-h-9 px-2.5 rounded-lg text-[13.5px] text-mq-ink hover:bg-mq-canvas">{x.label}</a>
              ))}
            </div>
          )}
        </Popover>
      )}
      {print && <Button variant="secondary" size="sm" icon="print" onClick={() => window.print()}>Print</Button>}
    </div>
  );
}

export function Toolbar({ children, exports, print = true }) {
  return (
    <div className="flex items-center gap-2.5 flex-wrap rpt-noprint">
      {children}
      <span className="flex-1" />
      <ExportBar exports={exports} print={print} />
    </div>
  );
}

/** Human labels for the raw filter values the API takes (never print the raw value). */
export const FILTER_LABELS = {
  channel: { dine_in: 'Dine-in', delivery: 'Delivery', online: 'Online' },
  movement: { purchase: 'Purchase', usage: 'Usage', waste: 'Waste', adjustment: 'Adjustment' },
  role: { cashier: 'Cashiers', waiter: 'Waiters', manager: 'Managers', admin: 'Admins' },
  status: { voided: 'Voided', completed: 'Completed', all: 'All' },
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
    <div className="hidden print:block mb-3">
      <div className="text-xl font-semibold">{title}</div>
      <div className="text-sm text-mq-muted">{name ? `${name} · ` : ''}{dates}</div>
      <div className="text-sm text-mq-muted">{bits.length ? `Filters — ${bits.join(' · ')}` : 'No filters applied'}</div>
    </div>
  );
}

/** A4 print rules shared by the reports layout and Sales history (which lives outside it). */
export function ReportPrintCss() {
  return (
    <style jsx global>{`
      @media print {
        @page { size: A4; margin: 12mm; }
        [data-admin-chrome], .rpt-noprint { display: none !important; }
        [data-admin-main] { display: block !important; margin: 0 !important; padding: 0 !important; height: auto !important; overflow: visible !important; }
        [data-admin-main] * { box-shadow: none !important; }
        [data-admin-main] [style*='max-height'] { max-height: none !important; overflow: visible !important; }
        [data-admin-main] section { break-inside: avoid; }
      }
    `}</style>
  );
}

/** Report KPI tile (label, value, foot) on the design-system tile. */
export function Kpi({ label, value, foot, tone, href }) {
  const dot = { ink: null, green: 'bg-mq-ok', gold: 'bg-mq-warn', rose: 'bg-mq-danger', sky: 'bg-mq-info', primary: 'bg-mq-primary' }[tone] ?? null;
  return <UiKpi label={label} value={value} foot={foot} tone={dot} href={href} />;
}

/** Report card: title strip when `flush` (tables), plain padded title otherwise (charts). */
export function Card({ eyebrow, title, action, children, flush, id }) {
  if (flush) {
    return (
      <UiCard id={id} className="overflow-hidden">
        <CardHeader title={title} sub={eyebrow} actions={action} />
        {children}
      </UiCard>
    );
  }
  return (
    <UiCard id={id} pad className="flex flex-col gap-3.5">
      <CardTitle title={title} sub={eyebrow} actions={action} />
      {children}
    </UiCard>
  );
}

/** One series by day (or hour via HourBars), on the shared Columns chart. */
export function DayBars({
  rows, value = (r) => r.total, fmt = money, label = 'Sales',
  keyOf = (r) => r.day, tick = (r) => r.day.slice(5), name = (r) => r.day, unit = 'day',
}) {
  if (!rows?.length) return <Empty>No data in range.</Empty>;
  const data = rows.map((r) => ({ key: keyOf(r), tick: tick(r), name: name(r), value: value(r), sub: r.orders != null ? `${r.orders} orders` : undefined }));
  return <Columns rows={data} fmt={fmt} label={label} unit={unit} height={200} />;
}

const hh = (h) => `${String(h).padStart(2, '0')}:00`;

/** Sales by hour of day: every hour from the first to the last busy one (no gaps). */
export function HourBars({ rows }) {
  if (!rows?.length) return <Empty>No sales in this range.</Empty>;
  const byHour = new Map(rows.map((r) => [r.hour, r]));
  const first = Math.min(...rows.map((r) => r.hour));
  const last = Math.max(...rows.map((r) => r.hour));
  const filled = [];
  for (let h = first; h <= last; h++) filled.push(byHour.get(h) || { hour: h, orders: 0, total: 0 });
  return <DayBars rows={filled} keyOf={(r) => r.hour} tick={(r) => hh(r.hour).slice(0, 2)} name={(r) => `${hh(r.hour)}–${hh(r.hour + 1)}`} unit="hour" />;
}

export function Empty({ children = 'Nothing in this range.' }) {
  return <EmptyState icon="reports">{children}</EmptyState>;
}

export function ErrorNote({ error }) {
  return <Alert tone="danger" title="Couldn’t load this report">{error?.message || 'Check the connection and try again.'}</Alert>;
}
