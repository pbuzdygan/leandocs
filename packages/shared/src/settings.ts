/**
 * App settings (UI_SPEC §81–84), stored in the `settings` table of `app.db`. They are durable app
 * data: index rebuilds keep them. Version 1.0 is single-user, so settings are global.
 */

export type EditorMode = 'visual' | 'source';
/** `system` follows the operating system (`prefers-color-scheme`). */
export type Theme = 'system' | 'light' | 'dark';

export interface AppSettings {
  general: {
    /** Open the last viewed document when the app starts on the home page. */
    openLastDocument: boolean;
    /** Folder (relative to the content root, `''` = root) preselected for new documents. */
    newDocumentFolder: string;
    /** Save automatically while editing; otherwise on Save, Ctrl/Cmd+S, Done or leaving. */
    autosave: boolean;
  };
  editor: {
    defaultMode: EditorMode;
    /** Pause after the last change before autosave runs (ms). */
    autosaveDelay: number;
    /** Source editor only. */
    lineNumbers: boolean;
    /** Source editor only. */
    wordWrap: boolean;
    /** Source editor only: spaces inserted by Tab and the width of a tab character. */
    tabSize: number;
  };
  appearance: {
    theme: Theme;
  };
}

/** A partial update: any subset of fields in any group. */
export type UpdateSettingsRequest = { [G in keyof AppSettings]?: Partial<AppSettings[G]> };

/** Applies a partial update to a full settings object (returns a new object). */
export function mergeSettings(settings: AppSettings, update: UpdateSettingsRequest): AppSettings {
  return {
    general: { ...settings.general, ...update.general },
    editor: { ...settings.editor, ...update.editor },
    appearance: { ...settings.appearance, ...update.appearance },
  };
}

export const DEFAULT_SETTINGS: AppSettings = {
  general: { openLastDocument: false, newDocumentFolder: '', autosave: true },
  editor: {
    defaultMode: 'visual',
    autosaveDelay: 1500,
    lineNumbers: true,
    wordWrap: true,
    tabSize: 2,
  },
  appearance: { theme: 'system' },
};

export const AUTOSAVE_DELAYS = [500, 1000, 1500, 3000, 5000, 10000] as const;
export const TAB_SIZES = [2, 4, 8] as const;
export const EDITOR_MODES: readonly EditorMode[] = ['visual', 'source'];
export const THEMES: readonly Theme[] = ['system', 'light', 'dark'];
