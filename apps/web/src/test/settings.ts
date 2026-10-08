import {
  DEFAULT_SETTINGS,
  mergeSettings,
  type AppSettings,
  type UpdateSettingsRequest,
} from '@leandocs/shared';

/** Settings served by `mockApi` unless a test routes `/settings` itself; reset after each test. */
let testSettings: AppSettings = structuredClone(DEFAULT_SETTINGS);

export const getTestSettings = (): AppSettings => testSettings;

export function setTestSettings(update: UpdateSettingsRequest): void {
  testSettings = mergeSettings(testSettings, update);
}

export function resetTestSettings(): void {
  testSettings = structuredClone(DEFAULT_SETTINGS);
}
