/**
 * Domain error carrying an HTTP status and a stable machine-readable code.
 * The global error handler turns it into the standard error body (PROJECT_SPEC §59).
 */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
