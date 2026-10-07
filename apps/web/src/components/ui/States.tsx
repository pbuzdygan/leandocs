import { useState, type ReactNode } from 'react';
import { LoadingIcon } from '../icons';
import { Button } from './Button';
import './ui.css';

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <LoadingIcon className="spinner" size={16} aria-label={label} role="status" />;
}

/** Skeleton lines instead of a full-screen spinner (UI_SPEC §77). */
export function SkeletonLines({ count = 3, widths }: { count?: number; widths?: string[] }) {
  return (
    <div className="skeleton-group" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="skeleton"
          style={{ width: widths?.[index % widths.length] ?? '100%' }}
        />
      ))}
    </div>
  );
}

/** Centered empty/error state with a small icon — never a large illustration (UI_SPEC §73). */
export function EmptyState({
  icon,
  title,
  children,
  actions,
  level = 2,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  /** 1 when the state replaces the whole page, so the page still has a top-level heading. */
  level?: 1 | 2;
}) {
  const Heading = level === 1 ? 'h1' : 'h2';
  return (
    <div className="empty-state">
      {icon && <div className="empty-state__icon">{icon}</div>}
      <Heading className="empty-state__title">{title}</Heading>
      {children && <div className="empty-state__text">{children}</div>}
      {actions && <div className="empty-state__actions">{actions}</div>}
    </div>
  );
}

/** Error page (UI_SPEC §79): Retry + collapsible details, no stack traces. */
export function ErrorState({
  title,
  message,
  details,
  onRetry,
  level,
}: {
  title: string;
  message: string;
  details?: string;
  onRetry?: () => void;
  level?: 1 | 2;
}) {
  const [open, setOpen] = useState(false);
  return (
    <EmptyState
      title={title}
      level={level}
      actions={onRetry && <Button onClick={onRetry}>Retry</Button>}
    >
      <p>{message}</p>
      {details && (
        <div className="error-details">
          <button
            type="button"
            className="link-button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
          >
            {open ? 'Hide details' : 'Details'}
          </button>
          {open && <pre className="error-details__body">{details}</pre>}
        </div>
      )}
    </EmptyState>
  );
}
