import { describe, expect, it } from 'vitest';
import { APP_NAME, APP_TAGLINE, APP_WORDMARK } from './index.js';

describe('branding', () => {
  it('exposes the product name and tagline', () => {
    expect(APP_NAME).toBe('LeanDocs');
    expect(APP_TAGLINE).toBe('Documentation without the bloat.');
  });

  it('splits the wordmark without changing the name', () => {
    expect(`${APP_WORDMARK.lead}${APP_WORDMARK.accent}`).toBe(APP_NAME);
  });
});
