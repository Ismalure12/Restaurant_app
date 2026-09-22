'use client';

import { Children, Fragment, cloneElement, isValidElement, useId } from 'react';

/**
 * One labelled input with its message UNDER it:
 *   error        red, the thing to fix                     ("Enter the supplier’s name")
 *   requirement  quiet grey, what is needed before saving   (shown until the field is touched)
 *   hint         quiet grey, always-on help text
 *
 * <Field label="Name" required {...form.fieldProps('name')}><input className="input" .../></Field>
 *
 * The FIRST element child gets id / aria-invalid / aria-describedby /
 * aria-required, the blur handler and the red outline — merged with its own
 * (its own id wins and becomes the label's target; its own describedby and
 * onBlur are kept). Anything after it (a hint link, a counter) is left alone.
 *
 * A custom control should be written as a function child so it can place the
 * props itself:  <Field …>{(a11y) => <Picker {...a11y} />}</Field>
 * A component child receives them only if it declares `Comp.fieldControl = true`
 * (and forwards them to its real control); any other component child is left
 * as it is, with a one-time dev warning.
 */
const warned = new Set();
const NATIVE_FIELDS = new Set(['input', 'select', 'textarea']);

export default function Field({ label, required = false, error, requirement, hint, children, className = '', name, onBlur, htmlFor }) {
  const auto = useId();
  const firstIdx = typeof children === 'function' ? -1 : Children.toArray(children).findIndex(isValidElement);
  const first = firstIdx >= 0 ? Children.toArray(children)[firstIdx] : null;
  const id = first?.props?.id || htmlFor || `f-${name || 'x'}-${auto}`;
  const msgId = `${id}-msg`;
  // Does the control actually carry `id`? (If not, the label mustn't point at nothing.)
  const reaches = typeof children === 'function' || typeof first?.type === 'string' || !!first?.type?.fieldControl;
  const message = error || requirement || hint;
  const a11y = {
    id,
    onBlur,
    'aria-invalid': error ? true : undefined,
    'aria-required': required || undefined,
    'aria-describedby': message ? msgId : undefined,
  };

  let control;
  if (typeof children === 'function') {
    control = children(a11y);
  } else {
    control = Children.toArray(children).map((child, i) => {
      if (i !== firstIdx || child.type === Fragment) return child;
      const own = child.props || {};
      const native = typeof child.type === 'string';
      // A component gets the props only when it says it forwards them
      // (`MyPicker.fieldControl = true`); otherwise they'd vanish silently.
      if (!native && !child.type?.fieldControl) {
        if (process.env.NODE_ENV !== 'production') {
          const tag = child.type?.displayName || child.type?.name || 'component';
          if (!warned.has(tag)) {
            warned.add(tag);
            console.warn(`<Field> wraps <${tag}>, which doesn't forward id / aria-* / onBlur. Use a function child ((a11y) => <${tag} {...a11y} />) or set ${tag}.fieldControl = true and forward them.`);
          }
        }
        return child;
      }
      const describedBy = [own['aria-describedby'], a11y['aria-describedby']].filter(Boolean).join(' ') || undefined;
      const cls = [own.className, error && native && NATIVE_FIELDS.has(child.type) ? 'input-err' : ''].filter(Boolean).join(' ');
      return cloneElement(child, {
        ...a11y,
        'aria-invalid': own['aria-invalid'] ?? a11y['aria-invalid'],
        'aria-required': own['aria-required'] ?? a11y['aria-required'],
        'aria-describedby': describedBy,
        onBlur: (e) => { own.onBlur?.(e); onBlur?.(e); },
        ...(cls ? { className: cls } : {}),
      });
    });
  }

  return (
    <div className={`ff fld ${className}`.trim()}>
      {label && (
        <label htmlFor={reaches ? id : htmlFor}>
          {label}
          {required && <span className="fld-req" aria-hidden="true"> *</span>}
        </label>
      )}
      {control}
      {message && (
        <div id={msgId} className={error ? 'field-err' : 'fld-note'} role={error ? 'alert' : undefined}>
          {message}
        </div>
      )}
    </div>
  );
}
