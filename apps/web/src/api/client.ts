import {
  API_BASE_PATH,
  type SetupRequest,
  type SetupStatus,
  type LoginRequest,
  type LoginResponse,
  type MfaChallenge,
  type MfaStatus,
  type MfaEnrollment,
  type MfaEnableResponse,
  type SessionResponse,
  type AttachmentDto,
  type AttachmentsResponse,
  type BacklinksResponse,
  type BrokenLinksResponse,
  type ApiErrorBody,
  type CreateDocumentRequest,
  type CreateFolderRequest,
  type DeleteFolderResponse,
  type DocumentDto,
  type FolderDto,
  type HealthResponse,
  type ImportReport,
  type IndexRebuildStatus,
  type IndexStatusResponse,
  type MoveDocumentRequest,
  type MoveFolderRequest,
  type OutgoingLinksResponse,
  type PinsResponse,
  type RecentDocumentsResponse,
  type RenameDocumentRequest,
  type RenameFolderRequest,
  type RestoreResponse,
  type SearchResponse,
  type TemplatesResponse,
  type TagsResponse,
  type UpdatePropertiesRequest,
  type TrashItem,
  type TreeResponse,
  type UpdateDocumentRequest,
} from '@leandocs/shared';
import { documentMutation } from './document-mutations';

