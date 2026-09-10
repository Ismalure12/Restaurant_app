'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchJson, parseApiError } from '@/lib/apiError';
import Bk from '@/components/admin/Bk';

const METHOD_LABEL = { cash: 'Cash', card: 'Card', evc: 'EVC', invoice: 'Invoice', unspecified: 'Unspecified' };

const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const num = (n) => Number(n || 0).toLocaleString('en-US');
// 0..7 index for the last 8 weeks (7 = current week). Date.now lives here, out of render.
const weekIndex = (d) => 7 - Math.floor((Date.now() - new Date(d).getTime()) / (7 * 86400000));

export default function InsightsPage() {
  const qc = useQueryClient();
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
    <div style={{ maxWidth: 1200 }}>
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

      <div className="grid3 reveal" style={{ marginTop: 16, animationDelay: '.14s' }}>
        <div className="card card-pad"><div className="eyebrow" style={{ marginBottom: 12 }}>Revenue by payment method</div><Bk rows={(fin?.revenueByMethod || []).map((r) => ({ l: METHOD_LABEL[r.method] || r.method, v: r.total }))} /></div>
        <div className="card card-pad">
          <div className="eyebrow" style={{ marginBottom: 12 }}>Invoicing</div>
          <div className="sc-stat"><div className="v">{money(fin?.invoicedTotal)}</div><div className="k">Invoiced, last 30 days</div></div>
          <div className="sc-stat" style={{ marginTop: 10 }}><div className="v" style={{ color: 'var(--rose)' }}>{money(fin?.invoiceOutstanding)}</div><div className="k">Currently outstanding</div></div>
          <div style={{ marginTop: 10, textAlign: 'right' }}><Link href="/admin/dashboard/invoices" className="btn btn-ghost btn-sm">Open Invoicing →</Link></div>
        </div>
        <div className="card card-pad">
          <div className="eyebrow" style={{ marginBottom: 12 }}>Full breakdown</div>
          <p className="empty-sub" style={{ textAlign: 'left' }}>The Daily Report has revenue by method, item-level sales, stock consumed and invoice activity for any date range.</p>
          <div style={{ marginTop: 10, textAlign: 'right' }}><Link href="/admin/dashboard/reports" className="btn btn-primary btn-sm">Open Daily Report →</Link></div>
        </div>
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
    </div>
  );
}
