'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson, parseApiError } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import { reportSaveError } from '@/lib/saveError';
import { useFormValidation } from '@/lib/formValidation';
import { dismissPaymentSchema } from '@/lib/schemas/sales';
import Field from '@/components/admin/Field';
import { RowsSkeleton } from '@/components/admin/Skeletons';
import { ORDER_COUNTS_KEY } from '@/hooks/useOrderCounts';
import { Ic, MANAGER_ROLES, ago, cap, dt, initials, money } from './orderUi';

export const ONLINE_PAYMENTS_KEY = ['online-payments'];

// Checkouts where the customer was sent to Sifalo but no order exists (yet).
// The server keeps asking Sifalo on its own (payment reconciler); this is
// where staff see the ones that need them and can help the customer.
const STATUS = {
  attention: { label: 'Needs attention', cls: 'pill-rose', color: 'var(--rose)', group: 'Needs attention — money may have moved' },
  stuck: { label: 'No answer yet', cls: 'pill-amber', color: 'var(--amber)', group: 'Stuck — Sifalo hasn’t confirmed' },
  checking: { label: 'Checking', cls: 'pill-sky', color: 'var(--sky)', group: 'Checking now' },
  not_paid: { label: 'Not paid', cls: 'pill-ghost', color: 'var(--faint)', group: 'Not paid' },
};
const ORDER = ['attention', 'stuck', 'checking', 'not_paid'];

const call = (phone) => `tel:+${String(phone).startsWith('252') ? phone : `252${phone}`}`;

