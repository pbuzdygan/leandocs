import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { queryKeys, useSettings } from '../api/queries';
import { readPreference, writePreference } from '../utils/storage';

const LAST_DOCUMENT = 'lastDocument';

/** The last document viewed in this browser (UI_SPEC §82 "Open last document on startup"). */
export function rememberLastDocument(id: string): void {
  writePreference(LAST_DOCUMENT, id);
}

/**
 * When the app starts on the home page and the setting is on, opens the last viewed document.
 * Decides once per start; a document that no longer exists is forgotten and the home page stays.
 * Also loads the settings early, so the editor rarely waits for them.
 */
export function useOpenLastDocument(): void {
  const settings = useSettings();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const startedAtHome = useRef(pathname === '/');
  const current = useRef(pathname);
  useEffect(() => {
    current.current = pathname;
  }, [pathname]);
  const decided = useRef(false);

  const enabled = settings.data?.general.openLastDocument;
  const settled = settings.data !== undefined || settings.isError;
  useEffect(() => {
    if (!settled || decided.current) return;
    decided.current = true;
    const id = readPreference<unknown>(LAST_DOCUMENT, null);
    if (!enabled || !startedAtHome.current || typeof id !== 'string' || id === '') return;
    queryClient
      .fetchQuery({ queryKey: queryKeys.document(id), queryFn: () => api.document(id) })
      .then(
        (document) => {
          // Someone who already navigated elsewhere keeps their page.
          if (current.current === '/')
            void navigate(`/doc/${encodeURIComponent(document.id)}`, { replace: true });
        },
        () => writePreference(LAST_DOCUMENT, null),
      );
  }, [settled, enabled, queryClient, navigate]);
}
