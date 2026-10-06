import {
  keepPreviousData,
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
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
  templates: ['templates'] as const,
  tags: ['tags'] as const,
  pins: ['pins'] as const,
  links: ['links'] as const,
  outgoingLinks: (id: string) => ['links', 'outgoing', id] as const,
  backlinks: (id: string) => ['links', 'backlinks', id] as const,
  brokenLinks: ['links', 'broken'] as const,
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
 * (tree, recent list, open documents).
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
