import { useMemo, useState } from 'react';
import type { DocumentDto } from '@leandocs/shared';
import { useQuery } from '@tanstack/react-query';
import { diffLines } from 'diff';
import { useNavigate } from 'react-router';
import { api, errorMessage } from '../api/client';
import { useContentMutation } from '../api/queries';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { FormError } from '../components/ui/Field';
import { SkeletonLines } from '../components/ui/States';
import { useNotify } from '../components/ui/Toast';
import { formatDate, parentPath, stripExtension } from '../utils/format';
import type { EditorSession, SessionState } from './editor-session';
import './editor.css';

function copyName(path: string): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${stripExtension(path.split('/').pop() ?? 'Document')} (conflict copy ${stamp})`;
}

/**
 * UI_SPEC §69: the file changed on disk while this editor had unsaved changes. Nothing is
 * overwritten by default. Options: review the differences, reload from disk, save my version as a
 * copy, or (only from the review) explicitly keep my version.
 */
export function ConflictDialog({
  document,
  session,
  state,
  onClose,
}: {
  document: DocumentDto;
  session: EditorSession;
  state: SessionState;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const notify = useNotify();
  const [reviewing, setReviewing] = useState(false);
  const disk = useQuery({
    queryKey: ['conflict', document.id, state.conflictRevision],
    queryFn: () => api.document(document.id),
    staleTime: 0,
  });
  const saveCopy = useContentMutation(() =>
    api.createDocument({
      name: copyName(document.path),
      folder: parentPath(document.path),
      title: `${document.title} (conflict copy)`,
      content: state.content,
    }),
  );
  const [overwriteError, setOverwriteError] = useState<string | null>(null);

  const reload = () => {
    if (!disk.data) return;
    session.reload(disk.data);
    notify.info('Reloaded the version from disk');
    onClose();
  };

  const copy = () =>
    saveCopy.mutate(undefined, {
      onSuccess: (created) => {
        if (disk.data) session.reload(disk.data);
        notify.info(`Your version was saved as "${created.title}"`);
        onClose();
        void navigate(`/doc/${encodeURIComponent(created.id)}/edit`);
      },
    });

  const overwrite = async () => {
    setOverwriteError(null);
    await session.overwrite();
    const next = session.getState();
    if (next.status === 'saved' || next.status === 'unsaved') {
      notify.info('Your version was saved');
      onClose();
    } else if (next.status === 'error') {
      setOverwriteError(next.error ?? 'Save failed');
    }
  };

  const parts = useMemo(
    () => (disk.data && reviewing ? diffLines(disk.data.content, state.content) : []),
    [disk.data, reviewing, state.content],
  );

  if (reviewing) {
    return (
      <Dialog
        open
        onOpenChange={(open) => !open && onClose()}
        title="Review changes"
        description="Red lines exist only on disk; green lines exist only in your editor."
        width={760}
        actions={
          <>
            <Button onClick={() => setReviewing(false)}>Back</Button>
            <Button
              variant="danger"
              onClick={() => void overwrite()}
              disabled={state.status === 'saving'}
            >
              Keep my version
            </Button>
          </>
        }
      >
        <FormError message={overwriteError} />
        {disk.isPending ? (
          <SkeletonLines count={6} />
        ) : (
          <pre className="diff" aria-label="Differences">
            {parts.map((part, index) => (
              <span
                key={index}
                className={
                  part.added ? 'diff__added' : part.removed ? 'diff__removed' : 'diff__same'
                }
              >
                {part.value
                  .replace(/\n$/, '')
                  .split('\n')
                  .map((line) => `${part.added ? '+ ' : part.removed ? '- ' : '  '}${line}`)
                  .join('\n')}
                {'\n'}
              </span>
            ))}
          </pre>
        )}
        <p className="diff__note">
          "Keep my version" replaces the file on disk with your editor content. The other changes
          are lost unless you saved them elsewhere.
        </p>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Document changed outside the editor"
      description="This document was modified after you opened it."
      width={520}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button onClick={copy} disabled={saveCopy.isPending}>
            Save as copy
          </Button>
          <Button onClick={reload} disabled={!disk.data}>
            Reload from disk
          </Button>
        </>
      }
    >
      <FormError
        message={
          disk.error
            ? errorMessage(disk.error)
            : saveCopy.error
              ? errorMessage(saveCopy.error)
              : null
        }
      />
      <dl className="conflict-facts">
        <dt>Modified on disk</dt>
        <dd>
          {disk.data?.updated
            ? `${formatDate(disk.data.updated)} ${new Date(disk.data.updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : '—'}
        </dd>
        <dt>Your editor</dt>
        <dd>unsaved changes</dd>
      </dl>
      <Button variant="primary" onClick={() => setReviewing(true)} data-autofocus>
        Review changes
      </Button>
    </Dialog>
  );
}
