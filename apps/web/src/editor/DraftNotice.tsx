import { RestoreIcon } from '../components/icons';
import { Button } from '../components/ui/Button';
import { formatRelativeTime } from '../utils/format';
import type { Draft } from './drafts';
import './editor.css';

/** PROJECT_SPEC §47: "Unsaved local changes found — Restore / Discard". */
export function DraftNotice({
  draft,
  restoreLabel = 'Restore',
  onRestore,
  onDiscard,
}: {
  draft: Draft;
  restoreLabel?: string;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="draft-notice" role="region" aria-label="Unsaved local changes">
      <RestoreIcon size={16} aria-hidden="true" />
      <div className="draft-notice__text">
        <strong>Unsaved local changes found</strong>
        <span>
          {draft.updatedAt ? `From ${formatRelativeTime(draft.updatedAt)}. ` : ''}They were never
          saved to the file.
        </span>
      </div>
      <Button size="small" variant="primary" onClick={onRestore}>
        {restoreLabel}
      </Button>
      <Button size="small" onClick={onDiscard}>
        Discard
      </Button>
    </div>
  );
}
