import { DEFAULT_SETTINGS, type AppSettings, type UpdateSettingsRequest } from '@leandocs/shared';

/** Settings served by `mockApi` unless a test routes `/settings` itself; reset after each test. */
let testSettings: AppSettings = structuredClone(DEFAULT_SETTINGS);

export const getTestSettings = (): AppSettings => testSettings;

export function setTestSettings(update: UpdateSettingsRequest): void {
  testSettings = {
    general: { ...testSettings.general, ...update.general },
    editor: { ...testSettings.editor, ...update.editor },
  };
}

export function resetTestSettings(): void {
  testSettings = structuredClone(DEFAULT_SETTINGS);
}
