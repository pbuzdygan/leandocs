import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir } from 'node:fs/promises';
import { resolveExistingDirectory } from '../filesystem/safe-path.js';
import path from 'node:path';
import type { TemplateDto } from '@leandocs/shared';
import { AppError } from '../errors.js';
import { atomicCreateFile } from '../filesystem/atomic-write.js';
import { documentStem, isDocumentFileName, sanitizeName } from '../filesystem/file-name.js';
import { parseFile } from '../documents/frontmatter.js';
import { BUILTIN_TEMPLATES } from './builtin.js';

export const TEMPLATES_FOLDER = '_templates';

/** Front matter keys that always come from the new document, never from a template. */
const OWN_KEYS = new Set(['id', 'title', 'created', 'updated']);

export interface InstantiatedTemplate {
  /** Extra front matter fields from the template (e.g. `tags`), placeholders filled in. */
  fields: Record<string, unknown>;
  body: string;
}

function fill(text: string, values: { title: string; date: string }): string {
  return text.replaceAll('{{title}}', values.title).replaceAll('{{date}}', values.date);
}

function fillValue(value: unknown, values: { title: string; date: string }): unknown {
  if (typeof value === 'string') return fill(value, values);
  if (Array.isArray(value)) return value.map((item) => fillValue(item, values));
  return value;
}

/** Templates in `DATA_DIR/content/_templates` (PROJECT_SPEC §35; P10-01/P10-02). */
export class TemplateService {
  private readonly folder: string;

  constructor(private readonly contentDir: string) {
    this.folder = path.join(contentDir, TEMPLATES_FOLDER);
  }

  /**
   * Writes the built-in templates when `_templates/` does not exist yet. An existing folder is
   * left alone, so templates the user changed or deleted are never restored or overwritten.
   */
  async seed(): Promise<string[]> {
    try {
      await mkdir(this.folder);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        await this.existingFolder();
        return [];
      }
      throw error;
    }
    const created: string[] = [];
    for (const [name, content] of Object.entries(BUILTIN_TEMPLATES)) {
      try {
        await atomicCreateFile(path.join(this.folder, `${name}.md`), content);
        created.push(name);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    }
    return created;
  }

  async list(): Promise<TemplateDto[]> {
    if (!(await this.existingFolder())) return [];
    const entries = await readdir(this.folder, { withFileTypes: true }).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return [];
        throw error;
      },
    );
    return entries
      .filter(
        (entry) => entry.isFile() && isDocumentFileName(entry.name) && !entry.name.startsWith('.'),
      )
      .map((entry) => ({ name: documentStem(entry.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private async existingFolder(): Promise<string | undefined> {
    const exists = await lstat(this.folder).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    return exists ? resolveExistingDirectory(this.contentDir, TEMPLATES_FOLDER) : undefined;
  }

  /** Reads a template and fills `{{title}}` and `{{date}}` (YYYY-MM-DD, UTC). */
  async instantiate(name: string, title: string, now: Date): Promise<InstantiatedTemplate> {
    let safe: string;
    try {
      safe = sanitizeName(name);
    } catch {
      throw new AppError(400, 'TEMPLATE_NOT_FOUND', 'Template not found');
    }
    if (safe !== name) throw new AppError(400, 'TEMPLATE_NOT_FOUND', 'Template not found');
    let source: string;
    try {
      if (!(await this.existingFolder()))
        throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Template not found');
      const handle = await open(
        path.join(this.folder, `${safe}.md`),
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      try {
        if (!(await handle.stat()).isFile())
          throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Template not found');
        source = await handle.readFile('utf8');
      } finally {
        await handle.close();
      }
    } catch (error) {
      if (['ENOENT', 'EISDIR', 'ELOOP'].includes((error as NodeJS.ErrnoException).code ?? ''))
        throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Template not found');
      throw error;
    }
    const parsed = parseFile(source);
    const values = { title, date: now.toISOString().slice(0, 10) };
    const fields: Record<string, unknown> = {};
    if (!parsed.error)
      for (const [key, value] of Object.entries(parsed.data))
        if (!OWN_KEYS.has(key)) fields[key] = fillValue(value, values);
    // A template with broken front matter is used as plain text, header included.
    const body = parsed.error ? source : parsed.body;
    return { fields, body: fill(body, values) };
  }
}
