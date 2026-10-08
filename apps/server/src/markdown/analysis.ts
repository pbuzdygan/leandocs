import {
  extractHeadings,
  extractLinks,
  extractPlainText,
  parseMarkdown,
  type ExtractedLink,
} from '@leandocs/shared';
import { htmlImporter } from '../import/html.js';
import { ImportItemError, type ConvertedDocument } from '../import/importer.js';

/** What the index needs from a document body. */
export interface MarkdownAnalysis {
  links: ExtractedLink[];
  headings: string[];
  /** Plain text for full-text search. */
  text: string;
}

/**
 * `ok: false`: the body is too large or complex to analyse within the limits (ADR-0025). The
 * document is then indexed and shown as plain text; `reason` completes "The document is …".
 */
export type AnalysisResult = { ok: true; analysis: MarkdownAnalysis } | Failure;

/** `userError`: a problem of the file itself, with a message for the import report. */
export type ConversionResult =
  { ok: true; converted: ConvertedDocument } | (Failure & { userError?: true });

export interface Failure {
  ok: false;
  reason: string;
}

/**
 * Parses untrusted content: Markdown bodies for the index, and HTML files during import. The
 * server runs both in a separate process with time and memory limits (ProcessAnalyser).
 */
export interface MarkdownAnalyser {
  analyse(body: string): Promise<AnalysisResult>;
  convertHtml(bytes: Uint8Array): Promise<ConversionResult>;
  close(): Promise<void>;
}

/** Larger bodies are never parsed: parsing needs hundreds of bytes of memory per byte. */
export const MAX_ANALYSED_BYTES = 2 * 1024 * 1024;

export const TOO_LARGE = `larger than ${MAX_ANALYSED_BYTES / 1024 / 1024} MiB`;

export function analyseMarkdown(body: string): MarkdownAnalysis {
  const tree = parseMarkdown(body);
  return {
    links: extractLinks(tree),
    headings: extractHeadings(tree).map((heading) => heading.text),
    text: extractPlainText(tree),
  };
}

export function tooLarge(body: string): boolean {
  return Buffer.byteLength(body, 'utf8') > MAX_ANALYSED_BYTES;
}

/** Converts an HTML file being imported (PROJECT_SPEC §68). */
export function convertHtml(bytes: Uint8Array): ConversionResult {
  try {
    return {
      ok: true,
      converted: htmlImporter.convert({
        kind: 'document',
        source: '',
        target: '',
        bytes: Buffer.from(bytes),
      }),
    };
  } catch (error) {
    if (error instanceof ImportItemError)
      return { ok: false, reason: error.message, userError: true };
    return { ok: false, reason: failureReason(error) };
  }
}

/** A recursion limit hit by deeply nested input surfaces as a RangeError. */
export function failureReason(error: unknown): string {
  return error instanceof RangeError ? 'nested too deeply' : 'not readable';
}

/**
 * Analyses in the calling thread, without time or memory limits: for tests and tools only. The
 * server uses WorkerAnalyser.
 */
export const inlineAnalyser: MarkdownAnalyser = {
  analyse(body) {
    if (tooLarge(body)) return Promise.resolve({ ok: false, reason: TOO_LARGE });
    try {
      return Promise.resolve({ ok: true, analysis: analyseMarkdown(body) });
    } catch (error) {
      return Promise.resolve({ ok: false, reason: failureReason(error) });
    }
  },
  convertHtml: (bytes) => Promise.resolve(convertHtml(bytes)),
  close: () => Promise.resolve(),
};
