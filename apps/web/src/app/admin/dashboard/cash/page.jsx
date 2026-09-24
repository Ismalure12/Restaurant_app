'use client';

import { Suspense, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import { reportSaveError } from '@/lib/saveError';
import { useFormValidation } from '@/lib/formValidation';
import { transferSchema, ownerSchema } from '@/lib/schemas/cash';
import Field from '@/components/admin/Field';
import { ExportBar } from '@/components/admin/reports/ReportKit';
import DateRange from '@/components/admin/DateRange';
import DayCloseTab from '@/components/admin/dayclose/DayCloseTab';
import IfCan from '@/components/admin/IfCan';
import { money } from '@/lib/money';
import { PALETTE } from '@/components/admin/reports/Charts';
import {
  Page, Toolbar, Button, Card, CardHeader, Chip, Kpi, KpiGrid, KpiSkeletons, Select, Segmented,
  Table, Th, Td, Tr, TotalRow, EmptyRow, LoadMoreBar, RowSkeletons, ErrorState, EmptyState, Alert, Modal, ModalSpacer,
  inputCls, selectCls, textareaCls, useBreakpoint, cx,
} from '@/components/admin/ui';

// "+$5.00" / "−$5.00" for movements.
const signed = (n) => (Number(n) < 0 ? '−' : '+') + money(Math.abs(Number(n)));
const pad = (n) => String(n).padStart(2, '0');
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const acctName = (a) => (a.kind === 'cash' ? 'Cash' : a.label);
const KIND_NAME = { cash: 'Cash', wallet: 'Wallet', card: 'Card', bank: 'Bank', gateway: 'Online' };
const ENTRY_KIND = {
  sale: 'Sale', invoice_payment: 'Account payment', refund: 'Refund', adjustment: 'Sale correction', expense: 'Expense',
  salary: 'Salary', transfer: 'Transfer', owner_in: 'Owner put in', owner_out: 'Owner took out', over_short: 'Count difference',
};
const TABS = [['balances', 'Balances'], ['book', 'Cash book'], ['collections', 'Collections'], ['transfers', 'Transfers & owner'], ['day-close', 'Day close']];
const stamp = (d) => new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const shortDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };
const amountTone = (n) => (Number(n) < 0 ? 'text-mq-danger-ink' : Number(n) > 0 ? 'text-mq-ok-ink' : 'text-mq-muted');

// The one place account balances are read — every tab needs the account list.
function useBalances() {
  return useQuery({ queryKey: ['account-balances'], queryFn: () => fetchJson('/api/admin/accounts?balances=1'), staleTime: 30 * 1000 });
}

export default function CashRoute() {
  return <Suspense fallback={null}><CashPage /></Suspense>;
}

/**
 * Money › Cash & accounts: Balances · Cash book · Collections · Transfers &
 * owner · Day close (?tab=). Transfer money / Owner money sit in the header
 * for people who may act on this page.
 */
function CashPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const bp = useBreakpoint();
  const tab = TABS.some(([k]) => k === sp.get('tab')) ? sp.get('tab') : 'balances';
  const accountParam = sp.get('account') || '';
  const dayParam = /^\d{4}-\d{2}-\d{2}$/.test(sp.get('day') || '') ? sp.get('day') : '';
  const [dialog, setDialog] = useState(null); // 'transfer' | 'owner'

  const hrefOf = (t, extra = {}) => {
    const q = new URLSearchParams();
    if (t !== 'balances') q.set('tab', t);
    Object.entries(extra).forEach(([k, v]) => v && q.set(k, v));
    const s = q.toString();
    return s ? `${pathname}?${s}` : pathname;
  };
  const go = (t, extra) => router.replace(hrefOf(t, extra), { scroll: false });

  // Design: the section switch is a segmented control, the money actions sit at the right.
  return (
    <Page>
      <Toolbar>
        <Segmented label="Cash & accounts" value={tab} options={TABS.map(([k, l]) => ({ value: k, label: l, href: hrefOf(k) }))} />
        <span className="flex-1" />
        <IfCan page="cash">
          <div className="flex items-center gap-2.5 flex-wrap">
            <Button variant="secondary" size={bp === 'phone' ? 'lg' : 'md'} icon="transfer" onClick={() => setDialog('transfer')}>Transfer money</Button>
            <Button variant="primary" size={bp === 'phone' ? 'lg' : 'md'} icon="plus" onClick={() => setDialog('owner')}>Owner money</Button>
          </div>
        </IfCan>
      </Toolbar>
      {tab === 'balances' && <BalancesTab />}
      {tab === 'book' && <CashBookTab accountParam={accountParam} onAccount={(id) => go('book', { account: id })} />}
      {tab === 'collections' && <CollectionsTab />}
      {tab === 'transfers' && <TransfersTab />}
      {tab === 'day-close' && <DayCloseTab dayParam={dayParam} onDay={(d) => go('day-close', { day: d })} />}
      {dialog === 'transfer' && <TransferDialog onClose={() => setDialog(null)} />}
      {dialog === 'owner' && <OwnerDialog onClose={() => setDialog(null)} />}
    </Page>
  );
}

