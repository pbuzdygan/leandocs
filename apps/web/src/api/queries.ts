import {
  keepPreviousData,
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import { mergeSettings, type AppSettings, type UpdateSettingsRequest } from '@leandocs/shared';
import { ApiError, api } from './client';

/** Server state lives in TanStack Query (UI_SPEC §141); no global store for documents. */
export const queryKeys = {
  tree: ['tree'] as const,
  recent: ['recent'] as const,
  document: (id: string) => ['document', id] as const,
  documents: ['document'] as const,
  search: (q: string) => ['search', q] as const,
  searches: ['search'] as const,
  indexStatus: ['index-status'] as const,
  health: ['health'] as const,
  templates: ['templates'] as const,
  tags: ['tags'] as const,
  pins: ['pins'] as const,
  settings: ['settings'] as const,
  links: ['links'] as const,
  outgoingLinks: (id: string) => ['links', 'outgoing', id] as const,
  backlinks: (id: string) => ['links', 'backlinks', id] as const,
  brokenLinks: ['links', 'broken'] as const,
  trash: ['trash'] as const,
};

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        refetchOnWindowFocus: true,
        // Never retry "not found" and other client errors.
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status >= 400 && error.status < 500) &&
          failureCount < 2,
      },
    },
  });
}

export function useTree() {
  return useQuery({ queryKey: queryKeys.tree, queryFn: api.tree, select: (data) => data.root });
}

export function useRecentDocuments() {
  return useQuery({ queryKey: queryKeys.recent, queryFn: () => api.recentDocuments(10) });
}

export function useDocument(id: string) {
  return useQuery({ queryKey: queryKeys.document(id), queryFn: () => api.document(id) });
}

/**
 * Wraps a content mutation and refreshes everything derived from the filesystem afterwards
 * (tree, recent list, open documents, trash).
 */
export function useContentMutation<TVariables, TResult>(
  mutationFn: (variables: TVariables) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.tree }),
        queryClient.invalidateQueries({ queryKey: queryKeys.recent }),
        queryClient.invalidateQueries({ queryKey: queryKeys.documents }),
        queryClient.invalidateQueries({ queryKey: queryKeys.searches }),
        queryClient.invalidateQueries({ queryKey: queryKeys.links }),
        queryClient.invalidateQueries({ queryKey: queryKeys.pins }),
        queryClient.invalidateQueries({ queryKey: queryKeys.trash }),
      ]);
    },
  });
}

/** Full-text search (PROJECT_SPEC §30). Always refetched: results must follow the latest edits. */
export function useSearch(q: string, limit: number) {
  const query = q.trim();
  return useQuery({
    queryKey: queryKeys.search(query),
    queryFn: ({ signal }) => api.search(query, limit, signal),
    enabled: query !== '',
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
}

/** Index and storage status; polls while a rebuild is running (UI_SPEC §87 progress). */
/** Server name and version (Settings › About). */
export function useHealth() {
  return useQuery({ queryKey: queryKeys.health, queryFn: api.health });
}

export function useIndexStatus() {
  return useQuery({
    queryKey: queryKeys.indexStatus,
    queryFn: api.indexStatus,
    refetchInterval: (query) => (query.state.data?.rebuild.state === 'running' ? 500 : false),
  });
}

/** Links of a document (PROJECT_SPEC §24); always refetched so they follow the latest saves. */
export function useDocumentLinks(id: string, enabled = true) {
  const outgoing = useQuery({
    queryKey: queryKeys.outgoingLinks(id),
    queryFn: () => api.outgoingLinks(id),
    enabled,
    staleTime: 0,
  });
  const backlinks = useQuery({
    queryKey: queryKeys.backlinks(id),
    queryFn: () => api.backlinks(id),
    enabled,
    staleTime: 0,
  });
  return { outgoing, backlinks };
}

export function useBrokenLinks() {
  return useQuery({ queryKey: queryKeys.brokenLinks, queryFn: api.brokenLinks, staleTime: 0 });
}

/** Templates in `_templates/` (P10-02); refetched each time the dialog opens. */
export function useTemplates() {
  return useQuery({ queryKey: queryKeys.templates, queryFn: api.templates, staleTime: 0 });
}

/** Existing tags for autocomplete (P10-03). */
export function useTags() {
  return useQuery({ queryKey: queryKeys.tags, queryFn: api.tags, staleTime: 0 });
}

/** Pinned documents (PROJECT_SPEC §40, P10-05). */
export function usePins() {
  return useQuery({ queryKey: queryKeys.pins, queryFn: api.pins });
}

/** Items in the trash, newest first (UI_SPEC §136). */
export function useTrash() {
  return useQuery({ queryKey: queryKeys.trash, queryFn: api.trash, staleTime: 0 });
}

/** App settings (UI_SPEC §81–83). Changed only through this app, so they rarely refetch. */
export function useSettings() {
  return useQuery({ queryKey: queryKeys.settings, queryFn: api.settings, staleTime: 60_000 });
}

const settingsMutation = ['update-settings'] as const;

/**
 * Saves partial updates. The cache takes the new value synchronously, so controlled inputs
 * (checkboxes) never flick back while the request runs. Responses can arrive out of order when
 * several changes are made quickly, so none of them is applied directly: once the last pending
 * save has settled (saved or failed), the stored settings are fetched again.
 */
export function useUpdateSettings() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationKey: settingsMutation,
    mutationFn: api.updateSettings,
    onSettled: () => {
      // This save still counts as pending while its callbacks run.
      if (queryClient.isMutating({ mutationKey: settingsMutation }) <= 1)
        return queryClient.invalidateQueries({ queryKey: queryKeys.settings });
    },
  });
  const { mutate } = mutation;
  const save = useCallback(
    (update: UpdateSettingsRequest) => {
      const current = queryClient.getQueryData<AppSettings>(queryKeys.settings);
      if (current)
        queryClient.setQueryData<AppSettings>(queryKeys.settings, mergeSettings(current, update));
      mutate(update);
    },
    [queryClient, mutate],
  );
  return { save, error: mutation.error };
}
