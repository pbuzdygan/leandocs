import { useMemo } from 'react';
import { toJsxRuntime } from 'hast-util-to-jsx-runtime';
import { createLowlight } from 'lowlight';
import markdown from 'highlight.js/lib/languages/markdown';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';

const lowlight = createLowlight({ markdown });

/** Read-only Markdown source with subtle highlighting (UI_SPEC §40–41). Editing comes in Phase 5. */
export function SourceView({ source }: { source: string }) {
  const content = useMemo(
    () => toJsxRuntime(lowlight.highlight('markdown', source), { Fragment, jsx, jsxs }),
    [source],
  );
  return (
    <pre className="source-view" aria-label="Markdown source">
      <code className="hljs language-markdown">{content}</code>
    </pre>
  );
}
