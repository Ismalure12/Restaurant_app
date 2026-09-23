'use client';

import useTables, { tableKey } from '@/hooks/useTables';
import { inputCls, selectCls } from '@/components/admin/ui';

/**
 * Dine-in table field. With tables defined it is a select of the active tables
 * (the value is the table's canonical name); with none it stays the free-text
 * input it always was. A legacy spelling ("T5") is matched to its table.
 * `size` = the kit field size (lg 42 in dialogs, xl 46 on the touch Register).
 */
export default function TablePicker({
  value, onChange, id, invalid, placeholder = 'Table no. (optional)', required = false, onBlur,
  size = 'lg', className = '',
  'aria-describedby': describedBy, 'aria-invalid': ariaInvalid,
}) {
  const { tables, hasTables } = useTables();
  if (!hasTables) {
    return (
      <input id={id} className={inputCls({ size, className })} value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur}
        aria-describedby={describedBy} aria-invalid={ariaInvalid || undefined} placeholder={placeholder} aria-label={id ? undefined : 'Table'} />
    );
  }
  const match = value ? tables.find((t) => tableKey(t.name) === tableKey(value)) : null;
  const bad = Boolean((invalid || ariaInvalid) && !match);
  return (
    <select id={id} className={selectCls({ size, className })} value={match ? match.name : ''} required={required} aria-required={required} aria-invalid={bad || undefined}
      aria-describedby={describedBy} aria-label={id ? undefined : 'Table'} onBlur={onBlur} onChange={(e) => onChange(e.target.value)}>
      <option value="">Table — required</option>
      {tables.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
    </select>
  );
}
// <Field> may hand it id / aria-describedby / aria-invalid / onBlur (see Field.jsx).
TablePicker.fieldControl = true;
