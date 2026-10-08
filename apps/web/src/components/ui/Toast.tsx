import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Toast as RadixToast } from 'radix-ui';
import { CloseIcon } from '../icons';
import './ui.css';

export interface ToastOptions {
  message: string;
  tone?: 'neutral' | 'error';
  /** Optional action, e.g. "Undo" after moving something to the trash. */
  action?: { label: string; onClick: () => void };
}

interface ToastEntry extends ToastOptions {
  id: number;
}

const ToastContext = createContext<(options: ToastOptions) => void>(() => undefined);

/** Toasts (UI_SPEC §71–72): bottom-right, 4–5 s, errors stay longer. Never for autosave. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const show = useCallback((options: ToastOptions) => {
    setToasts((current) => [...current, { ...options, id: Date.now() + Math.random() }]);
  }, []);
  const remove = (id: number) => setToasts((current) => current.filter((toast) => toast.id !== id));

  return (
    <ToastContext.Provider value={show}>
      <RadixToast.Provider swipeDirection="right">
        {children}
        {toasts.map((toast) => (
          <RadixToast.Root
            key={toast.id}
            className={toast.tone === 'error' ? 'toast toast--error' : 'toast'}
            duration={toast.tone === 'error' ? 10_000 : 5_000}
            onOpenChange={(open) => !open && remove(toast.id)}
          >
            <RadixToast.Description className="toast__message">
              {toast.message}
            </RadixToast.Description>
            {toast.action && (
              <RadixToast.Action
                className="toast__action"
                altText={toast.action.label}
                onClick={toast.action.onClick}
              >
                {toast.action.label}
              </RadixToast.Action>
            )}
            <RadixToast.Close className="icon-btn" aria-label="Dismiss">
              <CloseIcon size={14} />
            </RadixToast.Close>
          </RadixToast.Root>
        ))}
        <RadixToast.Viewport className="toast-viewport" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): (options: ToastOptions) => void {
  return useContext(ToastContext);
}

/** Memoised helpers for the most common toasts. */
export function useNotify() {
  const show = useToast();
  return useMemo(
    () => ({
      info: (message: string, action?: ToastOptions['action']) =>
        show(action ? { message, action } : { message }),
      error: (message: string) => show({ message, tone: 'error' }),
    }),
    [show],
  );
}
