'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import { reportSaveError } from '@/lib/saveError';
import { useFormValidation } from '@/lib/formValidation';
import { dismissPaymentSchema } from '@/lib/schemas/sales';
import Field from '@/components/admin/Field';
import { ORDER_COUNTS_KEY } from '@/hooks/useOrderCounts';
import useAccess from '@/hooks/useAccess';
import { Alert, Button, Card, CardHeader, Chip, Facts, Modal, ModalSpacer, textareaCls, cx } from '@/components/admin/ui';
import { MANAGER_ROLES, age, cap, dt, money } from './orderUi';

// Online checkouts where the customer was sent to Sifalo but no order exists
// (yet). The server keeps asking Sifalo on its own (payment reconciler); the
// Orders list shows the ones that need staff in "Needs a decision", with this
// pane for the chosen one: check with Sifalo now (staff) or dismiss (manager,
// with a reason, audited). Never shows the Sifalo reference.

export const ONLINE_PAYMENTS_KEY = ['online-payments'];

/** GET /api/admin/online-payments → the payments array. One key, one shape (also refreshed by useLiveOrders). */
export function useOnlinePayments({ enabled = true } = {}) {
  const q = useQuery({
    queryKey: ONLINE_PAYMENTS_KEY,
    queryFn: () => fetchJson('/api/admin/online-payments'),
    refetchInterval: 30_000,
    enabled,
  });
  const payments = useMemo(() => (Array.isArray(q.data?.payments) ? q.data.payments : []), [q.data]);
  return { ...q, payments };
}

// attention + stuck = the badge's "stuck payments" (need a decision);
// checking = just started, not_paid = Sifalo says nobody paid.
export const PAY_STATUS = {
  attention: { label: 'Needs attention', tone: 'danger', stuck: true },
  stuck: { label: 'Stuck payment', tone: 'danger', stuck: true },
  checking: { label: 'Checking', tone: 'info' },
  not_paid: { label: 'Not paid', tone: 'off' },
};
export const isStuck = (p) => Boolean(PAY_STATUS[p.status]?.stuck);

const call = (phone) => `tel:+${String(phone).startsWith('252') ? phone : `252${phone}`}`;

/**
 * The chosen payment: who, how much, why it's here, and what staff can do.
 * onResolved(orderId|null) — Sifalo confirmed it (an order now exists) or it
 * was dismissed; the caller refreshes its selection.
 */
