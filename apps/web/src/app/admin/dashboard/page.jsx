'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchJson, parseApiError } from '@/lib/apiError';
import useStaffList from '@/hooks/useStaffList';
import useOrderCounts from '@/hooks/useOrderCounts';
import SaleDrawer from '@/components/admin/orders/SaleDrawer';
import {
  ActiveFilters, ChannelSelect, FilterSelect, FiltersButton, PeriodPicker, RangeNote, CHANNEL_OPTIONS,
  compactMoney, compareLabel, comparisonRange, money, num, periodParams, rangeLabel, useAccountOptions, useReportParams,
} from '@/components/admin/reports/ReportKit';
import { Columns, Donut, HBars, LineArea, Sparkline, StackBar, PALETTE } from '@/components/admin/reports/Charts';
import {
  Page, Toolbar, SectionLabel, Card, CardHeader, Button, Chip, Icon, Kpi, KpiGrid, Delta, ProgressBar, MiniBars,
  Table, Th, Td, Tr, TotalRow, EmptyRow, ErrorState, KpiSkeletons, Skeleton, cx,
} from '@/components/admin/ui';

const FILTERS = ['staffId', 'waiterId', 'account', 'channel'];
const link = (path) => `/admin/dashboard/${path}`;
const hm = (d) => (d ? new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');
const dateShort = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const whereOf = (o) => (o.tableNumber ? `Table ${o.tableNumber}` : o.customer || (o.orderType === 'delivery' ? 'Delivery' : 'Walk-in'));
const hh = (h) => `${String(h).padStart(2, '0')}:00`;
const addDay = (d, n) => { const x = new Date(`${d}T00:00:00`); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const dayTick = (d) => `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`;
const dayName = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const initials = (s) => (s || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const CHANNEL_COLOR = { dine_in: '#850D33', delivery: '#B06A00', online: '#1F6FB2' };

/** "$4,812" with the cents a size down (KPI values). */
function BigMoney({ value }) {
  const s = money(value);
  const i = s.lastIndexOf('.');
  return <>{s.slice(0, i)}<span className="text-[.6em] text-mq-muted">{s.slice(i)}</span></>;
}

function OverviewSkeleton() {
  return (
    <>
      <KpiSkeletons count={4} min={216} />
      <Skeleton className="h-[300px] rounded-xl" />
      <div className="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))]">
        <Skeleton className="h-[260px] rounded-xl" /><Skeleton className="h-[260px] rounded-xl" /><Skeleton className="h-[260px] rounded-xl" />
      </div>
    </>
  );
}

/**
 * Overview — the manager's decision page (GET /api/admin/overview). Top to
 * bottom: what needs doing now, the period's four numbers against a meaningful
 * comparison, the sales trend, whether sales cover the costs, the best
 * sellers and where the sales came from; then (ignoring the period) today's
 * money position and the latest sales. Detail lives in the Sales report.
 */
export default function OverviewPage() {
  return (
    <Suspense fallback={<Page><OverviewSkeleton /></Page>}>
      <Overview />
    </Suspense>
  );
}

function Overview() {
  const router = useRouter();
  const { preset, range, filters, set, query } = useReportParams('7d', FILTERS);
  const cmp = comparisonRange(preset, range);
  const vs = compareLabel(preset);
  const apiQuery = `${query}&cfrom=${cmp.from}&cto=${cmp.to}`;
  const q = useQuery({ queryKey: ['overview', apiQuery], queryFn: () => fetchJson(`/api/admin/overview?${apiQuery}`), refetchInterval: 60_000 });
  const d = q.data;
  // Own key: nothing else caches under it. Manager tier — a 403 just hides the prompt.
  const dc = useQuery({ queryKey: ['day-close-overview'], queryFn: () => fetchJson('/api/admin/day-close'), refetchInterval: 5 * 60_000, retry: false });
  const unclosed = dc.data?.unclosed || [];
  const { stuckPayments } = useOrderCounts();
  const accounts = useAccountOptions();
  const { staff, denied } = useStaffList();
  const [drawer, setDrawer] = useState(null);

  const people = useMemo(() => staff.map((s) => ({ value: String(s.id), label: s.name || s.email, role: s.role })), [staff]);
  const cashiers = people.filter((p) => p.role !== 'waiter');
  const labelOfOpt = (opts, v) => opts.find((o) => o.value === v)?.label || v;
  const active = FILTERS.filter((k) => filters[k]).length;
  const clear = () => set({ staffId: '', waiterId: '', account: '', channel: '' });
  const chipItems = [
    filters.staffId && { key: 'staffId', label: `Cashier: ${labelOfOpt(people, filters.staffId)}`, onRemove: () => set({ staffId: '' }) },
    filters.waiterId && { key: 'waiterId', label: `Served by: ${labelOfOpt(people, filters.waiterId)}`, onRemove: () => set({ waiterId: '' }) },
    filters.account && { key: 'account', label: `Account: ${labelOfOpt(accounts, filters.account)}`, onRemove: () => set({ account: '' }) },
    filters.channel && { key: 'channel', label: `Channel: ${labelOfOpt(CHANNEL_OPTIONS, filters.channel)}`, onRemove: () => set({ channel: '' }) },
  ].filter(Boolean);

  const period = new URLSearchParams(periodParams(preset, range));
  const salesHref = link(`reports/sales?${new URLSearchParams({ ...Object.fromEntries(period), ...filters })}`);
  const dishesHref = `${salesHref}#dishes`;

  const k = d?.kpis;
  const live = d?.live;
  const oneDay = (d?.range?.days ?? 0) === 1;

  const trendRows = useMemo(() => {
    if (!d) return [];
    if (d.range.days === 1) {
      const cmpDay = dayName(d.previous.from);
      return d.hours.map((h) => ({ key: h.hour, tick: hh(h.hour), name: `${hh(h.hour)}–${hh(h.hour + 1)}`, value: h.sales, prev: h.previous, prevName: `${cmpDay} ${hh(h.hour)}` }));
    }
    return d.trend.map((t, i) => ({ key: t.day, tick: dayTick(t.day), name: dayName(t.day), value: t.sales, sub: `${num(t.orders)} ${t.orders === 1 ? 'sale' : 'sales'}`, prev: t.previous, prevName: dayName(addDay(d.previous.from, i)) }));
  }, [d]);

  // Top dishes donut: the top 5 + "Other dishes" (itemsValue = every dish sold).
  const dishSegs = useMemo(() => {
    if (!d) return [];
    // PALETTE order = Sales report › How customers paid.
    const top = d.topDishes.map((t, i) => ({ label: t.name, value: t.revenue, color: PALETTE[i] }));
    const rest = Math.round(((d.itemsValue || 0) - top.reduce((n, t) => n + t.value, 0)) * 100) / 100;
    return rest > 0 ? [...top, { label: 'Other dishes', value: rest, color: '#9A9A93' }] : top;
  }, [d]);

  // "Needs you" — oldest first; each chip opens the page that settles it.
  const needs = [
    unclosed.length > 0 && { key: 'close', label: `Close ${dayName(unclosed[0])}`, n: unclosed.length, href: link(`cash?tab=day-close&day=${unclosed[0]}`) },
    stuckPayments > 0 && { key: 'stuck', label: 'Stuck payment', n: stuckPayments, href: link('orders?tab=payments'), danger: true },
    live?.awaitingDecision > 0 && { key: 'online', label: 'Online orders to accept', n: live.awaitingDecision, href: link('orders') },
    live?.unpaid.count > 0 && { key: 'unpaid', label: `Unpaid tabs · ${money(live.unpaid.total)}`, n: live.unpaid.count, href: link('orders?pay=unpaid') },
    live?.lowStock.count > 0 && { key: 'stock', label: 'Items below par', n: live.lowStock.count, href: link('inventory'), title: live.lowStock.items.map((i) => i.name).join(', ') },
    live?.salariesToPay > 0 && { key: 'salary', label: 'Salaries to pay', n: live.salariesToPay, href: link('users?tab=payroll') },
  ].filter(Boolean);

  const moneyToday = live?.money ? live.money.accounts.reduce((n, a) => n + (a.today || 0), 0) : 0;
  const acctRows = live?.money ? live.money.accounts.map((a, i) => ({ ...a, color: PALETTE[i % PALETTE.length] })) : [];

  return (
    <Page>
      <Toolbar className="rpt-noprint">
        <PeriodPicker preset={preset} range={range} set={set} />
        <FiltersButton active={active} onClear={clear}>
          {!denied && people.length > 0 && (
            <>
              <FilterSelect label="Cashier" value={filters.staffId} options={cashiers} onChange={(v) => set({ staffId: v })} />
              <FilterSelect label="Served by" value={filters.waiterId} options={people} onChange={(v) => set({ waiterId: v })} />
            </>
          )}
          <FilterSelect label="Account" value={filters.account} options={accounts} onChange={(v) => set({ account: v })} />
          <ChannelSelect value={filters.channel} onChange={(v) => set({ channel: v })} />
        </FiltersButton>
        <span className="flex-1" />
        <RangeNote preset={preset} range={range} />
      </Toolbar>
      <ActiveFilters items={chipItems} onClear={clear} />

      {needs.length > 0 && (
        <section aria-label="Needs attention" className="flex items-stretch gap-2.5 flex-wrap px-3.5 py-3 rounded-xl border border-mq-warn-line bg-mq-warn-bg">
          <span className="grid place-items-center w-8 h-8 rounded-[9px] bg-mq-warn text-white flex-none"><Icon name="alert" size={17} stroke={2.1} /></span>
          <span className="flex flex-col justify-center gap-px min-w-[160px] flex-[1_1_200px] text-mq-warn-ink">
            <span className="text-[13.5px] font-semibold">{needs.length} {needs.length === 1 ? 'thing needs' : 'things need'} you</span>
            <span className="text-[12.5px]">Oldest first.</span>
          </span>
          <span className="flex items-center gap-2 flex-wrap">
            {needs.map((c) => (
              <Link
                key={c.key}
                href={c.href}
                title={c.title}
                className={cx(
                  'inline-flex items-center gap-2 h-9 max-nar:h-11 px-3 rounded-full border bg-white text-[12.5px] font-semibold whitespace-nowrap transition-colors',
                  c.danger ? 'border-mq-danger-line text-mq-danger-ink hover:border-mq-danger' : 'border-mq-warn-line text-mq-warn-ink hover:border-mq-warn',
                )}
              >
                {c.label}
                <span className={cx('font-mq-mono rounded-full px-1.5 tabular-nums', c.danger ? 'bg-mq-danger-bg' : 'bg-mq-warn-bg')}>{c.n}</span>
              </Link>
            ))}
          </span>
        </section>
      )}

      {q.isError && !d ? (
        <ErrorState error={{ message: parseApiError(q.error) }} onRetry={() => q.refetch()} title="Couldn’t load the overview" />
      ) : q.isLoading || !d ? <OverviewSkeleton /> : (
        <>
          <KpiGrid min={216}>
            <Kpi
              big
              label="Net sales"
              href={salesHref}
              badge={<Delta value={k.sales.value} previous={k.sales.previous} />}
              value={<BigMoney value={k.sales.value} />}
              visual={<Sparkline values={oneDay ? d.hours.map((h) => h.sales) : d.trend.map((t) => t.sales)} prev={oneDay ? d.hours.map((h) => h.previous) : d.trend.map((t) => t.previous)} />}
              foot={<>vs <span className="font-mq-mono">{money(k.sales.previous)}</span> {vs.replace(/^vs /, '')}</>}
            />
            <Kpi
              big
              label="Orders"
              href={link(`sales?${query}`)}
              badge={<Delta value={k.orders.value} previous={k.orders.previous} />}
              value={num(k.orders.value)}
              visual={!oneDay && d.trend.some((t) => t.orders > 0) ? <MiniBars values={d.trend.map((t) => t.orders)} height={34} /> : null}
              foot={<>avg ticket <b className="font-mq-mono font-semibold text-mq-body">{money(k.avgTicket.value)}</b></>}
            />
            <Kpi
              big
              label="Net profit"
              href={link(`reports/financial?${period}`)}
              className={k.profit.applies ? undefined : 'opacity-70'}
              badge={k.profit.applies ? <Delta value={k.profit.value} previous={k.profit.previous} /> : null}
              value={k.profit.applies ? <BigMoney value={k.profit.value} /> : '—'}
              visual={k.profit.applies && k.margin != null ? <div className="flex items-center h-[34px]"><ProgressBar className="w-full" pct={Math.max(0, k.margin)} tone={k.margin >= 0 ? 'bg-mq-primary' : 'bg-mq-danger'} /></div> : null}
              foot={k.profit.applies
                ? (k.margin != null
                  ? <>margin <b className="font-mq-mono font-semibold text-mq-body">{Math.round(k.margin)}%</b> · expenses <span className="font-mq-mono">{money(k.expenses.value)}</span></>
                  : 'No sales yet in this period')
                : 'Doesn’t apply when filtered — expenses belong to the whole business. Clear the filters.'}
            />
            {live.money ? (
              <Kpi
                big
                label="Money in accounts"
                href={link('cash')}
                badge={<span className="text-[11px] font-semibold uppercase tracking-[.08em] text-mq-info-ink bg-mq-info-bg rounded-full px-[7px] py-0.5">now</span>}
                value={<BigMoney value={live.money.total} />}
                visual={acctRows.some((a) => a.balance > 0) ? (
                  <span className="flex items-end gap-1 h-[34px]" aria-hidden="true">
                    {acctRows.filter((a) => a.balance > 0).map((a) => (
                      <span key={a.id} className="h-full rounded-t-[3px]" style={{ flex: a.balance, background: a.color }} title={`${a.label} ${money(a.balance)}`} />
                    ))}
                  </span>
                ) : null}
                foot={moneyToday
                  ? <span className={cx('font-semibold', moneyToday > 0 ? 'text-mq-ok-ink' : 'text-mq-danger-ink')}>{moneyToday > 0 ? '+' : '−'}{money(Math.abs(moneyToday))} today</span>
                  : 'No movement today'}
              />
            ) : (
              <Kpi
                big
                label="Money in accounts"
                href={link('settings/money')}
                value="—"
                foot={<>The cash book has no starting point. <span className="font-semibold text-mq-cta">Set the opening balances →</span></>}
              />
            )}
          </KpiGrid>

          <Card className="overflow-hidden">
            <CardHeader
              chart
              title={oneDay ? 'Sales by hour' : 'Sales by day'}
              sub={`Solid is this period, dashed is ${vs.replace(/^vs /, '')}`}
              actions={<Button href={salesHref} size="xs" iconRight="arrowRight">Sales report</Button>}
            />
            <div className="px-4 pt-4 pb-3.5">
              <Columns rows={trendRows} fmt={money} label="Sales" unit={oneDay ? 'hour' : 'day'} compareLabel={vs} empty="No sales in this period yet." />
            </div>
          </Card>

          <div className="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] items-start">
            <Card className="overflow-hidden">
              <CardHeader
                chart
                title="Covering costs"
                sub={d.filtered ? 'Only without filters' : oneDay ? 'Today’s sales against today’s costs' : 'Running totals — the gap is profit'}
                actions={!d.filtered && (
                  <span className={cx('font-mq-mono text-[13px] font-semibold tabular-nums whitespace-nowrap', k.profit.value >= 0 ? 'text-mq-ok-ink' : 'text-mq-danger-ink')}>
                    {k.profit.value >= 0 ? '+' : '−'}{money(Math.abs(k.profit.value))}
                  </span>
                )}
              />
              <div className="px-4 pt-4 pb-3.5">
                {d.filtered ? (
                  <p className="m-0 text-[13px] text-mq-muted">
                    Expenses belong to the whole business, so this chart only shows without filters.{' '}
                    <button type="button" onClick={clear} className="font-semibold text-mq-cta hover:text-mq-primary">Clear the filters</button>
                  </p>
                ) : oneDay ? (
                  <CostsToday sales={k.sales.value} expenses={k.expenses.value} />
                ) : (
                  <LineArea rows={d.cumulative} xTick={(r) => dayTick(r.day)} xName={(r) => dayName(r.day)} fmt={money} height={190}
                    series={[{ key: 'sales', label: 'Sales so far', area: true, color: '#850D33' }, { key: 'expenses', label: 'Expenses so far', color: '#C8321F' }]} />
                )}
              </div>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader
                chart
                title="Top dishes"
                sub="Share of dish sales in the period"
                actions={<Button href={dishesHref} size="xs" iconRight="arrowRight">All dishes</Button>}
              />
              <div className="px-4 py-[18px]">
                {/* Same donut as Sales report › How customers paid: the top 5 plus
                    everything else, so each share is of ALL dish sales. */}
                <Donut segments={dishSegs} fmt={money} centre={compactMoney(d.itemsValue || 0)} centreLabel="DISHES" size={132} />
              </div>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader chart title="Where the sales came from" sub={`${rangeLabel(range)} · by channel`} />
              <div className="p-4 flex flex-col gap-3.5">
                <StackBar
                  fmt={money}
                  segments={(d.byChannel || []).map((c) => ({ label: c.label, value: c.total, sub: `${num(c.orders)} ${c.orders === 1 ? 'sale' : 'sales'}`, color: CHANNEL_COLOR[c.channel] }))}
                  empty="No sales in this period."
                />
                <p className="m-0 pt-3 border-t border-mq-chip text-xs text-mq-on-tint leading-normal">Dine-in and Delivery are rung up in the restaurant. Online comes through the online menu, eaten in or delivered.</p>
              </div>
            </Card>
          </div>

          <SectionLabel note="Ignores the period and filters">Right now</SectionLabel>
          <div className="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] items-start">
            <Card className="overflow-hidden">
              <CardHeader title="Money in accounts" actions={<Button href={link('cash')} size="xs" iconRight="arrowRight">Cash &amp; accounts</Button>} />
              {!live.money ? (
                <p className="m-0 p-4 text-[13px] text-mq-muted">
                  The cash book has no starting point yet. <Link href={link('settings/money')} className="font-semibold text-mq-cta hover:text-mq-primary">Set the opening balances</Link> to see what each account holds.
                </p>
              ) : (
                <Table label="Money in accounts">
                  <tbody>
                    {acctRows.map((a) => (
                      <Tr key={a.id} onClick={() => router.push(link(`cash?tab=book&account=${a.id}`))} label={`${a.label} cash book`}>
                        <Td><span className="inline-flex items-center gap-2 text-mq-ink"><span className="w-[9px] h-[9px] rounded-sm flex-none" style={{ background: a.color }} />{a.label}</span></Td>
                        <Td align="right" className={cx('text-xs font-semibold whitespace-nowrap', a.today > 0 ? 'text-mq-ok-ink' : a.today < 0 ? 'text-mq-danger-ink' : 'text-mq-muted')}>
                          {a.today ? `${a.today > 0 ? '+' : '−'}${money(Math.abs(a.today))}` : '—'}
                        </Td>
                        <Td money>{money(a.balance)}</Td>
                      </Tr>
                    ))}
                    <TotalRow><Td>Total</Td><Td /><Td money>{money(live.money.total)}</Td></TotalRow>
                  </tbody>
                </Table>
              )}
            </Card>

            <Card className="overflow-hidden">
              <CardHeader chart title="Collected today by person" sub="Handed over to the business at day close" actions={<Button href={link('cash?tab=collections')} size="xs" iconRight="arrowRight">Details</Button>} />
              <Table label="Collected today by person">
                <tbody>
                  {live.collections.rows.length === 0 ? (
                    <EmptyRow cols={2}>Nothing collected by staff yet today.</EmptyRow>
                  ) : live.collections.rows.map((r) => (
                    <Tr key={r.staffId}>
                      <Td>
                        <span className="inline-flex items-center gap-2.5 text-mq-ink">
                          <span className="grid place-items-center w-[26px] h-[26px] rounded-lg bg-mq-soft text-mq-primary text-[11px] font-semibold flex-none" aria-hidden="true">{initials(r.name)}</span>
                          {r.name}
                        </span>
                      </Td>
                      <Td money>{money(r.total)}</Td>
                    </Tr>
                  ))}
                  {live.collections.rows.length > 0 && <TotalRow><Td>Total</Td><Td money>{money(live.collections.total)}</Td></TotalRow>}
                </tbody>
              </Table>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <CardHeader
              title="Recent sales"
              count={`${num(k.orders.value)} in period`}
              actions={<Button href={link(`sales?${query}`)} size="xs" iconRight="arrowRight">Sales history</Button>}
            />
            <Table maxH={320} minW={640} label="Recent sales">
              <thead>
                <tr><Th>Receipt</Th><Th>Order ID</Th><Th>Time</Th><Th>Where</Th><Th>Account</Th><Th>Status</Th><Th align="right">Total</Th></tr>
              </thead>
              <tbody>
                {d.recent.length === 0 ? <EmptyRow cols={7}>No sales in this period.</EmptyRow> : d.recent.map((o) => {
                  const onAcct = o.account === 'invoice';
                  return (
                    <Tr key={o.id} onClick={() => setDrawer(o.id)} label={`Open sale ${o.code}`} selected={drawer === o.id}>
                      <Td mono>{o.receiptNo ?? '—'}</Td>
                      <Td mono className="whitespace-nowrap">{o.code}</Td>
                      <Td mono className="whitespace-nowrap">{oneDay ? hm(o.closedAt) : `${dateShort(o.closedAt)} ${hm(o.closedAt)}`}</Td>
                      <Td>{whereOf(o)}</Td>
                      <Td>{o.accountLabel}</Td>
                      <Td><Chip tone={onAcct ? 'info' : 'ok'} small>{onAcct ? 'On account' : 'Paid'}</Chip></Td>
                      <Td money>{money(o.total)}</Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        </>
      )}

      <SaleDrawer orderId={drawer} onClose={() => setDrawer(null)} href={drawer ? link(`sales/${drawer}`) : undefined} />
    </Page>
  );
}

/** One day: are today's sales covering today's costs? */
function CostsToday({ sales, expenses }) {
  const left = sales - expenses;
  return (
    <div className="flex flex-col gap-3">
      <HBars rows={[{ label: 'Sales', value: sales, color: '#850D33' }, { label: 'Expenses', value: expenses, color: '#C8321F' }]} fmt={money} max={Math.max(sales, expenses) || 1} />
      <p className="m-0 text-[12.5px] text-mq-muted">
        {left >= 0
          ? <>Sales cover today’s costs with <b className="font-mq-mono font-semibold text-mq-ink">{money(left)}</b> left over.</>
          : <>Expenses are <b className="font-mq-mono font-semibold text-mq-ink">{money(-left)}</b> ahead of sales today.</>}
      </p>
    </div>
  );
}
