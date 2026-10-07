import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { API_BASE_PATH, type ContentChanges, type DocumentDto } from '@leandocs/shared';
import { useNotify } from '../components/ui/Toast';
import { api } from './client';
import { queryKeys } from './queries';

const listeners = new Set<(changes: ContentChanges) => void>();
export function subscribeExternalChanges(listener: (changes: ContentChanges) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function parseChanges(data: string): ContentChanges | undefined {
  try {
    const value: unknown = JSON.parse(data);
    if (!record(value) || !Array.isArray(value.documents) || !Array.isArray(value.folders)) return;
    if (
      !value.documents.every(
        (item: unknown) =>
          record(item) &&
          ['added', 'changed', 'removed'].includes(String(item.kind)) &&
          typeof item.id === 'string' &&
          typeof item.path === 'string' &&
          (item.previousPath === undefined || typeof item.previousPath === 'string'),
      )
    )
      return;
    if (
      !value.folders.every(
        (item: unknown) =>
          record(item) &&
          ['added', 'removed'].includes(String(item.kind)) &&
          typeof item.path === 'string',
      )
    )
      return;
    return value as unknown as ContentChanges;
  } catch {
    return;
  }
}

/** Mounted once inside the authenticated shell. Native EventSource owns transport reconnection. */
export function useExternalChanges() {
  const client = useQueryClient();
  const notify = useNotify();
  const { pathname } = useLocation();
  const path = useRef(pathname);
  useEffect(() => {
    path.current = pathname;
  }, [pathname]);
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    let disposed = false;
    let checkingSession = false;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let source: EventSource;
    const retryClosedSource = () => {
      if (disposed || source.readyState !== EventSource.CLOSED || reconnect) return;
      reconnect = setTimeout(() => {
        reconnect = undefined;
        if (!disposed) open();
      }, 3000);
    };
    const refresh = async (changes?: ContentChanges) => {
      const location = path.current;
      const match = /^\/doc\/([^/]+)$/.exec(location);
      const id = match ? decodeURIComponent(match[1]!) : undefined;
      const before = id ? client.getQueryData<DocumentDto>(queryKeys.document(id)) : undefined;
      // Stop editor autosave synchronously, before potentially slow revision fetches.
      if (changes) for (const listener of listeners) listener(changes);
      await client.invalidateQueries({
        predicate: ({ queryKey }) => {
          const key = queryKey[0];
          if (
            [
              'tree',
              'recent',
              'search',
              'links',
              'pins',
              'tags',
              'index-status',
              'conflict',
            ].includes(String(key))
          )
            return true;
          if (key === 'document' || key === 'attachments')
            return !changes || changes.documents.some((change) => change.id === queryKey[1]);
          return false;
        },
      });
      if (disposed || location !== path.current || !id || !before) return;
      const after = client.getQueryData<DocumentDto>(queryKeys.document(id));
      const removed = changes?.documents.some(
        (change) => change.id === id && change.kind === 'removed',
      );
      if (removed) notify.info('Document removed externally.');
      else if (after && after.revision !== before.revision)
        notify.info('Document updated externally.');
    };
    const open = () => {
      source = new EventSource(`${API_BASE_PATH}/events`);
      source.addEventListener('ready', () => {
        if (!disposed) void refresh();
      });
      source.addEventListener('content-changed', (event) => {
        if (disposed) return;
        const changes = parseChanges((event as MessageEvent<string>).data);
        if (changes) void refresh(changes);
      });
      source.onerror = () => {
        if (disposed || checkingSession) return;
        checkingSession = true;
        void api
          .session()
          .then((session) => {
            if (disposed) return;
            if (session.authMode !== 'none' && !session.user) {
              source.close();
              window.dispatchEvent(new Event('leandocs:unauthorized'));
            } else retryClosedSource();
          })
          .catch(retryClosedSource)
          .finally(() => {
            checkingSession = false;
          });
      };
    };
    open();
    return () => {
      disposed = true;
      clearTimeout(reconnect);
      source.close();
    };
  }, [client, notify]);
}
