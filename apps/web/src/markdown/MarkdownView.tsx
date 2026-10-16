import { useMemo, useState, type ComponentProps, type MouseEvent, type ReactNode } from 'react';
import type { Element, Root } from 'hast';
import { toString as hastToString } from 'hast-util-to-string';
import { toJsxRuntime, type Components } from 'hast-util-to-jsx-runtime';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { Link } from 'react-router';
import { useNotify } from '../components/ui/Toast';
import { CodeBlock } from './CodeBlock';
import { attachmentTarget } from './links';
import { MermaidDiagram } from './MermaidDiagram';
import './markdown.css';

type WithNode<T extends keyof React.JSX.IntrinsicElements> = ComponentProps<T> & { node?: Element };

/** `data-attachment` value; the Links tab finds an attachment's place in the text by it. */
export function attachmentRefKey(documentId: string, name: string): string {
  return `${documentId}/${name}`;
}

/**
 * Saves a file through a temporary `download` link. Navigating to it would rely on the browser
 * honouring `Content-Disposition: attachment`, and WebKit shows text files in place of the app.
 */
function saveFile(href: string, name: string) {
  const link = document.createElement('a');
  link.href = href;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
}

/**
 * Attachment links lead to the API, outside the app. A file deleted or renamed on disk would end
 * there on an error, so a plain click checks first (HEAD) and stays in the app when the file is
 * gone. Files the server sends as downloads are saved, so the app stays open; images open. Modified
 * clicks (new tab) open directly; the server answers those with a short page when the file is gone.
 */
function AttachmentAnchor({
  href,
  documentId,
  name,
  children,
  ...props
}: Omit<WithNode<'a'>, 'node'> & { href: string; documentId: string; name: string }) {
  const notify = useNotify();
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    fetch(href, { method: 'HEAD', credentials: 'same-origin' })
      .then((response) => {
        if (response.ok) {
          const disposition = response.headers.get('Content-Disposition') ?? '';
          if (/^attachment\b/i.test(disposition)) saveFile(href, name);
          else window.location.assign(href);
        } else if (response.status === 404)
          notify.error(
            `"${name}" is no longer attached to this document. It may have been deleted or renamed; Attachments below the document lists the files attached now.`,
          );
        else
          notify.error(
            `"${name}" could not be opened (HTTP ${response.status}). Reload the page and try again.`,
          );
      })
      .catch(() =>
        notify.error(`"${name}" could not be opened. Check the connection and try again.`),
      );
  };
  return (
    <a href={href} {...props} data-attachment={attachmentRefKey(documentId, name)} onClick={open}>
      {children}
    </a>
  );
}

function Anchor({ href, children, node: _node, ...props }: WithNode<'a'>) {
  const attachment = attachmentTarget(href);
  if (href && attachment !== null)
    return (
      <AttachmentAnchor href={href} {...attachment} {...props}>
        {children}
      </AttachmentAnchor>
    );
  if (href?.startsWith('/doc/')) {
    return (
      <Link to={href} {...props}>
        {children}
      </Link>
    );
  }
  if (href && /^(https?:|mailto:)/i.test(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    );
  }
  return (
    <a href={href} {...props}>
      {children}
    </a>
  );
}

function Pre({ node, children }: WithNode<'pre'>) {
  const code = node?.children.find(
    (child): child is Element => child.type === 'element' && child.tagName === 'code',
  );
  const classes = (code?.properties.className as string[] | undefined) ?? [];
  const language = classes.find((name) => name.startsWith('language-'))?.slice('language-'.length);
  const text = code ? hastToString(code) : '';
  if (language === 'mermaid') return <MermaidDiagram source={text.replace(/\n$/, '')} />;
  return (
    <CodeBlock language={language} code={text.replace(/\n$/, '')}>
      {children}
    </CodeBlock>
  );
}

function Table({ node: _node, ...props }: WithNode<'table'>) {
  return (
    <div className="table-wrap">
      <table {...props} />
    </div>
  );
}

function Image({ node: _node, alt = '', ...props }: WithNode<'img'>) {
  const [missing, setMissing] = useState(false);
  const attachment = attachmentTarget(props.src);
  const key = attachment ? attachmentRefKey(attachment.documentId, attachment.name) : undefined;
  // A missing attached image says so instead of the browser's broken-image icon.
  if (missing && attachment !== null)
    return (
      <span className="broken-link" title="Image not found" data-attachment={key}>
        Image not found: {alt || attachment.name}
      </span>
    );
  return (
    <img
      alt={alt}
      loading="lazy"
      decoding="async"
      {...props}
      data-attachment={key}
      onError={attachment !== null ? () => setMissing(true) : undefined}
    />
  );
}

const components: Partial<Components> = {
  a: Anchor as Components['a'],
  pre: Pre as Components['pre'],
  table: Table as Components['table'],
  img: Image as Components['img'],
};

/** Renders an already sanitised hast tree to React — no `innerHTML` for document content. */
export function HastContent({ tree }: { tree: Root }): ReactNode {
  return useMemo(
    () => toJsxRuntime(tree, { Fragment, jsx, jsxs, components, passNode: true }),
    [tree],
  );
}
