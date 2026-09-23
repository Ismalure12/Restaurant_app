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
import { KpiRowSkeleton, RowsSkeleton } from '@/components/admin/Skeletons';
import DateRange from '@/components/admin/DateRange';
import DayCloseTab from '@/components/admin/dayclose/DayCloseTab';
import { money } from '@/lib/money';
import IfCan from '@/components/admin/IfCan';


// "+$5.00" / "-$5.00" for movements.
const signed = (n) => (Number(n) < 0 ? '-' : '+') + money(Math.abs(Number(n)));
const pad = (n) => String(n).padStart(2, '0');
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const KIND_NAME = { cash: 'Cash', wallet: 'Mobile wallet', card: 'Card', bank: 'Bank', gateway: 'Online payments' };
const ENTRY_KIND = {
  sale: 'Sale', invoice_payment: 'Account payment', refund: 'Refund', adjustment: 'Sale correction', expense: 'Expense',
  salary: 'Salary', transfer: 'Transfer', owner_in: 'Owner put in', owner_out: 'Owner took out', over_short: 'Count difference',
};
const TABS = [['balances', 'Balances'], ['book', 'Cash book'], ['collections', 'Collections'], ['transfers', 'Transfers & owner'], ['day-close', 'Day close']];
const WalletIc = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 12V8H6a2 2 0 0 1 0-4h12v4" /><path d="M4 6v12a2 2 0 0 0 2 2h14v-4" /><path d="M18 12a2 2 0 0 0 0 4h4v-4z" /></svg>;
const CloseIc = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg>;

// The one place account balances are read — every tab needs the account list.
function useBalances() {
  return useQuery({ queryKey: ['account-balances'], queryFn: () => fetchJson('/api/admin/accounts?balances=1'), staleTime: 30 * 1000 });
}

export default function CashRoute() {
  return <Suspense fallback={null}><CashPage /></Suspense>;
}

function CashPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = TABS.some(([k]) => k === sp.get('tab')) ? sp.get('tab') : 'balances';
  const accountParam = sp.get('account') || '';
  const dayParam = /^\d{4}-\d{2}-\d{2}$/.test(sp.get('day') || '') ? sp.get('day') : '';

  const go = (t, extra = {}) => {
    const q = new URLSearchParams();
    if (t !== 'balances') q.set('tab', t);
    Object.entries(extra).forEach(([k, v]) => v && q.set(k, v));
    const s = q.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  return (
    <div className="wrap cash">
      <div className="toolbar">
        <div className="seg" role="tablist" aria-label="Cash & accounts">
          {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => go(k)}>{l}</button>)}
        </div>
      </div>
      {tab === 'balances' && <BalancesTab />}
      {tab === 'book' && <CashBookTab accountParam={accountParam} onAccount={(id) => go('book', { account: id })} />}
      {tab === 'collections' && <CollectionsTab />}
      {tab === 'transfers' && <TransfersTab />}
      {tab === 'day-close' && <DayCloseTab dayParam={dayParam} onDay={(d) => go('day-close', { day: d })} />}
    </div>
  );
}

function ErrorBox({ onRetry, what }) {
  return (
    <div className="card-pad">
      <div className="adm-error-banner">Couldn&rsquo;t load {what}. <button className="btn btn-ghost btn-sm" onClick={onRetry}>Try again</button></div>
    </div>
  );
}

