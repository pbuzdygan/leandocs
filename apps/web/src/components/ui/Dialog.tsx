import type { FormEvent, ReactNode } from 'react';
import { Dialog as RadixDialog } from 'radix-ui';
import { CloseIcon } from '../icons';
import './ui.css';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  /** Footer buttons (right-aligned: Cancel, then the primary action). */
  actions: ReactNode;
  /** When set, the dialog body is a form and Enter submits it. */
  onSubmit?: () => void;
  width?: number;
}

/** Modal dialog (UI_SPEC §123): white, border, 8px radius, shadow, no blur. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  actions,
  onSubmit,
  width = 520,
}: DialogProps) {
  const body = (
    <>
      <div className="dialog__header">
        <RadixDialog.Title className="dialog__title">{title}</RadixDialog.Title>
        <RadixDialog.Close className="icon-btn" aria-label="Close">
          <CloseIcon size={16} />
        </RadixDialog.Close>
      </div>
      {description ? (
        <RadixDialog.Description className="dialog__description">
          {description}
        </RadixDialog.Description>
      ) : (
        <RadixDialog.Description className="visually-hidden">{title}</RadixDialog.Description>
      )}
      {children && <div className="dialog__body">{children}</div>}
      <div className="dialog__actions">{actions}</div>
    </>
  );
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="dialog-overlay" />
        <RadixDialog.Content
          className="dialog"
          style={{ width }}
          onOpenAutoFocus={(event) => {
            // Prefer an element marked with data-autofocus (e.g. the selected folder).
            const preferred = (event.currentTarget as HTMLElement).querySelector<HTMLElement>(
              '[data-autofocus]',
            );
            if (preferred) {
              event.preventDefault();
              preferred.focus();
            }
          }}
        >
          {onSubmit ? (
            <form
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                onSubmit();
              }}
            >
              {body}
            </form>
          ) : (
            body
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
