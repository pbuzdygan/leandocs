import { isUtf8 } from 'node:buffer';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import { AppError } from '../errors.js';
import { sanitizeName } from '../filesystem/file-name.js';

export const ATTACHMENT_TYPES: Record<
  string,
  { mime: string; image: boolean; aliases?: string[] }
> = {
  '.png': { mime: 'image/png', image: true },
  '.jpg': { mime: 'image/jpeg', image: true },
  '.jpeg': { mime: 'image/jpeg', image: true },
  '.webp': { mime: 'image/webp', image: true },
  '.svg': { mime: 'image/svg+xml', image: true },
  '.pdf': { mime: 'application/pdf', image: false },
  '.zip': { mime: 'application/zip', image: false, aliases: ['application/x-zip-compressed'] },
  '.txt': { mime: 'text/plain', image: false },
  '.yaml': {
    mime: 'text/yaml',
    image: false,
    aliases: ['application/yaml', 'application/x-yaml', 'text/plain'],
  },
  '.yml': {
    mime: 'text/yaml',
    image: false,
    aliases: ['application/yaml', 'application/x-yaml', 'text/plain'],
  },
  '.json': { mime: 'application/json', image: false, aliases: ['text/plain'] },
};

/** True when the file type may be stored as an attachment (by extension only). */
export function isAttachmentFileName(name: string): boolean {
  return ATTACHMENT_TYPES[path.extname(name).toLowerCase()] !== undefined;
}

export function attachmentName(input: string): string {
  if (
    !input ||
    input.includes('/') ||
    input.includes('\\') ||
    input.includes('\0') ||
    input.startsWith('.') ||
    input === '..'
  )
    throw new AppError(400, 'INVALID_ATTACHMENT_NAME', 'Invalid attachment name');
  const extension = path.extname(input).toLowerCase();
  if (!ATTACHMENT_TYPES[extension])
    throw new AppError(400, 'UNSUPPORTED_ATTACHMENT', 'This file type is not allowed');
  const stem = sanitizeName(input.slice(0, -extension.length));
  // sanitizeName also rejects Windows device names before the extension.
  return `${stem}${extension}`;
}

export async function validateAttachment(
  name: string,
  declaredMime: string,
  bytes: Buffer,
  limit: number,
): Promise<{ mime: string; image: boolean }> {
  if (bytes.length > limit)
    throw new AppError(413, 'ATTACHMENT_TOO_LARGE', `File exceeds the ${limit} byte upload limit`);
  const type = ATTACHMENT_TYPES[path.extname(name).toLowerCase()];
  if (!type) throw new AppError(400, 'UNSUPPORTED_ATTACHMENT', 'This file type is not allowed');
  const mime = declaredMime.toLowerCase().split(';')[0]?.trim();
  if (
    mime &&
    mime !== 'application/octet-stream' &&
    mime !== type.mime &&
    !type.aliases?.includes(mime)
  )
    throw new AppError(400, 'ATTACHMENT_TYPE_MISMATCH', 'The file type does not match its name');
  if (
    bytes.subarray(0, 2).toString() === 'MZ' ||
    bytes.subarray(0, 4).equals(Buffer.from([127, 69, 76, 70])) ||
    bytes.subarray(0, 2).toString() === '#!'
  )
    throw new AppError(400, 'UNSUPPORTED_ATTACHMENT', 'Executable files are not allowed');
  if (['.txt', '.yaml', '.yml', '.json', '.svg'].includes(path.extname(name))) {
    // Checked on the bytes: decoding a large text file needed twice its size again for every
    // download (P15-07). Only JSON and SVG, which are parsed, are decoded.
    if (!isUtf8(bytes))
      throw new AppError(400, 'ATTACHMENT_TYPE_MISMATCH', 'Expected a UTF-8 text file');
    if (bytes.includes(0))
      throw new AppError(400, 'ATTACHMENT_TYPE_MISMATCH', 'Expected a text file');
    const parsed = name.endsWith('.json') || name.endsWith('.svg');
    const text = parsed ? new TextDecoder('utf-8').decode(bytes) : '';
    if (name.endsWith('.json')) {
      try {
        JSON.parse(text);
      } catch {
        throw new AppError(400, 'ATTACHMENT_TYPE_MISMATCH', 'Invalid JSON file');
      }
    }
    if (name.endsWith('.svg') && (!/<svg(?:\s|>)/i.test(text) || /<!DOCTYPE|<!ENTITY/i.test(text)))
      throw new AppError(400, 'ATTACHMENT_TYPE_MISMATCH', 'Invalid SVG file');
  } else {
    const detected = await fileTypeFromBuffer(bytes).catch(() => undefined);
    if (detected?.mime !== type.mime)
      throw new AppError(
        400,
        'ATTACHMENT_TYPE_MISMATCH',
        'The file contents do not match its type',
      );
  }
  return type;
}
