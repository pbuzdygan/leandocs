import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { resetTestSettings } from './settings';

// `findBy…`/`waitFor` wait up to 5 s instead of 1 s. The first test in a file that opens a document
// waits for the lazily loaded document page (editors, Markdown pipeline), which Vite transforms on
// demand: about 1.1 s locally, and longer on a busy CI runner (KI-12). Failing checks still fail,
// only later.
configure({ asyncUtilTimeout: 5000 });

// jsdom lacks a few browser APIs that Radix primitives use.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => undefined;
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => undefined;
Element.prototype.releasePointerCapture ??= () => undefined;
// CodeMirror measures text through Range rectangles.
Range.prototype.getClientRects ??= () =>
  ({
    length: 0,
    item: () => null,
    [Symbol.iterator]: [][Symbol.iterator],
  }) as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();
/**
 * Width queries are answered from `window.innerWidth` (a wide 1440 px screen unless a test sets
 * `setViewportWidth`); other queries never match. Listeners are not notified of changes.
 */
function matchesWidth(query: string, width = window.innerWidth): boolean {
  const min = /min-width:\s*(\d+)px/.exec(query);
  const max = /max-width:\s*(\d+)px/.exec(query);
  if (!min && !max) return false;
  return (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]));
}
window.matchMedia = ((query: string) => ({
  matches: matchesWidth(query),
  media: query,
  onchange: null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  addListener: () => undefined,
  removeListener: () => undefined,
  dispatchEvent: () => false,
})) as typeof window.matchMedia;
window.innerWidth = 1440;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  resetTestSettings();
  window.innerWidth = 1440;
  delete document.documentElement.dataset.theme;
});
