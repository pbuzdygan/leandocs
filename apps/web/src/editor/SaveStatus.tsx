import { AlertIcon, CheckIcon, DotIcon, LoadingIcon, WarningIcon } from '../components/icons';
import type { SessionState } from './editor-session';
import './editor.css';

/**
 * Save status (UI_SPEC §33): always visible, very subtle; problems are coloured AND labelled
 * (never colour alone), and clickable to resolve them. No toasts for autosave.
 */
export function SaveStatus({
  state,
  onRetry,
  onResolveConflict,
}: {
  state: SessionState;
  onRetry: () => void;
  onResolveConflict: () => void;
}) {
  const content = (() => {
    switch (state.status) {
      case 'saved':
        return (
          <span className="save-status">
            <CheckIcon size={14} aria-hidden="true" /> Saved
          </span>
        );
      case 'saving':
        return (
          <span className="save-status">
            <LoadingIcon size={14} className="spinner" aria-hidden="true" /> Saving…
          </span>
        );
      case 'unsaved':
        return (
          <span className="save-status">
            <DotIcon size={14} aria-hidden="true" /> Unsaved
          </span>
        );
      case 'conflict':
        return (
          <button
            type="button"
            className="save-status save-status--warning"
            onClick={onResolveConflict}
          >
            <WarningIcon size={14} aria-hidden="true" /> Conflict
          </button>
        );
      case 'error':
        return (
          <button
            type="button"
            className="save-status save-status--danger"
            onClick={onRetry}
            title={state.error ? `${state.error} — click to retry` : 'Click to retry'}
          >
            <AlertIcon size={14} aria-hidden="true" /> Save failed
          </button>
        );
    }
  })();
  return (
    <div role="status" aria-live="polite" aria-label="Save status" className="save-status-wrap">
      {content}
    </div>
  );
}
