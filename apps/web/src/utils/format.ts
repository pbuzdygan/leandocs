const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const absolute = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** "4 minutes ago", "yesterday", "3 days ago" … then an absolute date after ~a month. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return 'just now';
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return relative.format(Math.round(seconds / 3600), 'hour');
  if (abs < 30 * 86_400) return relative.format(Math.round(seconds / 86_400), 'day');
  return formatDate(iso);
}

/** "2 Oct 2026" */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : absolute.format(date);
}

/** Reading time at ~200 words per minute, at least 1 minute. */
export function readingMinutes(text: string): number {
  const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

/** "Infrastructure/Servers/BUZHULK.md" → ["Infrastructure", "Servers"] */
export function folderSegments(documentPath: string): string[] {
  const parts = documentPath.split('/');
  parts.pop();
  return parts;
}

/** "Infrastructure/Servers" → "Infrastructure / Servers" (root → "Documentation") */
export function displayFolder(folderPath: string): string {
  return folderPath === '' ? 'Documentation' : folderPath.split('/').join(' / ');
}

/** "Home Assistant.md" → "Home Assistant" */
export function stripExtension(fileName: string): string {
  return fileName.replace(/\.md$/i, '');
}

export function parentPath(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

/** "0 B", "980 B", "1.2 KB", "45 MB" (1 KB = 1024 bytes). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
