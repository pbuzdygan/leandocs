import {
  AUTOSAVE_DELAYS,
  EDITOR_MODES,
  TAB_SIZES,
  THEMES,
  type AppSettings,
  type UpdateSettingsRequest,
} from '@leandocs/shared';
import type { FastifyPluginAsync } from 'fastify';
import type { SettingsService } from '../settings/service.js';

const updateSchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    general: {
      type: 'object',
      additionalProperties: false,
      properties: {
        openLastDocument: { type: 'boolean' },
        newDocumentFolder: { type: 'string', maxLength: 4096 },
        autosave: { type: 'boolean' },
      },
    },
    editor: {
      type: 'object',
      additionalProperties: false,
      properties: {
        defaultMode: { type: 'string', enum: EDITOR_MODES },
        autosaveDelay: { type: 'integer', enum: AUTOSAVE_DELAYS },
        lineNumbers: { type: 'boolean' },
        wordWrap: { type: 'boolean' },
        tabSize: { type: 'integer', enum: TAB_SIZES },
      },
    },
    appearance: {
      type: 'object',
      additionalProperties: false,
      properties: {
        theme: { type: 'string', enum: THEMES },
      },
    },
  },
} as const;

/** App settings (UI_SPEC §81–84): `GET /settings`, `PATCH /settings` (partial update). */
export const settingsRoutes: FastifyPluginAsync<{ settings: SettingsService }> = async (
  app,
  { settings },
) => {
  app.get('/settings', async (): Promise<AppSettings> => settings.get());
  app.patch<{ Body: UpdateSettingsRequest }>(
    '/settings',
    { schema: { body: updateSchema } },
    async (request): Promise<AppSettings> => settings.update(request.body),
  );
};