export default function PaymentDetail({ payment: p, onBack, onResolved }) {
  const qc = useQueryClient();
  const [dismissing, setDismissing] = useState(false);
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => fetchJson('/api/auth/me'), staleTime: 5 * 60 * 1000 });
  const canDismiss = MANAGER_ROLES.includes(me?.role);
  const canRecheck = useAccess().canAct('orders');
  const st = PAY_STATUS[p.status] || PAY_STATUS.checking;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ONLINE_PAYMENTS_KEY });
    qc.invalidateQueries({ queryKey: ORDER_COUNTS_KEY });
  };

  const recheck = useMutation({
    mutationFn: () => fetchJson(`/api/admin/online-payments/${p.id}/recheck`, { method: 'POST' }),
    onSuccess: (res) => {
      if (res.state === 'paid') {
        notify.success('Payment confirmed by Sifalo — the order is now in Orders');
        qc.invalidateQueries({ queryKey: ['orders-all'] });
        onResolved?.(res.orderId ?? null);
      } else if (res.state === 'pending') {
        notify.info('Sifalo still shows it as pending — the server keeps checking on its own');
      } else {
        notify.info(res.payment?.reason || 'Sifalo has no successful payment for this checkout');
      }
      refresh();
    },
    onError: (e) => notify.error(e, { title: 'Could not check with Sifalo' }),
  });

  const facts = [
    ['Customer', p.name],
    ['Phone', <a key="ph" className="font-mq-mono text-[12.5px] text-mq-cta hover:text-mq-primary" href={call(p.phone)}>{p.phone}</a>],
    ['Service', `Online · ${cap(p.orderType)}`],
    p.orderType === 'dine_in' && ['Table', p.tableNumber || '—'],
    p.orderType === 'delivery' && ['Deliver to', p.address || '—'],
    ['Sent to Sifalo', <span key="s" className="font-mq-mono text-[12.5px] tabular-nums">{dt(p.startedAt || p.createdAt)}</span>],
    ['Last asked', p.lastCheckedAt ? `${dt(p.lastCheckedAt)} · ${p.checks} ${p.checks === 1 ? 'time' : 'times'}` : 'Not yet'],
  ].filter(Boolean);
  const btn = 'max-nar:h-12';

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 flex flex-col gap-4 w-full max-w-[820px] mx-auto px-4 py-5 tab:px-6">
        {onBack && <Button variant="secondary" size="sm" icon="chevLeft" onClick={onBack} className="self-start max-nar:h-11">All orders</Button>}

        <Card pad={false} className={cx('flex items-start justify-between gap-4 flex-wrap px-5 py-[18px]', st.stuck && 'shadow-[inset_3px_0_0_#C8321F]')}>
          <div className="min-w-0 flex-[1_1_220px] flex flex-col gap-1">
            <span className="font-mq-mono text-xs font-semibold text-mq-muted">Online payment · no order yet</span>
            <span className="text-[26px] font-semibold tracking-[-.02em] leading-tight text-mq-ink break-words">{p.name}</span>
            <span className="flex flex-wrap gap-1.5 mt-1.5">
              <Chip tone={st.tone}>{st.label}</Chip>
              <Chip tone="off" dot={false}>Online · {cap(p.orderType)}</Chip>
            </span>
          </div>
          <div className="text-right flex-none">
            <div className="font-mq-mono text-[32px] font-medium tracking-[-.03em] leading-none tabular-nums text-mq-ink">{money(p.total)}</div>
            <div className="text-[12.5px] text-mq-muted mt-1.5">{age(p.startedAt || p.createdAt)} ago</div>
            {p.charged !== p.total && <div className="text-xs text-mq-muted mt-1">Test charge {money(p.charged)} sent to Sifalo</div>}
          </div>
        </Card>

        {p.reason && <Alert tone={p.status === 'attention' ? 'danger' : p.status === 'not_paid' ? 'info' : 'warn'}>{p.reason}</Alert>}

        <Card className="overflow-hidden">
          <CardHeader title="What they ordered" />
          <p className="m-0 px-4 py-3 text-sm text-mq-body break-words">{p.items || '—'}</p>
          <div className="flex items-baseline justify-between gap-3 px-4 py-3 bg-mq-cream border-t border-mq-line text-[17px] font-bold text-mq-ink">
            <span>Total</span><span className="font-mq-mono tabular-nums">{money(p.total)}</span>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="Details" />
          <div className="p-4"><Facts items={facts} /></div>
        </Card>
        <p className="m-0 text-xs text-mq-muted">The server asks Sifalo about every unconfirmed payment on its own — for 48 hours.</p>
      </div>

      <div className="sticky bottom-0 z-[2] bg-white border-t border-mq-line px-4 py-3 tab:px-5 flex flex-wrap items-center gap-2">
        {canRecheck && (
          <Button variant="primary" size="lg" icon="refresh" className={cx('flex-[1_1_180px]', btn)} onClick={() => recheck.mutate()} disabled={recheck.isPending}>
            {recheck.isPending ? 'Asking Sifalo…' : 'Check with Sifalo now'}
          </Button>
        )}
        <Button size="lg" href={call(p.phone)} className={btn}>Call customer</Button>
        {canDismiss && p.status !== 'checking' && (
          <Button variant="danger-soft" size="lg" icon="x" className={btn} onClick={() => setDismissing(true)}>Dismiss</Button>
        )}
      </div>

      {dismissing && (
        <DismissModal
          payment={p}
          onClose={() => setDismissing(false)}
          onDone={(res) => {
            setDismissing(false);
            if (res?.orderId) qc.invalidateQueries({ queryKey: ['orders-all'] });
            else notify.success('Payment dismissed');
            refresh();
            onResolved?.(res?.orderId ?? null);
          }}
        />
      )}
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
    e?.preventDefault();
    if (!form.check() || dismiss.isPending) return;
    form.setServerErrors(null);
    dismiss.mutate();
  };

  return (
    <Modal
      title={`Dismiss ${payment.name}’s payment?`}
      eyebrow="Online payment"
      sub="Sifalo is asked one last time first — if the payment went through, its order is created instead. Dismiss only when you’ve spoken to the customer or refunded them in the Sifalo portal. Recorded in the audit log."
      icon="x"
      tone="danger"
      width={480}
      onClose={onClose}
      busy={dismiss.isPending}
      footer={(
        <>
          <ModalSpacer />
          <Button variant="secondary" size="lg" onClick={onClose} disabled={dismiss.isPending}>Keep it</Button>
          <Button variant="danger" size="lg" type="submit" form="dismiss-payment-form" disabled={dismiss.isPending || !form.valid}>
            {dismiss.isPending ? 'Checking with Sifalo…' : `Dismiss ${money(payment.total)}`}
          </Button>
        </>
      )}
    >
      <form id="dismiss-payment-form" noValidate onSubmit={submit}>
        <Field label="Reason" required {...form.fieldProps('reason')}>
          <textarea className={textareaCls()} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Called the customer — they never paid" />
        </Field>
      </form>
    </Modal>
  );
}
