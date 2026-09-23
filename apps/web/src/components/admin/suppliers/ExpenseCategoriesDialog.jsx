'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import {
  Modal, ModalSpacer, Button, Table, Th, Td, Tr, RowSkeletons, ErrorState, EmptyState, selectCls,
} from '@/components/admin/ui';

const KINDS = [
  ['operating', 'Operating', 'Running costs of the month: rent, power, supplies. Counted as an expense.'],
  ['payroll', 'Payroll', 'Salaries and wages. Shown on their own line in the profit statement.'],
  ['stock_purchase', 'Stock purchase', 'Cost of goods. Entered through Inventory purchases, and counted through stock, not as an expense.'],
];

/** Manager: which statement line each expense category lands on. */
export default function ExpenseCategoriesDialog({ onClose }) {
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['expense-categories'], queryFn: () => fetchJson('/api/admin/expense-categories') });
  const [busy, setBusy] = useState('');

  const save = useMutation({
    mutationFn: ({ name, kind }) => fetchJson('/api/admin/expense-categories', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, kind }) }),
    onMutate: ({ name }) => { setBusy(name); },
    onSuccess: (_d, v) => { notify.success(`${v.name} updated`); qc.invalidateQueries({ queryKey: ['expense-categories'] }); },
    onError: (e, v) => { notify.error(e, { title: `Could not update ${v.name}` }); qc.invalidateQueries({ queryKey: ['expense-categories'] }); },
    onSettled: () => setBusy(''),
  });

  return (
    <Modal
      eyebrow="Expense categories"
      title="What each category means"
      icon="categories"
      onClose={onClose}
      width={620}
      footer={<><ModalSpacer /><Button variant="primary" size="lg" onClick={onClose}>Done</Button></>}
    >
      <dl className="m-0 mb-4 grid gap-2 rounded-[10px] border border-mq-line bg-mq-cream px-3.5 py-3 text-[12.5px] leading-normal text-mq-body">
        {KINDS.map(([k, l, d]) => (
          <div key={k}><dt className="inline font-semibold text-mq-ink">{l}: </dt><dd className="inline m-0">{d}</dd></div>
        ))}
      </dl>
      {isLoading ? <RowSkeletons rows={4} className="!p-0" /> : isError ? <ErrorState error={error} onRetry={() => refetch()} /> : (data || []).length === 0 ? (
        <EmptyState icon="categories" title="No categories yet">They appear when you log the first expense.</EmptyState>
      ) : (
        <div className="border border-mq-line rounded-xl overflow-hidden">
          <Table maxH={360} label="Expense categories">
            <thead><tr><Th>Category</Th><Th align="right">Entries</Th><Th>Kind</Th></tr></thead>
            <tbody>{data.map((c) => (
              <Tr key={c.id}>
                <Td strong className="capitalize">{c.name}</Td>
                <Td money className="!font-normal !text-mq-muted">{c.expenses}</Td>
                <Td className="!py-1.5">
                  <select
                    className={selectCls({ size: 'sm', className: 'min-w-[160px]' })}
                    value={c.kind}
                    disabled={busy === c.name}
                    aria-label={`Kind of ${c.name}`}
                    onChange={(e) => save.mutate({ name: c.name, kind: e.target.value })}
                  >
                    {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </Td>
              </Tr>
            ))}</tbody>
          </Table>
        </div>
      )}
    </Modal>
  );
}
