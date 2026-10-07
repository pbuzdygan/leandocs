import { useState, type FormEvent, type ReactNode } from 'react';
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

/**
 * Where focus goes back to when a dialog closes (WCAG 2.4.3). Dialogs here are opened from
 * code, not from a Radix trigger, so Radix would drop focus on the page body. A dialog chosen
 * from a menu was focused from a menu item that no longer exists; its menu's button stands in.
 * Editors are skipped: focusing a text surface from code would move its caret, so they restore
 * focus themselves.
 */
function returnFocusTarget(): HTMLElement | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active === document.body || active.isContentEditable)
    return null;
  const menu = active.closest<HTMLElement>('[role="menu"]');
  const trigger = menu?.id
    ? document.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(menu.id)}"]`)
    : null;
  return trigger ?? active;
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
  // Remember the opener while focus is still on it: at the render that opens the dialog.
  const [opener, setOpener] = useState(() => (open ? returnFocusTarget() : null));
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setOpener(returnFocusTarget());
  }
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
          onCloseAutoFocus={(event) => {
            // Only when nothing else took focus (an editor may already have refocused itself).
            const active = document.activeElement;
            const unclaimed = !active || active === document.body || !active.isConnected;
            if (unclaimed && opener?.isConnected) {
              event.preventDefault();
              opener.focus();
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
