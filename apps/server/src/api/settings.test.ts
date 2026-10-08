import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import { DEFAULT_SETTINGS, type AppSettings } from '@leandocs/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../test/authenticated-app.js';
import { loadConfig } from '../config/config.js';
import { makeTempDir } from '../test/temp-dir.js';

/** P16-01, P16-03 (UI_SPEC §81–84). */

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function setup() {
  const dataDir = await makeTempDir();
  const content = path.join(dataDir, 'content');
  await mkdir(path.join(content, 'Servers', 'Linux'), { recursive: true });
  await mkdir(path.join(content, '.git'), { recursive: true });
  const start = async () => {
    const app = await buildApp(loadConfig({ LOG_LEVEL: 'silent', DATA_DIR: dataDir }));
    apps.push(app);
    return app;
  };
  return { dataDir, start };
}

const get = async (app: FastifyInstance) =>
  (await app.inject({ method: 'GET', url: '/api/v1/settings' })).json<AppSettings>();
const patch = (app: FastifyInstance, payload: unknown) =>
  app.inject({ method: 'PATCH', url: '/api/v1/settings', payload: payload as object });

describe('settings', () => {
  it('starts with defaults and keeps partial updates across restarts and index rebuilds', async () => {
    const { start } = await setup();
    const app = await start();
    expect(await get(app)).toEqual(DEFAULT_SETTINGS);

    const updated = await patch(app, {
      general: { autosave: false, newDocumentFolder: 'Servers/Linux/' },
      editor: { defaultMode: 'source', tabSize: 4 },
      appearance: { theme: 'dark' },
    });
    expect(updated.statusCode).toBe(200);
    const expected: AppSettings = {
      general: { ...DEFAULT_SETTINGS.general, autosave: false, newDocumentFolder: 'Servers/Linux' },
      editor: { ...DEFAULT_SETTINGS.editor, defaultMode: 'source', tabSize: 4 },
      appearance: { theme: 'dark' },
    };
    expect(updated.json()).toEqual(expected);
    expect((await patch(app, { editor: { wordWrap: false } })).json<AppSettings>().editor).toEqual({
      ...expected.editor,
      wordWrap: false,
    });

    await app.inject({ method: 'POST', url: '/api/v1/index/rebuild' });
    await app.close();
    const restarted = await start();
    expect((await get(restarted)).general).toEqual(expected.general);
    expect((await get(restarted)).editor.wordWrap).toBe(false);
    expect((await get(restarted)).appearance.theme).toBe('dark');
  });

  it('rejects unknown fields, invalid values and folders that are not documentation folders', async () => {
    const { start } = await setup();
    const app = await start();
    const rejected = [
      [{}, 400],
      [{ theme: 'dark' }, 400],
      [{ editor: { tabSize: 3 } }, 400],
      [{ editor: { autosaveDelay: 1 } }, 400],
      [{ editor: { defaultMode: 'wysiwyg' } }, 400],
      [{ appearance: { theme: 'sepia' } }, 400],
      [{ appearance: { accent: 'red' } }, 400],
      [{ general: { newDocumentFolder: '../outside' } }, 400],
      [{ general: { newDocumentFolder: '.git' } }, 400],
      [{ general: { newDocumentFolder: 'Missing' } }, 404],
      // Nothing of a rejected update is written, including the valid fields next to it.
      [{ general: { autosave: false, newDocumentFolder: 'Missing' } }, 404],
    ] as const;
    for (const [payload, status] of rejected) {
      expect((await patch(app, payload)).statusCode, JSON.stringify(payload)).toBe(status);
    }
    expect(await get(app)).toEqual(DEFAULT_SETTINGS);
  });

  it('reads invalid stored values as defaults', async () => {
    const { dataDir, start } = await setup();
    const app = await start();
    await patch(app, { editor: { tabSize: 8, wordWrap: false }, appearance: { theme: 'light' } });
    await app.close();
    // Values written by hand or by another version.
    const db = new Database(path.join(dataDir, 'system', 'app.db'));
    const write = db.prepare('UPDATE settings SET value = ? WHERE key = ?');
    write.run('3', 'editor.tabSize');
    write.run('not json', 'editor.wordWrap');
    write.run('"sepia"', 'appearance.theme');
    db.prepare("INSERT INTO settings VALUES ('editor.theme', '\"dark\"', 'now')").run();
    db.close();
    const restarted = await start();
    expect(await get(restarted)).toEqual(DEFAULT_SETTINGS);
  });
});
