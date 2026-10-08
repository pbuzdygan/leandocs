import { forwardRef, type ButtonHTMLAttributes } from 'react';
import './ui.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** UI_SPEC §118: primary sparingly, secondary neutral, ghost for toolbars, danger only destructive. */
  variant?: ButtonVariant;
  size?: 'standard' | 'small';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'standard', className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={['btn', `btn--${variant}`, size === 'small' && 'btn--small', className]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  );
});
