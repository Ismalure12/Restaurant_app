// Shared by /api/admin/expenses and /api/admin/expenses/:id so a created,
// listed and edited expense all come back in one shape.

export const EXPENSE_INCLUDE = {
  staff: { select: { name: true, email: true } },
  paidFrom: { select: { id: true, label: true } },
  salaryPayment: { select: { id: true } },
} as const;

export function serializeExpense(e: any) {
  return {
    id: e.id,
    category: e.category,
    amount: Number(e.amount).toFixed(2),
    note: e.note,
    recordedBy: e.staff ? (e.staff.name || e.staff.email) : null,
    paidFromAccountId: e.paidFrom?.id ?? null,
    paidFrom: e.paidFrom?.label ?? null,
    incurredAt: e.incurredAt,
    createdAt: e.createdAt,
  };
}

// The form sends a date-only "YYYY-MM-DD". Anchor it at local noon so a
// timezone offset can never push it onto the previous or next day.
export function parseExpenseDate(value: string | null | undefined) {
  if (!value) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
}