/** Error from the API with the stable `code` from the standard error body (PROJECT_SPEC §59). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const mutation = !['GET', 'HEAD', 'OPTIONS'].includes((init?.method ?? 'GET').toUpperCase());
  if (mutation && path !== '/auth/setup' && !headers.has('X-LeanDocs-CSRF')) {
    // Fresh session state avoids stale tokens after login rotation, logout or server restart.
    const session = await request<SessionResponse>('/auth/session');
    headers.set('X-LeanDocs-CSRF', session.csrfToken);
  }
  headers.set('Accept', 'application/json');
  if (init?.body && !(init.body instanceof FormData))
    headers.set('Content-Type', 'application/json');
  let res: Response;
  try {
    res = await fetch(`${API_BASE_PATH}${path}`, {
      ...init,
      headers,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'The server cannot be reached. Check your connection.');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    if (
      res.status === 401 &&
      path !== '/auth/login' &&
      (!path.startsWith('/auth/mfa/') || body?.error.code === 'UNAUTHORIZED')
    )
      window.dispatchEvent(new Event('leandocs:unauthorized'));
    throw new ApiError(
      res.status,
      body?.error.code ?? 'HTTP_ERROR',
      body?.error.message ?? `Request failed (${res.status})`,
      body?.error.details,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});
const enc = encodeURIComponent;

export const api = {
  session: () => request<SessionResponse>('/auth/session'),
  login: (body: LoginRequest, csrfToken: string) =>
    request<LoginResponse>('/auth/login', {
      ...json('POST', body),
      headers: { 'X-LeanDocs-CSRF': csrfToken },
    }),
  mfaStatus: () => request<MfaStatus>('/auth/mfa/status'),
  enrollMfa: (password: string) =>
    request<MfaEnrollment>('/auth/mfa/enroll', json('POST', { password })),
  cancelMfaEnrollment: () => request<void>('/auth/mfa/enroll', { method: 'DELETE' }),
  confirmMfa: (code: string) =>
    request<MfaEnableResponse>('/auth/mfa/confirm', json('POST', { code })),
  disableMfa: (password: string, code: string) =>
    request<SessionResponse>('/auth/mfa/disable', json('POST', { password, code })),
  verifyMfa: (challenge: MfaChallenge, code: string, csrfToken: string) =>
    request<SessionResponse>('/auth/mfa/verify', {
      ...json('POST', { challenge: challenge.challenge, code }),
      headers: { 'X-LeanDocs-CSRF': csrfToken },
    }),
  logout: (csrfToken: string) =>
    request<void>('/auth/logout', { method: 'POST', headers: { 'X-LeanDocs-CSRF': csrfToken } }),
  setupStatus: () => request<SetupStatus>('/auth/setup'),
  createAdministrator: (body: SetupRequest, token: string) =>
    request<SetupStatus>('/auth/setup', {
      ...json('POST', body),
      headers: { 'X-LeanDocs-Setup-Token': token },
    }),
  attachments: (id: string) => request<AttachmentsResponse>(`/documents/${enc(id)}/attachments`),
  uploadAttachment: (id: string, file: File) => {
    const body = new FormData();
    body.append('file', file);
    return request<AttachmentDto>(`/documents/${enc(id)}/attachments`, { method: 'POST', body });
  },
  deleteAttachment: (id: string, name: string) =>
    request<void>(`/documents/${enc(id)}/attachments/${enc(name)}`, { method: 'DELETE' }),
  /** ADR-0022: the same upload previews (`dryRun`) or imports. Paths are relative to the selection. */
  importFiles: (
    files: readonly ImportSelection[],
    options: { destination: string; dryRun: boolean },
  ) => {
    const body = new FormData();
    for (const { path, file } of files)
      // Only Markdown content is read by the importer; other files are listed by name only.
      body.append('files', isMarkdownPath(path) ? file : new Blob([]), path);
    const query = `destination=${enc(options.destination)}&dryRun=${options.dryRun}`;
    return request<ImportReport>(`/import?importer=markdown-directory&${query}`, {
      method: 'POST',
      body,
    });
  },
  health: () => request<HealthResponse>('/health'),
  templates: () => request<TemplatesResponse>('/templates'),
  pins: () => request<PinsResponse>('/pins'),
  pin: (id: string) => request<void>(`/pins/${enc(id)}`, { method: 'PUT' }),
  unpin: (id: string) => request<void>(`/pins/${enc(id)}`, { method: 'DELETE' }),
  tags: () => request<TagsResponse>('/tags'),
  updateProperties: (id: string, body: UpdatePropertiesRequest) =>
    documentMutation(request<DocumentDto>(`/documents/${enc(id)}/properties`, json('POST', body))),
  outgoingLinks: (id: string) => request<OutgoingLinksResponse>(`/documents/${enc(id)}/links`),
  backlinks: (id: string) => request<BacklinksResponse>(`/documents/${enc(id)}/backlinks`),
  brokenLinks: () => request<BrokenLinksResponse>('/links/broken'),
  tree: () => request<TreeResponse>('/tree'),
  indexStatus: () => request<IndexStatusResponse>('/index/status'),
  rebuildIndex: () => request<IndexRebuildStatus>('/index/rebuild', { method: 'POST' }),
  search: (q: string, limit: number, signal?: AbortSignal) =>
    request<SearchResponse>(`/search?q=${enc(q)}&limit=${limit}`, signal ? { signal } : undefined),
  recentDocuments: (limit = 10) =>
    request<RecentDocumentsResponse>(`/documents/recent?limit=${limit}`),
  document: (id: string) => request<DocumentDto>(`/documents/${enc(id)}`),
  rawDocumentUrl: (id: string) => `${API_BASE_PATH}/documents/${enc(id)}/raw`,
  createDocument: (body: CreateDocumentRequest) =>
    request<DocumentDto>('/documents', json('POST', body)),
  updateDocument: (id: string, body: UpdateDocumentRequest) =>
    request<DocumentDto>(`/documents/${enc(id)}`, json('PUT', body)),
  renameDocument: (id: string, body: RenameDocumentRequest) =>
    documentMutation(request<DocumentDto>(`/documents/${enc(id)}/rename`, json('POST', body))),
  moveDocument: (id: string, body: MoveDocumentRequest) =>
    documentMutation(request<DocumentDto>(`/documents/${enc(id)}/move`, json('POST', body))),
  trashDocument: (id: string) => request<TrashItem>(`/documents/${enc(id)}`, { method: 'DELETE' }),
  restoreTrashItem: (trashId: string) =>
    request<RestoreResponse>(`/trash/${enc(trashId)}/restore`, { method: 'POST' }),
  createFolder: (body: CreateFolderRequest) => request<FolderDto>('/folders', json('POST', body)),
  renameFolder: (body: RenameFolderRequest) =>
    request<FolderDto>('/folders/rename', json('POST', body)),
  moveFolder: (body: MoveFolderRequest) => request<FolderDto>('/folders/move', json('POST', body)),
  deleteFolder: (path: string) =>
    request<DeleteFolderResponse>(`/folders?path=${enc(path)}`, { method: 'DELETE' }),
};

/** One selected file and its path inside the selection (`Notes/Router.md`). */
export interface ImportSelection {
  path: string;
  file: Blob;
}

export function isMarkdownPath(path: string): boolean {
  return /[^/]\.md$/i.test(path);
}

/** A user-facing message for any error thrown by the API layer. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}
