import { AppError } from '../errors.js';

/** Human-readable file names (PROJECT_SPEC §10): sanitised, never UUIDs. */

export const DOCUMENT_EXTENSION = '.md';
export const ASSETS_SUFFIX = '.assets';
const MAX_NAME_BYTES = 200;
// Windows reserved device names — rejected so content stays portable.
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

export class InvalidNameError extends AppError {
  constructor(reason: string) {
    super(400, 'INVALID_NAME', `Invalid name: ${reason}`);
  }
}

/**
 * Turns user input into a safe, portable file/folder name while keeping it readable:
 * `Nginx: Proxy/Manager` → `Nginx- Proxy-Manager`. Throws InvalidNameError when nothing usable
 * remains or the name is reserved.
 */
export function sanitizeName(input: string): string {
  let name = input
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[/\\:*?"<>|]/g, '-')
    .trim()
    // Leading dots would hide the file; trailing dots/spaces are invalid on Windows.
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '');

  if (name === '') throw new InvalidNameError('name is empty');
  if (RESERVED.test(name)) throw new InvalidNameError(`"${name}" is a reserved name`);
  if (name.toLowerCase().endsWith(ASSETS_SUFFIX)) {
    throw new InvalidNameError(`names ending in "${ASSETS_SUFFIX}" are reserved for attachments`);
  }
  while (Buffer.byteLength(name, 'utf8') > MAX_NAME_BYTES) {
    name = Array.from(name).slice(0, -1).join('').trimEnd();
  }
  return name;
}

/** `Home Assistant` → `Home Assistant.md` (an existing `.md` suffix is not doubled). */
export function toDocumentFileName(input: string): string {
  const withoutExt = input.trim().toLowerCase().endsWith(DOCUMENT_EXTENSION)
    ? input.trim().slice(0, -DOCUMENT_EXTENSION.length)
    : input;
  return `${sanitizeName(withoutExt)}${DOCUMENT_EXTENSION}`;
}

export function isDocumentFileName(name: string): boolean {
  return name.toLowerCase().endsWith(DOCUMENT_EXTENSION) && name.length > DOCUMENT_EXTENSION.length;
}

/** `BUZHULK.md` → `BUZHULK` */
export function documentStem(fileName: string): string {
  return isDocumentFileName(fileName) ? fileName.slice(0, -DOCUMENT_EXTENSION.length) : fileName;
}

/** `Docs/BUZHULK.md` → `Docs/BUZHULK.assets` (attachments folder of a document, PROJECT_SPEC §13). */
export function assetsDirFor(documentPath: string): string {
  const withoutExt = documentPath.toLowerCase().endsWith(DOCUMENT_EXTENSION)
    ? documentPath.slice(0, -DOCUMENT_EXTENSION.length)
    : documentPath;
  return `${withoutExt}${ASSETS_SUFFIX}`;
}
