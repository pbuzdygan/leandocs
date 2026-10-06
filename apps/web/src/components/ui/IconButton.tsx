import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Tooltip } from 'radix-ui';
import './ui.css';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name; also shown as tooltip (UI_SPEC §117). */
  label: string;
  children: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, children, className, type = 'button', ...props },
  ref,
) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          ref={ref}
          type={type}
          aria-label={label}
          className={['icon-btn', className].filter(Boolean).join(' ')}
          {...props}
        >
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" sideOffset={6}>
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
});
