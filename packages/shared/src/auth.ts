export const MIN_ACCOUNT_PASSWORD_LENGTH = 15;
export const MAX_ACCOUNT_PASSWORD_BYTES = 1024;

export interface SetupRequest {
  username: string;
  password: string;
  confirmPassword: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}
export interface SessionResponse {
  authMode: 'local' | 'proxy' | 'none';
  user: { username: string } | null;
  csrfToken: string;
}

export type SetupStatus =
  | {
      required: true;
      contentDir: string;
      setupToken: string;
      authMode?: 'local' | 'proxy' | 'none';
    }
  | { required: false; contentDir: string; authMode?: 'local' | 'proxy' | 'none' };

/** Shared account policy; passwords are never trimmed or normalized. */
export function validateSetup(input: SetupRequest): string | null {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(input.username.trim()))
    return 'Username must be 1–64 characters: letters, numbers, dots, underscores or hyphens, starting with a letter or number.';
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(input.password))
    return 'Password must contain valid Unicode characters.';
  if ([...input.password].length < MIN_ACCOUNT_PASSWORD_LENGTH)
    return `Password must contain at least ${MIN_ACCOUNT_PASSWORD_LENGTH} characters.`;
  if (new TextEncoder().encode(input.password).byteLength > MAX_ACCOUNT_PASSWORD_BYTES)
    return `Password must not exceed ${MAX_ACCOUNT_PASSWORD_BYTES} UTF-8 bytes.`;
  if (input.password !== input.confirmPassword) return 'Passwords do not match.';
  return null;
}

export interface MfaChallenge {
  mfaRequired: true;
  challenge: string;
  expiresIn: number;
}
export type LoginResponse = SessionResponse | MfaChallenge;
export interface MfaVerifyRequest {
  challenge: string;
  code: string;
}
export interface MfaStatus {
  enabled: boolean;
  recoveryCodesRemaining: number;
}
export interface MfaEnrollment {
  secret: string;
  qrCode: string;
  expiresIn: number;
}
export interface MfaEnableResponse {
  session: SessionResponse;
  recoveryCodes: string[];
}
