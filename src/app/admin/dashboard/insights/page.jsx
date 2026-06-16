'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchJson, parseApiError } from '@/lib/apiError';

const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const num = (n) => Number(n || 0).toLocaleString('en-US');
// 0..7 index for the last 8 weeks (7 = current week). Date.now lives here, out of render.
const weekIndex = (d) => 7 - Math.floor((Date.now() - new Date(d).getTime()) / (7 * 86400000));

function Bk({ rows, color = 'var(--primary)' }) {
  const max = Math.max(...rows.map((r) => r.v), 1);
  return rows.length === 0 ? <div className="sub">No data in range.</div> : rows.map((r, i) => (
    <div className="bk-row" key={i}>
      <span className="bk-l">{r.l}</span>
      <div className="bk-bar"><i className="anim-grow-x" style={{ width: `${Math.round((r.v / max) * 100)}%`, background: r.c || color, '--d': `${i * 0.06}s` }} /></div>
      <span className="bk-v">{r.fmt || money(r.v)}</span>
    </div>
  ));
}

export default function InsightsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('pnl');
  const [exp, setExp] = useState({ category: '', amount: '', note: '' });

  const { data: fin } = useQuery({ queryKey: ['fin-summary'], queryFn: () => fetchJson('/api/admin/finance/summary') });
  const { data: rep } = useQuery({ queryKey: ['rep-summary'], queryFn: () => fetchJson('/api/admin/reports/summary') });
  const { data: orders = [] } = useQuery({ queryKey: ['ins-orders'], queryFn: () => fetchJson('/api/admin/orders') });
  const { data: expenses = [] } = useQuery({ queryKey: ['ins-expenses'], queryFn: () => fetchJson('/api/admin/expenses').catch(() => []) });

  const addExpense = useMutation({
    mutationFn: (payload) => fetchJson('/api/admin/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
    onSuccess: () => { toast.success('Expense added'); qc.invalidateQueries({ queryKey: ['ins-expenses'] }); qc.invalidateQueries({ queryKey: ['fin-summary'] }); setExp({ category: '', amount: '', note: '' }); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const m = useMemo(() => {
    const paid = orders.filter((o) => o.paymentStatus === 'paid');
    let online = { c: 0, t: 0 }, counter = { c: 0, t: 0 };
    for (const o of paid) { const t = Number(o.total); if (o.source === 'online') { online.c++; online.t += t; } else { counter.c++; counter.t += t; } }
    // 8-week revenue vs expenses
    const rev = new Array(8).fill(0), expw = new Array(8).fill(0);
    for (const o of paid) { const idx = weekIndex(o.createdAt); if (idx >= 0 && idx < 8) rev[idx] += Number(o.total); }
    for (const e of expenses) { const idx = weekIndex(e.incurredAt || e.createdAt); if (idx >= 0 && idx < 8) expw[idx] += Number(e.amount); }
    const maxBar = Math.max(...rev, ...expw, 1);
    return { online, counter, rev, expw, maxBar };
  }, [orders, expenses]);

  const revenue = Number(fin?.revenueTotal || 0);
  const expensesTotal = Number(fin?.expensesTotal || 0);
  const net = Number(fin?.net ?? revenue - expensesTotal);
  const margin = revenue ? Math.round((net / revenue) * 100) : 0;
  const orderCount = fin?.orderCount || 0;

  const submitExp = (e) => {
    e.preventDefault();
    const amt = parseFloat(exp.amount);
    if (!exp.category.trim() || !(amt > 0)) { toast.error('Enter a category and amount'); return; }
    addExpense.mutate({ category: exp.category.trim(), amount: amt, note: exp.note.trim() || null });
  };

  return (
    <>
      <div className="tabs-lg">
        <button className={tab === 'pnl' ? 'active' : ''} onClick={() => setTab('pnl')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>Profit &amp; Loss</button>
        <button className={tab === 'ops' ? 'active' : ''} onClick={() => setTab('ops')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="6" /><rect x="12" y="8" width="3" height="10" /><rect x="17" y="5" width="3" height="13" /></svg>Operations</button>
      </div>

      {tab === 'pnl' ? (
        <section>
          <div className="kpi-row reveal" style={{ marginBottom: 16 }}>
            <div className="kpi"><div className="kpi-top"><div className="kpi-ic green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg></div><span className="kpi-k">Revenue</span></div><div className="kpi-v"><small>$</small>{num(Math.round(revenue))}</div><div className="kpi-foot"><span>last 30 days</span></div></div>
            <div className="kpi"><div className="kpi-top"><div className="kpi-ic gold"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 3v18h18" /><path d="M18 9l-5 5-3-3-4 4" /></svg></div><span className="kpi-k">Expenses</span></div><div className="kpi-v"><small>$</small>{num(Math.round(expensesTotal))}</div><div className="kpi-foot"><span>last 30 days</span></div></div>
            <div className="kpi"><div className="kpi-top"><div className="kpi-ic green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg></div><span className="kpi-k">Net profit</span></div><div className="kpi-v"><small>$</small>{num(Math.round(net))}</div><div className="kpi-foot"><span className="pill pill-green" style={{ padding: '1px 8px' }}>{margin}% margin</span></div></div>
            <div className="kpi"><div className="kpi-top"><div className="kpi-ic ink"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="2" /></svg></div><span className="kpi-k">Paid orders</span></div><div className="kpi-v">{num(orderCount)}</div><div className="kpi-foot"><span>avg {money(orderCount ? revenue / orderCount : 0)}</span></div></div>
          </div>

          <div className="grid-chart reveal" style={{ animationDelay: '.08s' }}>
            <div className="card card-pad">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div><div className="eyebrow">Revenue vs expenses</div><div className="h-2" style={{ marginTop: 2 }}>Weekly · last 8 weeks</div></div>
                <div className="legend" style={{ gap: 14 }}><span><i style={{ width: 11, height: 11, borderRadius: 3, background: 'var(--primary)' }} />Revenue</span><span><i style={{ width: 11, height: 11, borderRadius: 3, background: 'var(--gold)' }} />Expenses</span></div>
              </div>
              <div className="bars2">
                {m.rev.map((r, i) => (
                  <div className="bcol" key={i}><div className="bpair"><i className="rev" style={{ height: `${(r / m.maxBar) * 100}%`, '--d': `${i * 0.05}s` }} /><i className="exp" style={{ height: `${(m.expw[i] / m.maxBar) * 100}%`, '--d': `${i * 0.05 + 0.04}s` }} /></div><span>W{i + 1}</span></div>
                ))}
              </div>
            </div>
            <div className="card card-pad">
              <div className="eyebrow" style={{ marginBottom: 12 }}>Channel split</div>
              <Bk rows={[{ l: 'Counter', v: m.counter.t }, { l: 'Online', v: m.online.t, c: 'var(--sky)' }]} />
            </div>
          </div>

          <div className="grid3 reveal" style={{ marginTop: 16, animationDelay: '.12s' }}>
            <div className="card card-pad"><div className="eyebrow" style={{ marginBottom: 12 }}>Expenses by category</div><Bk color="var(--gold)" rows={(fin?.expensesByCategory || []).map((r) => ({ l: r.category, v: r.total, c: 'var(--gold)' }))} /></div>
            <div className="card card-pad"><div className="eyebrow" style={{ marginBottom: 12 }}>Sales by staff</div><Bk rows={(fin?.salesByStaff || []).slice(0, 5).map((r) => ({ l: r.name, v: r.total }))} /></div>
            <div className="card card-pad"><div className="eyebrow" style={{ marginBottom: 12 }}>Top items</div><Bk rows={(rep?.itemsSold || []).slice(0, 5).map((r) => ({ l: r.name, v: r.total }))} /></div>
          </div>

          <div className="card card-pad reveal" style={{ marginTop: 16, animationDelay: '.16s' }}>
            <div className="h-2" style={{ marginBottom: 14 }}>Expenses</div>
            <form className="exp-form" onSubmit={submitExp}>
              <input className="input" value={exp.category} onChange={(e) => setExp({ ...exp, category: e.target.value })} placeholder="Category (e.g. rent)" />
              <input className="input" type="number" step="any" value={exp.amount} onChange={(e) => setExp({ ...exp, amount: e.target.value })} placeholder="Amount" />
              <input className="input" value={exp.note} onChange={(e) => setExp({ ...exp, note: e.target.value })} placeholder="Note (optional)" />
              <button className="btn btn-primary" type="submit" disabled={addExpense.isPending}>Add</button>
            </form>
            <div style={{ overflowX: 'auto' }}>
              <table className="table"><thead><tr><th>Date</th><th>Category</th><th>Note</th><th className="num">Amount</th></tr></thead>
                <tbody>
                  {expenses.slice(0, 12).map((e) => (
                    <tr key={e.id}><td style={{ color: 'var(--muted)' }}>{new Date(e.incurredAt || e.createdAt).toLocaleDateString()}</td><td style={{ textTransform: 'capitalize' }}>{e.category}</td><td style={{ color: 'var(--muted)' }}>{e.note || '—'}</td><td className="num">${num(e.amount)}</td></tr>
                  ))}
                  {expenses.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>No expenses yet</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : (
        <section>
          <div className="kpi-row reveal" style={{ marginBottom: 16 }}>
            <div className="kpi"><div className="kpi-top"><div className="kpi-ic sky"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="2" /></svg></div><span className="kpi-k">Total orders</span></div><div className="kpi-v">{num(rep?.totalOrders || 0)}</div><div className="kpi-foot"><span>last 30 days</span></div></div>
            <div className="kpi"><div className="kpi-top"><div className="kpi-ic green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20" /></svg></div><span className="kpi-k">Digital · online</span></div><div className="kpi-v">{num(m.online.c)}</div><div className="kpi-foot"><span>{money(m.online.t)}</span></div></div>
            <div className="kpi"><div className="kpi-top"><div className="kpi-ic gold"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="4" y="3" width="16" height="13" rx="2" /><line x1="8" y1="20" x2="16" y2="20" /><line x1="12" y1="16" x2="12" y2="20" /></svg></div><span className="kpi-k">Manual · counter</span></div><div className="kpi-v">{num(m.counter.c)}</div><div className="kpi-foot"><span>{money(m.counter.t)}</span></div></div>
            <div className="kpi"><div className="kpi-top"><div className="kpi-ic ink"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><path d="M7 7h.01" /></svg></div><span className="kpi-k">Items sold</span></div><div className="kpi-v">{num(rep?.itemsSoldUnits || 0)}</div><div className="kpi-foot"><span>units</span></div></div>
          </div>

          <div className="grid3 reveal" style={{ animationDelay: '.08s' }}>
            <div className="card card-pad"><div className="eyebrow" style={{ marginBottom: 12 }}>Manual vs digital</div><Bk color="var(--gold)" rows={[{ l: 'Manual', v: m.counter.c, fmt: num(m.counter.c), c: 'var(--gold)' }, { l: 'Digital', v: m.online.c, fmt: num(m.online.c), c: 'var(--sky)' }]} /></div>
            <div className="card card-pad"><div className="eyebrow" style={{ marginBottom: 12 }}>Waiter performance</div><Bk rows={(rep?.waiterPerformance || []).filter((w) => w.waiterId != null).slice(0, 5).map((w) => ({ l: w.name, v: w.orders, fmt: num(w.orders) }))} /></div>
            <div className="card card-pad"><div className="eyebrow" style={{ marginBottom: 12 }}>Sales by cashier</div><Bk rows={(rep?.salesByStaff || []).slice(0, 5).map((s) => ({ l: s.name, v: s.count, fmt: num(s.count) }))} /></div>
          </div>

          <div className="card card-pad reveal" style={{ marginTop: 16, animationDelay: '.12s' }}>
            <div className="h-2" style={{ marginBottom: 14 }}>Items sold</div>
            <div style={{ overflowX: 'auto' }}>
              <table className="table"><thead><tr><th>Item</th><th className="num">Qty sold</th><th className="num">Revenue</th></tr></thead>
                <tbody>
                  {(rep?.itemsSold || []).slice(0, 12).map((it, i) => (
                    <tr key={i}><td>{it.name}</td><td className="num">{num(it.qty)}</td><td className="num">{money(it.total)}</td></tr>
                  ))}
                  {(!rep?.itemsSold || rep.itemsSold.length === 0) && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>No sales yet</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
