/**
 * Central branding constants (BRAND_SPEC.md, UI_SPEC §143). Never hard-code the product name or
 * the wordmark split elsewhere.
 */
export const APP_NAME = 'LeanDocs';
export const APP_TAGLINE = 'Documentation without the bloat.';

/** Wordmark: "Lean" in the ink colour + "Docs" in the accent colour (BRAND_SPEC §3). */
export const APP_WORDMARK = { lead: 'Lean', accent: 'Docs' } as const;
