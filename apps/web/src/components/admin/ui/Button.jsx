'use client';

import Link from 'next/link';
import { forwardRef } from 'react';
import cx from './cx';
import Icon from './icons';

// docs/admin-design-system.md §4. `href` renders a Next <Link>.
const VARIANT = {
  primary: 'bg-mq-cta text-mq-cream shadow-mq-btn hover:bg-mq-primary',
  secondary: 'bg-white text-mq-body border border-mq-line hover:bg-mq-canvas hover:border-mq-line-2',
  soft: 'bg-mq-soft text-mq-primary hover:bg-mq-soft-2',
  ghost: 'bg-transparent text-mq-muted hover:bg-mq-chip hover:text-mq-ink',
  'danger-soft': 'bg-mq-danger-bg text-mq-danger-ink border border-mq-danger-line hover:bg-mq-danger-bg-hover',
  danger: 'bg-mq-danger text-white hover:bg-mq-danger-hover',
  link: 'bg-transparent text-mq-cta hover:text-mq-primary !px-0 !h-auto',
};
const SIZE = {
  xs: 'h-8 px-2.5 text-[12.5px] rounded-[7px]',
  sm: 'h-9 px-3.5 text-[13.5px]',
  md: 'h-[38px] px-4 text-[13.5px]',
  lg: 'h-10 px-4 text-sm',
  xl: 'h-12 px-5 text-[15px]',
};
const DISABLED = 'disabled:bg-mq-canvas disabled:text-mq-disabled disabled:border disabled:border-mq-line disabled:shadow-none disabled:cursor-not-allowed';

export function buttonCls({ variant = 'secondary', size = 'md', block = false, className = '' } = {}) {
  return cx(
    'inline-flex items-center justify-center gap-[7px] rounded-lg font-semibold whitespace-nowrap select-none transition-colors',
    'focus-visible:outline-none focus-visible:shadow-mq-focus',
    VARIANT[variant], SIZE[size], DISABLED, block && 'w-full', className,
  );
}

const Button = forwardRef(function Button(
  { variant = 'secondary', size = 'md', icon, iconRight, block, className, href, children, type = 'button', ...rest },
  ref,
) {
  const cls = buttonCls({ variant, size, block, className });
  const iconSize = size === 'xs' ? 14 : size === 'xl' ? 17 : 15;
  const body = (
    <>
      {icon && <Icon name={icon} size={iconSize} stroke={2} />}
      {children}
      {iconRight && <Icon name={iconRight} size={iconSize} stroke={2} />}
    </>
  );
  if (href) return <Link ref={ref} href={href} className={cls} {...rest}>{body}</Link>;
  return <button ref={ref} type={type} className={cls} {...rest}>{body}</button>;
});
export default Button;

/** Square icon-only button. Always give it a `label` (aria-label + title). */
export const IconButton = forwardRef(function IconButton(
  { icon, label, size = 36, variant = 'outline', className, href, children, iconSize = 16, ...rest },
  ref,
) {
  const cls = cx(
    'relative inline-grid place-items-center flex-none rounded-lg transition-colors',
    'focus-visible:outline-none focus-visible:shadow-mq-focus disabled:opacity-50 disabled:cursor-not-allowed',
    variant === 'outline' && 'bg-white border border-mq-line text-mq-muted hover:bg-mq-canvas hover:text-mq-ink',
    variant === 'ghost' && 'bg-transparent text-mq-muted hover:bg-mq-chip hover:text-mq-ink',
    variant === 'danger' && 'bg-transparent text-mq-muted hover:bg-mq-danger-bg hover:text-mq-danger-ink',
    className,
  );
  const style = { width: size, height: size };
  const body = <>{icon && <Icon name={icon} size={iconSize} />}{children}</>;
  if (href) return <Link ref={ref} href={href} className={cls} style={style} aria-label={label} title={label} {...rest}>{body}</Link>;
  return <button ref={ref} type="button" className={cls} style={style} aria-label={label} title={label} {...rest}>{body}</button>;
});
