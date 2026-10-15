import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { LoadingIcon } from '../icons';
import './ui.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** UI_SPEC §118: primary sparingly, secondary neutral, ghost for toolbars, danger only destructive. */
  variant?: ButtonVariant;
  size?: 'standard' | 'small';
  /** Busy: a spinner before the unchanged label; the button is disabled until it ends. */
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'standard',
    loading = false,
    className,
    type = 'button',
    disabled,
    children,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={['btn', `btn--${variant}`, size === 'small' && 'btn--small', className]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <LoadingIcon className="spinner" size={14} aria-hidden="true" />}
      {children}
    </button>
  );
});