export default function OnlinePaymentsPanel({ tabs, onOrderCreated }) {
  const qc = useQueryClient();
  const [selId, setSelId] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [dismissing, setDismissing] = useState(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ONLINE_PAYMENTS_KEY,
    queryFn: () => fetchJson('/api/admin/online-payments'),
    refetchInterval: 30_000,
  });
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => fetchJson('/api/auth/me'), staleTime: 5 * 60 * 1000 });
  const canDismiss = MANAGER_ROLES.includes(me?.role);

  const payments = useMemo(() => (Array.isArray(data?.payments) ? data.payments : []), [data]);
  const groups = useMemo(() => ORDER
    .map((key) => ({ key, title: STATUS[key].group, items: payments.filter((p) => p.status === key) }))
    .filter((g) => g.items.length), [payments]);
  const sel = payments.find((p) => p.id === selId);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ONLINE_PAYMENTS_KEY });
    qc.invalidateQueries({ queryKey: ORDER_COUNTS_KEY });
  };

  const recheck = useMutation({
    mutationFn: (id) => fetchJson(`/api/admin/online-payments/${id}/recheck`, { method: 'POST' }),
    onSuccess: (res) => {
      if (res.state === 'paid') {
        notify.success('Payment confirmed by Sifalo — the order is now in Orders');
        qc.invalidateQueries({ queryKey: ['orders-all'] });
        setSelId(null);
        setDetailOpen(false);
        onOrderCreated?.(res.orderId);
      } else if (res.state === 'pending') {
        notify.info('Sifalo still shows it as pending — the server keeps checking on its own');
      } else {
        notify.info(res.payment?.reason || 'Sifalo has no successful payment for this checkout');
      }
      refresh();
    },
    onError: (e) => notify.error(e, { title: 'Could not check with Sifalo' }),
  });

  return (
    <div className={`ord${detailOpen ? ' detail-open' : ''}`}>
      <section className="ord-list">
        <div className="ol-top">{tabs}</div>
        <div className="ol-scroll">
          {isLoading ? (
            <div style={{ padding: 16 }}><RowsSkeleton rows={4} height={52} /></div>
          ) : isError ? (
            <div className="ol-empty">Couldn&rsquo;t load online payments. {parseApiError(error)}</div>
          ) : groups.length === 0 ? (
            <div className="ol-empty">Every online payment has its order. Nothing to check.</div>
          ) : groups.map((g) => (
            <div key={g.key}>
              <div className="ol-group-h">{g.title}<span className="cnt">{g.items.length}</span></div>
              {g.items.map((p) => {
                const st = STATUS[p.status] || STATUS.checking;
                return (
                  <button type="button" key={p.id} className={`oli${p.id === selId ? ' sel' : ''}`} onClick={() => { setSelId(p.id); setDetailOpen(true); }} style={{ width: '100%', textAlign: 'left' }}>
                    <div className="oli-ic" style={{ background: 'var(--sky-soft)', color: 'var(--sky)' }}>{initials(p.name)}</div>
                    <div className="oli-main">
                      <div className="oli-top"><span className="blip" style={{ background: st.color }} /><span className="oli-who">{p.name}</span></div>
                      <div className="oli-sub"><span className="mono">{p.phone}</span> · {cap(p.orderType)}</div>
                    </div>
                    <div className="oli-r">
                      <div className="oli-amt">{money(p.total)}</div>
                      <span className={`pill pill-xs ${st.cls}`}>{st.label}</span>
                      <div className="oli-time">{ago(p.startedAt || p.createdAt)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
          <div className="ol-more op-foot">The server asks Sifalo about every unconfirmed payment on its own — for 48 hours.</div>
        </div>
      </section>

      <section className="ord-detail">
        {!sel ? (
          <div className="od-empty">
            <div>
              <div className="empty-ring">{Ic.cash}</div>
              <div className="empty-title">Select a payment</div>
              <div className="empty-sub">A customer says they paid but has no order? Find them here, check with Sifalo again, or call them.</div>
            </div>
          </div>
        ) : (
          <div className="od-scroll">
            <PaymentDetail
              key={sel.id}
              p={sel}
              checking={recheck.isPending && recheck.variables === sel.id}
              onRecheck={() => recheck.mutate(sel.id)}
              canDismiss={canDismiss}
              onDismiss={() => setDismissing(sel)}
              onBack={() => setDetailOpen(false)}
            />
          </div>
        )}
      </section>

      {dismissing && (
        <DismissModal
          payment={dismissing}
          onClose={() => setDismissing(null)}
          onDone={(res) => {
            setDismissing(null);
            if (res?.orderId) {
              qc.invalidateQueries({ queryKey: ['orders-all'] });
              onOrderCreated?.(res.orderId);
            } else {
              notify.success('Payment dismissed');
            }
            setSelId(null);
            setDetailOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function PaymentDetail({ p, checking, onRecheck, canDismiss, onDismiss, onBack }) {
  const st = STATUS[p.status] || STATUS.checking;
  const facts = [
    ['Customer', p.name],
    ['Phone', <a key="ph" className="mono" href={call(p.phone)}>{p.phone}</a>],
    ['Service', `Online · ${cap(p.orderType)}`],
    p.orderType === 'dine_in' && ['Table', p.tableNumber || '—'],
    p.orderType === 'delivery' && ['Deliver to', p.address || '—'],
    ['Sent to Sifalo', dt(p.startedAt || p.createdAt)],
    ['Last asked Sifalo', p.lastCheckedAt ? `${dt(p.lastCheckedAt)} · ${p.checks} ${p.checks === 1 ? 'time' : 'times'}` : 'Not yet'],
  ].filter(Boolean);

  return (
    <div className="odv odv-embedded">
      <button className="btn btn-ghost btn-sm odv-back" onClick={onBack}>{Ic.back}All payments</button>
      <section className="odv-hero">
        <div className="odv-hero-main">
          <div className="odv-code">Online payment</div>
          <div className="odv-who">{p.name}</div>
          <div className="odv-pills">
            <span className={`pill ${st.cls}`}><span className="pdot" />{st.label}</span>
            <span className="pill pill-ghost">No order yet</span>
          </div>
        </div>
        <div className="odv-hero-side">
          <div className="odv-total">{money(p.total)}</div>
          {p.charged !== p.total && <div className="odv-receipt">Test charge {money(p.charged)} sent to Sifalo</div>}
        </div>
      </section>

      <div className={`note op-reason op-${p.status}`}>{p.reason}</div>

      <div className="odv-actions">
        <button className="btn btn-primary" onClick={onRecheck} disabled={checking}>{Ic.check}{checking ? 'Asking Sifalo…' : 'Check with Sifalo now'}</button>
        <a className="btn btn-ghost" href={call(p.phone)}>Call customer</a>
        <div className="grow" />
        {canDismiss && p.status !== 'checking' && (
          <button className="btn btn-danger" onClick={onDismiss}>{Ic.x}Dismiss</button>
        )}
      </div>

      <div className="odv-grid">
        <div className="odv-main">
          <section className="card odv-card">
            <div className="odv-card-h"><span className="ttl">What they ordered</span></div>
            <div className="op-items">{p.items || '—'}</div>
            <div className="odv-tot"><div className="r t"><span>Total</span><span className="mono">{money(p.total)}</span></div></div>
          </section>
        </div>
        <aside className="odv-side">
          <section className="card odv-card">
            <div className="odv-card-h"><span className="ttl">Details</span></div>
            <dl className="odv-facts">
              {facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}

function DismissModal({ payment, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const form = useFormValidation(dismissPaymentSchema, { reason });
  const dismiss = useMutation({
    mutationFn: () => fetchJson(`/api/admin/online-payments/${payment.id}/dismiss`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.trim() }),
    }),
    onSuccess: onDone,
    onError: (e) => {
      // Sifalo confirmed it at the last moment: the order exists now.
      if (e?.status === 409 && e?.body?.orderId) {
        notify.success('Sifalo confirmed this payment — its order was created instead');
        onDone({ orderId: e.body.orderId });
        return;
      }
      reportSaveError(e, { form, title: 'Could not dismiss the payment' });
    },
  });
  const submit = (e) => {
    e.preventDefault();
    if (!form.check() || dismiss.isPending) return;
    form.setServerErrors(null);
    dismiss.mutate();
  };

  return (
    <div className="jz-modal-bk open" onClick={(e) => { if (e.target === e.currentTarget && !dismiss.isPending) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Dismiss online payment">
        <div className="modal-h">
          <div className="mt"><div className="eyebrow">Dismiss online payment</div><div className="h-1" style={{ marginTop: 3 }}>{payment.name} · {money(payment.total)}</div></div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">{Ic.x}</button>
        </div>
        <form noValidate onSubmit={submit} style={{ display: 'contents' }}>
          <div className="modal-b">
            <div className="note">Sifalo is asked one last time first — if the payment went through, its order is created instead. Dismiss only when you&rsquo;ve spoken to the customer or refunded them in the Sifalo portal. Recorded in the audit log.</div>
            <Field label="Reason" required {...form.fieldProps('reason')}>
              <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Called the customer — they never paid" autoFocus />
            </Field>
          </div>
          <div className="modal-f">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={dismiss.isPending}>Cancel</button>
            <button type="submit" className="btn btn-danger" disabled={dismiss.isPending || !form.valid}>{dismiss.isPending ? 'Checking with Sifalo…' : 'Dismiss'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
