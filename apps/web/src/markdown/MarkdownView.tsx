import { useMemo, type ComponentProps, type ReactNode } from 'react';
import type { Element, Root } from 'hast';
import { toString as hastToString } from 'hast-util-to-string';
import { toJsxRuntime, type Components } from 'hast-util-to-jsx-runtime';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { Link } from 'react-router';
import { CodeBlock } from './CodeBlock';
import { MermaidDiagram } from './MermaidDiagram';
import './markdown.css';

type WithNode<T extends keyof React.JSX.IntrinsicElements> = ComponentProps<T> & { node?: Element };

function Anchor({ href, children, node: _node, ...props }: WithNode<'a'>) {
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
  return <img alt={alt} loading="lazy" decoding="async" {...props} />;
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
