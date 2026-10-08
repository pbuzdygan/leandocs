import { defaultSchema, type Options as SanitizeSchema } from 'rehype-sanitize';
import { CALLOUT_TYPES } from '@leandocs/shared';

/**
 * Sanitisation schema (PROJECT_SPEC §17, §52, RULE 15). Based on GitHub's schema
 * (`defaultSchema`): no scripts, no event handlers, no `style`, no `javascript:` URLs, ids/names
 * from raw HTML prefixed with `user-content-` (DOM clobbering). Only the classes LeanDocs itself
 * generates are allowed in addition.
 */
export const sanitizeSchema: SanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    div: [
      ...(defaultSchema.attributes?.div ?? []),
      ['className', 'callout', ...CALLOUT_TYPES.map((type) => `callout--${type}`)],
      ['dataCallout', ...CALLOUT_TYPES],
    ],
    p: [...(defaultSchema.attributes?.p ?? []), ['className', 'callout__title']],
    span: [...(defaultSchema.attributes?.span ?? []), ['className', 'broken-link'], 'title'],
  },
};
