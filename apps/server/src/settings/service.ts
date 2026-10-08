import type Database from 'better-sqlite3';
import {
  AUTOSAVE_DELAYS,
  DEFAULT_SETTINGS,
  EDITOR_MODES,
  TAB_SIZES,
  THEMES,
  type AppSettings,
  type UpdateSettingsRequest,
} from '@leandocs/shared';
import { assertVisiblePath } from '../documents/scanner.js';
import { normalizeRelativePath, resolveExistingDirectory } from '../filesystem/safe-path.js';

type Group = keyof AppSettings;

/** Per-field checks; stored values that fail them (hand-edited, older versions) read as defaults. */
const VALID: { [G in Group]: { [K in keyof AppSettings[G]]: (value: unknown) => boolean } } = {
  general: {
    openLastDocument: (value) => typeof value === 'boolean',
    newDocumentFolder: (value) => typeof value === 'string',
    autosave: (value) => typeof value === 'boolean',
  },
  editor: {
    defaultMode: (value) => EDITOR_MODES.includes(value as AppSettings['editor']['defaultMode']),
    autosaveDelay: (value) => (AUTOSAVE_DELAYS as readonly unknown[]).includes(value),
    lineNumbers: (value) => typeof value === 'boolean',
    wordWrap: (value) => typeof value === 'boolean',
    tabSize: (value) => (TAB_SIZES as readonly unknown[]).includes(value),
  },
  appearance: {
    theme: (value) => THEMES.includes(value as AppSettings['appearance']['theme']),
  },
};

/**
 * App settings (UI_SPEC §81–84) as one `settings` row per field, keyed `group.field` with a JSON
 * value. Durable app data: index rebuilds and resets of derived tables keep them (ADR-0019).
 */
export class SettingsService {
  constructor(
    private readonly db: Database.Database,
    private readonly contentDir: string,
  ) {}

  get(): AppSettings {
    const settings = structuredClone(DEFAULT_SETTINGS);
    const rows = this.db
      .prepare<[], { key: string; value: string }>('SELECT key, value FROM settings')
      .all();
    for (const { key, value } of rows) {
      const [group, field, ...rest] = key.split('.');
      if (rest.length || !group || !field || !Object.hasOwn(VALID, group)) continue;
      const checks = VALID[group as Group] as Record<string, (value: unknown) => boolean>;
      if (!Object.hasOwn(checks, field)) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        continue;
      }
      if (checks[field]!(parsed))
        (settings[group as Group] as Record<string, unknown>)[field] = parsed;
    }
    return settings;
  }

  /** Validates the whole update before writing any of it; the request schema checks the types. */
  async update(request: UpdateSettingsRequest): Promise<AppSettings> {
    const folder = request.general?.newDocumentFolder;
    const changes: [string, unknown][] = [];
    for (const group of Object.keys(VALID) as Group[]) {
      for (const [field, value] of Object.entries(request[group] ?? {})) {
        changes.push([`${group}.${field}`, value]);
      }
    }
    if (folder !== undefined) {
      const normalized = normalizeRelativePath(folder);
      assertVisiblePath(normalized);
      await resolveExistingDirectory(this.contentDir, normalized);
      changes.push(['general.newDocumentFolder', normalized]);
    }
    const now = new Date().toISOString();
    const upsert = this.db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    );
    this.db.transaction(() => {
      for (const [key, value] of changes) upsert.run(key, JSON.stringify(value), now);
    })();
    return this.get();
  }
}
