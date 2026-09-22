'use client';

import useTables, { tableKey } from '@/hooks/useTables';

/**
 * Dine-in table field. With tables defined it is a select of the active tables
 * (the value is the table's canonical name); with none it stays the free-text
 * input it always was. A legacy spelling ("T5") is matched to its table.
 */
export default function TablePicker({ value, onChange, id, invalid, placeholder = 'Table no. (optional)', required = false, onBlur, 'aria-describedby': describedBy }) {
  const { tables, hasTables } = useTables();
  if (!hasTables) {
    return <input id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} aria-describedby={describedBy} placeholder={placeholder} />;
  }
  const match = value ? tables.find((t) => tableKey(t.name) === tableKey(value)) : null;
  return (
    <select id={id} className={`input${invalid && !match ? ' input-err' : ''}`} value={match ? match.name : ''} required={required} aria-required={required} aria-invalid={Boolean(invalid && !match)}
      aria-describedby={describedBy} onBlur={onBlur} onChange={(e) => onChange(e.target.value)}>
      <option value="">Table — required</option>
      {tables.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
    </select>
  );
}
// <Field> may hand it id / aria-describedby / onBlur (see Field.jsx).
TablePicker.fieldControl = true;
