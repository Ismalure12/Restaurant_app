'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchJson, parseApiError } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import { RowsSkeleton } from '@/components/admin/Skeletons';
import Modal from '@/components/admin/Modal';

const KINDS = [
  ['operating', 'Operating', 'Running costs of the month: rent, power, supplies. Counted as an expense.'],
  ['payroll', 'Payroll', 'Salaries and wages. Shown on their own line in the profit statement.'],
  ['stock_purchase', 'Stock purchase', 'Cost of goods. Entered through Inventory purchases, and counted through stock, not as an expense.'],
];

/** Manager: which statement line each expense category lands on. */
export default function ExpenseCategoriesDialog({ onClose }) {
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['expense-categories'], queryFn: () => fetchJson('/api/admin/expense-categories') });
  const [busy, setBusy] = useState('');

  const save = useMutation({
    mutationFn: ({ name, kind }) => fetchJson('/api/admin/expense-categories', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, kind }) }),
    onMutate: ({ name }) => { setBusy(name); },
    onSuccess: (_d, v) => { notify.success(`${v.name} updated`); qc.invalidateQueries({ queryKey: ['expense-categories'] }); },
    onError: (e, v) => { notify.error(e, { title: `Could not update ${v.name}` }); qc.invalidateQueries({ queryKey: ['expense-categories'] }); },
    onSettled: () => setBusy(''),
  });

  return (
    <Modal eyebrow="Expense categories" title="What each category means" onClose={onClose} wide>
      <div className="modal-b">
        <div className="stm-kinds">
          {KINDS.map(([k, l, d]) => <div key={k}><b>{l}</b>: {d}</div>)}
        </div>
        {isLoading ? <RowsSkeleton rows={4} /> : isError ? <div className="adm-error-banner">{parseApiError(error)}</div> : (data || []).length === 0 ? (
          <p className="note">No categories yet. They appear when you log the first expense.</p>
        ) : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Category</th><th className="num">Entries</th><th>Kind</th></tr></thead>
            <tbody>{data.map((c) => (
              <tr key={c.id}>
                <td className="strong" style={{ textTransform: 'capitalize' }}>{c.name}</td>
                <td className="num muted">{c.expenses}</td>
                <td>
                  <select className="input stm-kind" value={c.kind} disabled={busy === c.name} aria-label={`Kind of ${c.name}`}
                    onChange={(e) => save.mutate({ name: c.name, kind: e.target.value })}>
                    {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      <div className="modal-f"><button className="btn btn-primary" onClick={onClose}>Done</button></div>
    </Modal>
  );
}