function OpeningPrompt({ children }) {
  return (
    <Alert
      tone="info"
      title="Set opening balances"
      action={<Button href="/admin/dashboard/settings/money" variant="primary" size="sm">Set opening balances</Button>}
    >
      {children}
    </Alert>
  );
}

// ── Balances ────────────────────────────────────────────────────────────
function BalancesTab() {
  const q = useBalances();
  if (q.isLoading) return <><KpiSkeletons count={2} min={210} /><KpiSkeletons count={4} min={260} /></>;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} title="Couldn’t load the balances" />;
  const data = q.data;
  const accounts = (data?.accounts || []).filter((a) => a.isActive);
  const noOpening = !data?.openingDate;

  return (
    <>
      {noOpening ? (
        <OpeningPrompt>Balances start from the money each account held on your opening date. Enter them in Settings to see what every account holds now.</OpeningPrompt>
      ) : (
        <KpiGrid min={210}>
          <Kpi label="Total across accounts" value={money(data.total)} foot={`${accounts.length} ${accounts.length === 1 ? 'account' : 'accounts'} · since ${shortDay(data.openingDate)}`} />
          <Kpi
            label="Net today"
            value={<span className={Number(data.today) < 0 ? 'text-mq-danger-ink' : undefined}>{signed(data.today)}</span>}
            foot="money in less money out, all accounts"
          />
        </KpiGrid>
      )}
      {accounts.length === 0 ? (
        <Card><EmptyState icon="cash" title="No accounts yet" action={<Button href="/admin/dashboard/settings/money" variant="soft" size="sm">Open Settings › Money</Button>}>Add business accounts in Settings.</EmptyState></Card>
      ) : (
        <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))' }}>
          {accounts.map((a, i) => (
            <Link
              key={a.id}
              href={`/admin/dashboard/cash?tab=book&account=${a.id}`}
              className="flex flex-col gap-2.5 p-[18px] bg-white border border-mq-line rounded-xl shadow-mq-card text-mq-ink transition-[border-color,box-shadow] hover:border-mq-focus hover:shadow-mq-md focus-visible:outline-none focus-visible:shadow-mq-focus"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-[3px] flex-none" style={{ background: PALETTE[i % PALETTE.length] }} aria-hidden="true" />
                <span className="text-sm font-semibold truncate">{acctName(a)}</span>
                <span className="ml-auto text-[11px] font-semibold uppercase tracking-[.08em] text-mq-muted">{KIND_NAME[a.kind] || a.kind}</span>
              </span>
              <span className={cx('font-mq-mono tabular-nums text-[28px] font-medium tracking-[-.03em] leading-[1.1] break-words', a.balance != null && Number(a.balance) < 0 && 'text-mq-danger-ink')}>
                {a.balance == null ? '—' : money(a.balance)}
              </span>
              <span className="flex justify-between gap-2 text-[12.5px]">
                <span className="text-mq-on-tint font-mq-mono truncate">{a.number || KIND_NAME[a.kind] || ''}</span>
                {Number(a.today) === 0
                  ? <span className="text-mq-muted whitespace-nowrap">no movement today</span>
                  : <span className={cx('font-semibold whitespace-nowrap font-mq-mono tabular-nums', amountTone(a.today))}>{signed(a.today)} today</span>}
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

// ── Cash book ───────────────────────────────────────────────────────────
function CashBookTab({ accountParam, onAccount }) {
  const bal = useBalances();
  const accounts = bal.data?.accounts || [];
  const accountId = accountParam || (accounts[0] ? String(accounts[0].id) : '');
  const [range, setRange] = useState(null);
  const onRange = useCallback((from, to) => setRange((r) => (r && r.from === from && r.to === to ? r : { from, to })), []);

  const list = useInfiniteQuery({
    queryKey: ['account-entries', accountId, range?.from, range?.to],
    enabled: Boolean(accountId && range),
    initialPageParam: null,
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams({ from: range.from, to: range.to });
      if (pageParam) p.set('cursor', pageParam);
      return fetchJson(`/api/admin/accounts/${accountId}/entries?${p}`);
    },
    getNextPageParam: (last) => last.nextCursor || undefined,
  });

  const pages = list.data?.pages || [];
  const first = pages[0];
  const totals = first?.totals;
  const openingDate = first?.openingDate;
  const rows = pages.flatMap((p) => p.rows || []);
  // The API gives the opening balance once and rows oldest-first, so the
  // running balance is opening + everything up to this row. Rows dated before
  // the opening date never count toward it, so they show no balance.
  const run = [];
  if (totals) {
    let acc = totals.opening;
    for (const r of rows) {
      if (openingDate && r.day >= openingDate) { acc = Math.round((acc + r.amount) * 100) / 100; run.push(acc); } else run.push(null);
    }
  }
  const exportHref = (format) => (accountId && range ? `/api/admin/accounts/${accountId}/entries?${new URLSearchParams({ from: range.from, to: range.to, format })}` : undefined);
  const loading = bal.isLoading || (accountId && (!range || list.isLoading));

  return (
    <>
      {bal.isError || list.isError ? null : loading ? <KpiSkeletons count={4} min={210} /> : totals ? (
        <KpiGrid min={210}>
          <Kpi label="Opening" value={money(totals.opening)} foot={`on ${shortDay(totals.from)}`} />
          <Kpi label="Money in" value={<span className="text-mq-ok-ink">+{money(totals.moneyIn)}</span>} foot="sales, payments, transfers in" />
          <Kpi label="Money out" value={<span className="text-mq-danger-ink">−{money(totals.moneyOut)}</span>} foot="expenses, refunds, transfers out" />
          <Kpi label="Closing" value={money(totals.closing)} foot={`on ${shortDay(totals.to)}`} />
        </KpiGrid>
      ) : accountId && !openingDate && first ? (
        <OpeningPrompt>Opening balances aren’t set yet, so there is no opening or closing balance to show.</OpeningPrompt>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader
          title="Cash book"
          count={first ? rows.length : null}
          actions={(
            <>
              <DateRange defaultPreset="today" onChange={onRange} />
              <Select
                size="sm"
                className="w-auto min-w-[150px]"
                value={accountId}
                onChange={(e) => onAccount(e.target.value)}
                aria-label="Account"
                disabled={!accounts.length}
              >
                {accounts.map((a) => <option key={a.id} value={a.id}>{acctName(a)}{a.isActive ? '' : ' (inactive)'}</option>)}
              </Select>
              {exportHref('xlsx') && <ExportBar size="xs" print={false} excel={exportHref('xlsx')} csv={[{ label: 'Cash book', href: exportHref('csv') }]} />}
            </>
          )}
        />
        {bal.isError || list.isError ? (
          <div className="p-4"><ErrorState error={bal.error || list.error} onRetry={() => { bal.refetch(); list.refetch(); }} /></div>
        ) : loading ? <RowSkeletons rows={5} /> : !accountId ? (
          <EmptyState icon="cash" title="No accounts yet">Add business accounts in Settings › Money.</EmptyState>
        ) : (
          <Table maxH={440} minW={860} label="Cash book">
            <thead>
              <tr><Th>When</Th><Th>What</Th><Th>Note</Th><Th>Order</Th><Th>Collected by</Th><Th align="right">Amount</Th><Th align="right">Balance</Th></tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow cols={7}>Nothing went in or out of this account in the chosen days.</EmptyRow>
              ) : rows.map((r, i) => (
                <Tr key={r.id}>
                  <Td className="whitespace-nowrap">{stamp(r.at)}</Td>
                  <Td strong className="whitespace-nowrap">{ENTRY_KIND[r.kind] || r.kind}</Td>
                  <Td className="text-mq-on-tint">{r.note || '—'}</Td>
                  <Td mono className="whitespace-nowrap">
                    {r.order ? <Link href={`/admin/dashboard/sales/${r.order.id}`} className="text-mq-cta font-semibold hover:text-mq-primary">{r.order.code}</Link> : '—'}
                  </Td>
                  <Td>{r.collectedBy || '—'}</Td>
                  <Td money className={cx('font-semibold', amountTone(r.amount))}>{signed(r.amount)}</Td>
                  <Td money>{run[i] == null ? '—' : money(run[i])}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        {!loading && !list.isError && accountId && (
          <LoadMoreBar shown={rows.length} hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onMore={() => list.fetchNextPage()} noun={rows.length === 1 ? 'movement' : 'movements'} />
        )}
      </Card>
    </>
  );
}

// ── Collections ─────────────────────────────────────────────────────────
function CollectionsTab() {
  const [day, setDay] = useState(todayISO);
  const q = useQuery({
    queryKey: ['collections', day],
    queryFn: () => fetchJson(`/api/admin/collections?day=${day}`),
    placeholderData: keepPreviousData,
  });
  const data = q.data;
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Collections"
        sub="Handed over to the business automatically."
        actions={(
          <input
            className={inputCls({ size: 'sm', className: 'w-auto' })}
            type="date"
            value={day}
            max={todayISO()}
            onChange={(e) => e.target.value && setDay(e.target.value)}
            aria-label="Day"
          />
        )}
      />
      {q.isLoading ? <RowSkeletons rows={4} /> : q.isError ? (
        <div className="p-4"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>
      ) : !data || data.rows.length === 0 ? (
        <EmptyState icon="user" title="Nothing collected">No staff member took payments on {shortDay(day)}.</EmptyState>
      ) : (
        <Table maxH={440} minW={420 + data.accounts.length * 110} label="Collections">
          <thead>
            <tr><Th>Person</Th>{data.accounts.map((a) => <Th key={a.id} align="right">{acctName(a)}</Th>)}<Th align="right">Total</Th></tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <Tr key={r.staffId}>
                <Td strong><span className="inline-flex items-center gap-2">{r.name}<Chip tone="plain" dot={false} small className="capitalize">{r.role}</Chip></span></Td>
                {data.accounts.map((a) => <Td key={a.id} money>{r.byAccount[a.id] != null ? money(r.byAccount[a.id]) : <span className="text-mq-muted">—</span>}</Td>)}
                <Td money className="font-semibold">{money(r.total)}</Td>
              </Tr>
            ))}
          </tbody>
          <tfoot>
            <TotalRow>
              <Td>Total</Td>
              {data.accounts.map((a) => <Td key={a.id} money>{money(data.totals[a.id])}</Td>)}
              <Td money>{money(data.total)}</Td>
            </TotalRow>
          </tfoot>
        </Table>
      )}
    </Card>
  );
}

// ── Transfers & owner ───────────────────────────────────────────────────
const MOVE_KIND = { transfer: ['Transfer', 'info'], owner_out: ['Drawings', 'warn'], owner_in: ['Capital', 'ok'] };

function TransfersTab() {
  const [range, setRange] = useState(null);
  const onRange = useCallback((from, to) => setRange((r) => (r && r.from === from && r.to === to ? r : { from, to })), []);
  const list = useInfiniteQuery({
    queryKey: ['account-transfers', range?.from, range?.to],
    enabled: Boolean(range),
    initialPageParam: null,
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams({ from: range.from, to: range.to });
      if (pageParam) p.set('cursor', pageParam);
      return fetchJson(`/api/admin/accounts/transfers?${p}`);
    },
    getNextPageParam: (last) => last.nextCursor || undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.rows || []) ?? [];
  const loading = !range || list.isLoading;

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Transfers & owner money"
        count={list.data ? rows.length : null}
        actions={<DateRange defaultPreset="30d" onChange={onRange} />}
      />
      {list.isError ? (
        <div className="p-4"><ErrorState error={list.error} onRetry={() => list.refetch()} /></div>
      ) : loading ? <RowSkeletons rows={4} /> : (
        <Table maxH={440} minW={720} label="Transfers and owner money">
          <thead><tr><Th>When</Th><Th>Kind</Th><Th>From → to</Th><Th>Note</Th><Th align="right">Amount</Th></tr></thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow cols={5}>No transfers or owner money in these days. Every one also appears in its account’s Cash book.</EmptyRow>
            ) : rows.map((r) => {
              const [label, tone] = MOVE_KIND[r.kind] || [r.kind, 'off'];
              return (
                <Tr key={r.id}>
                  <Td className="whitespace-nowrap">{stamp(r.at)}</Td>
                  <Td><Chip tone={tone} small>{label}</Chip></Td>
                  <Td className="whitespace-nowrap">{r.from?.label || 'Owner'} → {r.to?.label || 'Owner'}</Td>
                  <Td className="text-mq-on-tint">{r.note || '—'}{r.by && <span className="text-mq-muted"> · {r.by}</span>}</Td>
                  <Td money>{money(r.amount)}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      )}
      {!loading && !list.isError && (
        <LoadMoreBar shown={rows.length} hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onMore={() => list.fetchNextPage()} noun={rows.length === 1 ? 'entry' : 'entries'} />
      )}
    </Card>
  );
}

// ── Dialogs ─────────────────────────────────────────────────────────────
function useRefreshMoney() {
  const qc = useQueryClient();
  return () => {
    ['account-balances', 'money-accounts', 'account-entries', 'account-transfers'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };
}

function AccountOptions({ accounts, skipGateway }) {
  return accounts.filter((a) => a.isActive && !(skipGateway && a.kind === 'gateway')).map((a) => (
    <option key={a.id} value={a.id}>{acctName(a)}</option>
  ));
}

function DialogFooter({ formId, busy, disabled, label, busyLabel, onClose }) {
  return (
    <>
      <ModalSpacer />
      <Button variant="secondary" size="lg" onClick={onClose} disabled={busy}>Cancel</Button>
      <Button variant="primary" size="lg" type="submit" form={formId} disabled={busy || disabled}>{busy ? busyLabel : label}</Button>
    </>
  );
}

function AmountDayNote({ f, setF, form }) {
  return (
    <>
      <div className="grid grid-cols-1 tab:grid-cols-2 gap-3.5">
        <Field label="Amount ($)" required {...form.fieldProps('amount')}>
          <input className={inputCls({ size: 'lg', mono: true })} type="number" min="0" step="0.01" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="0.00" />
        </Field>
        <Field label="Date" required {...form.fieldProps('day')}>
          <input className={inputCls({ size: 'lg' })} type="date" value={f.day} max={todayISO()} onChange={(e) => setF({ ...f, day: e.target.value })} />
        </Field>
      </div>
      <Field label="Note" {...form.fieldProps('note')}>
        <textarea className={textareaCls('min-h-[64px]')} rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Optional" />
      </Field>
    </>
  );
}

function TransferDialog({ onClose }) {
  const bal = useBalances();
  const accounts = bal.data?.accounts || [];
  const refresh = useRefreshMoney();
  const [f, setF] = useState({ from: '', to: '', amount: '', day: todayISO(), note: '' });
  const form = useFormValidation(transferSchema, f);
  const save = useMutation({
    mutationFn: (payload) => fetchJson('/api/admin/accounts/transfer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
    onSuccess: (d) => { notify.success(`Moved ${money(d.amount)} from ${d.from} to ${d.to}`, { title: 'Could not move the money' }); refresh(); onClose(); },
    onError: (e) => reportSaveError(e, { form, title: 'Could not move the money' }),
  });
  const submit = (e) => {
    e.preventDefault();
    if (!form.check() || save.isPending) return;
    form.setServerErrors(null);
    save.mutate({ fromAccountId: Number(f.from), toAccountId: Number(f.to), amount: Number(f.amount), day: f.day || undefined, note: f.note.trim() || null });
  };
  return (
    <Modal
      title="Transfer money"
      eyebrow="Between accounts"
      sub="Cash to the bank, a payout from online payments, wallet money withdrawn to cash."
      icon="transfer"
      onClose={onClose}
      busy={save.isPending}
      footer={<DialogFooter formId="cash-transfer" busy={save.isPending} disabled={bal.isLoading || !form.valid} label="Transfer" busyLabel="Saving…" onClose={onClose} />}
    >
      <form id="cash-transfer" noValidate onSubmit={submit} className="flex flex-col gap-3.5">
        <div className="grid grid-cols-1 tab:grid-cols-2 gap-3.5">
          <Field label="From" required {...form.fieldProps('from')}>
            <select className={selectCls({ size: 'lg' })} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })}><option value="">Choose…</option><AccountOptions accounts={accounts} /></select>
          </Field>
          <Field label="To" required {...form.fieldProps('to')}>
            <select className={selectCls({ size: 'lg' })} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })}><option value="">Choose…</option><AccountOptions accounts={accounts} skipGateway /></select>
          </Field>
        </div>
        <AmountDayNote f={f} setF={setF} form={form} />
      </form>
    </Modal>
  );
}

function OwnerDialog({ onClose }) {
  const bal = useBalances();
  const accounts = bal.data?.accounts || [];
  const refresh = useRefreshMoney();
  const [f, setF] = useState({ account: '', direction: 'in', amount: '', day: todayISO(), note: '' });
  const form = useFormValidation(ownerSchema, f);
  const save = useMutation({
    mutationFn: (payload) => fetchJson('/api/admin/accounts/owner', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
    onSuccess: (d) => { notify.success(d.direction === 'in' ? `Owner put in ${money(d.amount)} (${d.account})` : `Owner took out ${money(d.amount)} (${d.account})`, { title: 'Could not record the owner money' }); refresh(); onClose(); },
    onError: (e) => reportSaveError(e, { form, title: 'Could not record the owner money' }),
  });
  const submit = (e) => {
    e.preventDefault();
    if (!form.check() || save.isPending) return;
    form.setServerErrors(null);
    save.mutate({ accountId: Number(f.account), direction: f.direction, amount: Number(f.amount), day: f.day || undefined, note: f.note.trim() || null });
  };
  return (
    <Modal
      title="Owner money"
      eyebrow="Capital & drawings"
      sub="Kept apart from expenses so profit stays honest."
      icon="cash"
      onClose={onClose}
      busy={save.isPending}
      footer={<DialogFooter formId="cash-owner" busy={save.isPending} disabled={bal.isLoading || !form.valid} label="Save" busyLabel="Saving…" onClose={onClose} />}
    >
      <form id="cash-owner" noValidate onSubmit={submit} className="flex flex-col gap-3.5">
        <Segmented
          label="Direction"
          size="lg"
          className="self-start"
          value={f.direction}
          onChange={(v) => setF({ ...f, direction: v })}
          options={[{ value: 'in', label: 'Owner puts money in' }, { value: 'out', label: 'Owner takes money out' }]}
        />
        <Field label="Account" required {...form.fieldProps('account')}>
          <select className={selectCls({ size: 'lg' })} value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })}><option value="">Choose…</option><AccountOptions accounts={accounts} skipGateway /></select>
        </Field>
        <AmountDayNote f={f} setF={setF} form={form} />
      </form>
    </Modal>
  );
}

