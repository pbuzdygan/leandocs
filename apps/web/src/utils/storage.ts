/**
 * Per-browser UI preferences (sidebar width, expanded folders). Storage can be unavailable
 * (private mode, blocked site data), so every access is guarded and falls back silently.
 */
export function readPreference<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(`leandocs.${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writePreference(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(`leandocs.${key}`, JSON.stringify(value));
  } catch {
    // Preferences are a convenience; ignore storage failures.
  }
}
