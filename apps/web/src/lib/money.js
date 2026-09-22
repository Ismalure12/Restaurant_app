/** "$1,234.50" — and "-$2.00" for a negative (never "$-2.00"). The one money formatter for the admin. */
export const money = (n) => {
  const v = Number(n || 0);
  const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 && Number(s.replace(/,/g, '')) !== 0 ? '-' : ''}$${s}`;
};
