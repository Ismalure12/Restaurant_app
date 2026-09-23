// The payment chips at the till, built from the business money accounts
// (Settings › Business accounts, GET /api/admin/settings → moneyAccounts):
// Cash · one chip per mobile wallet (A/C, E/d, My Cash…) · Card (the business
// Mastercard) · On account. Picking a wallet records WHICH business wallet
// received the money — the cash book and the "by account" reports group on it.
export function paymentOptions(accounts = [], { invoice = true } = {}) {
  const cash = accounts.find((a) => a.kind === 'cash');
  const card = accounts.find((a) => a.kind === 'card');
  return [
    cash && { key: 'cash', method: 'cash', accountId: cash.id, label: 'Cash' },
    ...accounts.filter((a) => a.kind === 'wallet').map((w) => ({ key: `acct:${w.id}`, method: 'evc', accountId: w.id, label: w.label, hint: w.number })),
    card && { key: 'card', method: 'card', accountId: card.id, label: card.label || 'Card' },
    invoice && { key: 'invoice', method: 'invoice', accountId: null, label: 'On account' },
  ].filter(Boolean);
}

/** Accounts a customer can pay into at the till (split parts pick from these). */
export const tillAccounts = (accounts = []) => accounts.filter((a) => a.kind === 'cash' || a.kind === 'wallet' || a.kind === 'card');

export const findOption = (options, key) => options.find((o) => o.key === key) || options[0];
