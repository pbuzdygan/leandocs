import { AttachmentIcon } from '../components/icons';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AttachmentDto } from '@leandocs/shared';
import { api, errorMessage } from '../api/client';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { useNotify } from '../components/ui/Toast';
import './attachments.css';

export const attachmentKey = (id: string) => ['attachments', id];

export function AttachmentPanel({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const notify = useNotify();
  const query = useQuery({ queryKey: attachmentKey(id), queryFn: () => api.attachments(id) });
  const [target, setTarget] = useState<AttachmentDto>();
  const [deleting, setDeleting] = useState(false);
  const remove = async () => {
    if (!target) return;
    setDeleting(true);
    try {
      await api.deleteAttachment(id, target.name);
      await queryClient.invalidateQueries({ queryKey: attachmentKey(id) });
      setTarget(undefined);
      notify.info('Attachment deleted.');
    } catch (error) {
      notify.error(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  };
  return (
    <section className="attachments" aria-label="Attachments">
      <details>
        <summary>Attachments{query.data ? ` (${query.data.items.length})` : ''}</summary>
        {query.isPending && <p role="status">Loading attachments…</p>}
        {query.isError && (
          <p role="alert">
            Unable to load attachments. <Button onClick={() => void query.refetch()}>Retry</Button>
          </p>
        )}
        {query.data?.items.length === 0 && (
          <p>
            No attachments. Choose Attach files while editing, paste an image or drop files into the
            editor.
          </p>
        )}
        <ul>
          {query.data?.items.map((item) => (
            <li key={item.name}>
              <AttachmentIcon size={16} aria-hidden="true" />
              <span className="attachment-name">{item.name}</span>
              <a href={item.url} target="_blank" rel="noopener noreferrer">
                Open
              </a>
              <span>{Math.max(1, Math.ceil(item.size / 1024))} KB</span>
              <a href={`${item.url}?download=1`} download={item.name}>
                Download
              </a>
              <Button size="small" onClick={() => setTarget(item)}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      </details>
      {target && (
        <Dialog
          open
          title="Delete attachment?"
          onOpenChange={(open) => !open && !deleting && setTarget(undefined)}
          onSubmit={() => void remove()}
          actions={
            <>
              <Button disabled={deleting} onClick={() => setTarget(undefined)}>
                Cancel
              </Button>
              <Button disabled={deleting} type="submit" variant="danger">
                Delete permanently
              </Button>
            </>
          }
        >
          <p>Delete {target.name}? Links to this file will stop working. This cannot be undone.</p>
        </Dialog>
      )}
    </section>
  );
}
