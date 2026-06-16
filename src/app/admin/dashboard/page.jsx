'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';

const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const dayKey = (d) => startOfDay(d).getTime();

function ago(date) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// Build an SVG area chart (viewBox 720x230) from daily totals.
function buildArea(values) {
  const n = values.length;
  const max = Math.max(...values, 1);
  const X = (i) => (n === 1 ? 360 : (i / (n - 1)) * 720);
  const Y = (v) => 205 - (v / max) * 165;
  const pts = values.map((v, i) => [X(i), Y(v)]);
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L720,230 L0,230 Z`;
  return { line, area, lastX: pts[n - 1][0], lastY: pts[n - 1][1] };
}
function spark(values, color) {
  const n = values.length; const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${(n === 1 ? 60 : (i / (n - 1)) * 120).toFixed(1)},${(27 - (v / max) * 22).toFixed(1)}`).join(' ');
  return <svg className="spark" viewBox="0 0 120 30" preserveAspectRatio="none"><polyline style={color ? { stroke: color } : undefined} points={pts} /></svg>;
}

const Delta = ({ v, suffix = '%' }) => {
  if (v == null) return null;
  const up = v >= 0;
  return (
    <span className={`delta ${up ? 'up' : 'down'}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">{up ? <path d="M7 17 17 7M9 7h8v8" /> : <path d="M7 7 17 17M9 17h8V9" />}</svg>
      {up ? '' : ''}{Math.abs(v).toFixed(1)}{suffix}
    </span>
  );
};

export default function OverviewPage() {
  const { data: orders = [] } = useQuery({ queryKey: ['ov-orders'], queryFn: () => fetchJson('/api/admin/orders') });
  const { data: inventory = [] } = useQuery({ queryKey: ['ov-inventory'], queryFn: () => fetchJson('/api/admin/inventory').catch(() => []) });

  const m = useMemo(() => {
    const paid = orders.filter((o) => o.paymentStatus === 'paid');
    const tStart = dayKey(new Date());
    const yStart = tStart - 86400000;
    let todayRev = 0, todayCnt = 0, yRev = 0, yCnt = 0;
    let pos = 0, online = 0, dine = 0, deliv = 0;
    const byDay = new Map();
    for (const o of paid) {
      const t = Number(o.total); const k = dayKey(o.createdAt);
      byDay.set(k, (byDay.get(k) || 0) + t);
      if (k === tStart) {
        todayRev += t; todayCnt += 1;
        if (o.source === 'pos') pos += 1; else online += 1;
        if (o.orderType === 'delivery') deliv += 1; else dine += 1;
      } else if (k === yStart) { yRev += t; yCnt += 1; }
    }
    // 14-day + prior-14 daily series
    const series = []; const prior = [];
    for (let i = 13; i >= 0; i--) series.push(byDay.get(tStart - i * 86400000) || 0);
    for (let i = 27; i >= 14; i--) prior.push(byDay.get(tStart - i * 86400000) || 0);
    const net14 = series.reduce((s, v) => s + v, 0);
    const prior14 = prior.reduce((s, v) => s + v, 0);
    const orderSeries = []; const dcount = new Map();
    for (const o of paid) dcount.set(dayKey(o.createdAt), (dcount.get(dayKey(o.createdAt)) || 0) + 1);
    for (let i = 13; i >= 0; i--) orderSeries.push(dcount.get(tStart - i * 86400000) || 0);

    const avg = todayCnt ? todayRev / todayCnt : 0;
    const last7 = series.slice(-7); const cnt7 = orderSeries.slice(-7).reduce((s, v) => s + v, 0);
    const avg7 = cnt7 ? last7.reduce((s, v) => s + v, 0) / cnt7 : 0;
    const pending = orders.filter((o) => o.status === 'pending').length;
    const chTotal = pos + online || 1;
    const svcTotal = dine + deliv || 1;

    return {
      todayRev, todayCnt, avg, pending, series, prior, orderSeries, net14,
      revDelta: yRev ? ((todayRev - yRev) / yRev) * 100 : null,
      ordDelta: todayCnt - yCnt,
      avgDelta: avg7 ? ((avg - avg7) / avg7) * 100 : null,
      netDelta: prior14 ? ((net14 - prior14) / prior14) * 100 : null,
      posPct: Math.round((pos / chTotal) * 100), onlinePct: Math.round((online / chTotal) * 100),
      dinePct: Math.round((dine / svcTotal) * 100), delivPct: Math.round((deliv / svcTotal) * 100),
      recent: orders.slice(0, 5),
    };
  }, [orders]);

  const area = buildArea(m.series.length ? m.series : [0, 0]);
  const priorArea = buildArea(m.prior.length ? m.prior : [0, 0]);
  const low = inventory.filter((it) => it.reorderLevel != null && Number(it.quantity) <= Number(it.reorderLevel));

  return (
    <>
      <section className="kpi-row reveal" style={{ marginBottom: 16 }}>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ic green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg></div><span className="kpi-k">Revenue today</span></div>
          <div className="kpi-v"><small>$</small>{money(m.todayRev)}</div>
          <div className="kpi-foot"><Delta v={m.revDelta} /><span>vs yesterday</span></div>
          {spark(m.series)}
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ic sky"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="2" /></svg></div><span className="kpi-k">Orders today</span></div>
          <div className="kpi-v">{m.todayCnt}</div>
          <div className="kpi-foot"><span className={`delta ${m.ordDelta >= 0 ? 'up' : 'down'}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor">{m.ordDelta >= 0 ? <path d="M7 17 17 7M9 7h8v8" /> : <path d="M7 7 17 17M9 17h8V9" />}</svg>{m.ordDelta >= 0 ? '+' : ''}{m.ordDelta}</span><span>vs yesterday</span></div>
          {spark(m.orderSeries, 'var(--sky)')}
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ic gold"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="6" /><rect x="12" y="8" width="3" height="10" /><rect x="17" y="5" width="3" height="13" /></svg></div><span className="kpi-k">Avg ticket</span></div>
          <div className="kpi-v"><small>$</small>{money(m.avg)}</div>
          <div className="kpi-foot"><Delta v={m.avgDelta} /><span>vs 7-day avg</span></div>
          {spark(m.series.map((v, i) => v / Math.max(1, m.orderSeries[i] || 1)), 'var(--gold)')}
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ic amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg></div><span className="kpi-k">Awaiting decision</span></div>
          <div className="kpi-v">{m.pending}</div>
          <div className="kpi-foot"><span className="pill pill-amber" style={{ padding: '1px 8px' }}><span className="live-dot" style={{ background: 'var(--amber)' }} />pre-auth held</span></div>
          {spark(m.orderSeries, 'var(--amber)')}
        </div>
      </section>

      <div className="grid-main">
        <div className="card card-pad reveal" style={{ animationDelay: '.08s' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
            <div>
              <div className="eyebrow">Net revenue</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
                <span className="h-display mono"><small style={{ fontSize: 18, color: 'var(--muted)' }}>$</small>{money(m.net14)}</span>
                <Delta v={m.netDelta} />
              </div>
              <div className="sub" style={{ marginTop: 2 }}>Last 14 days · captured</div>
            </div>
            <div className="seg"><button>7D</button><button className="active">14D</button><button>30D</button></div>
          </div>
          <div className="area-wrap">
            <svg className="area-svg" viewBox="0 0 720 230" preserveAspectRatio="none">
              <defs><linearGradient id="fillA" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity="0.20" /><stop offset="100%" stopColor="var(--primary)" stopOpacity="0" /></linearGradient></defs>
              <line className="gl" x1="0" y1="40" x2="720" y2="40" /><line className="gl" x1="0" y1="95" x2="720" y2="95" /><line className="gl" x1="0" y1="150" x2="720" y2="150" /><line className="gl" x1="0" y1="205" x2="720" y2="205" />
              <path className="fillgrad" fill="url(#fillA)" d={area.area} />
              <path className="ln2" d={priorArea.line} />
              <path className="ln" d={area.line} />
              <circle className="dot" cx={area.lastX} cy={area.lastY} r="4.5" />
            </svg>
            <div className="axis-x"><span>14d ago</span><span>10d</span><span>6d</span><span>3d</span><span>Today</span></div>
          </div>
          <div className="legend" style={{ marginTop: 12 }}><span><i style={{ background: 'var(--primary)' }} />Net captured</span><span><i style={{ background: 'var(--gold)', opacity: .6 }} />Prior period</span></div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card card-pad reveal" style={{ animationDelay: '.14s' }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Channel · today</div>
            <div className="mixbar"><i style={{ background: 'var(--primary)', width: `${m.posPct}%` }} /><i style={{ background: 'var(--sky)', width: `${m.onlinePct}%` }} /></div>
            <div style={{ marginTop: 14 }}>
              <div className="kv"><span className="kvl"><i style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)' }} />Counter / POS</span><span className="kvv">{m.posPct}%</span></div>
              <div className="kv"><span className="kvl"><i style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--sky)' }} />Online app</span><span className="kvv">{m.onlinePct}%</span></div>
            </div>
          </div>
          <div className="card card-pad reveal" style={{ animationDelay: '.2s' }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Service mix · today</div>
            <div className="kv" style={{ border: 'none' }}><span className="kvl">Dine-in</span><span className="kvv">{m.dinePct}%</span></div>
            <div className="mixbar" style={{ margin: '6px 0 12px' }}><i style={{ background: 'var(--primary)', width: `${m.dinePct}%` }} /></div>
            <div className="kv" style={{ border: 'none' }}><span className="kvl">Delivery</span><span className="kvv">{m.delivPct}%</span></div>
            <div className="mixbar" style={{ marginTop: 6 }}><i style={{ background: 'var(--gold)', width: `${m.delivPct}%` }} /></div>
          </div>
        </div>
      </div>

      <div className="card reveal" style={{ marginTop: 16, animationDelay: '.16s', overflow: 'hidden' }}>
        <div className="card-pad" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 }}>
          <div><div className="eyebrow">Live</div><div className="h-2" style={{ marginTop: 2 }}>Recent orders</div></div>
          <Link className="btn btn-ghost btn-sm" href="/admin/dashboard/orders">View all<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14M13 6l6 6-6 6" /></svg></Link>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th>Ref</th><th>Customer</th><th>Channel</th><th>Status</th><th>Time</th><th className="num">Total</th></tr></thead>
            <tbody>
              {m.recent.map((o) => {
                const dine = o.orderType !== 'delivery';
                const who = o.contactName || o.customer?.name || (dine ? (o.tableNumber ? `Table ${o.tableNumber}` : 'Walk-in') : 'Delivery');
                const chan = o.source === 'pos'
                  ? <span className="pill pill-green">Counter · {dine ? 'Dine-in' : 'Delivery'}</span>
                  : <span className="pill pill-sky">Online · {dine ? 'Dine-in' : 'Delivery'}</span>;
                const st = o.status === 'pending' ? <span className="pill pill-amber"><span className="pdot" />Awaiting</span>
                  : o.status === 'declined' ? <span className="pill pill-rose"><span className="pdot" />Declined</span>
                  : o.source === 'pos' ? <span className="pill pill-green"><span className="pdot" />Paid</span>
                  : <span className="pill pill-green"><span className="pdot" />Confirmed</span>;
                return (
                  <tr className="ord-row" key={o.id}>
                    <td>#{o.id}</td><td>{who}</td><td>{chan}</td><td>{st}</td>
                    <td style={{ color: 'var(--muted)' }}>{ago(o.createdAt)}</td>
                    <td className="num">${money(o.total)}</td>
                  </tr>
                );
              })}
              {m.recent.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 28 }}>No orders yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card card-pad reveal" style={{ marginTop: 16, animationDelay: '.22s' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}><div className="eyebrow">Inventory</div>{low.length > 0 && <span className="pill pill-amber"><span className="pdot" />{low.length} low</span>}</div>
        {low.length === 0 ? (
          <div className="sub">All items above reorder level.</div>
        ) : (
          <div className="lowstrip">
            {low.map((it) => (
              <span className="lowchip" key={it.id}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
                {it.name} · {Number(it.quantity)} {it.unit}
              </span>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
