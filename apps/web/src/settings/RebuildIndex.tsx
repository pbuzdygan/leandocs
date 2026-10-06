import { useEffect, useRef, useState } from 'react';
import type { IndexRebuildStatus } from '@leandocs/shared';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshIcon } from '../components/icons';
import { api, errorMessage } from '../api/client';
import { queryKeys } from '../api/queries';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { useNotify } from '../components/ui/Toast';

/** Rebuild Index action with its confirmation (UI_SPEC §87) and live progress. */
export function RebuildIndex({ rebuild }: { rebuild: IndexRebuildStatus }) {
  const [confirming, setConfirming] = useState(false);
  const [starting, setStarting] = useState(false);
  const queryClient = useQueryClient();
  const notify = useNotify();
  const running = rebuild.state === 'running' || starting;
  const wasRunning = useRef(false);

  // Announce the end of a rebuild and refresh everything derived from the index.
  useEffect(() => {
    if (rebuild.state === 'running') wasRunning.current = true;
    else if (wasRunning.current) {
      wasRunning.current = false;
      if (rebuild.state === 'failed')
        notify.error(`Rebuild failed: ${rebuild.error ?? 'unknown error'}`);
      else notify.info('Search index rebuilt.');
      void queryClient.invalidateQueries({ queryKey: queryKeys.searches });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tree });
    }
  }, [rebuild.state, rebuild.error, notify, queryClient]);

  const start = async () => {
    setConfirming(false);
    setStarting(true);
    try {
      const status = await api.rebuildIndex();
      queryClient.setQueryData(queryKeys.indexStatus, (current: unknown) =>
        current ? { ...(current as object), rebuild: status } : current,
      );
      wasRunning.current = true;
      await queryClient.invalidateQueries({ queryKey: queryKeys.indexStatus });
    } catch (error) {
      notify.error(errorMessage(error));
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="settings__action">
      <Button onClick={() => setConfirming(true)} disabled={running}>
        <RefreshIcon size={15} />
        Rebuild index
      </Button>
      {rebuild.state === 'running' && (
        <span className="settings__progress" role="status">
          Indexing documents… {rebuild.done} / {rebuild.total}
        </span>
      )}
      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Rebuild search index?"
        description="Documentation files will not be modified."
        width={420}
        actions={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void start()} data-autofocus>
              Rebuild
            </Button>
          </>
        }
      />
    </div>
  );
}
