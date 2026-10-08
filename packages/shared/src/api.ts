/** Shared API contracts between apps/server and apps/web (PROJECT_SPEC §59–61). */

export const API_BASE_PATH = '/api/v1';

export interface HealthResponse {
  status: 'ok';
  name: string;
  version: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