// ── Balances ────────────────────────────────────────────────────────────
function BalancesTab() {
  const q = useBalances();
  const data = q.data;
  if (q.isLoading) return <><KpiRowSkeleton count={4} /></>;
  if (q.isError) return <div className="card"><ErrorBox what="balances" onRetry={() => q.refetch()} /></div>;
  const accounts = (data?.accounts || []).filter((a) => a.isActive);
  const noOpening = !data?.openingDate;

  return (
    <>
      {noOpening && (
        <div className="card card-pad-lg cash-prompt" style={{ marginBottom: 16 }}>
          <div>
            <div className="ttl">Set opening balances</div>
            <div className="note">Balances start from the money each account held on your opening date. Enter them in Settings to see what every account holds now.</div>
          </div>
          <Link href="/admin/dashboard/settings/money" className="btn btn-primary">Set opening balances</Link>
        </div>
      )}
      {!noOpening && (
        <div className="kpi-row reveal" style={{ marginBottom: 16 }}>
          <div className="kpi">
            <div className="kpi-top"><div className="kpi-ic green">{WalletIc}</div><span className="kpi-k">Total across accounts</span></div>
            <div className="kpi-v">{money(data.total)}</div>
            <div className="kpi-foot"><span>Since {data.openingDate}</span></div>
          </div>
          <div className="kpi">
            <div className="kpi-top"><div className="kpi-ic amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 3v18h18" /><path d="M18 9l-5 5-3-3-4 4" /></svg></div><span className="kpi-k">Net today</span></div>
            <div className={`kpi-v ${Number(data.today) < 0 ? 'cash-neg' : ''}`}>{signed(data.today)}</div>
            <div className="kpi-foot"><span>all accounts, money in minus out</span></div>
          </div>
        </div>
      )}
      {accounts.length === 0 ? (
        <div className="card"><div className="empty"><div className="empty-ring">{WalletIc}</div><p className="empty-title">No accounts yet</p><p className="empty-sub">Add business accounts in Settings.</p></div></div>
      ) : (
        <div className="cash-grid">
          {accounts.map((a, i) => (
            <Link key={a.id} href={`/admin/dashboard/cash?tab=book&account=${a.id}`} className="card card-pad-lg cash-acct reveal" style={{ animationDelay: `${i * 0.04}s` }}>
              <div className="cash-acct-top">
                <div>
                  <div className="ttl">{a.kind === 'cash' ? 'Cash' : a.label}</div>
                  <div className="note">{KIND_NAME[a.kind] || a.kind}{a.number ? ` · ${a.number}` : ''}</div>
                </div>
              </div>
              <div className={`cash-bal ${a.balance != null && Number(a.balance) < 0 ? 'cash-neg' : ''}`}>{a.balance == null ? '—' : money(a.balance)}</div>
              <div className="cash-acct-foot">
                <span className={Number(a.today) < 0 ? 'cash-neg' : 'cash-pos'}>{signed(a.today)} today</span>
                <span className="cash-link">Cash book →</span>
              </div>
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
  const [range, setRange] = useState(() => ({ from: todayISO(), to: todayISO() }));
  const onRange = useCallback((from, to) => setRange((r) => (r.from === from && r.to === to ? r : { from, to })), []);

  const list = useInfiniteQuery({
    queryKey: ['account-entries', accountId, range.from, range.to],
    enabled: Boolean(accountId),
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
  const csvHref = accountId ? `/api/admin/accounts/${accountId}/entries?${new URLSearchParams({ from: range.from, to: range.to, format: 'csv' })}` : '#';

  return (
    <>
      <div className="toolbar">
        <select className="input" value={accountId} onChange={(e) => onAccount(e.target.value)} aria-label="Account">
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.kind === 'cash' ? 'Cash' : a.label}{a.isActive ? '' : ' (inactive)'}</option>)}
        </select>
        <DateRange defaultPreset="today" onChange={onRange} />
        <div style={{ flex: 1 }} />
        <a className="btn btn-ghost" href={csvHref} download>Download CSV</a>
      </div>

      {bal.isLoading || (list.isLoading && accountId) ? (
        <div className="card"><RowsSkeleton rows={5} className="card-pad" /></div>
      ) : bal.isError || list.isError ? (
        <div className="card"><ErrorBox what="the cash book" onRetry={() => { bal.refetch(); list.refetch(); }} /></div>
      ) : !accountId ? (
        <div className="card"><div className="empty"><div className="empty-ring">{WalletIc}</div><p className="empty-title">No accounts yet</p></div></div>
      ) : (
        <>
          {totals ? (
            <div className="kpi-row reveal" style={{ marginBottom: 16 }}>
              <div className="kpi"><div className="kpi-top"><span className="kpi-k">Opening</span></div><div className="kpi-v">{money(totals.opening)}</div><div className="kpi-foot"><span>on {totals.from}</span></div></div>
              <div className="kpi"><div className="kpi-top"><span className="kpi-k">Money in</span></div><div className="kpi-v cash-pos">{money(totals.moneyIn)}</div></div>
              <div className="kpi"><div className="kpi-top"><span className="kpi-k">Money out</span></div><div className="kpi-v cash-neg">{money(totals.moneyOut)}</div></div>
              <div className="kpi"><div className="kpi-top"><span className="kpi-k">Closing</span></div><div className="kpi-v">{money(totals.closing)}</div><div className="kpi-foot"><span>on {totals.to}</span></div></div>
            </div>
          ) : !openingDate ? (
            <div className="card card-pad-lg cash-prompt" style={{ marginBottom: 16 }}>
              <div className="note">Opening balances aren&rsquo;t set yet, so there is no opening or closing balance to show.</div>
              <Link href="/admin/dashboard/settings/money" className="btn btn-primary">Set opening balances</Link>
            </div>
          ) : null}

          <div className="card reveal" style={{ overflow: 'hidden' }}>
            <div className="card-h"><div><div className="ttl">Cash book</div><div className="note">{rows.length} {rows.length === 1 ? 'movement' : 'movements'} loaded · {range.from === range.to ? range.from : `${range.from} to ${range.to}`}</div></div></div>
            {rows.length === 0 ? (
              <div className="empty"><div className="empty-ring">{WalletIc}</div><p className="empty-title">No movements</p><p className="empty-sub">Nothing went in or out of this account in the chosen days.</p></div>
            ) : (
              <div className="table-wrap">
                <table className="table" style={{ marginTop: 12 }}>
                  <thead><tr><th>When</th><th>What</th><th>Note</th><th>Order</th><th>Collected by</th><th className="num">Amount</th><th className="num">Balance</th></tr></thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.id}>
                        <td className="muted" style={{ whiteSpace: 'nowrap' }}>{r.day} · {new Date(r.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                        <td><span className="pill pill-ghost">{ENTRY_KIND[r.kind] || r.kind}</span></td>
                        <td className="muted">{r.note || '—'}</td>
                        <td>{r.order ? <Link href={`/admin/dashboard/sales/${r.order.id}`} className="cash-link">{r.order.code}</Link> : <span className="muted">—</span>}</td>
                        <td className="muted">{r.collectedBy || '—'}</td>
                        <td className={`num strong ${r.amount < 0 ? 'cash-neg' : 'cash-pos'}`}>{signed(r.amount)}</td>
                        <td className="num">{run[i] == null ? '—' : money(run[i])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {list.hasNextPage && (
            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <button className="btn btn-ghost" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>{list.isFetchingNextPage ? 'Loading…' : 'Load more'}</button>
            </div>
          )}
        </>
      )}
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
    <>
      <div className="toolbar">
        <div className="ff" style={{ margin: 0 }}>
          <input className="input" type="date" value={day} max={todayISO()} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Day" />
        </div>
      </div>
      <div className="card reveal" style={{ overflow: 'hidden' }}>
        <div className="card-h">
          <div>
            <div className="ttl">Collected on {day}</div>
            <div className="note">Everything collected is handed over to the business automatically at day&rsquo;s end.</div>
          </div>
        </div>
        {q.isLoading ? <RowsSkeleton rows={4} className="card-pad" />
          : q.isError ? <ErrorBox what="collections" onRetry={() => q.refetch()} />
          : !data || data.rows.length === 0 ? (
            <div className="empty"><div className="empty-ring">{WalletIc}</div><p className="empty-title">Nothing collected</p><p className="empty-sub">No staff member took payments on this day.</p></div>
          ) : (
            <div className="table-wrap">
              <table className="table" style={{ marginTop: 12 }}>
                <thead><tr><th>Person</th>{data.accounts.map((a) => <th key={a.id} className="num">{a.kind === 'cash' ? 'Cash' : a.label}</th>)}<th className="num">Total</th></tr></thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.staffId}>
                      <td><span className="strong">{r.name}</span> <span className="pill pill-ghost" style={{ textTransform: 'capitalize' }}>{r.role}</span></td>
                      {data.accounts.map((a) => <td key={a.id} className="num">{r.byAccount[a.id] != null ? money(r.byAccount[a.id]) : <span className="muted">—</span>}</td>)}
                      <td className="num strong">{money(r.total)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="strong">Total</td>
                    {data.accounts.map((a) => <td key={a.id} className="num strong">{money(data.totals[a.id])}</td>)}
                    <td className="num strong">{money(data.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
      </div>
    </>
  );
}

// ── Transfers & owner ───────────────────────────────────────────────────
function TransfersTab() {
  const [dialog, setDialog] = useState(null); // 'transfer' | 'owner'
  return (
    <>
      <div className="cash-grid">
        <div className="card card-pad-lg">
          <div className="ttl">Transfer between accounts</div>
          <p className="note" style={{ margin: '6px 0 14px' }}>Move money between two business accounts: cash to the bank, a payout from online payments, wallet money withdrawn to cash.</p>
          <IfCan page="cash"><button className="btn btn-primary" onClick={() => setDialog('transfer')}>New transfer</button></IfCan>
        </div>
        <div className="card card-pad-lg">
          <div className="ttl">Owner money</div>
          <p className="note" style={{ margin: '6px 0 14px' }}>Record the owner putting money in (capital) or taking money out (drawings). Kept apart from expenses so profit stays honest.</p>
          <IfCan page="cash"><button className="btn btn-primary" onClick={() => setDialog('owner')}>Record owner money</button></IfCan>
        </div>
      </div>
      <p className="note" style={{ marginTop: 14 }}>Every transfer and owner entry appears in the account&rsquo;s Cash book.</p>
      {dialog === 'transfer' && <TransferDialog onClose={() => setDialog(null)} />}
      {dialog === 'owner' && <OwnerDialog onClose={() => setDialog(null)} />}
    </>
  );
}

function useRefreshMoney() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['account-balances'] });
    qc.invalidateQueries({ queryKey: ['money-accounts'] });
    qc.invalidateQueries({ queryKey: ['account-entries'] });
  };
}

function Modal({ title, eyebrow, onClose, busy, children }) {
  return (
    <div className="jz-modal-bk open" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-h">
          <div className="mt"><div className="eyebrow">{eyebrow}</div><div className="h-1" style={{ marginTop: 3 }}>{title}</div></div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">{CloseIc}</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AccountOptions({ accounts, skipGateway }) {
  return accounts.filter((a) => a.isActive && !(skipGateway && a.kind === 'gateway')).map((a) => (
    <option key={a.id} value={a.id}>{a.kind === 'cash' ? 'Cash' : a.label}</option>
  ));
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
    onError: (e) => {
      reportSaveError(e, { form, title: 'Could not move the money' });
    },
  });
  const submit = (e) => {
    e.preventDefault();
    if (!form.check() || save.isPending) return;
    form.setServerErrors(null);
    save.mutate({ fromAccountId: Number(f.from), toAccountId: Number(f.to), amount: Number(f.amount), day: f.day || undefined, note: f.note.trim() || null });
  };
  return (
    <Modal title="Transfer money" eyebrow="Between accounts" onClose={onClose} busy={save.isPending}>
      <form noValidate onSubmit={submit} style={{ display: 'contents' }}>
        <div className="modal-b">
          <div className="form-grid">
            <Field label="From" required {...form.fieldProps('from')}>
              <select className="input" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })}><option value="">Choose…</option><AccountOptions accounts={accounts} /></select>
            </Field>
            <Field label="To" required {...form.fieldProps('to')}>
              <select className="input" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })}><option value="">Choose…</option><AccountOptions accounts={accounts} skipGateway /></select>
            </Field>
          </div>
          <div className="form-grid">
            <Field label="Amount ($)" required {...form.fieldProps('amount')}><input className="input" type="number" min="0" step="0.01" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="0.00" /></Field>
            <Field label="Date" required {...form.fieldProps('day')}><input className="input" type="date" value={f.day} max={todayISO()} onChange={(e) => setF({ ...f, day: e.target.value })} /></Field>
          </div>
          <Field label="Note" {...form.fieldProps('note')}><textarea className="input" rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Optional" /></Field>
        </div>
        <div className="modal-f">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={save.isPending}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending || bal.isLoading || !form.valid}>{save.isPending ? 'Saving…' : 'Transfer'}</button>
        </div>
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
    onError: (e) => {
      reportSaveError(e, { form, title: 'Could not record the owner money' });
    },
  });
  const submit = (e) => {
    e.preventDefault();
    if (!form.check() || save.isPending) return;
    form.setServerErrors(null);
    save.mutate({ accountId: Number(f.account), direction: f.direction, amount: Number(f.amount), day: f.day || undefined, note: f.note.trim() || null });
  };
  return (
    <Modal title="Owner money" eyebrow="Capital & drawings" onClose={onClose} busy={save.isPending}>
      <form noValidate onSubmit={submit} style={{ display: 'contents' }}>
        <div className="modal-b">
          <div className="seg" role="radiogroup" aria-label="Direction" style={{ alignSelf: 'flex-start' }}>
            <button type="button" role="radio" aria-checked={f.direction === 'in'} className={f.direction === 'in' ? 'active' : ''} onClick={() => setF({ ...f, direction: 'in' })}>Owner puts money in</button>
            <button type="button" role="radio" aria-checked={f.direction === 'out'} className={f.direction === 'out' ? 'active' : ''} onClick={() => setF({ ...f, direction: 'out' })}>Owner takes money out</button>
          </div>
          <Field label="Account" required {...form.fieldProps('account')}>
            <select className="input" value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })}><option value="">Choose…</option><AccountOptions accounts={accounts} skipGateway /></select>
          </Field>
          <div className="form-grid">
            <Field label="Amount ($)" required {...form.fieldProps('amount')}><input className="input" type="number" min="0" step="0.01" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="0.00" /></Field>
            <Field label="Date" required {...form.fieldProps('day')}><input className="input" type="date" value={f.day} max={todayISO()} onChange={(e) => setF({ ...f, day: e.target.value })} /></Field>
          </div>
          <Field label="Note" {...form.fieldProps('note')}><textarea className="input" rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Optional" /></Field>
        </div>
        <div className="modal-f">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={save.isPending}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending || bal.isLoading || !form.valid}>{save.isPending ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}
