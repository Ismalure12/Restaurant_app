'use client';

import { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { KpiRowSkeleton, RowsSkeleton } from '@/components/admin/Skeletons';
import {
  Card, ChannelSelect, Delta, FilterSelect, FiltersButton, PeriodPicker, Toolbar,
  compareLabel, comparisonRange, money, num, periodParams, useAccountOptions, useReportParams,
} from '@/components/admin/reports/ReportKit';
import { Columns, HBars, LineArea, Sparkline } from '@/components/admin/reports/Charts';

const FILTERS = ['account', 'channel'];
const link = (path) => `/admin/dashboard/${path}`;
const Arrow = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
const time = (d) => (d ? new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');
const dateShort = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const whereOf = (o) => (o.tableNumber ? `Table ${o.tableNumber}` : o.customer || (o.orderType === 'delivery' ? 'Delivery' : 'Walk-in'));
const hh = (h) => `${String(h).padStart(2, '0')}:00`;
const addDay = (d, n) => { const x = new Date(`${d}T00:00:00`); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const dayTick = (d) => `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`;
const dayName = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many}`;

function Tile({ label, value, tone, foot, spark, href, dim, note }) {
  const body = (
    <>
      <div className="kpi-top"><span className={`kpi-dot ${tone || ''}`} /><span className="kpi-k">{label}</span></div>
      <div className="kpi-v r6-v">{value}</div>
      {spark}
      {note && <div className="r6-tile-note">{note}</div>}
      {foot != null && <div className="kpi-foot">{foot}</div>}
    </>
  );
  const cls = `kpi r6-tile${dim ? ' r6-dim' : ''}`;
  return href ? <Link href={href} className={`${cls} ov-tile-link`}>{body}</Link> : <div className={cls}>{body}</div>;
}

function OverviewSkeleton() {
  return (
    <>
      <KpiRowSkeleton count={4} className="kpi-row r6-kpis4" style={{ marginBottom: 12 }} />
      <RowsSkeleton rows={1} height={46} className="r6-sk-strip" />
      <RowsSkeleton rows={1} height={300} className="r6-sk-block" />
      <div className="grid2 rpt-grid"><RowsSkeleton rows={1} height={260} className="r6-sk-block" /><RowsSkeleton rows={1} height={260} className="r6-sk-block" /></div>
    </>
  );
}

/**
 * Overview — the manager's decision page (GET /api/admin/overview). Top to
 * bottom: what needs doing now, the period's four numbers against a meaningful
 * comparison, the sales trend, whether sales cover the costs, the best
 * sellers, then today's money position and the latest sales. Everything
 * detailed (accounts, channels, busy hours, every dish) lives in the Sales
 * report, which it links to.
 */
export default function OverviewPage() {
  return (
    <Suspense fallback={<OverviewSkeleton />}>
      <Overview />
    </Suspense>
  );
}

function Overview() {
  const { preset, range, filters, set, query } = useReportParams('7d', FILTERS);
  const cmp = comparisonRange(preset, range);
  const vs = compareLabel(preset);
  const apiQuery = `${query}&cfrom=${cmp.from}&cto=${cmp.to}`;
  const q = useQuery({ queryKey: ['overview', apiQuery], queryFn: () => fetchJson(`/api/admin/overview?${apiQuery}`), refetchInterval: 60_000 });
  const d = q.data;
  // Own key: nothing else caches under it. Manager tier — a 403 just hides the prompt.
  const dc = useQuery({ queryKey: ['day-close-overview'], queryFn: () => fetchJson('/api/admin/day-close'), refetchInterval: 5 * 60_000, retry: false });
  const unclosed = dc.data?.unclosed || [];
  const accounts = useAccountOptions();
  const active = FILTERS.filter((k) => filters[k]).length;
  const period = new URLSearchParams(periodParams(preset, range));
  const salesHref = link(`reports/sales?${new URLSearchParams({ ...Object.fromEntries(period), ...filters })}`);

  const k = d?.kpis;
  const live = d?.live;
  const oneDay = (d?.range?.days ?? 0) === 1;

  const trendRows = useMemo(() => {
    if (!d) return [];
    if (d.range.days === 1) {
      const cmpDay = dayName(d.previous.from);
      return d.hours.map((h) => ({ key: h.hour, tick: hh(h.hour), name: `${hh(h.hour)}–${hh(h.hour + 1)}`, value: h.sales, prev: h.previous, prevName: `${cmpDay} ${hh(h.hour)}` }));
    }
    return d.trend.map((t, i) => ({ key: t.day, tick: dayTick(t.day), name: dayName(t.day), value: t.sales, sub: plural(t.orders, 'sale', 'sales'), prev: t.previous, prevName: dayName(addDay(d.previous.from, i)) }));
  }, [d]);

  const chips = live ? [
    live.awaitingDecision > 0 && { key: 'online', tone: 'amber', text: `${plural(live.awaitingDecision, 'online order', 'online orders')} to accept`, href: link('orders') },
    live.unpaid.count > 0 && { key: 'unpaid', tone: 'sky', text: `${plural(live.unpaid.count, 'unpaid tab', 'unpaid tabs')} · ${money(live.unpaid.total)}`, href: link('orders?pay=unpaid') },
    live.lowStock.count > 0 && { key: 'stock', tone: 'rose', text: `${plural(live.lowStock.count, 'item', 'items')} low on stock`, title: live.lowStock.items.map((i) => i.name).join(', '), href: link('inventory') },
    live.salariesToPay > 0 && { key: 'salary', tone: 'gold', text: `${plural(live.salariesToPay, 'salary', 'salaries')} to pay`, href: link('users?tab=payroll') },
  ].filter(Boolean) : [];
  const moneyToday = live?.money ? live.money.accounts.reduce((n, a) => n + (a.today || 0), 0) : 0;

  return (
    <div className="ov r6-ov">
      <Toolbar print={false}>
        <PeriodPicker preset={preset} range={range} set={set} />
        <FiltersButton active={active} onClear={() => set({ account: '', channel: '' })}>
          <FilterSelect label="Account" value={filters.account} options={accounts} onChange={(v) => set({ account: v })} />
          <ChannelSelect value={filters.channel} onChange={(v) => set({ channel: v })} />
        </FiltersButton>
      </Toolbar>

      {(unclosed.length > 0 || chips.length > 0) && (
        <section className="r6-action" aria-label="Needs attention">
          {unclosed.length > 0 && (
            <Link href={link(`cash?tab=day-close&day=${unclosed[0]}`)} className="r6-close">
              <span className="r6-close-t">
                <b>Close {dayName(unclosed[0])}</b>
                <span>{unclosed.length === 1 ? 'Count the till and lock the day.' : `${unclosed.length} finished days aren’t closed yet, oldest first.`}</span>
              </span>
              <span className="btn btn-primary btn-sm">Close day{Arrow}</span>
            </Link>
          )}
          {chips.length > 0 && (
            <ul className="r6-chips">
              {chips.map((c) => (
                <li key={c.key}><Link href={c.href} className="r6-achip" title={c.title}><span className={`kpi-dot ${c.tone}`} />{c.text}{Arrow}</Link></li>
              ))}
            </ul>
          )}
        </section>
      )}

      {q.isError && !d ? (
        <div className="adm-error-banner r6-fail" role="alert">
          <span>Couldn’t load the overview. {q.error?.message || 'Please try again.'}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => q.refetch()} disabled={q.isFetching}>{q.isFetching ? 'Trying…' : 'Try again'}</button>
        </div>
      ) : q.isLoading || !d ? <OverviewSkeleton /> : (
        <>
          <section className="kpi-row r6-kpis4 reveal" aria-label={`Key numbers, ${vs}`}>
            <Tile label="Net sales" tone="green" value={money(k.sales.value)} href={salesHref}
              spark={<Sparkline values={oneDay ? d.hours.map((h) => h.sales) : d.trend.map((t) => t.sales)} />}
              foot={<Delta now={k.sales.value} before={k.sales.previous} vs={vs} zero="no sales before" />} />
            <Tile label="Orders" value={num(k.orders.value)} href={link(`sales?${query}`)}
              note={<>avg ticket <b className="mono">{money(k.avgTicket.value)}</b></>}
              foot={<Delta now={k.orders.value} before={k.orders.previous} fmt={num} vs={vs} zero="no sales before" />} />
            <Tile label="Net profit" tone={k.profit.value >= 0 ? 'green' : 'rose'} dim={!k.profit.applies} value={money(k.profit.value)}
              href={link(`reports/financial?${period}`)}
              note={k.profit.applies ? (k.margin != null ? <>margin <b className="mono">{Math.round(k.margin)}%</b></> : 'no sales yet') : 'needs all channels · clear the filters'}
              foot={k.profit.applies ? <Delta now={k.profit.value} before={k.profit.previous} vs={vs} zero="nothing before" /> : null} />
            {live.money ? (
              <Tile label="Money in accounts" tone="sky" value={money(live.money.total)} href={link('cash')}
                note="right now, all accounts"
                foot={<span className={moneyToday > 0 ? 'delta up' : moneyToday < 0 ? 'delta down' : ''}>{moneyToday ? `${moneyToday > 0 ? '+' : '−'}${money(Math.abs(moneyToday))} today` : 'no movement today'}</span>} />
            ) : (
              <Tile label="Money in accounts" tone="sky" value="—" href={link('settings')} note="the cash book has no starting point"
                foot={<span className="r6-linkish">Set the opening balances →</span>} />
            )}
          </section>

          <ul className="r6-strip" aria-label="More numbers">
            <li><Link href={link('customers?owing=1')} className="r6-strip-i">
              <span className="kpi-dot sky" /><span className="r6-strip-k">On account</span><b className="mono">{money(k.onAccount.value)}</b>
              <span className="r6-strip-s">customers owe {money(d.receivable.owed)}</span>
            </Link></li>
            <li><Link href={link('expenses')} className={`r6-strip-i${k.expenses.applies ? '' : ' r6-dim'}`}>
              <span className="kpi-dot rose" /><span className="r6-strip-k">Expenses</span><b className="mono">{money(k.expenses.value)}</b>
              <span className="r6-strip-s">{k.expenses.applies ? <Delta now={k.expenses.value} before={k.expenses.previous} invert vs={vs} zero="none before" /> : 'all channels'}</span>
            </Link></li>
            <li><Link href={link(`sales?${query}&status=voided`)} className="r6-strip-i">
              <span className="kpi-dot amber" /><span className="r6-strip-k">Voids</span><b className="mono">{num(k.voids.count)}</b>
              <span className="r6-strip-s">{k.voids.count ? money(k.voids.total) : 'none'}</span>
            </Link></li>
          </ul>

          <Card eyebrow={oneDay ? 'Today by hour' : 'Trend'} title={oneDay ? 'Sales by hour' : 'Sales by day'}
            action={<Link className="btn btn-ghost btn-sm" href={salesHref}>Sales report{Arrow}</Link>}>
            <Columns rows={trendRows} fmt={money} label="Sales" unit={oneDay ? 'hour' : 'day'} compareLabel={vs} empty="No sales in this period yet." />
          </Card>

          <div className="grid2 rpt-grid r6-two">
            <Card eyebrow="Profit" title="Covering costs">
              {d.filtered ? (
                <p className="note">Expenses belong to the whole business, so this chart only shows without filters. <button type="button" className="r6-linkbtn" onClick={() => set({ account: '', channel: '' })}>Clear the filters</button></p>
              ) : oneDay ? (
                <CostsToday sales={k.sales.value} expenses={k.expenses.value} />
              ) : (
                <>
                  <LineArea rows={d.cumulative} xTick={(r) => dayTick(r.day)} xName={(r) => dayName(r.day)} fmt={money} height={190}
                    series={[{ key: 'sales', label: 'Sales so far', area: true }, { key: 'expenses', label: 'Expenses so far', color: 'var(--rose)' }]} />
                  <p className="note r6-note">Running totals for the period — the gap between the lines is your profit so far.</p>
                </>
              )}
            </Card>
            <Card eyebrow="Menu" title="Top 5 dishes"
              action={<Link className="btn btn-ghost btn-sm" href={link(`reports/sales?${new URLSearchParams({ ...Object.fromEntries(period), ...filters })}#dishes`)}>All dishes{Arrow}</Link>}>
              <HBars rows={d.topDishes.map((t) => ({ label: t.name, value: t.revenue, sub: `${num(t.quantity)} sold${t.category ? ` · ${t.category}` : ''}` }))} fmt={money} empty="No dishes sold in this period." />
            </Card>
          </div>

          <div className="r6-now-h"><span className="pill pill-ghost"><span className="pdot" />Right now</span><span className="sub">Today’s position — ignores the period and filters above.</span></div>
          <div className="grid2 rpt-grid r6-two">
            <Card eyebrow="Right now" title="Money in accounts" action={<Link className="btn btn-ghost btn-sm" href={link('cash')}>Cash &amp; accounts{Arrow}</Link>}>
              {!live.money ? (
                <p className="note">The cash book has no starting point yet. <Link href={link('settings')}>Set the opening balances</Link> to see what each account holds.</p>
              ) : (
                <ul className="r6-list">
                  {live.money.accounts.map((a) => (
                    <li key={a.id}>
                      <Link href={link(`cash?tab=book&account=${a.id}`)}>
                        <span className="r6-list-n">{a.label}{a.today ? <span className="sub">{a.today > 0 ? '+' : '−'}{money(Math.abs(a.today))} today</span> : null}</span>
                        <b className="mono">{money(a.balance)}</b>
                      </Link>
                    </li>
                  ))}
                  <li className="r6-row r6-list-total"><span className="r6-list-n">Total</span><b className="mono">{money(live.money.total)}</b></li>
                </ul>
              )}
            </Card>
            <Card eyebrow="Right now" title="Collected today by person" action={<Link className="btn btn-ghost btn-sm" href={link('cash?tab=collections')}>Details{Arrow}</Link>}>
              {live.collections.rows.length === 0 ? (
                <p className="note">Nothing collected by staff yet today.</p>
              ) : (
                <ul className="r6-list">
                  {live.collections.rows.map((r) => <li key={r.staffId} className="r6-row"><span className="r6-list-n">{r.name}</span><b className="mono">{money(r.total)}</b></li>)}
                  <li className="r6-row r6-list-total"><span className="r6-list-n">Total</span><b className="mono">{money(live.collections.total)}</b></li>
                </ul>
              )}
              <p className="note r6-note">Staff collections are handed over to the business at the end of the day.</p>
            </Card>
          </div>

          <Card eyebrow="Latest" title="Recent sales" action={<Link className="btn btn-ghost btn-sm" href={link('sales')}>Sales history{Arrow}</Link>}>
            {d.recent.length === 0 ? <p className="note">No sales in this period.</p> : (
              <ul className="r6-list r6-recent">
                {d.recent.map((o) => (
                  <li key={o.id}>
                    <Link href={link(`sales/${o.id}`)}>
                      <span className="r6-list-n">
                        <span className="mono strong">{o.code}</span>
                        <span className="sub">{whereOf(o)} · {o.accountLabel} · {dateShort(o.closedAt)} {time(o.closedAt)}{o.receiptNo != null ? ` · #${o.receiptNo}` : ''}</span>
                      </span>
                      <b className="mono">{money(o.total)}</b>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

/** One day: are today's sales covering today's costs? */
function CostsToday({ sales, expenses }) {
  const left = sales - expenses;
  return (
    <>
      <HBars rows={[{ label: 'Sales', value: sales }, { label: 'Expenses', value: expenses, color: 'var(--rose)' }]} fmt={money} max={Math.max(sales, expenses) || 1} />
      <p className="note r6-note">{left >= 0 ? <>Sales cover today’s costs with <b className="mono">{money(left)}</b> left over.</> : <>Expenses are <b className="mono">{money(-left)}</b> ahead of sales today.</>}</p>
    </>
  );
}
