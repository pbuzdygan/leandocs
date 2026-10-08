import { useState, type ReactNode } from 'react';
import { CheckIcon, CopyIcon } from '../components/icons';

/** UI_SPEC §52: dark block, language label left, Copy right, whitespace preserved. */
export function CodeBlock({
  language,
  code,
  children,
}: {
  language: string | undefined;
  code: string;
  children: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      () => undefined,
    );
  };
  return (
    <div className="code-block">
      <div className="code-block__bar">
        <span className="code-block__lang">{language ?? 'text'}</span>
        <button type="button" className="code-block__copy" onClick={copy} aria-label="Copy code">
          {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="code-block__pre">{children}</pre>
    </div>
  );
}
